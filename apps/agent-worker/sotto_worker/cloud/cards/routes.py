"""HTTP routes for card tone presets and banned phrases (C3, D-094).

Merger registers `card_tone_routes(store, auth, owner_route)` in `sotto_worker/cloud/app.py`
(see `docs/handoffs/round4-live-cards.md`).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from sotto_worker.cloud.cards.store import CardToneStore


def card_tone_routes(
    tone_store: CardToneStore,
    require_user: Callable[[Request], Any],
    owner_route: Callable[..., Any],
) -> list[Route]:
    async def get_tone(request: Request) -> JSONResponse:
        who = require_user(request)
        eff = tone_store.resolve(who.company_id, who.user_id)
        comp = tone_store.get_company_settings(who.company_id)
        plat = tone_store.get_platform_banned()
        return JSONResponse(
            {
                "tone": eff.tone,
                "source": eff.source,
                "company_default": eff.company_default,
                "allowed_presets": list(eff.allowed_presets),
                "how_we_talk": eff.how_we_talk,
                "banned_en": list(eff.banned_en),
                "banned_ar": list(eff.banned_ar),
                "company_banned_en": comp["banned_en"],
                "company_banned_ar": comp["banned_ar"],
                "platform_banned_en": plat["en"],
                "platform_banned_ar": plat["ar"],
            }
        )

    async def put_company_tone(request: Request) -> JSONResponse:
        who = require_user(request)
        if getattr(who, "role", None) != "admin":
            return JSONResponse({"error": "forbidden"}, status_code=403)
        body = await request.json()
        try:
            saved = tone_store.set_company_settings(
                who.company_id,
                default_tone=str(body.get("default_tone", "casual")),
                allowed_presets=body.get("allowed_presets"),
                how_we_talk=str(body.get("how_we_talk", "")),
                banned_en=body.get("banned_en"),
                banned_ar=body.get("banned_ar"),
            )
        except ValueError as exc:
            return JSONResponse({"error": str(exc)}, status_code=400)
        return JSONResponse(saved)

    async def put_agent_tone(request: Request) -> JSONResponse:
        who = require_user(request)
        body = await request.json()
        tone = body.get("tone")
        if tone is None or tone == "":
            tone_store.clear_agent_tone(who.company_id, who.user_id)
            eff = tone_store.resolve(who.company_id, who.user_id)
            return JSONResponse({"tone": eff.tone, "source": eff.source})
        try:
            picked = tone_store.set_agent_tone(who.company_id, who.user_id, str(tone))
        except ValueError as exc:
            return JSONResponse({"error": str(exc)}, status_code=400)
        except PermissionError as exc:
            return JSONResponse({"error": str(exc)}, status_code=403)
        return JSONResponse({"tone": picked, "source": "agent"})

    async def get_platform_banned(_request: Request) -> JSONResponse:
        return JSONResponse(tone_store.get_platform_banned())

    async def put_platform_banned(request: Request) -> JSONResponse:
        body = await request.json()
        saved = tone_store.set_platform_banned(
            en=list(body.get("en") or []),
            ar=list(body.get("ar") or []),
        )
        return JSONResponse(saved)

    return [
        Route("/api/v1/cards/tone", get_tone, methods=["GET"]),
        Route("/api/v1/cards/tone/company", put_company_tone, methods=["PUT"]),
        Route("/api/v1/cards/tone/agent", put_agent_tone, methods=["PUT"]),
        Route("/api/owner/cards/banned", owner_route(get_platform_banned), methods=["GET"]),
        Route(
            "/api/owner/cards/banned",
            owner_route(put_platform_banned, mutating=True),
            methods=["PUT"],
        ),
    ]
