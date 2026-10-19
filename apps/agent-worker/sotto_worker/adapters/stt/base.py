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
CLOSE_TIMEOUT_S = 2.0

State = Literal["ready", "done"] | None


class STTError(RuntimeError):
    """A vendor error or a socket closed early. The message names the vendor, never the key."""


class WSClosed:
    """Marker: the server closed the socket (FakeWS in tests returns None for it too)."""


class WSClosedAbnormally(Exception):
    """The server closed the socket with an error code (bad key, quota, vendor failure)."""


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
        from websockets.exceptions import ConnectionClosedError, ConnectionClosedOK

        try:
            message: str | bytes = await self._ws.recv()
        except ConnectionClosedOK:
            return None
        except ConnectionClosedError as e:
            code = e.rcvd.code if e.rcvd else None
            reason = e.rcvd.reason if e.rcvd else ""
            raise WSClosedAbnormally(f"closed with code {code} {reason}".strip()) from None
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
    max_chunk_ms = 0  # vendor rejects large audio messages (AssemblyAI: 1000 ms); 0 = no limit

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
        text = f"{self.provider}: {detail}"
        return STTError(text.replace(self._key, "***") if self._key else text)

    async def _recv(self, ws: WSConnection) -> str | bytes | None:
        try:
            return await ws.recv()
        except WSClosedAbnormally as e:
            raise self._error(str(e)) from None

    def _parse(
        self, raw: str | bytes, opts: STTOptions, *, ending: bool
    ) -> tuple[list[TranscriptEvent], State]:
        try:
            return self.parse(raw, opts, ending=ending)
        except STTError:
            raise
        except Exception as e:  # malformed vendor message: one clear error, never a raw one
            raise self._error(f"unreadable message ({type(e).__name__})") from None

    async def transcribe(
        self, audio: AsyncIterator[bytes], opts: STTOptions
    ) -> AsyncIterator[TranscriptEvent]:
        try:
            ws = await self._connect(self.url(opts), self.headers())
        except Exception as e:
            raise self._error(f"connect failed ({type(e).__name__})") from None
        ending = asyncio.Event()  # set once our end-of-stream messages are on the wire
        sender: asyncio.Task[None] | None = None
        recv: asyncio.Future[str | bytes | None] | None = None
        loop = asyncio.get_running_loop()
        try:
            for message in self.start_messages(opts):
                await ws.send(message)
            if self.wait_ready:
                while True:
                    raw = await self._recv(ws)
                    if raw is None:
                        raise self._error("connection closed before the session started")
                    events, state = self._parse(raw, opts, ending=False)
                    for item in events:
                        yield item
                    if state == "ready":
                        break
            sender = asyncio.create_task(self._pump(ws, audio, opts, ending))
            recv = asyncio.ensure_future(self._recv(ws))
            sender_checked = False
            deadline: float | None = None
            while True:
                waiters: set[asyncio.Future[Any]] = {recv}
                if not sender_checked:
                    waiters.add(sender)
                if ending.is_set() and deadline is None:
                    deadline = loop.time() + END_TIMEOUT_S  # one budget for the last finals
                timeout = None if deadline is None else max(deadline - loop.time(), 0)
                done, _ = await asyncio.wait(
                    waiters, timeout=timeout, return_when=asyncio.FIRST_COMPLETED
                )
                if not done:
                    return  # END_TIMEOUT_S after our end message: finished
                if sender in done and not sender_checked:
                    sender_checked = True
                    failure = sender.exception()
                    if failure is not None:
                        raise self._error(
                            f"sending audio failed ({type(failure).__name__})"
                        ) from failure
                if recv not in done:
                    continue
                raw = recv.result()
                if raw is None:
                    if ending.is_set():
                        return
                    raise self._error("connection closed")
                events, state = self._parse(raw, opts, ending=ending.is_set())
                for item in events:
                    yield item
                if state == "done":
                    return
                recv = asyncio.ensure_future(self._recv(ws))
        finally:
            leftovers = [t for t in (recv, sender) if t is not None]
            for task in leftovers:
                task.cancel()
            await asyncio.gather(*leftovers, return_exceptions=True)
            with contextlib.suppress(Exception):
                await asyncio.wait_for(ws.close(), CLOSE_TIMEOUT_S)

    async def _pump(
        self,
        ws: WSConnection,
        audio: AsyncIterator[bytes],
        opts: STTOptions,
        ending: asyncio.Event,
    ) -> None:
        bytes_per_ms = opts.sample_rate * 2 // 1000
        min_bytes = bytes_per_ms * self.min_chunk_ms
        max_bytes = bytes_per_ms * self.max_chunk_ms
        buffer = b""
        sent = 0

        async def send(data: bytes) -> None:
            nonlocal sent
            await ws.send(self.audio_message(data, opts))
            sent += 1

        async for chunk in audio:
            if not chunk:
                continue  # an empty binary frame means "end of stream" to some vendors
            buffer += chunk
            while max_bytes and len(buffer) > max_bytes:
                await send(buffer[:max_bytes])
                buffer = buffer[max_bytes:]
            if len(buffer) >= max(min_bytes, 1):
                await send(buffer)
                buffer = b""
        if buffer:
            await send(buffer.ljust(min_bytes, b"\x00"))  # pad a short tail with silence
        for message in self.end_messages(sent, opts):
            await ws.send(message)
        ending.set()


def event(
    opts: STTOptions, text: str, *, final: bool, start_ms: int, end_ms: int
) -> TranscriptEvent:
    return TranscriptEvent(
        speaker=opts.speaker, text=text.strip(), final=final, start_ms=start_ms, end_ms=end_ms
    )


def seconds_to_ms(value: float | int | None) -> int:
    return round(float(value or 0) * 1000)
