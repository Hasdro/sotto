"""Background merge job for per-agent style memory (Round 4, A3).

Builds a minimized, PII-stripped feedback packet (never a full transcript), renders
`seed/prompts/memory_merge.md`, calls the configured router stage (`memory_merge`), enforces
<= 12 rules of <= 25 words, retries up to 3 times on failure while keeping raw feedback intact.
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from sotto_worker.cloud.memory.obs_stub import log_event
from sotto_worker.cloud.memory.redact import strip_personal_data
from sotto_worker.cloud.memory.store import (
    MAX_RULES,
    MAX_WORDS,
    MERGE_MAX_RETRIES,
    MemoryStore,
)

PROMPT_FILE = Path(__file__).resolve().parents[5] / "seed" / "prompts" / "memory_merge.md"
_BULLET_RE = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+(.+)$")

# Caller supplies an async function `(stage, prompt_text) -> str` wired to the model router.
# No model names or provider SDKs appear in this module (CLAUDE.md hard rule).
MergeRunner = Callable[[str, str], Awaitable[str]]


def load_merge_prompt_body(path: Path = PROMPT_FILE) -> str:
    """Load the body of `seed/prompts/memory_merge.md` (stripping YAML front matter)."""
    raw = path.read_text(encoding="utf-8")
    if raw.startswith("---"):
        parts = raw.split("---", 2)
        if len(parts) == 3:
            return parts[2].strip()
    return raw.strip()


def build_feedback_packet(feedback_rows: list[dict[str, Any]]) -> str:
    """Format sanitized feedback items for the merge prompt. Never includes a transcript."""
    lines: list[str] = []
    for idx, row in enumerate(feedback_rows, start=1):
        source = str(row.get("source", "card"))
        rating = row.get("rating")
        reasons = row.get("reasons") or []
        note = strip_personal_data(row.get("note"))
        parts = [f"{idx}. [{source}]"]
        if rating == "up":
            parts.append("helpful")
        elif rating == "down":
            parts.append("not helpful")
        if reasons:
            parts.append(f"reasons: {', '.join(str(r).replace('_', ' ') for r in reasons)}")
        if note:
            parts.append(f"note: {note}")
        lines.append(" · ".join(parts))
    return "\n".join(lines) if lines else "(no feedback)"


def render_merge_prompt(
    *,
    company_name: str,
    current_rules: list[str],
    feedback_rows: list[dict[str, Any]],
    prompt_body: str | None = None,
) -> str:
    body = prompt_body if prompt_body is not None else load_merge_prompt_body()
    current_block = "\n".join(f"- {r}" for r in current_rules) if current_rules else "(none)"
    packet = build_feedback_packet(feedback_rows)
    return (
        body.replace("{{company.name}}", company_name)
        .replace("{{memory.current}}", current_block)
        .replace("{{memory.max_rules}}", str(MAX_RULES))
        .replace("{{memory.max_words}}", str(MAX_WORDS))
        .replace("{{memory.feedback}}", packet)
    )


def parse_merged_rules(raw: str) -> list[str] | None:
    """Parse `- rule` lines into <= 12 rules of <= 25 words; NONE -> []; garbage -> None."""
    text = raw.strip()
    if not text:
        return None
    if re.fullmatch(r"NONE\.?", text, re.IGNORECASE):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for line in text.splitlines():
        m = _BULLET_RE.match(line)
        if not m:
            continue
        cleaned = strip_personal_data(m.group(1))
        if not cleaned:
            continue
        words = cleaned.split(" ")
        if len(words) > MAX_WORDS:
            cleaned = " ".join(words[:MAX_WORDS])
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
        if len(out) >= MAX_RULES:
            break
    return out if out else None


async def run_memory_merge(
    memory: MemoryStore,
    *,
    company_id: str,
    company_name: str,
    user_id: str,
    runner: MergeRunner,
    call_id: str | None = None,
    max_retries: int = MERGE_MAX_RETRIES,
    prompt_body: str | None = None,
    now: int | None = None,
) -> dict[str, Any] | None:
    """Run the background style-memory merge for a user's unmerged feedback.

    Retries up to `max_retries` (3) times on error or unparseable output. If all attempts fail,
    raw feedback stays unmerged (never deleted) and retry_count is recorded.
    """
    rows = memory.pending_feedback(company_id, user_id, call_id=call_id)
    if not rows:
        return None
    feedback_ids = [r["id"] for r in rows]
    current = [
        i["text"]
        for i in memory._active_items(company_id, "agent", user_id)
        if i.get("enabled", True)
    ]
    prompt = render_merge_prompt(
        company_name=company_name,
        current_rules=current,
        feedback_rows=rows,
        prompt_body=prompt_body,
    )
    last_err = ""
    for attempt in range(1, max(1, max_retries) + 1):
        try:
            raw_out = await runner("memory_merge", prompt)
            parsed = parse_merged_rules(raw_out)
            if parsed is None:
                raise ValueError("unparseable merge output")
            result = memory.save_merged_rules(
                company_id,
                user_id,
                parsed,
                source_call=call_id,
                now=now,
            )
            memory.mark_feedback_merged(company_id, feedback_ids)
            log_event(
                "style_memory",
                "merge_succeeded",
                call_id=call_id,
                attempt=attempt,
                feedback_count=len(feedback_ids),
                learned_count=int(result["learned_count"]),
                status=str(result["status"]),
            )
            return result
        except Exception as exc:  # noqa: BLE001
            last_err = f"{type(exc).__name__}: {exc}"
            log_event(
                "style_memory",
                "merge_retry",
                call_id=call_id,
                level="warn",
                attempt=attempt,
                error=type(exc).__name__,
            )
    memory.record_merge_failure(company_id, feedback_ids, last_err)
    log_event(
        "style_memory",
        "merge_failed",
        call_id=call_id,
        level="error",
        attempts=max_retries,
        feedback_count=len(feedback_ids),
    )
    return None
