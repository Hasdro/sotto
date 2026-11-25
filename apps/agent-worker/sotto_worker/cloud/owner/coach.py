"""Owner console routes for Voice Coach (V2): configure stages, enable per company, set USD cap."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from sotto_worker.cloud.coach.store import DEFAULT_COST_PER_MIN_USD, CoachStore
from sotto_worker.cloud.store import CloudStore, Principal

Handler = Callable[[Request], Awaitable[Response]]
NO_STORE = {"Cache-Control": "no-store"}


def make_owner_coach_routes(
    *,
    store: CloudStore,
    coach: CoachStore,
    owner_route: Callable[..., Handler],
    body: Callable[[Request], Awaitable[dict[str, Any]]],
    ip_of: Callable[[Request], str],
) -> list[Route]:
    @owner_route
    async def list_companies(_request: Request, _who: Principal) -> Response:
        rows = store._q("SELECT id, name FROM companies ORDER BY name")
        items = [
            {"id": str(r["id"]), "name": str(r["name"]), **coach.cap_status(str(r["id"]))}
            for r in rows
        ]
        return JSONResponse({"companies": items}, headers=NO_STORE)

    @owner_route
    async def get_company(request: Request, _who: Principal) -> Response:
        cid = request.path_params["company_id"]
        store.company_row(cid)
        return JSONResponse(coach.cap_status(cid), headers=NO_STORE)

    @owner_route
    async def update_company(request: Request, who: Principal) -> Response:
        cid = request.path_params["company_id"]
        data = await body(request)
        clear_cap = "cap_usd" in data and data["cap_usd"] is None
        out = coach.configure_company_coach(
            who,
            cid,
            cap_usd=None if clear_cap else data.get("cap_usd"),
            cost_per_min_usd=float(data.get("cost_per_min_usd", DEFAULT_COST_PER_MIN_USD)),
            enabled=data.get("enabled"),
            stages_configured=data.get("stages_configured"),
            clear_cap=clear_cap,
            ip=ip_of(request),
        )
        return JSONResponse(out, headers=NO_STORE)

    return [
        Route("/api/owner/coach/companies", list_companies, methods=["GET"]),
        Route("/api/owner/coach/companies/{company_id}", get_company, methods=["GET"]),
        Route("/api/owner/coach/companies/{company_id}", update_company, methods=["PUT"]),
    ]
