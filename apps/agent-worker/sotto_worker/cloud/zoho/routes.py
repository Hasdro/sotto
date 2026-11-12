"""HTTP routes for Zoho (D-031, D-036). Mounted by cloud/app.py.

/api/owner/zoho                      platform OAuth client (owner console; write-only)
/api/v1/company/zoho/client          the org's own client, overriding the platform one (admin)
/api/v1/zoho/status|connect|connection   one person's connection
/api/v1/zoho/search, /records/…      read-only lookup for the context rail
/auth/zoho/start, /auth/zoho/callback/   the browser half of the OAuth flow

No response carries a client ID, client secret, code or token."""

from __future__ import annotations

import html
import secrets
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, Response
from starlette.routing import Route

from sotto_worker.adapters.crm.zoho import ModuleNotAllowed, ZohoCRMReader, ZohoError
from sotto_worker.cloud.features import FeatureUnavailable
from sotto_worker.cloud.store import CloudError, CloudStore, Principal
from sotto_worker.cloud.zoho import lookup
from sotto_worker.cloud.zoho.oauth import (
    AccessCache,
    Client,
    ZohoAuthError,
    accounts_server_for,
    authorize_url,
    exchange_code,
    refresh_access,
    revoke,
)

Handler = Callable[[Request, Principal], Awaitable[Response]]
Wrap = Callable[..., Callable[[Request], Awaitable[Response]]]
PAGE_CSP = (
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none';"
    " frame-ancestors 'none'"
)
NO_STORE = {"Cache-Control": "no-store"}
BROWSER_COOKIE = "sotto_zoho_flow"


def _page(
    title: str, body: str, status: int = 200, *, link: tuple[str, str] | None = None
) -> HTMLResponse:
    doc = (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>{html.escape(title)}</title><style>"
        "body{font-family:system-ui,sans-serif;margin:0;display:grid;place-items:center;"
        "min-height:100vh;background:#f6f7f9;color:#1b1f24}"
        "@media (prefers-color-scheme:dark){body{background:#111418;color:#e8eaed}}"
        "main{max-width:420px;padding:24px;text-align:center}h1{font-size:22px}</style>"
        "a{display:inline-block;margin-top:12px;padding:10px 18px;border-radius:8px;"
        "background:#1f5eff;color:#fff;text-decoration:none;font-weight:600}"
        f"</head><body><main><h1>{html.escape(title)}</h1><p>{html.escape(body)}</p>"
        + (
            f"<a href='{html.escape(link[0], quote=True)}'>{html.escape(link[1])}</a>"
            if link
            else ""
        )
        + "</main></body></html>"
    )
    return HTMLResponse(
        doc,
        status_code=status,
        headers={"Content-Security-Policy": PAGE_CSP, **NO_STORE, "Referrer-Policy": "no-referrer"},
    )


def make_routes(
    *,
    store: CloudStore,
    app_route: Wrap,
    owner_route: Wrap,
    handle: Wrap,
    body: Callable[[Request], Awaitable[dict[str, Any]]],
    ip_of: Callable[[Request], str],
    origin_of: Callable[[Request], str],
    transport: httpx.AsyncBaseTransport | None = None,
    log: Callable[[str], None] = lambda _l: None,
    secure_cookies: bool = False,
    read_limit: Callable[[str], bool] = lambda _key: True,
) -> list[Route]:
    cache = AccessCache()

    def http() -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=transport) if transport else httpx.AsyncClient()

    def connectable(who: Principal) -> None:
        """Connecting is allowed while the only thing missing is this person's own connection."""
        state = store.feature_state(who, "zoho")
        if state.state == "available":
            return
        if state.state == "needs_connection" and state.cause == "zoho":
            return
        raise FeatureUnavailable("zoho", state)

    def client_of(company_id: str) -> Client | None:
        c = store.zoho_client(company_id)
        return Client(c["client_id"], c["client_secret"], c["dc"]) if c else None

    # --- client configuration --------------------------------------------------------------------
    async def o_get(_r: Request, _who: Principal) -> Response:
        return JSONResponse(store.zoho_client_status(None)["platform"], headers=NO_STORE)

    async def o_put(r: Request, who: Principal) -> Response:
        data = await body(r)
        store.set_platform_zoho_client(
            who,
            str(data.get("client_id", "")),
            str(data.get("client_secret", "")),
            str(data.get("dc", "us")),
            ip=ip_of(r),
        )
        return JSONResponse(store.zoho_client_status(None)["platform"], headers=NO_STORE)

    async def o_delete(r: Request, who: Principal) -> Response:
        store.delete_platform_zoho_client(who, ip=ip_of(r))
        return JSONResponse(store.zoho_client_status(None)["platform"], headers=NO_STORE)

    @app_route
    async def org_get(_r: Request, who: Principal) -> Response:
        who.require("admin")
        return JSONResponse(store.zoho_client_status(who.company), headers=NO_STORE)

    @app_route
    async def org_put(r: Request, who: Principal) -> Response:
        who.require("admin")
        store.require_feature(who, "integrations")
        data = await body(r)
        store.set_org_zoho_client(
            who,
            str(data.get("client_id", "")),
            str(data.get("client_secret", "")),
            str(data.get("dc", "us")),
            ip=ip_of(r),
        )
        return JSONResponse(store.zoho_client_status(who.company), headers=NO_STORE)

    @app_route
    async def org_delete(r: Request, who: Principal) -> Response:
        who.require("admin")
        store.delete_org_zoho_client(who, ip=ip_of(r))
        return JSONResponse(store.zoho_client_status(who.company), headers=NO_STORE)

    # --- one person's connection -----------------------------------------------------------------
    @app_route
    async def status(_r: Request, who: Principal) -> Response:
        state = store.feature_state(who, "zoho")
        clients = store.zoho_client_status(who.company)
        return JSONResponse(
            {
                **store.zoho_connection_status(who),
                "feature": state.out(),
                "client": clients["active"],
            },
            headers=NO_STORE,
        )

    @app_route
    async def connect(r: Request, who: Principal) -> Response:
        connectable(who)
        if client_of(who.company) is None:
            raise CloudError("zoho_no_client", "ask your admin to add the Zoho client first")
        origin = origin_of(r)
        state = store.zoho_new_state(who, f"{origin}/auth/zoho/callback/")
        return JSONResponse({"url": f"{origin}/auth/zoho/start?state={state}"}, headers=NO_STORE)

    @app_route
    async def disconnect(r: Request, who: Principal) -> Response:
        conn = store.zoho_connection(who)
        revoked = False
        if conn is not None:
            async with http() as h:
                revoked = await revoke(h, conn["accounts_server"], conn["refresh_token"])
        cache.drop((who.company, who.user_id))
        store.zoho_delete_connection(who, ip=ip_of(r))
        return JSONResponse({"connected": False, "revoked": revoked})

    async def start(request: Request) -> Response:
        state = request.query_params.get("state", "")
        row = store.zoho_peek_state(state)
        if row is None:
            return _page("Link expired", "Start again from AGN Sales Shield.", 400)
        client = client_of(str(row["company_id"]))
        if client is None:
            return _page("Zoho is not set up", "Ask your admin to add the Zoho client.", 409)
        # Bind the flow to this browser (security review M1), and say whose account it is for,
        # so a forwarded link cannot quietly connect someone else's Zoho.
        browser = secrets.token_urlsafe(32)
        store.zoho_bind_browser(state, browser)
        page = _page(
            "Connect Zoho",
            f"This connects your Zoho account to AGN Sales Shield for {row['email']}. "
            "Continue only if that is you.",
            link=(authorize_url(client, str(row["redirect_uri"]), state), "Continue to Zoho"),
        )
        page.set_cookie(
            BROWSER_COOKIE,
            browser,
            max_age=600,
            httponly=True,
            secure=secure_cookies,
            samesite="lax",  # Zoho's redirect back is a top-level cross-site GET
            path="/auth/zoho/",
        )
        return page

    async def callback(request: Request) -> Response:
        q = request.query_params
        row = store.zoho_spend_state(q.get("state", ""), request.cookies.get(BROWSER_COOKIE, ""))
        if row is None:
            return _page("Link expired", "Start again from AGN Sales Shield.", 400)
        if q.get("error") or not q.get("code"):
            return _page("Not connected", "Zoho did not grant access. Try again from the app.", 400)
        company_id, user_id = str(row["company_id"]), str(row["user_id"])
        person = Principal(
            user_id, company_id, str(row["role"]), row["device_id"], str(row["email"]), ""
        )
        try:
            connectable(person)  # a kill switch or org toggle since /connect still applies
        except FeatureUnavailable:
            return _page("Not connected", "Zoho is switched off for your organisation.", 403)
        client = client_of(company_id)
        if client is None:
            return _page("Zoho is not set up", "Ask your admin to add the Zoho client.", 409)
        accounts = accounts_server_for(q.get("accounts-server"), client)
        try:
            async with http() as h:
                tokens = await exchange_code(
                    h, client, accounts, q["code"], str(row["redirect_uri"])
                )
        except ZohoAuthError as e:
            log(f"zoho: code exchange failed for company {company_id}: {e}")
            return _page("Not connected", "Zoho refused the sign-in. Try again from the app.", 502)
        scope = (store.zoho_client(company_id) or {}).get("scope", "platform")
        store.zoho_save_connection(
            company_id,
            user_id,
            refresh_token=tokens["refresh_token"],
            accounts_server=accounts,
            api_domain=tokens["api_domain"],
            client_scope=scope,
            ip=ip_of(request),
        )
        if tokens["access_token"]:
            cache.put((company_id, user_id), tokens["access_token"], int(tokens["expires_in"]))
        return _page("Connected to Zoho", "You can close this tab and return to AGN Sales Shield.")

    # --- read-only lookup ------------------------------------------------------------------------
    async def reader(h: httpx.AsyncClient, who: Principal) -> ZohoCRMReader:
        store.require_feature(who, "zoho")
        conn = store.zoho_connection(who)
        client = client_of(who.company)
        if conn is None or client is None:
            raise CloudError("zoho_reconnect", "connect Zoho again")
        key = (who.company, who.user_id)
        token = cache.get(key)
        if token is None:
            try:
                token, ttl = await refresh_access(
                    h, client, conn["accounts_server"], conn["refresh_token"]
                )
            except ZohoAuthError as e:
                log(f"zoho: refresh failed for company {who.company}: {e}")
                raise CloudError("zoho_reconnect", "connect Zoho again") from None
            cache.put(key, token, ttl)
        return ZohoCRMReader(h, conn["api_domain"], token)

    async def zoho_call(who: Principal, fn: Callable[[ZohoCRMReader], Awaitable[Any]]) -> Any:
        async with http() as h:
            r = await reader(h, who)
            try:
                return await fn(r)
            except ModuleNotAllowed:
                raise CloudError("forbidden", "that Zoho module is not readable") from None
            except ZohoError as e:
                if e.status == 401:
                    cache.drop((who.company, who.user_id))
                    raise CloudError("zoho_reconnect", "connect Zoho again") from None
                raise CloudError("zoho_unavailable", str(e)) from None

    def limited(who: Principal) -> None:
        if not read_limit(f"{who.company}:{who.user_id}"):
            raise CloudError("rate_limited", "too many Zoho lookups; wait a minute")

    @app_route
    async def search(r: Request, who: Principal) -> Response:
        limited(who)
        query = r.query_params.get("q", "")
        kind = lookup.classify(query)
        if kind is None:
            raise CloudError("invalid", "type a phone number, an email or a name")
        found = await zoho_call(who, lambda rd: lookup.find_candidates(rd, query))
        store.zoho_audit(who, "zoho.search", f"by {kind[0]}: {len(found)} found", ip=ip_of(r))
        return JSONResponse({"candidates": found}, headers=NO_STORE)

    @app_route
    async def record(r: Request, who: Principal) -> Response:
        limited(who)
        module, record_id = r.path_params["module"], r.path_params["id"]
        if module not in lookup.PERSON_MODULES:
            raise CloudError("forbidden", "only contacts and leads can be attached")
        if not lookup.RECORD_ID.match(record_id):
            raise CloudError("invalid", "unknown record")
        brief = await zoho_call(who, lambda rd: lookup.build_brief(rd, module, record_id))
        if brief is None:
            raise CloudError("not_found", "that record is gone")
        store.zoho_audit(who, "zoho.read", f"{module}:{record_id}", ip=ip_of(r))
        return JSONResponse({"brief": brief}, headers=NO_STORE)

    @app_route
    async def modules(_r: Request, who: Principal) -> Response:
        who.require("admin")
        found = await zoho_call(who, lambda rd: rd.modules())
        return JSONResponse({"modules": found}, headers=NO_STORE)

    api = "/api/v1"
    return [
        Route("/api/owner/zoho", owner_route(o_get)),
        Route("/api/owner/zoho", owner_route(o_put, mutating=True), methods=["PUT"]),
        Route("/api/owner/zoho", owner_route(o_delete, mutating=True), methods=["DELETE"]),
        Route(f"{api}/company/zoho/client", org_get),
        Route(f"{api}/company/zoho/client", org_put, methods=["PUT"]),
        Route(f"{api}/company/zoho/client", org_delete, methods=["DELETE"]),
        Route(f"{api}/zoho/status", status),
        Route(f"{api}/zoho/connect", connect, methods=["POST"]),
        Route(f"{api}/zoho/connection", disconnect, methods=["DELETE"]),
        Route(f"{api}/zoho/search", search),
        Route(f"{api}/zoho/records/{{module}}/{{id}}", record),
        Route(f"{api}/zoho/modules", modules),
        Route("/auth/zoho/start", handle(start)),
        Route("/auth/zoho/callback/", handle(callback)),
    ]
