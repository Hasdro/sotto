"""HTTP routes for card tone presets and banned phrases (C3, D-094).

Mounted in `sotto_worker/cloud/app.py` with full `@app_route` / `owner_route`,
feature gating (`card_style_v2`, D-036), input validation, and audit logging.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from sotto_worker.cloud.cards.store import CardToneStore
from sotto_worker.cloud.store import CloudError, CloudStore, Principal

Wrap = Callable[..., Callable[[Request], Awaitable[Response]]]
NO_STORE = {"Cache-Control": "no-store"}


def _str_list(value: Any, field: str) -> list[str] | None:
    if value is None:
        return None
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise CloudError("invalid", f"{field} must be a list of strings")
    return list(value)


def _require_company(who: Principal) -> str:
    if not who.company:
        raise CloudError("forbidden", "this account has no organization")
    return who.company


def card_tone_routes(
    *,
    tone_store: CardToneStore,
    cloud_store: CloudStore,
    app_route: Wrap,
    owner_route: Callable[..., Any],
    body: Callable[[Request], Awaitable[dict[str, Any]]],
    ip_of: Callable[[Request], str],
) -> list[Route]:
    @app_route
    async def get_tone(_request: Request, who: Principal) -> Response:
        company_id = _require_company(who)
        cloud_store.require_feature(who, "card_style_v2")
        eff = tone_store.resolve(company_id, who.user_id)
        comp = tone_store.get_company_settings(company_id)
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
            },
            headers=NO_STORE,
        )

    @app_route
    async def put_company_tone(request: Request, who: Principal) -> Response:
        company_id = _require_company(who)
        who.require("admin")
        cloud_store.require_feature(who, "card_style_v2")
        data = await body(request)
        default_tone = data.get("default_tone", "casual")
        how_we_talk = data.get("how_we_talk", "")
        if not isinstance(default_tone, str):
            raise CloudError("invalid", "default_tone must be text")
        if not isinstance(how_we_talk, str):
            raise CloudError("invalid", "how_we_talk must be text")
        allowed_presets = _str_list(data.get("allowed_presets"), "allowed_presets")
        banned_en = _str_list(data.get("banned_en"), "banned_en")
        banned_ar = _str_list(data.get("banned_ar"), "banned_ar")
        try:
            saved = tone_store.set_company_settings(
                company_id,
                default_tone=default_tone,
                allowed_presets=allowed_presets,
                how_we_talk=how_we_talk,
                banned_en=banned_en,
                banned_ar=banned_ar,
                actor=who,
                ip=ip_of(request),
            )
        except ValueError as exc:
            raise CloudError("invalid", str(exc)) from exc
        return JSONResponse(saved, headers=NO_STORE)

    @app_route
    async def put_agent_tone(request: Request, who: Principal) -> Response:
        company_id = _require_company(who)
        cloud_store.require_feature(who, "card_style_v2")
        data = await body(request)
        tone = data.get("tone")
        if tone is None or tone == "":
            try:
                tone_store.clear_agent_tone(company_id, who.user_id)
            except ValueError as exc:
                raise CloudError("forbidden", str(exc)) from exc
            eff = tone_store.resolve(company_id, who.user_id)
            return JSONResponse({"tone": eff.tone, "source": eff.source}, headers=NO_STORE)
        if not isinstance(tone, str):
            raise CloudError("invalid", "tone must be text")
        try:
            picked = tone_store.set_agent_tone(company_id, who.user_id, tone)
        except PermissionError as exc:
            raise CloudError("forbidden", str(exc)) from exc
        except ValueError as exc:
            raise CloudError("invalid", str(exc)) from exc
        return JSONResponse({"tone": picked, "source": "agent"}, headers=NO_STORE)

    async def get_platform_banned(_request: Request, _who: Principal) -> Response:
        return JSONResponse(tone_store.get_platform_banned(), headers=NO_STORE)

    async def put_platform_banned(request: Request, who: Principal) -> Response:
        data = await body(request)
        en = _str_list(data.get("en"), "en") or []
        ar = _str_list(data.get("ar"), "ar") or []
        saved = tone_store.set_platform_banned(en=en, ar=ar, actor=who, ip=ip_of(request))
        return JSONResponse(saved, headers=NO_STORE)

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
