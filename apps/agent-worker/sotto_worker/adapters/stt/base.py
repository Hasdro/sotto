"""Shared real-time STT runner over a WebSocket (spec/phase-2-stt.md). Each vendor adapter only
describes its URL, headers, framing and message mapping; this module owns the socket, the audio
pump, the end-of-stream handshake and error handling, so every vendor behaves the same way."""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any, Literal, Protocol

from sotto_worker.contracts import STTOptions, TranscriptEvent

# After the client's end-of-stream message, how long to wait for the last finals.
END_TIMEOUT_S = 5.0
OPEN_TIMEOUT_S = 5.0

State = Literal["ready", "done"] | None


class STTError(RuntimeError):
    """A vendor error or a socket closed early. The message names the vendor, never the key."""


class WSClosed:
    """Marker: the server closed the socket (FakeWS in tests returns None for it too)."""


class WSConnection(Protocol):
    async def send(self, message: str | bytes) -> None: ...

    async def recv(self) -> str | bytes | None:
        """The next message, or None once the server has closed the socket."""
        ...

    async def close(self) -> None: ...


Connect = Callable[[str, dict[str, str]], Awaitable[WSConnection]]


class _WebsocketsConnection:
    def __init__(self, ws: Any) -> None:
        self._ws = ws

    async def send(self, message: str | bytes) -> None:
        await self._ws.send(message)

    async def recv(self) -> str | bytes | None:
        from websockets.exceptions import ConnectionClosedOK

        try:
            message: str | bytes = await self._ws.recv()
        except ConnectionClosedOK:
            return None
        return message

    async def close(self) -> None:
        await self._ws.close()


async def websockets_connect(url: str, headers: dict[str, str]) -> WSConnection:
    from websockets.asyncio.client import connect

    ws = await connect(url, additional_headers=headers, open_timeout=OPEN_TIMEOUT_S, max_size=2**22)
    return _WebsocketsConnection(ws)


class WebSocketSTT:
    provider = "base"
    default_model = ""
    wait_ready = False  # vendor needs a "started" reply before audio (Speechmatics, ElevenLabs)
    min_chunk_ms = 0  # vendor rejects tiny audio messages (AssemblyAI: 50 ms)

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str | None = None,
        connect: Connect | None = None,
    ) -> None:
        self.model = model
        self._key = api_key
        self._base_url = base_url
        self._connect = connect or websockets_connect

    # --- vendor hooks -------------------------------------------------------------------------
    def url(self, opts: STTOptions) -> str:
        raise NotImplementedError

    def headers(self) -> dict[str, str]:
        raise NotImplementedError

    def start_messages(self, opts: STTOptions) -> list[str]:
        return []

    def audio_message(self, chunk: bytes, opts: STTOptions) -> str | bytes:
        return chunk

    def end_messages(self, chunks_sent: int, opts: STTOptions) -> list[str]:
        raise NotImplementedError

    def parse(
        self, raw: str | bytes, opts: STTOptions, *, ending: bool
    ) -> tuple[list[TranscriptEvent], State]:
        raise NotImplementedError

    # --- runner -------------------------------------------------------------------------------
    def _error(self, detail: str) -> STTError:
        return STTError(f"{self.provider}: {detail}".replace(self._key, "***"))

    async def transcribe(
        self, audio: AsyncIterator[bytes], opts: STTOptions
    ) -> AsyncIterator[TranscriptEvent]:
        try:
            ws = await self._connect(self.url(opts), self.headers())
        except Exception as e:
            raise self._error(f"connect failed ({type(e).__name__})") from None
        ending = asyncio.Event()
        sender: asyncio.Task[None] | None = None
        pending_tasks: list[asyncio.Future[str | bytes | None]] = []
        try:
            for message in self.start_messages(opts):
                await ws.send(message)
            if self.wait_ready:
                while True:
                    raw = await ws.recv()
                    if raw is None:
                        raise self._error("connection closed before the session started")
                    events, state = self.parse(raw, opts, ending=False)
                    for item in events:
                        yield item
                    if state == "ready":
                        break
            sender = asyncio.create_task(self._pump(ws, audio, opts, ending))
            recv: asyncio.Future[str | bytes | None] = asyncio.ensure_future(ws.recv())
            pending_tasks.append(recv)
            sender_checked = False
            while True:
                waiters: set[asyncio.Future[Any]] = {recv}
                if not sender_checked:
                    waiters.add(sender)
                timeout = END_TIMEOUT_S if ending.is_set() else None
                done, _ = await asyncio.wait(
                    waiters, timeout=timeout, return_when=asyncio.FIRST_COMPLETED
                )
                if not done:
                    return  # quiet for END_TIMEOUT_S after our end message: finished
                if sender in done and not sender_checked:
                    sender_checked = True
                    failure = sender.exception()
                    if failure is not None:
                        raise self._error(f"sending audio failed ({type(failure).__name__})")
                if recv not in done:
                    continue
                raw = recv.result()
                if raw is None:
                    if ending.is_set():
                        return
                    raise self._error("connection closed")
                events, state = self.parse(raw, opts, ending=ending.is_set())
                for item in events:
                    yield item
                if state == "done":
                    return
                recv = asyncio.ensure_future(ws.recv())
                pending_tasks.append(recv)
        finally:
            for task in pending_tasks:
                task.cancel()
            if sender is not None and not sender.done():
                sender.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await sender
            with contextlib.suppress(Exception):
                await ws.close()

    async def _pump(
        self,
        ws: WSConnection,
        audio: AsyncIterator[bytes],
        opts: STTOptions,
        ending: asyncio.Event,
    ) -> None:
        min_bytes = opts.sample_rate * 2 * self.min_chunk_ms // 1000
        buffer = b""
        sent = 0
        async for chunk in audio:
            buffer += chunk
            if len(buffer) >= min_bytes:
                await ws.send(self.audio_message(buffer, opts))
                sent += 1
                buffer = b""
        if buffer:
            await ws.send(self.audio_message(buffer, opts))
            sent += 1
        ending.set()
        for message in self.end_messages(sent, opts):
            await ws.send(message)


def event(
    opts: STTOptions, text: str, *, final: bool, start_ms: int, end_ms: int
) -> TranscriptEvent:
    return TranscriptEvent(
        speaker=opts.speaker, text=text.strip(), final=final, start_ms=start_ms, end_ms=end_ms
    )


def seconds_to_ms(value: float | int | None) -> int:
    return round(float(value or 0) * 1000)
