"""HTTP routes for WhatsApp through Gallabox (D-033, D-036, D-039). Mounted by cloud/app.py.

/api/owner/companies/{id}/gallabox           credentials (vendor; write-only) + allow-list
/api/owner/companies/{id}/gallabox/templates/load  every template Gallabox has
/api/owner/companies/{id}/gallabox/discover  channels + APPROVED templates with guessed mappings
/api/owner/companies/{id}/gallabox/channel   pick the WhatsApp number (by an opaque ref)
/api/owner/companies/{id}/gallabox/templates save the allow-list (parameters cached)
/api/owner/companies/{id}/gallabox/webhook   delivery-status webhook URL + secret (shown once)
/api/v1/company/gallabox                     status only (admin)
/api/v1/whatsapp/templates|preview|send      the agent's approved template send

Round 2 (D-078): the client no longer configures Gallabox — the vendor does, per organisation,
from the company profile. Template-only (D-033): Gallabox documents no window signal, so
`window_status()` is "unknown" and free-form text is refused. No response carries a key, secret,
account or channel id, or anything from Gallabox's embedded `channel` object."""

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
from sotto_worker.cloud.gallabox import data, webhook
from sotto_worker.cloud.scheduler.plans import check_step_key
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
    owner_route: Wrap | None = None,
    origin_of: Callable[[Request], str] | None = None,
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

    # --- owner: Gallabox is configured per organisation from the company profile --------
    # Round 2 (D-078). The client keeps only a status view. `owner_route` enforces the platform
    # owner, so these handlers take the company id from the path and never trust the caller.
    async def o_get(r: Request, _who: Principal) -> Response:
        return JSONResponse(data.status(store, r.path_params["id"]), headers=NO_STORE)

    async def o_put(r: Request, who: Principal) -> Response:
        cid = r.path_params["id"]
        data.save(store, who, await body(r), company_id=cid, ip=ip_of(r))
        return JSONResponse(data.status(store, cid), headers=NO_STORE)

    async def o_delete(r: Request, who: Principal) -> Response:
        cid = r.path_params["id"]
        data.delete(store, who, company_id=cid, ip=ip_of(r))
        return JSONResponse(data.status(store, cid), headers=NO_STORE)

    async def o_load(r: Request, _who: Principal) -> Response:
        found = await live_templates(r.path_params["id"])
        return JSONResponse({"templates": [x.out() for x in found]}, headers=NO_STORE)

    async def o_discover(r: Request, who: Principal) -> Response:
        """ZC-07: after a valid key, the pick lists. Only APPROVED templates are offered; each
        parameter carries a guessed source, and `unmapped` names the ones the vendor must pick.
        With one WhatsApp number on the account and none chosen yet, it is chosen here."""
        cid = r.path_params["id"]
        found, channels = await live_discover(cid)
        creds = data.credentials(store, cid) or {}
        if len(channels) == 1 and not creds.get("channel_id"):
            data.save_channel(
                store, who, channels[0].id, channels[0].label, company_id=cid, ip=ip_of(r)
            )
            creds = data.credentials(store, cid) or {}
        approved = [x for x in found if x.status == "APPROVED"]
        return JSONResponse(
            {
                "channels": [
                    {
                        "ref": channel_ref(cid, c.id),
                        "label": c.label or f"WhatsApp {i + 1}",
                        "selected": c.id == creds.get("channel_id"),
                    }
                    for i, c in enumerate(channels)
                ],
                "templates": [x.out() for x in approved],
                "unmapped": {
                    f"{x.name}/{x.language}": [p.name for p in x.params if not p.source]
                    for x in approved
                },
                "hidden": len(found) - len(approved),
                "status": data.status(store, cid),
            },
            headers=NO_STORE,
        )

    async def o_channel(r: Request, who: Principal) -> Response:
        cid = r.path_params["id"]
        ref = str((await body(r)).get("ref", ""))
        _found, channels = await live_discover(cid)
        picked = next((c for c in channels if channel_ref(cid, c.id) == ref), None)
        if picked is None:
            raise CloudError("invalid", "that WhatsApp number is not on the Gallabox account")
        data.save_channel(store, who, picked.id, picked.label, company_id=cid, ip=ip_of(r))
        return JSONResponse(data.status(store, cid), headers=NO_STORE)

    async def o_allow(r: Request, who: Principal) -> Response:
        """The server re-reads the templates from Gallabox: the parameters it caches come from
        Gallabox, never from what the browser sent."""
        cid = r.path_params["id"]
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
        live = {(x.name, x.language): x for x in await live_templates(cid)} if wanted else {}
        missing = wanted - set(live)
        if missing:
            raise CloudError(
                "invalid", f"not in Gallabox: {', '.join(n for n, _ in sorted(missing))}"
            )
        chosen = [with_mapping(live[k], mappings.get(k)) for k in sorted(wanted)]
        unapproved = [x.name for x in chosen if x.status and x.status != "APPROVED"]
        if unapproved:
            raise CloudError("invalid", f"not approved by WhatsApp yet: {', '.join(unapproved)}")
        data.save_allowed(store, who, chosen, company_id=cid, ip=ip_of(r))
        return JSONResponse(data.status(store, cid), headers=NO_STORE)

    async def o_hook_get(r: Request, _who: Principal) -> Response:
        assert origin_of is not None  # noqa: S101 — app.py always passes it with owner_route
        return JSONResponse(
            webhook.hook_state(store, r.path_params["id"], origin_of(r)), headers=NO_STORE
        )

    async def o_hook_rotate(r: Request, who: Principal) -> Response:
        assert origin_of is not None  # noqa: S101 — app.py always passes it with owner_route
        return JSONResponse(
            webhook.rotate_hook(
                store,
                company_id=r.path_params["id"],
                who=who,
                ip=ip_of(r),
                origin=origin_of(r),
            ),
            headers=NO_STORE,
        )

    # --- client: status only ------------------------------------------------------------------
    @app_route
    async def org_get(_r: Request, who: Principal) -> Response:
        who.require("admin")
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
        check_step_key(store, who, idem)
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
        webhook.remember_message(store, who.company, idem, message_id)  # INT-10: status only
        return JSONResponse(
            {"status": "sent", "duplicate": False, "id": message_id, "window": window},
            headers=NO_STORE,
        )

    api = "/api/v1"
    routes: list[Route] = [
        Route(f"{api}/company/gallabox", org_get),
        Route(f"{api}/whatsapp/templates", templates),
        Route(f"{api}/whatsapp/preview", preview, methods=["POST"]),
        Route(f"{api}/whatsapp/send", send, methods=["POST"]),
    ]
    if owner_route is not None:
        routes += [
            Route("/api/owner/companies/{id}/gallabox", owner_route(o_get)),
            Route(
                "/api/owner/companies/{id}/gallabox",
                owner_route(o_put, mutating=True),
                methods=["PUT"],
            ),
            Route(
                "/api/owner/companies/{id}/gallabox",
                owner_route(o_delete, mutating=True),
                methods=["DELETE"],
            ),
            Route(
                "/api/owner/companies/{id}/gallabox/templates/load",
                owner_route(o_load, mutating=True),
                methods=["POST"],
            ),
            Route(
                "/api/owner/companies/{id}/gallabox/discover",
                owner_route(o_discover, mutating=True),
                methods=["POST"],
            ),
            Route(
                "/api/owner/companies/{id}/gallabox/channel",
                owner_route(o_channel, mutating=True),
                methods=["PUT"],
            ),
            Route(
                "/api/owner/companies/{id}/gallabox/templates",
                owner_route(o_allow, mutating=True),
                methods=["PUT"],
            ),
            Route(
                "/api/owner/companies/{id}/gallabox/webhook",
                owner_route(o_hook_get),
            ),
            Route(
                "/api/owner/companies/{id}/gallabox/webhook",
                owner_route(o_hook_rotate, mutating=True),
                methods=["POST"],
            ),
        ]
    return routes
