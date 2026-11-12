"""Zoho CRM v8 reads (D-031). Plain HTTPS (httpx); the server owns tokens, this adapter only
receives an access token and the person's `api_domain`.

Docs: search https://www.zoho.com/crm/developer/docs/api/v8/search-records.html, records
…/get-records.html, related lists …/get-related-records.html, modules …/module-meta.html."""

from __future__ import annotations

from typing import Any

import httpx

TIMEOUT_S = 8.0
# v1 read matrix (D-031). Any other module is refused before a request leaves the server.
READ_MODULES = frozenset({"Leads", "Contacts", "Accounts", "Deals", "Events", "Notes"})
PERSON_FIELDS = {
    "Contacts": "Full_Name,First_Name,Last_Name,Title,Email,Phone,Mobile,Account_Name",
    "Leads": "Full_Name,First_Name,Last_Name,Designation,Email,Phone,Mobile,Company,Industry",
}
DEAL_FIELDS = "Deal_Name,Stage,Amount,Closing_Date,Owner"
NOTE_FIELDS = "Note_Title,Note_Content,Created_Time"
ACCOUNT_FIELDS = "Account_Name,Industry"


class ZohoError(RuntimeError):
    def __init__(self, status: int, code: str) -> None:
        super().__init__(f"Zoho answered {status} {code}".strip())
        self.status = status
        self.code = code


class ModuleNotAllowed(ValueError):
    pass


def check_read(module: str) -> None:
    if module not in READ_MODULES:
        raise ModuleNotAllowed(module)


class ZohoCRMReader:
    provider = "zoho"

    def __init__(self, http: httpx.AsyncClient, api_domain: str, access_token: str) -> None:
        self._http = http
        self._base = f"{api_domain.rstrip('/')}/crm/v8"
        self._headers = {"Authorization": f"Zoho-oauthtoken {access_token}"}

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        module = path.strip("/").split("/")[0]
        if module != "settings":
            check_read(module)
            for part in path.strip("/").split("/")[2:3]:  # related list: Contacts/{id}/Deals
                check_read(part)
        try:
            r = await self._http.get(
                f"{self._base}/{path.lstrip('/')}",
                params=params,
                headers=self._headers,
                timeout=TIMEOUT_S,
            )
        except httpx.HTTPError as e:
            raise ZohoError(0, type(e).__name__) from None
        if r.status_code == 204:  # Zoho: no matching records
            return {"data": []}
        try:
            data = r.json()
        except ValueError:
            data = {}
        if r.status_code >= 400:
            code = str(data.get("code", "")) if isinstance(data, dict) else ""
            raise ZohoError(r.status_code, code[:40])
        return data if isinstance(data, dict) else {}

    async def search(self, module: str, by: str, value: str) -> list[dict[str, Any]]:
        """`by` is email, phone or word (Zoho's search parameters)."""
        if by not in ("email", "phone", "word"):
            raise ValueError(by)
        data = await self._get(
            f"{module}/search",
            {by: value, "fields": PERSON_FIELDS.get(module, ""), "per_page": 5},
        )
        return [d for d in data.get("data") or [] if isinstance(d, dict)]

    async def record(self, module: str, record_id: str, fields: str) -> dict[str, Any] | None:
        data = await self._get(f"{module}/{record_id}", {"fields": fields})
        rows = data.get("data") or []
        return rows[0] if rows and isinstance(rows[0], dict) else None

    async def related(
        self, module: str, record_id: str, related: str, fields: str, per_page: int
    ) -> list[dict[str, Any]]:
        data = await self._get(
            f"{module}/{record_id}/{related}",
            {"fields": fields, "per_page": per_page},
        )
        return [d for d in data.get("data") or [] if isinstance(d, dict)]

    async def modules(self) -> list[dict[str, Any]]:
        data = await self._get("settings/modules")
        return [
            {
                "api_name": m.get("api_name"),
                "plural_label": m.get("plural_label"),
                "api_supported": m.get("api_supported"),
            }
            for m in data.get("modules") or []
            if isinstance(m, dict)
        ]
