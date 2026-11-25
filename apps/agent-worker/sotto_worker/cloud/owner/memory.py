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
from starlette.responses import FileResponse, JSONResponse, Response
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
) -> list[Route]:
    async def o_memory(_r: Request, _who: Principal) -> Response:
        return JSONResponse(memory.owner_overview(), headers=NO_STORE)

    async def page(_r: Request) -> Response:
        return FileResponse(OWNER_DIR / "memory.html", media_type="text/html; charset=utf-8")

    async def script(_r: Request) -> Response:
        return FileResponse(
            OWNER_DIR / "memory.js", media_type="application/javascript; charset=utf-8"
        )

    return [
        Route("/api/owner/memory", owner_route(o_memory), methods=["GET"]),
        Route("/owner/memory", page, methods=["GET"]),
        Route("/owner/memory.js", script, methods=["GET"]),
    ]
