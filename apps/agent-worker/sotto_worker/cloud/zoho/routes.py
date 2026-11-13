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
import time
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

import httpx
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, Response
from starlette.routing import Route

from sotto_worker.adapters.crm.zoho import ModuleNotAllowed, ZohoCRMReader, ZohoError
from sotto_worker.cloud.features import FeatureUnavailable
from sotto_worker.cloud.store import CloudError, CloudStore, Principal
from sotto_worker.cloud.zoho import actions, lookup
from sotto_worker.cloud.zoho.oauth import (
    ACCOUNTS,
    DC_NAMES,
    SCOPES,
    AccessCache,
    Client,
    ZohoAuthError,
    authorize_url,
    detect_dc,
    exchange_code,
    missing_scopes,
    probe_order,
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
# UX-35 / D-054: the desktop app's "return to the app" link. It never carries a token or code.
APP_LINK = "agn-sales-shield://zoho/connected"
READS = "meetings, contacts, deals"
WRITES = "meetings and notes after you approve them"


# Quiet Paper Glass (D-041, DESIGN-SYSTEM.md §5.6): the design-system tokens (the owner console's
# copy of packages/ui/tokens.css, kept current by a test) inlined, since PAGE_CSP allows only
# inline styles. Fonts fall back to the system face (no font-src). Colours only from --ss-*.
TOKENS_CSS = (Path(__file__).resolve().parent.parent / "owner" / "tokens.css").read_text()
PAGE_STYLE = TOKENS_CSS + (
    "*{box-sizing:border-box}"
    "body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;"
    "background:var(--ss-background);color:var(--ss-text);font-family:var(--ss-font);"
    "font-size:var(--ss-text-body);line-height:var(--ss-leading-body);"
    "-webkit-font-smoothing:antialiased}"
    "main{width:100%;max-width:480px;background:var(--ss-surface);"
    "border:1px solid var(--ss-border);border-radius:var(--ss-radius-xl);padding:32px 24px 24px}"
    ".mark{display:flex;align-items:center;gap:8px;margin-bottom:32px;color:var(--ss-primary)}"
    ".mark svg{width:30px;height:30px;flex:none}"
    ".mark span{display:grid;font-weight:var(--ss-weight-semibold);font-size:16px;line-height:20px}"
    ".mark small{font-size:12px;line-height:14px;font-weight:var(--ss-weight-medium);"
    "color:var(--ss-text-muted)}"
    ".state{width:44px;height:44px;margin:0 0 16px;border-radius:var(--ss-radius-pill);"
    "display:grid;place-items:center;background:var(--ss-surface-sunken);font-size:20px;"
    "font-weight:var(--ss-weight-semibold)}"
    ".state.ok{color:var(--ss-positive)}.state.bad{color:var(--ss-danger)}"
    "h1{margin:0 0 8px;font-size:var(--ss-text-title);line-height:var(--ss-leading-title);"
    "font-weight:var(--ss-weight-semibold)}"
    "p{margin:0;color:var(--ss-text-muted)}"
    "a{color:var(--ss-primary);text-underline-offset:2px}"
    "a.go,a.quiet{display:inline-flex;align-items:center;justify-content:center;height:44px;"
    "padding:0 20px;border-radius:var(--ss-radius-pill);text-decoration:none;"
    "font-weight:var(--ss-weight-medium);"
    "transition:opacity var(--ss-dur-base) var(--ss-ease-standard),"
    "background-color var(--ss-dur-base) var(--ss-ease-standard)}"
    "a.go{margin-top:24px;background:var(--ss-primary);color:var(--ss-on-primary)}"
    "a.go:hover{opacity:.92}"
    "a.quiet{margin-top:8px;color:var(--ss-text)}a.quiet:hover{background:var(--ss-surface-sunken)}"
    "main>br{display:none}p+br+a.quiet,ul+br+a.quiet{margin-top:24px}"
    "a.go+br+a.quiet{margin-inline-start:8px}"
    ".facts{margin:24px 0 0;padding:0;list-style:none;display:grid;gap:4px}"
    ".facts li{padding:12px 16px;border-radius:var(--ss-radius-lg);"
    "background:var(--ss-surface-sunken);color:var(--ss-text-muted);font-size:14px;line-height:20px}"
    ".facts b{display:block;color:var(--ss-text);font-weight:var(--ss-weight-medium)}"
    "details{margin-top:4px}summary{cursor:pointer;color:var(--ss-primary);"
    "font-weight:var(--ss-weight-medium);min-height:32px;display:flex;align-items:center}"
    ".dcs{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}"
    ".dcs a{display:inline-flex;align-items:center;height:36px;padding:0 14px;"
    "border-radius:var(--ss-radius-pill);background:var(--ss-surface);color:var(--ss-text);"
    "text-decoration:none;font-weight:var(--ss-weight-medium);box-shadow:0 0 0 1px var(--ss-border)}"
    ".dcs a:hover{background:var(--ss-bubble)}"
    "a:focus-visible,summary:focus-visible{outline:2px solid var(--ss-focus);outline-offset:2px}"
    "@media (prefers-reduced-motion:reduce){*{transition-duration:0ms!important}}"
)
SHIELD = (
    "<svg viewBox='0 0 64 64' aria-hidden='true'><defs><mask id='cut'>"
    "<rect width='64' height='64' fill='#fff'/><g transform='translate(14.5 14.5) scale(0.55)'>"
    "<g fill='#000'><rect x='6.5' y='8.5' width='21' height='14' rx='6.5' "
    "transform='rotate(-38 17 15.5)'/><rect x='36.5' y='41.5' width='21' height='14' rx='6.5' "
    "transform='rotate(-52 47 48.5)'/></g><path d='M15 17 C9 33 23 51 46 50' fill='none' "
    "stroke='#000' stroke-width='10' stroke-linecap='round'/></g></mask></defs>"
    "<path d='M32 3 L57 11 V29 C57 45 46.5 55 32 61 C17.5 55 7 45 7 29 V11 Z' "
    "fill='currentColor' mask='url(#cut)'/></svg>"
)


def _page(
    title: str,
    body: str,
    status: int = 200,
    *,
    link: tuple[str, str] | None = None,
    state: str | None = None,
    extra: str = "",
    after: str = "",
) -> HTMLResponse:
    """A small branded page for the browser half of the OAuth flow. All styling is in the head's
    <style> (allowed by PAGE_CSP); every dynamic value is escaped. `extra` (before the main link)
    and `after` are HTML the caller built from escaped values."""
    badge = {
        "ok": "<div class='state ok' aria-hidden='true'>&#10003;</div>",
        "bad": "<div class='state bad' aria-hidden='true'>!</div>",
    }.get(state or "", "")
    go = (
        f"<a class='go' href='{html.escape(link[0], quote=True)}'>{html.escape(link[1])}</a>"
        if link
        else ""
    )
    doc = (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<meta name='color-scheme' content='light dark'>"
        f"<title>{html.escape(title)} · AGN Sales Shield</title>"
        f"<style>{PAGE_STYLE}</style></head><body><main>"
        f"<div class='mark'>{SHIELD}<span><small>AGN</small>Sales Shield</span></div>{badge}"
        f"<h1>{html.escape(title)}</h1><p>{html.escape(body)}</p>{extra}{go}{after}"
        "</main></body></html>"
    )
    return HTMLResponse(
        doc,
        status_code=status,
        headers={
            "Content-Security-Policy": PAGE_CSP,
            **NO_STORE,
            "Referrer-Policy": "no-referrer",
        },
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

    def connect_page(state: str, row: Any, client: Client) -> HTMLResponse:
        """UX-35: what is read and written, the data centre with "Change", and Cancel."""
        chosen = row["dc"] if row["dc"] in ACCOUNTS else None
        known = chosen or store.zoho_known_dc(str(row["company_id"]), str(row["user_id"]))
        if chosen:
            dc_line = f"{DC_NAMES[chosen]} (you chose it)"
        elif known:
            dc_line = f"{DC_NAMES.get(known, known)} (detected when you sign in)"
        else:
            dc_line = "Detected automatically when you sign in"
        q = html.escape(state, quote=True)
        choices = "".join(
            f"<a href='/auth/zoho/start?state={q}&amp;dc={code}'>{html.escape(name)}</a>"
            for code, name in DC_NAMES.items()
        )
        facts = (
            "<ul class='facts'>"
            f"<li><b>Reads:</b> {html.escape(READS)}</li>"
            f"<li><b>Writes:</b> {html.escape(WRITES)}</li>"
            f"<li><b>Zoho data centre:</b> {html.escape(dc_line)}"
            "<details><summary>Change</summary>"
            f"<div class='dcs'>{choices}"
            f"<a href='/auth/zoho/start?state={q}&amp;dc=auto'>Detect automatically</a></div>"
            "</details></li></ul>"
        )
        return _page(
            "Connect Zoho",
            f"This connects your Zoho account to AGN Sales Shield for {row['email']}. "
            "Continue only if that is you.",
            link=(
                authorize_url(client, str(row["redirect_uri"]), state, dc=chosen),
                "Continue to Zoho",
            ),
            extra=facts,
            after=f"<br><a class='quiet' href='/auth/zoho/cancel?state={q}'>Cancel</a>",
        )

    async def start(request: Request) -> Response:
        state = request.query_params.get("state", "")
        row = store.zoho_peek_state(state)
        if row is None:
            return _page("Link expired", "Start again from AGN Sales Shield.", 400, state="bad")
        client = client_of(str(row["company_id"]))
        if client is None:
            return _page(
                "Zoho is not set up", "Ask your admin to add the Zoho client.", 409, state="bad"
            )
        # Bind the flow to the first browser that opens it (security review M1); that browser
        # keeps its cookie for "Change". Say whose account it is for, so a forwarded link
        # cannot quietly connect someone else's Zoho.
        browser = request.cookies.get(BROWSER_COOKIE, "")[:100] or secrets.token_urlsafe(32)
        if not store.zoho_bind_browser(state, browser):
            return _page(
                "Open it where you started",
                "This link is already open in another browser. Start again from AGN Sales Shield.",
                409,
                state="bad",
            )
        pick = request.query_params.get("dc")
        if pick is not None:  # "Change": a known DC, or "auto" to detect again
            store.zoho_choose_dc(state, pick if pick in ACCOUNTS else None)
            row = store.zoho_peek_state(state) or row
        page = connect_page(state, row, client)
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

    async def cancel(request: Request) -> Response:
        """UX-35 Cancel: spends the state from the bound browser, so the link is dead."""
        store.zoho_spend_state(
            request.query_params.get("state", ""), request.cookies.get(BROWSER_COOKIE, "")
        )
        return _page(
            "Not connected",
            "Nothing was connected. You can close this tab.",
            after=f"<br><a class='quiet' href='{APP_LINK.replace('connected', 'cancelled')}'>"
            "Open Sales Shield</a>",
        )

    async def callback(request: Request) -> Response:
        q = request.query_params
        row = store.zoho_spend_state(q.get("state", ""), request.cookies.get(BROWSER_COOKIE, ""))
        if row is None:
            return _page("Link expired", "Start again from AGN Sales Shield.", 400, state="bad")
        if q.get("error") or not q.get("code"):
            return _page(
                "Not connected",
                "Zoho did not grant access. Try again from the app.",
                400,
                state="bad",
            )
        company_id, user_id = str(row["company_id"]), str(row["user_id"])
        person = Principal(
            user_id, company_id, str(row["role"]), row["device_id"], str(row["email"]), ""
        )
        try:
            connectable(person)  # a kill switch or org toggle since /connect still applies
        except FeatureUnavailable:
            return _page(
                "Not connected", "Zoho is switched off for your organisation.", 403, state="bad"
            )
        client = client_of(company_id)
        if client is None:
            return _page(
                "Zoho is not set up", "Ask your admin to add the Zoho client.", 409, state="bad"
            )
        # ZC-02: Zoho names the DC; else the chosen one; else probe the known DCs in order.
        chosen = row["dc"] if row["dc"] in ACCOUNTS else None
        fallback = chosen or store.zoho_known_dc(company_id, user_id) or client.dc
        accounts, dc = detect_dc(q.get("accounts-server"), q.get("location"), fallback)
        tries = [accounts] if dc or chosen else probe_order(fallback)
        tokens: dict[str, str] | None = None
        try:
            async with http() as h:
                for server in tries:
                    try:
                        tokens = await exchange_code(
                            h, client, server, q["code"], str(row["redirect_uri"])
                        )
                        accounts = server
                        break
                    except ZohoAuthError as e:
                        last = e
                if tokens is None:
                    raise last
        except ZohoAuthError as e:
            log(f"zoho: code exchange failed for company {company_id}: {e}")
            return _page(
                "Not connected",
                "Zoho refused the sign-in. Try again from the app.",
                502,
                state="bad",
            )
        scope = (store.zoho_client(company_id) or {}).get("scope", "platform")
        store.zoho_save_connection(
            company_id,
            user_id,
            refresh_token=tokens["refresh_token"],
            accounts_server=accounts,
            api_domain=tokens["api_domain"],
            client_scope=scope,
            scopes=tokens.get("scope") or ",".join(SCOPES),
            dc=dc or chosen or next((k for k, v in ACCOUNTS.items() if v == accounts), None),
            ip=ip_of(request),
        )
        if tokens["access_token"]:
            cache.put((company_id, user_id), tokens["access_token"], int(tokens["expires_in"]))
        return _page(
            "Zoho is connected",
            "You can close this tab.",
            state="ok",
            link=(APP_LINK, "Open Sales Shield"),
        )

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
                if "refused" in str(e):  # Zoho said no (not "unreachable"): ZC-14 health
                    store.zoho_mark_refresh(who, ok=False)
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

    owners: dict[tuple[str, str], tuple[str, float]] = {}  # (company, person) → Zoho user id

    async def my_zoho_id(rd: ZohoCRMReader, who: Principal) -> str:
        """The connected Zoho user's id (1 h cache). Without users.READ the list could not be
        limited to this person's meetings, so it is refused and the app asks to reconnect."""
        conn = store.zoho_connection(who)
        if conn is None or "ZohoCRM.users.READ" in missing_scopes(conn.get("scopes")):
            raise CloudError("zoho_reconnect", "connect Zoho again to list your meetings")
        key = (who.company, who.user_id)
        hit = owners.get(key)
        if hit and hit[1] > time.monotonic():
            return hit[0]
        try:
            uid = await lookup.current_user_id(rd)
        except ValueError:
            raise CloudError("zoho_reconnect", "connect Zoho again to list your meetings") from None
        owners[key] = (uid, time.monotonic() + 3600)
        return uid

    @app_route
    async def meetings(r: Request, who: Principal) -> Response:
        """This person's upcoming meetings (owner = the connected Zoho user), soonest first."""
        limited(who)
        try:
            page = max(1, min(50, int(r.query_params.get("page", "1"))))
        except ValueError:
            page = 1

        async def go(rd: ZohoCRMReader) -> dict[str, Any]:
            return await lookup.upcoming_meetings(rd, await my_zoho_id(rd, who), page=page)

        return JSONResponse(await zoho_call(who, go), headers=NO_STORE)

    @app_route
    async def meeting(r: Request, who: Principal) -> Response:
        """The brief for a picked meeting (rail): meeting + contact/lead + deal + account."""
        limited(who)
        event_id = r.path_params["id"]
        if not lookup.RECORD_ID.match(event_id):
            raise CloudError("invalid", "unknown meeting")

        async def go(rd: ZohoCRMReader) -> dict[str, Any] | None:
            return await lookup.build_meeting_brief(rd, event_id, await my_zoho_id(rd, who))

        brief = await zoho_call(who, go)
        if brief is None:
            raise CloudError("not_found", "that meeting is gone")
        store.zoho_audit(who, "zoho.read", f"Events:{event_id}", ip=ip_of(r))
        return JSONResponse({"brief": brief}, headers=NO_STORE)

    @app_route
    async def meeting_detail(r: Request, who: Principal) -> Response:
        """View-only meeting detail (home screen)."""
        limited(who)
        event_id = r.path_params["id"]
        if not lookup.RECORD_ID.match(event_id):
            raise CloudError("invalid", "unknown meeting")

        async def go(rd: ZohoCRMReader) -> dict[str, Any] | None:
            return await lookup.meeting_detail(rd, await my_zoho_id(rd, who), event_id)

        detail = await zoho_call(who, go)
        if detail is None:
            raise CloudError("not_found", "that meeting is gone")
        store.zoho_audit(who, "zoho.read", f"Events:{event_id}", ip=ip_of(r))
        return JSONResponse({"meeting": detail}, headers=NO_STORE)

    @app_route
    async def action(r: Request, who: Principal) -> Response:
        """One approved write (R12): the request is the agent's approval of that one card."""
        limited(who)
        data = await body(r)
        if data.get("approved") is not True:
            raise CloudError("invalid", "approve the action first")
        planned = actions.plan(r.path_params["kind"], data.get("fields"))
        store.require_feature(who, "zoho")
        conn = store.zoho_connection(who)
        if conn is None or missing_scopes(conn.get("scopes")):
            raise CloudError("zoho_reconnect", "connect Zoho again to allow saving")
        key = planned.idem_key or str(data.get("idempotency_key", ""))
        earlier = store.zoho_write_begin(who, key, planned.kind)
        if earlier is not None:
            return JSONResponse({"ok": True, **earlier})
        try:
            async with http() as h:
                rd = await reader(h, who)  # fails before anything is sent: key freed below
                try:
                    result = await actions.execute(rd, planned)
                except ZohoError as e:
                    if 400 <= e.status < 500:  # Zoho refused it: nothing was written
                        if e.status == 401:
                            cache.drop((who.company, who.user_id))
                        store.zoho_write_failed(who, key, planned.kind, e.code or str(e.status))
                        code = "zoho_reconnect" if e.status == 401 else "zoho_unavailable"
                        raise CloudError(code, str(e)) from None
                    raise
        except CloudError:
            store.zoho_write_failed(who, key, planned.kind, "not sent")
            raise
        except BaseException as e:
            # A timeout, a 5xx or a dropped request: Zoho may have saved it. Keep the key so a
            # retry cannot write twice; the agent checks Zoho first (security review H1).
            store.zoho_write_unknown(who, key, planned.kind, type(e).__name__)
            if isinstance(e, Exception):
                raise CloudError(
                    "zoho_unknown", "Zoho did not confirm; check Zoho before trying again"
                ) from None
            raise
        store.zoho_write_done(
            who,
            key,
            planned.kind,
            result["id"],
            f"{planned.summary} {result['action'] or 'insert'} {result['id']}",
            ip=ip_of(r),
        )
        return JSONResponse({"ok": True, "id": result["id"], "action": result["action"]})

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
        Route(f"{api}/zoho/meetings", meetings),
        Route(f"{api}/zoho/meetings/{{id}}", meeting),
        Route(f"{api}/zoho/meetings/{{id}}/detail", meeting_detail),
        Route(f"{api}/zoho/actions/{{kind}}", action, methods=["POST"]),
        Route("/auth/zoho/start", handle(start)),
        Route("/auth/zoho/callback/", handle(callback)),
        Route("/auth/zoho/cancel", handle(cancel)),
    ]
