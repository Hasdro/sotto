"""`pnpm stt:live` (Mac, keys in `.env`): the P2.3 STT smoke test for every vendor with a key.

macOS `say` speaks a few English customer questions into a temp WAV (16 kHz PCM16 mono, never in
git). Each clip is streamed to the vendor in real time, followed by trailing silence as on a live
call, and we time **final latency**: from the end of speech to the moment the final transcript
arrives. ARCHITECTURE §4 budgets 350 ms for end-of-turn + final STT. Synthetic speech is clean, so
this is a plumbing and latency smoke test, not the accuracy benchmark (P2.8 with golden calls).
"""

from __future__ import annotations

import asyncio
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import wave
from collections.abc import AsyncIterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

from sotto_worker.adapters.factory import STT_VENDORS, make_stt, stt_default_model
from sotto_worker.adapters.stt.base import STTError
from sotto_worker.contracts import STTAdapter, STTOptions
from sotto_worker.router import RoutingConfig, StageRoute
from sotto_worker.runtime import SEED

SAMPLE_RATE = 16000
CHUNK_MS = 20
TRAILING_SILENCE_MS = 2000
# T-007: our end-of-turn stage decides "customer finished" about this long after the last word,
# then asks the vendor for the final at once instead of waiting for the vendor's own silence rule.
FINALIZE_AFTER_MS = 200
BETWEEN_CLIPS_S = 1.5  # let the vendor release the previous session (Speechmatics free: 2 at once)
PHRASES = (
    "What is the payment plan for the two bedroom apartment?",
    "Another company quoted us twenty percent less.",
    "Can I see the show apartment this weekend?",
)


@dataclass(frozen=True)
class ClipResult:
    phrase: str
    text: str
    final_latency_ms: int | None  # None: no final transcript arrived
    error: str | None = None


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower().replace("twenty percent", "20%"))


def word_error_rate(expected: str, heard: str) -> float:
    ref, hyp = words(expected), words(heard)
    row = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        prev, row[0] = row[0], i
        for j, h in enumerate(hyp, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (r != h))
    return row[-1] / max(len(ref), 1)


async def paced(pcm: bytes, *, started: float, chunk_ms: int = CHUNK_MS) -> AsyncIterator[bytes]:
    """Yield PCM in real time: chunk k is released at started + k * chunk_ms."""
    step = SAMPLE_RATE * 2 * chunk_ms // 1000
    for k, offset in enumerate(range(0, len(pcm), step)):
        delay = started + k * chunk_ms / 1000 - time.perf_counter()
        if delay > 0:
            await asyncio.sleep(delay)
        yield pcm[offset : offset + step]


async def run_clip(
    adapter: STTAdapter, phrase: str, speech: bytes, *, finalize_after_ms: int | None = None
) -> ClipResult:
    silence = b"\x00\x00" * (SAMPLE_RATE * TRAILING_SILENCE_MS // 1000)
    speech_ms = len(speech) * 1000 // (SAMPLE_RATE * 2)
    started = time.perf_counter()
    finals: list[tuple[float, str]] = []

    async def force(after_ms: int) -> None:
        release = started + (speech_ms + after_ms) / 1000
        await asyncio.sleep(max(release - time.perf_counter(), 0))
        await adapter.finalize()

    forcing = None if finalize_after_ms is None else asyncio.create_task(force(finalize_after_ms))
    try:
        async for event in adapter.transcribe(
            paced(speech + silence, started=started), STTOptions(speaker="customer")
        ):
            if event.final:
                finals.append((time.perf_counter(), event.text))
    except STTError as e:
        return ClipResult(phrase, "", None, str(e))
    finally:
        if forcing is not None:
            forcing.cancel()
            await asyncio.gather(forcing, return_exceptions=True)
    if not finals:
        return ClipResult(phrase, "", None)
    speech_end = started + speech_ms / 1000
    first_after_end = next((t for t, _ in finals if t >= speech_end), finals[-1][0])
    text = " ".join(t for _, t in finals)
    return ClipResult(phrase, text, round((first_after_end - speech_end) * 1000))


def synthesize(phrase: str, directory: Path, index: int) -> bytes:
    path = directory / f"clip{index}.wav"
    say = shutil.which("say") or "/usr/bin/say"
    subprocess.run(  # noqa: S603 - fixed binary and arguments; phrases are module constants
        [say, "-o", str(path), f"--data-format=LEI16@{SAMPLE_RATE}", phrase],
        check=True,
        capture_output=True,
    )
    with wave.open(str(path), "rb") as clip:
        shape = (clip.getframerate(), clip.getsampwidth(), clip.getnchannels())
        if shape != (SAMPLE_RATE, 2, 1):
            raise RuntimeError(f"`say` wrote {shape}, expected ({SAMPLE_RATE}, 2, 1)")
        return clip.readframes(clip.getnframes())


def vendor_routes(config: RoutingConfig) -> dict[str, StageRoute]:
    """Every STT vendor: the seed's route when it routes that vendor, else the adapter's default."""
    routes = {v: StageRoute(provider=v, model=stt_default_model(v)) for v in STT_VENDORS}
    for stage in ("stt", "stt_backup"):
        route = config.stages.get(stage)
        if route is not None and route.provider in STT_VENDORS:
            routes[route.provider] = route
    return routes


def format_results(results: Mapping[str, Sequence[ClipResult]], roles: Mapping[str, str]) -> str:
    lines = [
        "STT live smoke test (macOS synthetic speech, real-time streaming, "
        f"{TRAILING_SILENCE_MS} ms trailing silence)",
        "Final latency = end of speech -> final transcript. Budget (ARCHITECTURE §4): 350 ms "
        "for end-of-turn + final STT.",
        f"'+final' rows: we force the final {FINALIZE_AFTER_MS} ms after the last word (T-007).",
        "",
        f"{'vendor':<20}{'role':<10}{'clips':>6}{'final p50':>11}{'max':>8}{'WER':>7}  notes",
    ]
    for vendor, clips in results.items():
        latencies = sorted(c.final_latency_ms for c in clips if c.final_latency_ms is not None)
        errors = [c.error for c in clips if c.error]
        wer = sum(word_error_rate(c.phrase, c.text) for c in clips) / max(len(clips), 1)
        p50 = f"{latencies[len(latencies) // 2]} ms" if latencies else "-"
        worst = f"{latencies[-1]} ms" if latencies else "-"
        note = errors[0] if errors else ("no final" if len(latencies) < len(clips) else "")
        lines.append(
            f"{vendor:<20}{roles.get(vendor.split()[0], ''):<10}{len(clips):>6}{p50:>11}{worst:>8}"
            f"{wer:>7.0%}  {note}"
        )
    lines += ["", "Transcripts:"]
    for vendor, clips in results.items():
        for c in clips:
            lines.append(f"  {vendor:<13} {c.text or '(none)'}")
    return "\n".join(lines)


async def run(env: Mapping[str, str]) -> int:
    if shutil.which("say") is None:
        print("stt:live needs macOS `say` to synthesise speech; run it on the Mac.")
        return 1
    config = RoutingConfig.load(SEED / "models" / "default.yaml")
    roles = {}
    for stage, role in (("stt", "primary"), ("stt_backup", "backup")):
        route = config.stages.get(stage)
        if route is not None:
            roles[route.provider] = role
    routes = vendor_routes(config)
    with tempfile.TemporaryDirectory(prefix="sotto-stt-") as tmp:
        clips = [synthesize(p, Path(tmp), i) for i, p in enumerate(PHRASES)]
    results: dict[str, list[ClipResult]] = {}
    for vendor, route in routes.items():
        key_name = STT_VENDORS[vendor][1]
        if not env.get(key_name):
            print(f"skip {vendor}: {key_name} is not set")
            continue
        for mode, after in (("", None), (" +final", FINALIZE_AFTER_MS)):
            adapter = make_stt(route, env=env)
            runs = []
            for p, c in zip(PHRASES, clips, strict=True):
                runs.append(await run_clip(adapter, p, c, finalize_after_ms=after))
                await asyncio.sleep(BETWEEN_CLIPS_S)
            results[vendor + mode] = runs
    if not results:
        print("No STT keys set. Put at least one in .env (docs/PROVIDER-KEYS.md).")
        return 1
    print(format_results(results, roles))
    failed = [v for v, clips in results.items() if any(c.final_latency_ms is None for c in clips)]
    return 1 if any(v.split()[0] in roles for v in failed) else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run(os.environ)))
