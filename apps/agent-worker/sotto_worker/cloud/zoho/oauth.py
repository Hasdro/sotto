"""Zoho OAuth 2.0, server-based flow (REFERENCES § Zoho CRM v8; D-031).

Flow: the app asks `POST /api/v1/zoho/connect` for a one-time `state` (bound to the person and
device, 10 minutes) and opens `/auth/zoho/start?state=…` in the system browser; the server sends
the browser to Zoho; Zoho comes back to `/auth/zoho/callback/` with `code`, `state`,
`accounts-server`; the server spends the state, swaps the code for tokens at that accounts server
(only one from the known list: the client secret never goes anywhere else), and keeps the refresh
token encrypted. Access tokens live in memory for 55 minutes (Zoho: 1 hour; 10 per refresh token
per 10 minutes)."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx

# Data centre → accounts server (https://www.zoho.com/crm/developer/docs/api/v8/multi-dc.html).
ACCOUNTS: dict[str, str] = {
    "us": "https://accounts.zoho.com",
    "eu": "https://accounts.zoho.eu",
    "in": "https://accounts.zoho.in",
    "au": "https://accounts.zoho.com.au",
    "jp": "https://accounts.zoho.jp",
    "ca": "https://accounts.zohocloud.ca",
    "cn": "https://accounts.zoho.com.cn",
    "sa": "https://accounts.zoho.sa",
    "uk": "https://accounts.zoho.uk",
}
ACCOUNTS_SERVERS = frozenset(ACCOUNTS.values())
# The CRM API host the token response names; only these may receive an access token.
API_DOMAIN = re.compile(r"^https://(www\.)?zohoapis\.(com|eu|in|com\.au|jp|ca|com\.cn|sa|uk)$")
# D-031 v1 matrix: read Leads, Contacts, Accounts, Deals, Meetings (Events), Notes; write Leads,
# Contacts, Meetings and Notes. No Deals/Accounts write scope is ever requested, so Zoho itself
# refuses a Deal stage or amount change even if a bug let one through.
SCOPES = (
    "ZohoCRM.modules.contacts.READ",
    "ZohoCRM.modules.contacts.UPDATE",
    "ZohoCRM.modules.leads.READ",
    "ZohoCRM.modules.leads.CREATE",
    "ZohoCRM.modules.leads.UPDATE",
    "ZohoCRM.modules.accounts.READ",
    "ZohoCRM.modules.deals.READ",
    "ZohoCRM.modules.events.READ",
    "ZohoCRM.modules.events.CREATE",
    "ZohoCRM.modules.notes.READ",
    "ZohoCRM.modules.notes.CREATE",
    "ZohoCRM.settings.modules.READ",
)


def missing_scopes(granted: str | None) -> list[str]:
    """Scopes this server needs that a connection was not made with (made before an upgrade):
    the app asks that person to connect again."""
    have = set((granted or "").split(","))
    return [s for s in SCOPES if s not in have]


ACCESS_TTL_S = 55 * 60
TIMEOUT_S = 10.0


class ZohoAuthError(RuntimeError):
    """Zoho refused (bad code, revoked refresh token) or could not be reached. The message never
    carries a token or secret."""


@dataclass(frozen=True)
class Client:
    client_id: str
    client_secret: str
    dc: str


def authorize_url(client: Client, redirect_uri: str, state: str) -> str:
    query = urlencode(
        {
            "scope": ",".join(SCOPES),
            "client_id": client.client_id,
            "response_type": "code",
            "access_type": "offline",
            # Zoho sends a refresh token only on consent; always ask so a reconnect gets one.
            "prompt": "consent",
            "redirect_uri": redirect_uri,
            "state": state,
        }
    )
    return f"{ACCOUNTS[client.dc]}/oauth/v2/auth?{query}"


def accounts_server_for(param: str | None, client: Client) -> str:
    """The accounts server to swap the code at: Zoho's `accounts-server` when it is a known one
    (multi-DC: the person's account may live in another DC), else the client's own DC."""
    value = (param or "").rstrip("/")
    return value if value in ACCOUNTS_SERVERS else ACCOUNTS[client.dc]


def _error_of(data: Any) -> str | None:
    if isinstance(data, dict) and data.get("error"):
        return str(data["error"])[:60]
    return None


async def exchange_code(
    http: httpx.AsyncClient, client: Client, accounts_server: str, code: str, redirect_uri: str
) -> dict[str, str]:
    """Returns refresh_token, access_token, api_domain, expires_in."""
    if accounts_server not in ACCOUNTS_SERVERS:
        raise ZohoAuthError("unknown accounts server")
    try:
        r = await http.post(
            f"{accounts_server}/oauth/v2/token",
            data={
                "grant_type": "authorization_code",
                "client_id": client.client_id,
                "client_secret": client.client_secret,
                "redirect_uri": redirect_uri,
                "code": code,
            },
            timeout=TIMEOUT_S,
        )
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise ZohoAuthError(f"Zoho unreachable ({type(e).__name__})") from None
    err = _error_of(data)
    if r.status_code != 200 or err or not data.get("refresh_token"):
        raise ZohoAuthError(f"Zoho refused the code ({err or r.status_code})")
    api_domain = str(data.get("api_domain", "")).rstrip("/")
    if not API_DOMAIN.match(api_domain):
        raise ZohoAuthError("Zoho named an unknown API domain")
    return {
        "refresh_token": str(data["refresh_token"]),
        "access_token": str(data.get("access_token", "")),
        "api_domain": api_domain,
        "expires_in": str(data.get("expires_in", 3600)),
    }


async def refresh_access(
    http: httpx.AsyncClient, client: Client, accounts_server: str, refresh_token: str
) -> tuple[str, int]:
    """A fresh access token and its lifetime in seconds."""
    if accounts_server not in ACCOUNTS_SERVERS:
        raise ZohoAuthError("unknown accounts server")
    try:
        r = await http.post(
            f"{accounts_server}/oauth/v2/token",
            data={
                "grant_type": "refresh_token",
                "client_id": client.client_id,
                "client_secret": client.client_secret,
                "refresh_token": refresh_token,
            },
            timeout=TIMEOUT_S,
        )
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise ZohoAuthError(f"Zoho unreachable ({type(e).__name__})") from None
    err = _error_of(data)
    if r.status_code != 200 or err or not data.get("access_token"):
        raise ZohoAuthError(f"Zoho refused the refresh ({err or r.status_code})")
    return str(data["access_token"]), int(data.get("expires_in", 3600))


async def revoke(http: httpx.AsyncClient, accounts_server: str, refresh_token: str) -> bool:
    """Revokes the refresh token at Zoho. False when Zoho could not be reached (the connection is
    deleted here anyway; the person can also remove it under Zoho > Connected apps)."""
    if accounts_server not in ACCOUNTS_SERVERS:
        return False
    try:
        r = await http.post(
            f"{accounts_server}/oauth/v2/token/revoke",
            params={"token": refresh_token},
            timeout=TIMEOUT_S,
        )
    except httpx.HTTPError:
        return False
    return r.status_code == 200


class AccessCache:
    """Access tokens in memory only, per (company, person), for 55 minutes at most."""

    def __init__(self) -> None:
        self._items: dict[tuple[str, str], tuple[str, float]] = {}

    def get(self, key: tuple[str, str], now: float | None = None) -> str | None:
        item = self._items.get(key)
        t = time.monotonic() if now is None else now
        if item is None or item[1] <= t:
            self._items.pop(key, None)
            return None
        return item[0]

    def put(
        self, key: tuple[str, str], token: str, expires_in: int, now: float | None = None
    ) -> None:
        t = time.monotonic() if now is None else now
        self._items[key] = (token, t + min(ACCESS_TTL_S, max(60, expires_in - 300)))

    def drop(self, key: tuple[str, str]) -> None:
        self._items.pop(key, None)
