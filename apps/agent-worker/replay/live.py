"""P2.3 live smoke test (`pnpm replay:live`): real models, real clock, keys from the Mac's `.env`.

1. Model-ID check: every openai_compatible route in seed/models/default.yaml is looked up in its
   provider's `GET {base_url}/models` list. Each platform key goes only to its own host (D-016).
2. Live replay: the scripted demo calls run through the real pipeline and the real models on a
   real clock. End-of-turn + final STT are still simulated (a fixed delay before t0 is fed), so
   this is a model-latency smoke test, not the golden-call R1 gate (P2.8 with real audio).
"""

from __future__ import annotations

import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx

from replay.synthetic import ReplayReport, check_line
from sotto_worker.adapters.factory import has_credentials, platform_key
from sotto_worker.clock import RealClock
from sotto_worker.contracts import TranscriptEvent
from sotto_worker.pipeline.session import CallSession, Escalation
from sotto_worker.protocol import CardMessage
from sotto_worker.router import RoutingConfig
from sotto_worker.runtime import build_demo_runtime
from sotto_worker.scenarios import Scenario
from sotto_worker.telemetry import CardTimingRecord, summarise


@dataclass(frozen=True)
class ModelCheck:
    stage: str
    model: str
    host: str
    status: str  # "ok", "missing", "no key", or "HTTP <code>" / an error name


async def _list_ids(client: httpx.AsyncClient, base_url: str, key: str | None) -> set[str]:
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    response = await client.get(base_url.rstrip("/") + "/models", headers=headers, timeout=15)
    response.raise_for_status()
    ids = {str(item.get("id", "")) for item in response.json().get("data", [])}
    return {i.removeprefix("models/") for i in ids}  # Gemini lists "models/<id>"


async def check_model_ids(
    config: RoutingConfig, env: Mapping[str, str], client: httpx.AsyncClient
) -> list[ModelCheck]:
    results: list[ModelCheck] = []
    listed: dict[str, set[str] | str] = {}  # base_url -> ids, or the error status
    for stage, route in config.stages.items():
        if route.provider != "openai_compatible" or not route.base_url:
            continue
        host = urlsplit(route.base_url).hostname or "?"
        if not has_credentials(route, env):
            results.append(ModelCheck(stage, route.model, host, "no key"))
            continue
        if route.base_url not in listed:
            try:
                listed[route.base_url] = await _list_ids(
                    client, route.base_url, platform_key(route, env)
                )
            except httpx.HTTPStatusError as e:
                listed[route.base_url] = f"HTTP {e.response.status_code}"
            except (httpx.HTTPError, ValueError) as e:  # ValueError: key/host mismatch, bad JSON
                listed[route.base_url] = type(e).__name__
        ids = listed[route.base_url]
        status = ids if isinstance(ids, str) else ("ok" if route.model in ids else "missing")
        results.append(ModelCheck(stage, route.model, host, status))
    return results


def format_checks(results: Sequence[ModelCheck]) -> str:
    lines = [f"{'stage':<16}{'model':<28}{'host':<36}status"]
    lines += [f"{r.stage:<16}{r.model:<28}{r.host:<36}{r.status}" for r in results]
    return "\n".join(lines)


async def replay_live(
    scenarios: Sequence[Scenario],
    env: Mapping[str, str],
    *,
    final_after_t0_ms: int = 350,
    force_fake: bool = False,
) -> ReplayReport:
    """Each line: wait the simulated end-of-turn + STT delay, feed the final transcript with
    t0 = when the speaker stopped, then wait until that turn is fully done (card, backup race,
    holding line or late answer) before the next line, so turns never overlap."""
    clock = RealClock()
    report = ReplayReport()
    for scenario in scenarios:
        runtime = build_demo_runtime(clock, env, force_fake=force_fake)
        cards: list[CardMessage] = []
        records: list[CardTimingRecord] = []
        escalations: list[Escalation] = []

        async def on_card(card: CardMessage, sink: list[CardMessage] = cards) -> None:
            sink.append(card)

        async def on_escalation(e: Escalation, sink: list[Escalation] = escalations) -> None:
            sink.append(e)

        session = CallSession(
            call_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"sotto-live:{scenario.id}")),
            company=runtime.company,
            router=runtime.router,
            prompts=runtime.prompts,
            playbook=runtime.playbook,
            clock=clock,
            on_card=on_card,
            on_escalation=on_escalation,
            on_timing=records.append,
        )
        for line in scenario.lines:
            t0 = clock.now_ms()
            await clock.sleep(final_after_t0_ms)
            before = len([c for c in cards if c.seq == 0])
            event = TranscriptEvent(
                speaker=line.speaker,
                text=line.text,
                final=True,
                start_ms=t0 - line.duration_ms,
                end_ms=t0,
            )
            await session.on_transcript(event, t0_ms=t0)
            await session.drain()
            check_line(report, scenario, line, [c for c in cards if c.seq == 0][before:])
        await session.close()
        report.cards += len(records)
        report.escalations += len(escalations)
        report.records += records
        if records:
            report.per_call[scenario.id] = summarise(records)
    return report
