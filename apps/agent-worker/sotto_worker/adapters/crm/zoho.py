"""Zoho CRM v8 reads (D-031). Plain HTTPS (httpx); the server owns tokens, this adapter only
receives an access token and the person's `api_domain`.

Docs: search https://www.zoho.com/crm/developer/docs/api/v8/search-records.html, records
…/get-records.html, related lists …/get-related-records.html, modules …/module-meta.html."""

from __future__ import annotations

from typing import Any

import httpx

TIMEOUT_S = 8.0
# v1 matrix (D-031). Any other module is refused before a request leaves the server; Deals and
# Accounts are read-only, so no Deal stage or amount write can be built here.
READ_MODULES = frozenset({"Leads", "Contacts", "Accounts", "Deals", "Events", "Notes"})
WRITE_MODULES = frozenset({"Leads", "Contacts", "Events", "Notes"})
PERSON_FIELDS = {
    # INT-16: Lead_Source and the Campaign_Source lookup's name come with the record (no
    # Campaigns module scope is needed to read the name on the Lead/Contact itself).
    "Contacts": (
        "Full_Name,First_Name,Last_Name,Title,Email,Phone,Mobile,Account_Name,"
        "Lead_Source,Campaign_Source"
    ),
    "Leads": (
        "Full_Name,First_Name,Last_Name,Designation,Email,Phone,Mobile,Company,Industry,"
        "Lead_Source,Campaign_Source"
    ),
}
DEAL_FIELDS = "Deal_Name,Stage,Amount,Closing_Date,Owner"
EVENT_FIELDS = (
    "Event_Title,Start_DateTime,End_DateTime,Description,Who_Id,What_Id,Participants,Owner,Venue"
)
DEAL_DETAIL_FIELDS = "Deal_Name,Stage,Amount,Closing_Date,Owner,Account_Name,Contact_Name"
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


def check_write(module: str) -> None:
    if module not in WRITE_MODULES:
        raise ModuleNotAllowed(module)


class ZohoCRMReader:
    provider = "zoho"

    def __init__(self, http: httpx.AsyncClient, api_domain: str, access_token: str) -> None:
        self._http = http
        self._base = f"{api_domain.rstrip('/')}/crm/v8"
        self._headers = {"Authorization": f"Zoho-oauthtoken {access_token}"}

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        module = path.strip("/").split("/")[0]
        if module not in ("settings", "users"):
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

    async def search_criteria(
        self, module: str, criteria: str, fields: str
    ) -> list[dict[str, Any]]:
        data = await self._get(
            f"{module}/search", {"criteria": criteria, "fields": fields, "per_page": 20}
        )
        return [d for d in data.get("data") or [] if isinstance(d, dict)]

    async def search_page(
        self, module: str, criteria: str, fields: str, page: int, per_page: int = 200
    ) -> tuple[list[dict[str, Any]], bool]:
        """One page of a criteria search and whether Zoho has more."""
        data = await self._get(
            f"{module}/search",
            {"criteria": criteria, "fields": fields, "page": page, "per_page": per_page},
        )
        raw_info = data.get("info")
        info: dict[str, Any] = raw_info if isinstance(raw_info, dict) else {}
        rows = [d for d in data.get("data") or [] if isinstance(d, dict)]
        return rows, bool(info.get("more_records"))

    async def current_user(self) -> dict[str, Any] | None:
        """The Zoho user this token belongs to (ZohoCRM.users.READ)."""
        data = await self._get("users", {"type": "CurrentUser"})
        users = data.get("users") or []
        return users[0] if users and isinstance(users[0], dict) else None

    async def _send(self, method: str, path: str, body: dict[str, Any]) -> dict[str, Any]:
        """One record written; returns Zoho's `details` (id) and `action` (insert/update)."""
        parts = path.strip("/").split("/")
        for part in parts:
            if not part.isdigit() and part != "upsert":
                check_write(part)
        try:
            r = await self._http.request(
                method,
                f"{self._base}/{path.lstrip('/')}",
                json=body,
                headers=self._headers,
                timeout=TIMEOUT_S,
            )
            data = r.json()
        except (httpx.HTTPError, ValueError) as e:
            raise ZohoError(0, type(e).__name__) from None
        rows = data.get("data") if isinstance(data, dict) else None
        first = rows[0] if isinstance(rows, list) and rows and isinstance(rows[0], dict) else {}
        if r.status_code >= 400 or str(first.get("status", "")).lower() != "success":
            code = str(first.get("code") or (data.get("code") if isinstance(data, dict) else ""))
            raise ZohoError(r.status_code, code[:40])
        raw_details = first.get("details")
        details: dict[str, Any] = raw_details if isinstance(raw_details, dict) else {}
        return {"id": str(details.get("id", "")), "action": str(first.get("action", ""))}

    async def create(self, module: str, record: dict[str, Any]) -> dict[str, Any]:
        return await self._send("POST", module, {"data": [record]})

    async def upsert(
        self, module: str, record: dict[str, Any], duplicate_check: list[str]
    ) -> dict[str, Any]:
        return await self._send(
            "POST",
            f"{module}/upsert",
            {"data": [record], "duplicate_check_fields": duplicate_check},
        )

    async def update(self, module: str, record_id: str, record: dict[str, Any]) -> dict[str, Any]:
        return await self._send("PUT", f"{module}/{record_id}", {"data": [record]})

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
