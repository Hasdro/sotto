"""`pnpm spoken:live [--url URL] [--code CODE]`: the spoken-call smoke test (D-020, T-007).

macOS `say` speaks customer questions; each clip is streamed in real time into a running Sotto
server's `/ws` exactly like the browser microphone (PCM16 16 kHz, 20 ms frames, then silence).
We time, from the end of each spoken sentence: the final transcript, and the first card. This is
R1 measured end to end on the spoken path (VAD + STT + pipeline + model), against `pnpm demo`
locally or the hosted server (`--url https://… --code …`).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import tempfile
import time
import urllib.request
from dataclasses import dataclass
from http.cookies import SimpleCookie
from pathlib import Path
from typing import Any

from replay.stt_live import SAMPLE_RATE, synthesize

PHRASES = (
    "What is the payment plan for the two bedroom apartment?",
    "Another company quoted us twenty percent less.",
    "Is parking included with the apartment?",
    "Can you guarantee the rental yield for five years?",
    "My wife worries about the noise from the main road. What would you tell her?",
)
FRAME_BYTES = SAMPLE_RATE * 2 // 50  # 20 ms
SILENCE_S = 2.5
R1_MS = 1500


@dataclass(frozen=True)
class Turn:
    phrase: str
    heard: str | None
    transcript_ms: int | None
    card_ms: int | None
    source: str | None


def summarise(turns: list[Turn]) -> str:
    lines = [
        "Spoken-call smoke test: time from the end of each spoken sentence",
        f"{'transcript':>11}{'card':>8}  {'source':<9} heard",
    ]
    for t in turns:
        tr = f"{t.transcript_ms} ms" if t.transcript_ms is not None else "-"
        cd = f"{t.card_ms} ms" if t.card_ms is not None else "-"
        lines.append(f"{tr:>11}{cd:>8}  {t.source or '-':<9} {t.heard or '(nothing)'}")
    cards = sorted(t.card_ms for t in turns if t.card_ms is not None)
    if cards:
        lines.append(f"cards {len(cards)}/{len(turns)}, worst {cards[-1]} ms (R1 limit {R1_MS} ms)")
    return "\n".join(lines)


def ok(turns: list[Turn]) -> bool:
    return all(t.card_ms is not None and t.card_ms <= R1_MS for t in turns)


def sign_in(url: str, code: str) -> str:
    """Returns the session cookie for a hosted server."""
    request = urllib.request.Request(  # noqa: S310 - the owner's own server URL, http(s) only
        f"{url.rstrip('/')}/api/session",
        data=json.dumps({"code": code}).encode(),
        headers={"content-type": "application/json", "origin": url.rstrip("/")},
        method="POST",
    )
    if not url.startswith(("http://", "https://")):
        raise ValueError("--url must be http(s)")
    with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 - checked above
        cookie = SimpleCookie(response.headers.get("set-cookie", ""))
    return cookie["sotto_session"].value


async def run(url: str, code: str | None) -> list[Turn]:
    from websockets.asyncio.client import connect
    from websockets.typing import Origin

    with tempfile.TemporaryDirectory(prefix="sotto-spoken-") as tmp:
        clips = [synthesize(p, Path(tmp), i) for i, p in enumerate(PHRASES)]
    headers = {"cookie": f"sotto_session={sign_in(url, code)}"} if code else {}
    ws_url = url.replace("https://", "wss://").replace("http://", "ws://").rstrip("/") + "/ws"
    events: list[tuple[float, dict[str, Any]]] = []
    ends: list[float] = []
    async with connect(ws_url, origin=Origin(url.rstrip("/")), additional_headers=headers) as ws:
        hello = json.loads(await ws.recv())
        print(
            f"server: {hello['company_name']} · {hello['mode']} models · STT {hello.get('stt_vendor')}"
        )
        if not hello.get("stt_vendor"):
            raise SystemExit("this server has no speech-to-text key (Admin → Keys & providers)")
        await ws.send(json.dumps({"type": "audio_start", "sample_rate": SAMPLE_RATE}))

        async def reader() -> None:
            async for raw in ws:
                events.append((time.perf_counter(), json.loads(raw)))

        task = asyncio.create_task(reader())
        for clip in clips:
            pcm = clip + b"\x00\x00" * int(SAMPLE_RATE * SILENCE_S)
            start = time.perf_counter()
            for k, offset in enumerate(range(0, len(pcm), FRAME_BYTES)):
                delay = start + k * 0.02 - time.perf_counter()
                if delay > 0:
                    await asyncio.sleep(delay)
                await ws.send(pcm[offset : offset + FRAME_BYTES])
            ends.append(start + len(clip) / (SAMPLE_RATE * 2))
        await asyncio.sleep(2)
        await ws.send(json.dumps({"type": "end"}))
        await asyncio.sleep(0.5)
        task.cancel()
    return match(events, ends)


def match(events: list[tuple[float, dict[str, Any]]], ends: list[float]) -> list[Turn]:
    turns = []
    for i, (phrase, end) in enumerate(zip(PHRASES, ends, strict=True)):
        until = ends[i + 1] if i + 1 < len(ends) else float("inf")
        window = [(t, m) for t, m in events if end - 0.5 <= t < until]
        line = next(((t, m) for t, m in window if m["type"] == "transcript"), None)
        card = next(
            ((t, m) for t, m in window if m["type"] == "card" and m["card"]["seq"] == 0), None
        )
        turns.append(
            Turn(
                phrase=phrase,
                heard=line[1]["text"] if line else None,
                transcript_ms=round((line[0] - end) * 1000) if line else None,
                card_ms=round((card[0] - end) * 1000) if card else None,
                source=card[1]["card"]["source"] if card else None,
            )
        )
    return turns


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="spoken-live")
    parser.add_argument("--url", default="http://127.0.0.1:8787")
    parser.add_argument("--code", default=os.environ.get("SOTTO_ACCESS_CODE"))
    args = parser.parse_args(argv)
    turns = asyncio.run(run(args.url, args.code))
    print(summarise(turns))
    return 0 if ok(turns) else 1


if __name__ == "__main__":
    sys.exit(main())
