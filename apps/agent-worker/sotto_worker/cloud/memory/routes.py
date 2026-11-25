"""HTTP routes for style memory (A2–A4) and post-call wizard state (A1).

Mounted by cloud/app.py:
  POST   /api/v1/memory/feedback                 add card / call_note / coach_review feedback
  POST   /api/v1/memory/merge                    run merge on pending feedback for this user
  GET    /api/v1/memory/me                       agent's own rules + company rules + effective list
  GET    /api/v1/memory/admin                    admin roll-up + every agent's rules & versions
  PUT    /api/v1/memory/rules                    admin edit (company or agent scope)
  POST   /api/v1/memory/versions/{v}/revert      admin revert to an earlier version
  POST   /api/v1/memory/versions/{v}/approve     admin approve a pending merged version
  POST   /api/v1/memory/versions/{v}/reject      admin reject a pending merged version
  POST   /api/v1/memory/promote                  admin promote an agent rule to company-wide
  PUT    /api/v1/memory/settings                 admin toggle review_before_apply
  GET    /api/v1/postcall/wizard                 list pending post-call wizards / feedback queue
  GET    /api/v1/postcall/wizard/{call_id}       get saved wizard state
  PUT    /api/v1/postcall/wizard/{call_id}       save wizard place ("Finish later")
  DELETE /api/v1/postcall/wizard/{call_id}       complete / clear saved wizard
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from sotto_worker.cloud.memory.merge import MergeRunner, run_memory_merge
from sotto_worker.cloud.memory.store import MemoryStore
from sotto_worker.cloud.store import CloudError, Principal

Wrap = Callable[..., Callable[[Request], Awaitable[Response]]]
NO_STORE = {"Cache-Control": "no-store"}


def _version(request: Request) -> int:
    raw = request.path_params["v"]
    if not raw.isdigit():
        raise CloudError("not_found", "no such version")
    return int(raw)


def make_routes(
    *,
    memory: MemoryStore,
    app_route: Wrap,
    body: Callable[[Request], Awaitable[dict[str, Any]]],
    ip_of: Callable[[Request], str],
    merge_runner: MergeRunner | None = None,
    clock: Callable[[], int] | None = None,
) -> list[Route]:
    api = "/api/v1"

    def _now() -> int | None:
        return clock() if clock else None

    @app_route
    async def submit_feedback(request: Request, who: Principal) -> Response:
        memory.s.require_feature(who, "style_memory")
        data = await body(request)
        fid = memory.add_feedback(
            company_id=who.company,
            user_id=who.user_id,
            call_id=data.get("call_id"),
            source=data.get("source", "card"),
            rating=data.get("rating"),
            reasons=data.get("reasons") or [],
            note=data.get("note"),
            card_id=data.get("card_id"),
            now=_now(),
        )
        return JSONResponse({"id": fid}, status_code=201)

    @app_route
    async def merge_now(request: Request, who: Principal) -> Response:
        memory.s.require_feature(who, "style_memory")
        if merge_runner is None:
            raise CloudError("unavailable", "merge runner not configured")
        data = await body(request)
        call_id = data.get("call_id")
        comp = memory.s._q("SELECT name FROM companies WHERE id=?", (who.company,))
        company_name = str(comp[0]["name"]) if comp else "Company"
        res = await run_memory_merge(
            memory,
            company_id=who.company,
            company_name=company_name,
            user_id=who.user_id,
            runner=merge_runner,
            call_id=call_id if isinstance(call_id, str) else None,
            now=_now(),
        )
        return JSONResponse(res or {"version": None, "status": "noop", "learned_count": 0, "rules": []})

    @app_route
    async def my_memory(_request: Request, who: Principal) -> Response:
        return JSONResponse(memory.agent_view(who), headers=NO_STORE)

    @app_route
    async def admin_memory(_request: Request, who: Principal) -> Response:
        return JSONResponse(memory.admin_overview(who), headers=NO_STORE)

    @app_route
    async def edit_rules(request: Request, who: Principal) -> Response:
        data = await body(request)
        out = memory.edit_rules(
            who,
            scope=str(data.get("scope", "company")),
            user_id=data.get("user_id"),
            raw_items=data.get("items"),
            ip=ip_of(request),
        )
        return JSONResponse(out, headers=NO_STORE)

    @app_route
    async def revert(request: Request, who: Principal) -> Response:
        data = await body(request)
        out = memory.revert_version(
            who,
            scope=str(data.get("scope", "company")),
            user_id=data.get("user_id"),
            version=_version(request),
            ip=ip_of(request),
        )
        return JSONResponse(out, headers=NO_STORE)

    @app_route
    async def approve(request: Request, who: Principal) -> Response:
        data = await body(request)
        out = memory.decide_version(
            who,
            scope=str(data.get("scope", "agent")),
            user_id=data.get("user_id"),
            version=_version(request),
            approve=True,
            ip=ip_of(request),
        )
        return JSONResponse(out, headers=NO_STORE)

    @app_route
    async def reject(request: Request, who: Principal) -> Response:
        data = await body(request)
        out = memory.decide_version(
            who,
            scope=str(data.get("scope", "agent")),
            user_id=data.get("user_id"),
            version=_version(request),
            approve=False,
            ip=ip_of(request),
        )
        return JSONResponse(out, headers=NO_STORE)

    @app_route
    async def promote(request: Request, who: Principal) -> Response:
        data = await body(request)
        out = memory.promote_rule(
            who,
            from_user_id=str(data.get("user_id", "")),
            rule_id=str(data.get("rule_id", "")),
            ip=ip_of(request),
        )
        return JSONResponse(out, headers=NO_STORE)

    @app_route
    async def settings(request: Request, who: Principal) -> Response:
        data = await body(request)
        out = memory.set_review_before_apply(
            who, data.get("review_before_apply"), ip=ip_of(request)
        )
        return JSONResponse(out, headers=NO_STORE)

    @app_route
    async def wizard_list(_request: Request, who: Principal) -> Response:
        return JSONResponse({"items": memory.list_wizard_queue(who, now=_now())}, headers=NO_STORE)

    @app_route
    async def wizard_get(request: Request, who: Principal) -> Response:
        state = memory.get_wizard_state(who, request.path_params["call_id"], now=_now())
        if state is None:
            raise CloudError("not_found", "no saved wizard state for this call")
        return JSONResponse(state, headers=NO_STORE)

    @app_route
    async def wizard_save(request: Request, who: Principal) -> Response:
        data = await body(request)
        state = memory.save_wizard_state(who, request.path_params["call_id"], data, now=_now())
        return JSONResponse(state, headers=NO_STORE)

    @app_route
    async def wizard_delete(request: Request, who: Principal) -> Response:
        memory.delete_wizard_state(who, request.path_params["call_id"])
        return JSONResponse({"ok": True})

    return [
        Route(f"{api}/memory/feedback", submit_feedback, methods=["POST"]),
        Route(f"{api}/memory/merge", merge_now, methods=["POST"]),
        Route(f"{api}/memory/me", my_memory),
        Route(f"{api}/memory/admin", admin_memory),
        Route(f"{api}/memory/rules", edit_rules, methods=["PUT"]),
        Route(f"{api}/memory/versions/{{v}}/revert", revert, methods=["POST"]),
        Route(f"{api}/memory/versions/{{v}}/approve", approve, methods=["POST"]),
        Route(f"{api}/memory/versions/{{v}}/reject", reject, methods=["POST"]),
        Route(f"{api}/memory/promote", promote, methods=["POST"]),
        Route(f"{api}/memory/settings", settings, methods=["PUT"]),
        Route(f"{api}/postcall/wizard", wizard_list),
        Route(f"{api}/postcall/wizard/{{call_id}}", wizard_get, methods=["GET"]),
        Route(f"{api}/postcall/wizard/{{call_id}}", wizard_save, methods=["PUT"]),
        Route(f"{api}/postcall/wizard/{{call_id}}", wizard_delete, methods=["DELETE"]),
    ]
