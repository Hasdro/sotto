"""After-call summary (P7.5): the `summary` stage through the router, off the live path."""

from __future__ import annotations

from collections.abc import Sequence

from sotto_worker.company import CompanyProfile
from sotto_worker.contracts import LLMRequest, Message, TranscriptEvent
from sotto_worker.prompts import PromptContext, PromptRegistry
from sotto_worker.router import AllProvidersFailed, ModelRouter


def transcript_text(events: Sequence[TranscriptEvent]) -> str:
    return "\n".join(
        f"{'Customer' if e.speaker == 'customer' else 'Agent'}: {e.text}" for e in events
    )


async def summarise_call(
    *,
    company: CompanyProfile,
    events: Sequence[TranscriptEvent],
    escalations: Sequence[str],
    router: ModelRouter,
    prompts: PromptRegistry,
    t0_ms: int,
) -> str:
    """Model summary; if every provider fails, a plain extract so the CRM still gets a record."""
    rendered = prompts.render(
        "summary",
        PromptContext(company_id=company.company_id),
        {
            "company.name": company.name,
            "company.call_goal": company.call_goal,
            "call.transcript": transcript_text(events),
            "call.escalations": "; ".join(escalations) or "none",
        },
    )
    request = LLMRequest(
        system="", messages=[Message(role="user", content=rendered.text)], max_tokens=300
    )
    try:
        chunks = [
            c.text
            async for c in router.stream("summary", request, company=company.routing(), t0_ms=t0_ms)
        ]
        text = "".join(chunks).strip()
        if text:
            return text
    except AllProvidersFailed:
        pass
    asked = [
        e.text for e in events if e.speaker == "customer" and e.text.rstrip().endswith(("?", "؟"))
    ]
    lines = ["Summary unavailable (model error). Customer questions:", *[f"- {q}" for q in asked]]
    if escalations:
        lines.append("Open (escalated): " + "; ".join(escalations))
    return "\n".join(lines)
