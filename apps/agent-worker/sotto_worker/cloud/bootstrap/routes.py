"""HTTP routes for the playbook bootstrap (ZC-04, D-066). Managers and admins, after consent:

GET  /api/v1/playbook/bootstrap                    consent?, the company's domains, open drafts
POST /api/v1/playbook/bootstrap/material           {source: "website", url} | {source: "zoho"}
                                                   → {text} for the device to run the prompt on
POST /api/v1/playbook/bootstrap/drafts             {source, items: [{question, answer, tags?}]}
POST /api/v1/playbook/bootstrap/drafts/{id}/approve  {question?, answer?, tags?} → playbook entry
POST /api/v1/playbook/bootstrap/drafts/{id}/reject

A pasted document never reaches the server: the device runs the prompt on it and sends only the
drafts. Drafts are never in the call bundle until approved (they live in their own table)."""

from __future__ import annotations

import time
from collections import deque
from collections.abc import Awaitable, Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from sotto_worker.cloud.bootstrap import fetch
from sotto_worker.cloud.bootstrap.sources import Reader, zoho_material
from sotto_worker.cloud.bootstrap.store import BootstrapStore
from sotto_worker.cloud.store import CloudError, Principal

Wrap = Callable[..., Callable[[Request], Awaitable[Response]]]
NO_STORE = {"Cache-Control": "no-store"}
# The Zoho lookup's own reader (cloud/zoho/routes.py `zoho_call`), or None while it is not wired.
ZohoCall = Callable[[Principal, Callable[[Reader], Awaitable[Any]]], Awaitable[Any]]


class HourLimit:
    """Material reads per company per hour (website fetches and Zoho reads cost the vendor)."""

    def __init__(self, per_key: int = 20) -> None:
        self.per_key = per_key
        self._hits: dict[str, deque[float]] = {}

    def hit(self, key: str) -> bool:
        now = time.monotonic()
        recent = self._hits.setdefault(key, deque())
        while recent and now - recent[0] > 3600:
            recent.popleft()
        if len(recent) >= self.per_key:
            return False
        recent.append(now)
        return True


def make_routes(
    *,
    bootstrap: BootstrapStore,
    app_route: Wrap,
    body: Callable[[Request], Awaitable[dict[str, Any]]],
    ip_of: Callable[[Request], str],
    limit: Callable[[str], bool] | None = None,
    zoho_call: ZohoCall | None = None,
) -> list[Route]:
    api = "/api/v1/playbook/bootstrap"
    allow = limit or HourLimit().hit

    @app_route
    async def state(_request: Request, who: Principal) -> Response:
        who.require("admin", "manager")
        return JSONResponse(
            {
                "consent": bootstrap.consent(who.company) is not None,
                "domains": bootstrap.domains(who.company),
                # Wired and this person's own Zoho connection works (else "Connect Zoho first").
                "zoho": zoho_call is not None
                and bootstrap.s.feature_state(who, "zoho").state == "available",
                "drafts": bootstrap.list(who),
            },
            headers=NO_STORE,
        )

    @app_route
    async def material(request: Request, who: Principal) -> Response:
        bootstrap.require(who)
        if not allow(who.company):
            raise CloudError("rate_limited", "too many reads; try again in an hour")
        data = await body(request)
        source = data.get("source")
        if source == "website":
            url = data.get("url")
            if not isinstance(url, str) or len(url) > 2000:
                raise CloudError("invalid", "send the website address")
            page = await fetch.fetch_site(url, bootstrap.domains(who.company))
            return JSONResponse({"source": "website", **page}, headers=NO_STORE)
        if source == "zoho":
            if zoho_call is None:
                raise CloudError("zoho_reconnect", "connect Zoho first")
            text = await zoho_call(who, zoho_material)
            return JSONResponse({"source": "zoho", "text": str(text)}, headers=NO_STORE)
        raise CloudError("invalid", "source must be website or zoho")

    @app_route
    async def drafts(request: Request, who: Principal) -> Response:
        data = await body(request)
        out = bootstrap.add(who, data.get("source"), data.get("items"), ip=ip_of(request))
        return JSONResponse(out)

    @app_route
    async def approve(request: Request, who: Principal) -> Response:
        return JSONResponse(
            bootstrap.approve(
                who, request.path_params["id"], await body(request), ip=ip_of(request)
            )
        )

    @app_route
    async def reject(request: Request, who: Principal) -> Response:
        return JSONResponse(bootstrap.reject(who, request.path_params["id"], ip=ip_of(request)))

    return [
        Route(api, state),
        Route(f"{api}/material", material, methods=["POST"]),
        Route(f"{api}/drafts", drafts, methods=["POST"]),
        Route(f"{api}/drafts/{{id}}/approve", approve, methods=["POST"]),
        Route(f"{api}/drafts/{{id}}/reject", reject, methods=["POST"]),
    ]
