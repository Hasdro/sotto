"""HTTP routes for manager coaching and playbook suggestions (INT-05, INT-15). Mounted by
cloud/app.py next to the learning routes:

GET  /api/v1/coaching?days=30                       the coaching view (scope by role)
POST /api/v1/coaching/signals                       one call's signals, from the agent's device
PUT  /api/v1/coaching/team/{manager_id}             admin: which agents a manager coaches
GET  /api/v1/coaching/digest                        my weekly-email opt-in
PUT  /api/v1/coaching/digest                        {"weekly": bool}
POST /api/v1/coaching/digest/preview                send me the email now
GET  /api/v1/playbook/suggestions                   approval cards for managers and admins
POST /api/v1/playbook/suggestions/{id}/approve      {question?, answer} → one playbook entry
POST /api/v1/playbook/suggestions/{id}/reject

The weekly trigger is `weekly_digest_job` below; the scheduler from T-081 calls it once a day."""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from sotto_worker.cloud.coaching.store import WINDOW_DAYS, CoachingStore
from sotto_worker.cloud.learning.store import LearningStore
from sotto_worker.cloud.store import CloudError, Principal, now_ms
from sotto_worker.outbox import EmailMessage, EmailSender

Wrap = Callable[..., Callable[[Request], Awaitable[Response]]]


def _render(template: str, values: dict[str, str]) -> str:
    return re.sub(r"\{\{\s*([\w.]+)\s*\}\}", lambda m: values.get(m.group(1), ""), template).strip()


def reason_for(prompts: dict[str, dict[str, Any]]) -> Callable[[int], str]:
    body = str((prompts.get("playbook_suggest") or {}).get("body", ""))
    return lambda calls: _render(
        body, {"suggestion.count": str(calls), "suggestion.days": str(WINDOW_DAYS)}
    )


def _learned(learning: LearningStore, who: Principal) -> list[str]:
    active = learning.active_for_call(who)
    return list(active["instructions"]) if active else []


async def send_digest(
    coaching: CoachingStore,
    learning: LearningStore,
    who: Principal,
    *,
    prompts: dict[str, dict[str, Any]],
    origin: str,
    mailer: EmailSender | None,
    key: str,
) -> dict[str, Any]:
    template = str((prompts.get("coaching_digest") or {}).get("body", ""))
    if not template:
        raise CloudError("invalid", "the coaching email template is missing")
    subject, text = coaching.digest(who, template, f"{origin}/coaching", _learned(learning, who))
    if mailer is None:
        return {"sent": False, "subject": subject, "text": text}
    await mailer.send(EmailMessage(to=who.email, subject=subject, text=text), idempotency_key=key)
    return {"sent": True, "subject": subject, "text": text}


async def weekly_digest_job(
    coaching: CoachingStore,
    learning: LearningStore,
    *,
    prompts: dict[str, dict[str, Any]],
    origin: str,
    mailer: EmailSender | None,
    now: int | None = None,
) -> int:
    """The hook for the scheduler (T-081, wave 4): emails everyone who opted in and has not had
    the email for a week. Returns how many were sent. Safe to call more often than weekly."""
    if mailer is None:
        return 0
    t = now if now is not None else now_ms()
    sent = 0
    for company_id, user_id in coaching.due_digests(t):
        rows = coaching.s._q(
            "SELECT id, email, name, role FROM users WHERE id=? AND company_id=?",
            (user_id, company_id),
        )
        if not rows:
            continue
        r = rows[0]
        who = Principal(
            user_id=str(r["id"]),
            company_id=company_id,
            role=str(r["role"]),
            device_id=None,
            email=str(r["email"]),
            name=str(r["name"]),
        )
        week = t // (7 * 86_400_000)
        await send_digest(
            coaching,
            learning,
            who,
            prompts=prompts,
            origin=origin,
            mailer=mailer,
            key=f"coach-{user_id}-{week}",
        )
        coaching.mark_sent(company_id, user_id, t)
        sent += 1
    return sent


def make_routes(
    *,
    coaching: CoachingStore,
    learning: LearningStore,
    prompts: dict[str, dict[str, Any]],
    app_route: Wrap,
    body: Callable[[Request], Awaitable[dict[str, Any]]],
    ip_of: Callable[[Request], str],
    origin: str,
    mailer: EmailSender | None,
) -> list[Route]:
    api = "/api/v1"
    reason = reason_for(prompts)

    @app_route
    async def view(request: Request, who: Principal) -> Response:
        days = request.query_params.get("days", str(WINDOW_DAYS))
        out = coaching.view(who, int(days) if days.isdigit() else WINDOW_DAYS, [])
        if who.role != "agent":  # agents never see the org's instructions list (D-050 spirit)
            out["learned"] = _learned(learning, who)
        return JSONResponse(out, headers={"Cache-Control": "no-store"})

    @app_route
    async def signals(request: Request, who: Principal) -> Response:
        return JSONResponse(coaching.signals(who, await body(request)))

    @app_route
    async def team(request: Request, who: Principal) -> Response:
        data = await body(request)
        return JSONResponse(
            coaching.set_team(
                who, request.path_params["manager_id"], data.get("agents"), ip=ip_of(request)
            )
        )

    @app_route
    async def digest_get(_request: Request, who: Principal) -> Response:
        return JSONResponse(coaching.digest_setting(who), headers={"Cache-Control": "no-store"})

    @app_route
    async def digest_put(request: Request, who: Principal) -> Response:
        data = await body(request)
        return JSONResponse(coaching.set_digest(who, data.get("weekly"), ip=ip_of(request)))

    @app_route
    async def digest_preview(_request: Request, who: Principal) -> Response:
        who.require("admin", "manager")
        out = await send_digest(
            coaching,
            learning,
            who,
            prompts=prompts,
            origin=origin,
            mailer=mailer,
            key=f"coach-preview-{who.user_id}-{now_ms()}",
        )
        return JSONResponse(out)

    @app_route
    async def suggestions(_request: Request, who: Principal) -> Response:
        return JSONResponse(
            coaching.suggestions(who, reason), headers={"Cache-Control": "no-store"}
        )

    @app_route
    async def approve(request: Request, who: Principal) -> Response:
        data = await body(request)
        return JSONResponse(
            coaching.approve(who, request.path_params["id"], data, ip=ip_of(request))
        )

    @app_route
    async def reject(request: Request, who: Principal) -> Response:
        return JSONResponse(coaching.reject(who, request.path_params["id"], ip=ip_of(request)))

    return [
        Route(f"{api}/coaching", view),
        Route(f"{api}/coaching/signals", signals, methods=["POST"]),
        Route(f"{api}/coaching/team/{{manager_id}}", team, methods=["PUT"]),
        Route(f"{api}/coaching/digest", digest_get),
        Route(f"{api}/coaching/digest", digest_put, methods=["PUT"]),
        Route(f"{api}/coaching/digest/preview", digest_preview, methods=["POST"]),
        Route(f"{api}/playbook/suggestions", suggestions),
        Route(f"{api}/playbook/suggestions/{{id}}/approve", approve, methods=["POST"]),
        Route(f"{api}/playbook/suggestions/{{id}}/reject", reject, methods=["POST"]),
    ]
