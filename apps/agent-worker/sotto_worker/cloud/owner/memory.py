"""Owner console read-only routes for style memory across all companies (Round 4, A4).

Mounted by cloud/app.py:
  GET /api/owner/memory   read-only JSON of all companies' company-wide + per-agent style rules
  GET /owner/memory       read-only HTML view
  GET /owner/memory.js    client script for the read-only HTML view
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from pathlib import Path

from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, PlainTextResponse, Response
from starlette.routing import Route

from sotto_worker.cloud.memory.store import MemoryStore
from sotto_worker.cloud.store import Principal

Handler = Callable[[Request], Awaitable[Response]]
OWNER_DIR = Path(__file__).parent
NO_STORE = {"Cache-Control": "no-store"}


def make_routes(
    *,
    memory: MemoryStore,
    owner_route: Callable[..., Handler],
    owner_host_ok: Callable[[Request], bool] | None = None,
    csp: str | None = None,
) -> list[Route]:
    page_headers = dict(NO_STORE)
    if csp:
        page_headers["Content-Security-Policy"] = csp

    async def o_memory(_r: Request, _who: Principal) -> Response:
        return JSONResponse(memory.owner_overview(), headers=NO_STORE)

    async def page(request: Request) -> Response:
        if owner_host_ok is not None and not owner_host_ok(request):
            return PlainTextResponse("not found\n", status_code=404)
        return FileResponse(
            OWNER_DIR / "memory.html",
            media_type="text/html; charset=utf-8",
            headers=page_headers,
        )

    async def script(request: Request) -> Response:
        if owner_host_ok is not None and not owner_host_ok(request):
            return PlainTextResponse("not found\n", status_code=404)
        return FileResponse(
            OWNER_DIR / "memory.js",
            media_type="application/javascript; charset=utf-8",
            headers=page_headers,
        )

    return [
        Route("/api/owner/memory", owner_route(o_memory), methods=["GET"]),
        Route("/owner/memory", page, methods=["GET"]),
        Route("/owner/memory.js", script, methods=["GET"]),
    ]
