"""Automatic call-log & background-failure GitHub issue publisher (L3, L4, D-098).

- One issue per call, no approval, to the private logs repo set in the owner console.
- Healthy call (0 errors & p95 <= 1500 ms) -> label `healthy`, closed immediately.
- Errors or p95 > 1500 ms -> open, label `needs-attention`.
- Background failures deduplicated by error fingerprint.
- Body <= 60 000 chars + <= 5 comments, oldest cut first and marked.
- Strict redaction: never transcripts, customer names, phones, emails, or keys.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

import httpx

from sotto_worker.cloud import github
from sotto_worker.cloud.obs import store as obs_store
from sotto_worker.cloud.obs.log import redact_text
from sotto_worker.cloud.store import CloudStore, Principal

MAX_BODY_CHARS = 60_000
MAX_COMMENT_CHARS = 60_000
MAX_COMMENTS = 5
P95_HEALTHY_LIMIT_MS = 1500
CUT_MARKER = "[… oldest details omitted to stay within GitHub size limit …]\n"


@dataclass(frozen=True)
class CallLogPayload:
    company_id: str
    user_id: str
    call_id: str
    platform: str
    os_version: str
    app_version: str
    device: str
    timings: dict[str, int]
    connections: dict[str, str]
    automations: list[dict[str, Any]] = field(default_factory=list)
    errors: list[dict[str, Any]] = field(default_factory=list)
    # Model requests/replies as structure and sizes only (no text!)
    model_traces: list[dict[str, Any]] = field(default_factory=list)


def _sanitize_model_trace(trace: dict[str, Any]) -> dict[str, Any]:
    """Keep ONLY structure and sizes for model requests/replies — never prompt or reply text."""
    allowed = (
        "stage",
        "provider",
        "model_class",
        "request_bytes",
        "response_bytes",
        "tokens_in",
        "tokens_out",
        "first_token_ms",
        "total_ms",
        "status",
        "used_backup",
        "used_local",
    )
    out: dict[str, Any] = {}
    for k in allowed:
        if k in trace:
            val = trace[k]
            out[k] = redact_text(val) if isinstance(val, str) else val
    return out


def _sanitize_error(err: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k in ("stage", "code", "name", "message", "stack"):
        if k in err and err[k] is not None:
            out[k] = redact_text(str(err[k]))
    return out


def is_healthy(payload: CallLogPayload) -> bool:
    p95 = int(payload.timings.get("p95_ms", 0))
    return len(payload.errors) == 0 and p95 <= P95_HEALTHY_LIMIT_MS


def split_body_and_comments(
    summary: str, detail_lines: list[str], *, max_chars: int = MAX_BODY_CHARS
) -> tuple[str, list[str]]:
    """Pack summary into the issue body and overflow details into <= 5 comments.
    If total details exceed capacity, cut oldest lines first and prepend CUT_MARKER."""
    body_prefix = summary.rstrip() + "\n\n"
    if not detail_lines:
        return body_prefix[:max_chars], []

    # Check if everything fits in the body directly
    joined = "\n".join(detail_lines)
    if len(body_prefix) + len(joined) <= max_chars:
        return body_prefix + joined, []

    # Otherwise put summary in body, and pack details into up to MAX_COMMENTS comments.
    # Keep newest lines if total capacity is exceeded, cutting oldest first and marking.
    max_comment_budget = MAX_COMMENTS * max_chars
    kept: list[str] = []
    used = 0
    truncated = False
    for line in reversed(detail_lines):
        cost = len(line) + 1
        if used + cost + len(CUT_MARKER) > max_comment_budget:
            truncated = True
            break
        kept.append(line)
        used += cost
    kept.reverse()

    chunks: list[str] = []
    current = CUT_MARKER if truncated else ""
    for line in kept:
        addition = line + "\n"
        if len(current) + len(addition) > max_chars and current:
            chunks.append(current.rstrip())
            current = addition
        else:
            current += addition
    if current.strip():
        chunks.append(current.rstrip())

    body = (body_prefix + (f"_Details split across {len(chunks[:MAX_COMMENTS])} comment(s)._\n"))[
        :max_chars
    ]
    return body, chunks[:MAX_COMMENTS]


def format_call_issue(payload: CallLogPayload) -> tuple[str, str, list[str], list[str], bool]:
    """Return (title, body, comments, labels, close_immediately) with strict L3 redaction."""
    healthy = is_healthy(payload)
    label = "healthy" if healthy else "needs-attention"
    p95 = int(payload.timings.get("p95_ms", 0))
    title = redact_text(
        f"[call:{payload.call_id}] {label} · company={payload.company_id} · p95={p95}ms"
    )
    summary_lines = [
        f"## Call Log `{redact_text(payload.call_id)}`",
        f"- **Company:** `{redact_text(payload.company_id)}`",
        f"- **User:** `{redact_text(payload.user_id)}`",
        f"- **Platform / OS:** `{redact_text(payload.platform)}`"
        f" / `{redact_text(payload.os_version)}`",
        f"- **App version / Device:** `{redact_text(payload.app_version)}`"
        f" / `{redact_text(payload.device)}`",
        f"- **Status:** `{label}` (p95={p95} ms, errors={len(payload.errors)})",
        f"- **Timings (ms):** `{json.dumps(payload.timings, sort_keys=True)}`",
        "- **Connections:** `"
        + json.dumps(
            {k: redact_text(str(v)) for k, v in payload.connections.items()}, sort_keys=True
        )
        + "`",
    ]
    detail_lines: list[str] = []
    for err in payload.errors:
        detail_lines.append("ERROR " + json.dumps(_sanitize_error(err), sort_keys=True))
    for auto in payload.automations:
        safe_auto = {
            k: redact_text(str(v))
            for k, v in auto.items()
            if k not in ("body", "text", "email", "phone")
        }
        detail_lines.append("AUTOMATION " + json.dumps(safe_auto, sort_keys=True))
    for trace in payload.model_traces:
        detail_lines.append("MODEL " + json.dumps(_sanitize_model_trace(trace), sort_keys=True))

    body, comments = split_body_and_comments("\n".join(summary_lines), detail_lines)
    return title, body, comments, [label], healthy


def failure_fingerprint(job_kind: str, stage: str, error_code: str) -> str:
    raw = f"{job_kind.strip().lower()}|{stage.strip().lower()}|{error_code.strip().lower()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


async def publish_call_log(
    store: CloudStore,
    actor: Principal,
    payload: CallLogPayload,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> dict[str, Any]:
    """Publish one GitHub issue for a finished call if L4 switch is ON for (company, user)."""
    if not obs_store.call_logs_enabled_for(store, payload.company_id, payload.user_id):
        return {"sent": False, "reason": "disabled"}
    cfg = obs_store.get_logs_repo(store)
    if cfg is None:
        return {"sent": False, "reason": "repo_not_configured"}
    repo, token = cfg
    title, body, comments, labels, close_immediately = format_call_issue(payload)
    created = await github.create_log_issue(
        repo,
        token,
        title=title,
        body=body,
        labels=labels,
        close_immediately=close_immediately,
        comments=comments,
        transport=transport,
    )
    obs_store.record_call_issue(
        store,
        actor,
        company_id=payload.company_id,
        user_id=payload.user_id,
        call_id=payload.call_id,
        fingerprint=None,
        issue_number=created["issue_number"],
        issue_url=created["issue_url"],
        label=labels[0],
        state=created["state"],
        comment_count=len(comments),
    )
    return {"sent": True, **created, "comment_count": len(comments)}


async def publish_background_failure(
    store: CloudStore,
    actor: Principal,
    *,
    company_id: str,
    user_id: str,
    job_kind: str,
    stage: str,
    error_code: str,
    error_message: str,
    stack: str = "",
    transport: httpx.AsyncBaseTransport | None = None,
) -> dict[str, Any]:
    """Publish or deduplicate a background-failure issue by error fingerprint."""
    if not obs_store.call_logs_enabled_for(store, company_id, user_id):
        return {"sent": False, "reason": "disabled"}
    cfg = obs_store.get_logs_repo(store)
    if cfg is None:
        return {"sent": False, "reason": "repo_not_configured"}
    repo, token = cfg
    fp = failure_fingerprint(job_kind, stage, error_code)
    existing = obs_store.find_open_issue_by_fingerprint(store, company_id, fp)
    detail = (
        f"Occurrence for `{redact_text(job_kind)}` / `{redact_text(stage)}`"
        f" (`{redact_text(error_code)}`)\n"
        f"- Company: `{redact_text(company_id)}`\n"
        f"- Message: `{redact_text(error_message)}`\n"
        + (f"- Stack: `{redact_text(stack)}`\n" if stack else "")
    )
    if existing is not None:
        if int(existing["comment_count"]) < MAX_COMMENTS:
            await github.comment_on_log_issue(
                repo, token, int(existing["issue_number"]), detail, transport=transport
            )
            obs_store.increment_issue_comments(store, actor, company_id, int(existing["id"]))
        return {
            "sent": True,
            "deduplicated": True,
            "fingerprint": fp,
            "issue_number": int(existing["issue_number"]),
            "issue_url": str(existing["issue_url"]),
        }

    title = redact_text(f"[bg:{job_kind}] {stage} · {error_code} (fp:{fp})")
    created = await github.create_log_issue(
        repo,
        token,
        title=title,
        body=detail,
        labels=["needs-attention", "background"],
        close_immediately=False,
        transport=transport,
    )
    obs_store.record_call_issue(
        store,
        actor,
        company_id=company_id,
        user_id=user_id,
        call_id=None,
        fingerprint=fp,
        issue_number=created["issue_number"],
        issue_url=created["issue_url"],
        label="needs-attention",
        state="open",
        comment_count=0,
    )
    return {"sent": True, "deduplicated": False, "fingerprint": fp, **created}
