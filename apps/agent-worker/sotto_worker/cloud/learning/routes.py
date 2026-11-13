"""HTTP routes for ratings and learned instructions (R11, D-034). Mounted by cloud/app.py.

POST /api/v1/ratings                         one person's rating of one AI card (or null to clear)
GET  /api/v1/ratings/summary?days=30         aggregates for admins
POST /api/v1/learning/proposals              a learning run's instructions, from the device
GET  /api/v1/learning                        the editor: active list, versions, review switch
PUT  /api/v1/learning/instructions           admin edit → new version
POST /api/v1/learning/versions/{v}/revert    copy an earlier version into a new one
POST /api/v1/learning/versions/{v}/approve|reject
PUT  /api/v1/learning/settings               {"review_before_apply": bool}
POST /api/v1/learning/seen                   clears the "New instructions" badge"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from sotto_worker.cloud.learning.store import LearningStore
from sotto_worker.cloud.store import CloudError, Principal

Wrap = Callable[..., Callable[[Request], Awaitable[Response]]]


def _version(request: Request) -> int:
    raw = request.path_params["v"]
    if not raw.isdigit():
        raise CloudError("not_found", "no such version")
    return int(raw)


def make_routes(
    *,
    learning: LearningStore,
    app_route: Wrap,
    body: Callable[[Request], Awaitable[dict[str, Any]]],
    ip_of: Callable[[Request], str],
) -> list[Route]:
    api = "/api/v1"

    @app_route
    async def rate(request: Request, who: Principal) -> Response:
        return JSONResponse(learning.rate(who, await body(request)))

    @app_route
    async def summary(request: Request, who: Principal) -> Response:
        days = request.query_params.get("days", "30")
        return JSONResponse(learning.summary(who, int(days) if days.isdigit() else 30))

    @app_route
    async def propose(request: Request, who: Principal) -> Response:
        out = learning.propose(who, await body(request), ip=ip_of(request))
        return JSONResponse(out, status_code=201)

    @app_route
    async def overview(_request: Request, who: Principal) -> Response:
        return JSONResponse(learning.overview(who), headers={"Cache-Control": "no-store"})

    @app_route
    async def save(request: Request, who: Principal) -> Response:
        return JSONResponse(learning.save(who, await body(request), ip=ip_of(request)))

    @app_route
    async def revert(request: Request, who: Principal) -> Response:
        return JSONResponse(learning.revert(who, _version(request), ip=ip_of(request)))

    @app_route
    async def approve(request: Request, who: Principal) -> Response:
        return JSONResponse(learning.decide(who, _version(request), True, ip=ip_of(request)))

    @app_route
    async def reject(request: Request, who: Principal) -> Response:
        return JSONResponse(learning.decide(who, _version(request), False, ip=ip_of(request)))

    @app_route
    async def settings(request: Request, who: Principal) -> Response:
        data = await body(request)
        return JSONResponse(
            learning.set_review(who, data.get("review_before_apply"), ip=ip_of(request))
        )

    @app_route
    async def seen(_request: Request, who: Principal) -> Response:
        learning.mark_seen(who)
        return JSONResponse({"ok": True})

    return [
        Route(f"{api}/ratings", rate, methods=["POST"]),
        Route(f"{api}/ratings/summary", summary),
        Route(f"{api}/learning/proposals", propose, methods=["POST"]),
        Route(f"{api}/learning", overview),
        Route(f"{api}/learning/instructions", save, methods=["PUT"]),
        Route(f"{api}/learning/versions/{{v}}/revert", revert, methods=["POST"]),
        Route(f"{api}/learning/versions/{{v}}/approve", approve, methods=["POST"]),
        Route(f"{api}/learning/versions/{{v}}/reject", reject, methods=["POST"]),
        Route(f"{api}/learning/settings", settings, methods=["PUT"]),
        Route(f"{api}/learning/seen", seen, methods=["POST"]),
    ]
