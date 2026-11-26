"""Owner console routes for Voice Coach (V2): configure stages, enable per company, set USD cap."""

from __future__ import annotations

import math
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, PlainTextResponse, Response
from starlette.routing import Route

from sotto_worker.cloud.coach.store import CoachStore
from sotto_worker.cloud.store import CloudError, CloudStore, Principal

Handler = Callable[[Request], Awaitable[Response]]
OWNER_DIR = Path(__file__).parent
NO_STORE = {"Cache-Control": "no-store"}


def _opt_bool(data: dict[str, Any], key: str) -> bool | None:
    if key not in data or data[key] is None:
        return None
    val = data[key]
    if not isinstance(val, bool):
        raise CloudError("invalid", f"{key} must be a boolean")
    return val


def _opt_float(data: dict[str, Any], key: str) -> float | None:
    if key not in data or data[key] is None:
        return None
    val = data[key]
    if isinstance(val, bool) or not isinstance(val, int | float):
        raise CloudError("invalid", f"{key} must be a number")
    f = float(val)
    if not math.isfinite(f):
        raise CloudError("invalid", f"{key} must be finite")
    return f


def make_owner_coach_routes(
    *,
    store: CloudStore,
    coach: CoachStore,
    owner_route: Callable[..., Handler],
    body: Callable[[Request], Awaitable[dict[str, Any]]],
    ip_of: Callable[[Request], str],
    owner_host_ok: Callable[[Request], bool] | None = None,
    csp: str | None = None,
) -> list[Route]:
    page_headers = dict(NO_STORE)
    if csp:
        page_headers["Content-Security-Policy"] = csp

    async def list_companies(_request: Request, _who: Principal) -> Response:
        rows = store._q("SELECT id, name FROM companies ORDER BY name")
        items = [
            {"id": str(r["id"]), "name": str(r["name"]), **coach.cap_status(str(r["id"]))}
            for r in rows
        ]
        return JSONResponse({"companies": items}, headers=NO_STORE)

    async def get_company(request: Request, _who: Principal) -> Response:
        cid = request.path_params["company_id"]
        store.company_row(cid)
        return JSONResponse(coach.cap_status(cid), headers=NO_STORE)

    async def update_company(request: Request, who: Principal) -> Response:
        cid = request.path_params["company_id"]
        data = await body(request)
        clear_cap = "cap_usd" in data and data["cap_usd"] is None
        out = coach.configure_company_coach(
            who,
            cid,
            cap_usd=None if clear_cap else _opt_float(data, "cap_usd"),
            cost_per_min_usd=_opt_float(data, "cost_per_min_usd"),
            enabled=_opt_bool(data, "enabled"),
            stages_configured=_opt_bool(data, "stages_configured"),
            clear_cap=clear_cap,
            ip=ip_of(request),
        )
        return JSONResponse(out, headers=NO_STORE)

    async def page(request: Request) -> Response:
        if owner_host_ok is not None and not owner_host_ok(request):
            return PlainTextResponse("not found\n", status_code=404)
        return FileResponse(
            OWNER_DIR / "coach.html",
            media_type="text/html; charset=utf-8",
            headers=page_headers,
        )

    async def script(request: Request) -> Response:
        if owner_host_ok is not None and not owner_host_ok(request):
            return PlainTextResponse("not found\n", status_code=404)
        return FileResponse(
            OWNER_DIR / "coach.js",
            media_type="application/javascript; charset=utf-8",
            headers=page_headers,
        )

    return [
        Route("/api/owner/coach/companies", owner_route(list_companies), methods=["GET"]),
        Route("/api/owner/coach/companies/{company_id}", owner_route(get_company), methods=["GET"]),
        Route(
            "/api/owner/coach/companies/{company_id}",
            owner_route(update_company, mutating=True),
            methods=["PUT"],
        ),
        Route("/owner/coach.html", page, methods=["GET"]),
        Route("/owner/coach.js", script, methods=["GET"]),
    ]
