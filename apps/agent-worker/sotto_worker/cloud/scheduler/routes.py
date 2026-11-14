"""HTTP routes for follow-up plans (INT-08, INT-09; D-055, D-070). Mounted by cloud/app.py.

/api/v1/followup/plans                       create (after the call) · list the agent's own
/api/v1/followup/plans/{id}/{pause|resume|cancel}
/api/v1/followup/due                         due steps: what the desktop notifies about
/api/v1/followup/steps/{id}                  one step with its draft (the notification opens it)
/api/v1/followup/steps/{id}/skip
/api/v1/followup/steps/{id}/done             after the tap sent it via /email/send or /whatsapp/send

There is no send route here. A step is sent by the agent through the usual preview → confirm →
send route with the step's `idempotency_key`; `done` then checks that route's send log."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from sotto_worker.cloud.email import data as email_data
from sotto_worker.cloud.gallabox import data as gallabox_data
from sotto_worker.cloud.scheduler.plans import PlanStore
from sotto_worker.cloud.store import CloudError, CloudStore, Principal

Wrap = Callable[..., Callable[[Request], Awaitable[Response]]]
NO_STORE = {"Cache-Control": "no-store"}
REMINDER_CATEGORY = "UTILITY"  # INT-09: never a MARKETING template for a reminder


def make_routes(
    *,
    store: CloudStore,
    plans: PlanStore,
    app_route: Wrap,
    body: Callable[[Request], Awaitable[dict[str, Any]]],
    ip_of: Callable[[Request], str],
    clock: Callable[[], int],
    attachment_ids: Callable[[str], set[str]] = lambda _company: set(),
) -> list[Route]:
    def check_step(who: Principal) -> Callable[[str, dict[str, Any]], None]:
        def check(kind: str, p: dict[str, Any]) -> None:
            if kind == "reminder":
                return
            if kind == "email":
                store.require_feature(who, "email_send")
                if str(p.get("format", "")) not in {
                    f["id"] for f in email_data.formats(store, who.company)
                }:
                    raise CloudError("invalid", "pick an email format")
                if str(p.get("sender", "")) not in {
                    s["id"] for s in email_data.senders(store, who.company)
                }:
                    raise CloudError("invalid", "pick one of the approved senders")
                to = p.get("to")
                if not isinstance(to, list) or not to:
                    raise CloudError("invalid", "add at least one To address")
                p["to"] = [email_data.clean_address(a, "To") for a in to][:10]
                files = p.get("attachments") or []
                if files:
                    store.require_feature(who, "email_attachments")
                    if not isinstance(files, list) or not set(map(str, files)) <= attachment_ids(
                        who.company
                    ):
                        raise CloudError("invalid", "pick attachments from your admin's list")
                return
            # whatsapp and meeting_reminder: only the org's allow-listed templates (D-033)
            store.require_feature(
                who, "meeting_reminders" if kind == "meeting_reminder" else "whatsapp"
            )
            key = (str(p.get("template", "")), str(p.get("language", "")))
            tpl = next(
                (
                    t
                    for t in gallabox_data.allowed(store, who.company)
                    if (t.name, t.language) == key
                ),
                None,
            )
            if tpl is None:
                raise CloudError("invalid", "that template is not on your organisation's list")
            if kind == "meeting_reminder":
                if tpl.category.upper() != REMINDER_CATEGORY:
                    raise CloudError("invalid", "meeting reminders use a UTILITY template")
                if type(p.get("meeting_at")) is not int:
                    raise CloudError("invalid", "the reminder needs the meeting time")

        return check

    @app_route
    async def create(r: Request, who: Principal) -> Response:
        store.require_feature(who, "followup_plan")
        d = await body(r)
        now = clock()
        steps = d.get("steps")
        for s in steps if isinstance(steps, list) else []:
            p = s.get("prepared") if isinstance(s, dict) else None
            if (
                isinstance(s, dict)
                and s.get("kind") == "meeting_reminder"
                and isinstance(p, dict)
                and type(p.get("meeting_at")) is int
                and type(s.get("due_at")) is int
                and s["due_at"] >= p["meeting_at"]
            ):
                raise CloudError("invalid", "a reminder must be before the meeting")
        plan = plans.create(
            who,
            call_id=str(d.get("call_id", "")),
            customer_name=str(d.get("customer_name", "")),
            steps=steps if isinstance(steps, list) else [],
            now=now,
            check_step=check_step(who),
            ip=ip_of(r),
        )
        return JSONResponse(plan, status_code=201, headers=NO_STORE)

    @app_route
    async def listing(r: Request, who: Principal) -> Response:
        store.require_feature(who, "followup_plan")
        call = r.query_params.get("call_id")
        return JSONResponse({"plans": plans.plans(who, call)}, headers=NO_STORE)

    def status_route(status: str) -> Callable[[Request], Awaitable[Response]]:
        @app_route
        async def go(r: Request, who: Principal) -> Response:
            plan_id = r.path_params["id"]
            plans.set_status(who, plan_id, status, now=clock(), ip=ip_of(r))
            return JSONResponse(plans.plan(who, plan_id), headers=NO_STORE)

        return go

    @app_route
    async def due(_r: Request, who: Principal) -> Response:
        if store.feature_state(who, "followup_plan").state != "available":
            return JSONResponse({"steps": []}, headers=NO_STORE)
        return JSONResponse({"steps": plans.due(who)}, headers=NO_STORE)

    @app_route
    async def step(r: Request, who: Principal) -> Response:
        store.require_feature(who, "followup_plan")
        return JSONResponse(plans.step(who, r.path_params["id"]), headers=NO_STORE)

    @app_route
    async def skip(r: Request, who: Principal) -> Response:
        plans.skip(who, r.path_params["id"], now=clock(), ip=ip_of(r))
        return JSONResponse({"status": "skipped"}, headers=NO_STORE)

    @app_route
    async def done(r: Request, who: Principal) -> Response:
        out = plans.complete(who, r.path_params["id"], now=clock(), ip=ip_of(r))
        return JSONResponse(out, headers=NO_STORE)

    api = "/api/v1/followup"
    return [
        Route(f"{api}/plans", create, methods=["POST"]),
        Route(f"{api}/plans", listing),
        Route(f"{api}/plans/{{id}}/pause", status_route("paused"), methods=["POST"]),
        Route(f"{api}/plans/{{id}}/resume", status_route("active"), methods=["POST"]),
        Route(f"{api}/plans/{{id}}/cancel", status_route("cancelled"), methods=["POST"]),
        Route(f"{api}/due", due),
        Route(f"{api}/steps/{{id}}", step),
        Route(f"{api}/steps/{{id}}/skip", skip, methods=["POST"]),
        Route(f"{api}/steps/{{id}}/done", done, methods=["POST"]),
    ]
