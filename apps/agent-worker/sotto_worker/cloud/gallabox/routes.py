"""HTTP routes for WhatsApp through Gallabox (D-033, D-036, D-039). Mounted by cloud/app.py.

/api/v1/company/gallabox                     credentials (admin; write-only) + allow-list
/api/v1/company/gallabox/templates/load      every template Gallabox has, for the dropdown
/api/v1/company/gallabox/discover            channels + APPROVED templates with guessed mappings
/api/v1/company/gallabox/channel             pick the WhatsApp number (by an opaque ref)
/api/v1/company/gallabox/templates           save the allow-list (parameters cached)
/api/v1/whatsapp/templates|preview|send      the agent's approved template send

Template-only (D-033): Gallabox documents no window signal, so `window_status()` is "unknown"
and free-form text is refused. No response carries a key, secret, account or channel id, or
anything from Gallabox's embedded `channel` object."""

from __future__ import annotations

import dataclasses
import hashlib
import re
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from sotto_worker.adapters.whatsapp.gallabox import (
    SOURCES,
    VAR,
    Channel,
    Gallabox,
    GallaboxError,
    Template,
    digits,
)
from sotto_worker.cloud.gallabox import data
from sotto_worker.cloud.store import CloudError, CloudStore, Principal

Wrap = Callable[..., Callable[[Request], Awaitable[Response]]]
NO_STORE = {"Cache-Control": "no-store"}
IDEM = re.compile(r"^[A-Za-z0-9_.:-]{8,100}$")
MAX_TEMPLATES = 50


def check_value(name: str, value: Any) -> str:
    """WhatsApp rejects parameters with new lines, tabs or more than 4 spaces in a row."""
    text = str(value if value is not None else "").strip()
    if not text:
        raise CloudError("invalid", f"fill in {name}")
    if len(text) > 500:
        raise CloudError("invalid", f"{name} is too long (max 500)")
    if any(c in text for c in "\r\n\t") or "    " in text:
        raise CloudError("invalid", f"{name} must be one line without tabs or long spaces")
    return text


def preview_text(template: Template, values: dict[str, str]) -> str:
    return VAR.sub(lambda m: values.get(m.group(1), m.group(0)), template.body)


def channel_ref(company_id: str, channel_id: str) -> str:
    """What the screen gets instead of a channel id (D-039): stable per org, not reversible."""
    return hashlib.sha256(f"gallabox-channel:{company_id}:{channel_id}".encode()).hexdigest()[:16]


def with_mapping(template: Template, mapping: Any) -> Template:
    """The admin's choices for unmapped parameters; a guessed one may be changed too."""
    given: dict[str, Any] = mapping if isinstance(mapping, dict) else {}
    params = []
    for p in template.params:
        source = given.get(p.name, p.source)
        if not isinstance(source, str) or (source and source not in SOURCES):
            raise CloudError("invalid", f"unknown source for {p.name}")
        params.append(dataclasses.replace(p, source=source))
    return dataclasses.replace(template, params=tuple(params))


def mask(phone: str) -> str:
    d = digits(phone)
    return f"+{'•' * max(0, len(d) - 4)}{d[-4:]}"


def make_routes(
    *,
    store: CloudStore,
    app_route: Wrap,
    body: Callable[[Request], Awaitable[dict[str, Any]]],
    ip_of: Callable[[Request], str],
    transport: httpx.AsyncBaseTransport | None = None,
    send_limit: Callable[[str], bool] = lambda _key: True,
    log: Callable[[str], None] = lambda _l: None,
) -> list[Route]:
    data.ensure(store)

    def http() -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=transport) if transport else httpx.AsyncClient()

    def client(h: httpx.AsyncClient, company_id: str) -> Gallabox:
        creds = data.credentials(store, company_id)
        if creds is None:
            raise CloudError("gallabox_no_credentials", "add the Gallabox keys first")
        return Gallabox(h, **creds)

    def failed(e: GallaboxError) -> CloudError:
        if e.status in (401, 403):
            return CloudError("gallabox_auth", "Gallabox refused the keys; check them")
        return CloudError("gallabox_unavailable", str(e))

    async def live_templates(company_id: str) -> list[Template]:
        async with http() as h:
            try:
                return await client(h, company_id).templates()
            except GallaboxError as e:
                raise failed(e) from None

    async def live_discover(company_id: str) -> tuple[list[Template], list[Channel]]:
        async with http() as h:
            try:
                return await client(h, company_id).discover()
            except GallaboxError as e:
                raise failed(e) from None

    # --- admin ---------------------------------------------------------------------------------
    @app_route
    async def discover(r: Request, who: Principal) -> Response:
        """ZC-07: after a valid key, the pick lists. Only APPROVED templates are offered; each
        parameter carries a guessed source, and `unmapped` names the ones the admin must pick.
        With one WhatsApp number on the account and none chosen yet, it is chosen here."""
        who.require("admin")
        store.require_feature(who, "integrations")
        found, channels = await live_discover(who.company)
        creds = data.credentials(store, who.company) or {}
        if len(channels) == 1 and not creds.get("channel_id"):
            data.save_channel(store, who, channels[0].id, channels[0].label, ip=ip_of(r))
            creds = data.credentials(store, who.company) or {}
        approved = [t for t in found if t.status == "APPROVED"]
        return JSONResponse(
            {
                "channels": [
                    {
                        "ref": channel_ref(who.company, c.id),
                        "label": c.label or f"WhatsApp {i + 1}",
                        "selected": c.id == creds.get("channel_id"),
                    }
                    for i, c in enumerate(channels)
                ],
                "templates": [t.out() for t in approved],
                "unmapped": {
                    f"{t.name}/{t.language}": [p.name for p in t.params if not p.source]
                    for t in approved
                },
                "hidden": len(found) - len(approved),
                "status": data.status(store, who.company),
            },
            headers=NO_STORE,
        )

    @app_route
    async def channel(r: Request, who: Principal) -> Response:
        who.require("admin")
        store.require_feature(who, "integrations")
        ref = str((await body(r)).get("ref", ""))
        _found, channels = await live_discover(who.company)
        picked = next((c for c in channels if channel_ref(who.company, c.id) == ref), None)
        if picked is None:
            raise CloudError("invalid", "that WhatsApp number is not on the Gallabox account")
        data.save_channel(store, who, picked.id, picked.label, ip=ip_of(r))
        return JSONResponse(data.status(store, who.company), headers=NO_STORE)

    @app_route
    async def org_get(_r: Request, who: Principal) -> Response:
        who.require("admin")
        return JSONResponse(data.status(store, who.company), headers=NO_STORE)

    @app_route
    async def org_put(r: Request, who: Principal) -> Response:
        who.require("admin")
        store.require_feature(who, "integrations")
        data.save(store, who, await body(r), ip=ip_of(r))
        return JSONResponse(data.status(store, who.company), headers=NO_STORE)

    @app_route
    async def org_delete(r: Request, who: Principal) -> Response:
        who.require("admin")
        data.delete(store, who, ip=ip_of(r))
        return JSONResponse(data.status(store, who.company), headers=NO_STORE)

    @app_route
    async def load(_r: Request, who: Principal) -> Response:
        who.require("admin")
        store.require_feature(who, "integrations")
        found = await live_templates(who.company)
        return JSONResponse({"templates": [t.out() for t in found]}, headers=NO_STORE)

    @app_route
    async def allow(r: Request, who: Principal) -> Response:
        """The server re-reads the templates from Gallabox: the parameters it caches come from
        Gallabox, never from what the browser sent."""
        who.require("admin")
        store.require_feature(who, "integrations")
        picked = (await body(r)).get("selected")
        if not isinstance(picked, list) or len(picked) > MAX_TEMPLATES:
            raise CloudError("invalid", f"select up to {MAX_TEMPLATES} templates")
        wanted = {
            (str(p.get("name", "")), str(p.get("language", "")))
            for p in picked
            if isinstance(p, dict)
        }
        mappings = {
            (str(p.get("name", "")), str(p.get("language", ""))): p.get("mapping")
            for p in picked
            if isinstance(p, dict)
        }
        live = (
            {(t.name, t.language): t for t in await live_templates(who.company)} if wanted else {}
        )
        missing = wanted - set(live)
        if missing:
            raise CloudError(
                "invalid", f"not in Gallabox: {', '.join(n for n, _ in sorted(missing))}"
            )
        chosen = [with_mapping(live[k], mappings.get(k)) for k in sorted(wanted)]
        unapproved = [t.name for t in chosen if t.status and t.status != "APPROVED"]
        if unapproved:
            raise CloudError("invalid", f"not approved by WhatsApp yet: {', '.join(unapproved)}")
        data.save_allowed(store, who, chosen, ip=ip_of(r))
        return JSONResponse(data.status(store, who.company), headers=NO_STORE)

    # --- agent ---------------------------------------------------------------------------------
    @app_route
    async def templates(_r: Request, who: Principal) -> Response:
        store.require_feature(who, "whatsapp")
        return JSONResponse(
            {"templates": [t.out() for t in data.allowed(store, who.company)], "freeform": False},
            headers=NO_STORE,
        )

    def compose(who: Principal, d: dict[str, Any]) -> tuple[Template, dict[str, str], str, str]:
        store.require_feature(who, "whatsapp")
        if d.get("type", "template") != "template":
            raise CloudError("freeform_disabled", "only approved templates can be sent")
        key = (str(d.get("template", "")), str(d.get("language", "")))
        tpl = next(
            (t for t in data.allowed(store, who.company) if (t.name, t.language) == key), None
        )
        if tpl is None:
            raise CloudError("invalid", "that template is not on your organisation's list")
        given, to = d.get("values"), d.get("recipient")
        raw: dict[str, Any] = given if isinstance(given, dict) else {}
        values = {p.name: check_value(p.name, raw.get(p.name)) for p in tpl.params}
        recipient: dict[str, Any] = to if isinstance(to, dict) else {}
        phone = digits(str(recipient.get("phone", "")))
        if not 8 <= len(phone) <= 15:
            raise CloudError("invalid", "enter the customer's phone with country code")
        name = " ".join(str(recipient.get("name", "")).split())[:100] or "Customer"
        return tpl, values, phone, name

    @app_route
    async def preview(r: Request, who: Principal) -> Response:
        tpl, values, phone, name = compose(who, await body(r))
        return JSONResponse(
            {
                "template": tpl.name,
                "language": tpl.language,
                "to": {"name": name, "phone": f"+{phone}"},
                "text": preview_text(tpl, values),
            },
            headers=NO_STORE,
        )

    @app_route
    async def send(r: Request, who: Principal) -> Response:
        d = await body(r)
        tpl, values, phone, name = compose(who, d)
        if d.get("confirm") is not True:
            raise CloudError("confirm", "confirm the preview before sending")
        idem = str(d.get("idempotency_key", ""))
        if not IDEM.match(idem):
            raise CloudError("invalid", "missing idempotency key")
        state = data.claim_send(store, who, idem)
        if state == "sent":
            return JSONResponse({"status": "sent", "duplicate": True}, headers=NO_STORE)
        if state == "sending":
            raise CloudError("in_progress", "this message is being sent")
        detail = f"{tpl.name}/{tpl.language} to {mask(phone)}"
        if not send_limit(f"wa:{who.company}:{who.user_id}"):
            data.finish_send(
                store, who, idem, ok=False, detail=f"{detail}: rate limited", ip=ip_of(r)
            )
            raise CloudError("rate_limited", "too many messages; wait a minute")
        async with http() as h:
            try:
                gb = client(h, who.company)
                if not (data.credentials(store, who.company) or {}).get("channel_id"):
                    raise CloudError("gallabox_no_channel", "your admin has to pick a number")
                # Re-checked right before sending (D-033). Only an authoritative "open" could
                # ever allow free text; it is never offered in v1, so this is informational.
                window = await gb.window_status(phone)
                message_id = await gb.send_template(
                    phone=phone, name=name, template=tpl, values=values
                )
            except GallaboxError as e:
                why = f"{detail}: {e}" + (f" (code {e.code})" if e.code else "")
                data.finish_send(store, who, idem, ok=False, detail=why, ip=ip_of(r))
                log(f"gallabox: send failed for company {who.company}: {e.status} {e.code}")
                if e.stop:
                    raise CloudError(
                        "whatsapp_blocked",
                        f"WhatsApp refused this message (code {e.code}); do not retry it",
                    ) from None
                raise failed(e) from None
            except CloudError:
                data.finish_send(
                    store, who, idem, ok=False, detail=f"{detail}: not set up", ip=ip_of(r)
                )
                raise
        data.finish_send(store, who, idem, ok=True, detail=detail, ip=ip_of(r))
        return JSONResponse(
            {"status": "sent", "duplicate": False, "id": message_id, "window": window},
            headers=NO_STORE,
        )

    api = "/api/v1"
    return [
        Route(f"{api}/company/gallabox", org_get),
        Route(f"{api}/company/gallabox", org_put, methods=["PUT"]),
        Route(f"{api}/company/gallabox", org_delete, methods=["DELETE"]),
        Route(f"{api}/company/gallabox/templates/load", load, methods=["POST"]),
        Route(f"{api}/company/gallabox/templates", allow, methods=["PUT"]),
        Route(f"{api}/company/gallabox/discover", discover, methods=["POST"]),
        Route(f"{api}/company/gallabox/channel", channel, methods=["PUT"]),
        Route(f"{api}/whatsapp/templates", templates),
        Route(f"{api}/whatsapp/preview", preview, methods=["POST"]),
        Route(f"{api}/whatsapp/send", send, methods=["POST"]),
    ]
