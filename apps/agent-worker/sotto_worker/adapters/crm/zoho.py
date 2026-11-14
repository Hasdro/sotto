"""Zoho CRM v8 reads (D-031). Plain HTTPS (httpx); the server owns tokens, this adapter only
receives an access token and the person's `api_domain`.

Docs: search https://www.zoho.com/crm/developer/docs/api/v8/search-records.html, records
…/get-records.html, related lists …/get-related-records.html, modules …/module-meta.html."""

from __future__ import annotations

import re
from typing import Any

import httpx

TIMEOUT_S = 8.0
# v1 matrix (D-031). Any other module is refused before a request leaves the server; Deals and
# Accounts are read-only, so no Deal stage or amount write can be built here.
READ_MODULES = frozenset({"Leads", "Contacts", "Accounts", "Deals", "Events", "Notes", "Campaigns"})
# Deals are never in this list: the only Deal write is `update_deal_fields`, limited to
# AGN_DEAL_FIELDS (D-069, R12). Tasks: INT-02t.
WRITE_MODULES = frozenset({"Leads", "Contacts", "Events", "Notes", "Tasks"})
# INT-06 (D-069): the AGN-owned custom Deal fields, by Zoho API name, and how they are created.
# Nothing else on a Deal (Stage, Amount, Owner, Closing_Date, …) can be written.
AGN_FIELD_DEFS: tuple[dict[str, Any], ...] = (
    {"api_name": "AGN_Call_Score", "field_label": "AGN Call Score", "data_type": "integer"},
    {
        "api_name": "AGN_Chance_Band",
        "field_label": "AGN Chance Band",
        "data_type": "picklist",
        "pick_list_values": [
            {"display_value": v, "actual_value": v} for v in ("Low", "Medium", "High")
        ],
    },
    {
        "api_name": "AGN_Top_Objection",
        "field_label": "AGN Top Objection",
        "data_type": "text",
        "length": 255,
    },
    {"api_name": "AGN_Last_Call_Date", "field_label": "AGN Last Call Date", "data_type": "date"},
)
AGN_DEAL_FIELDS = frozenset(d["api_name"] for d in AGN_FIELD_DEFS)
AGN_LABELS = frozenset(d["field_label"] for d in AGN_FIELD_DEFS)
CAMPAIGN_FIELDS = "Campaign_Name,Type,Status"
FIELD_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,99}$")
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
DEAL_FIELDS = "Deal_Name,Stage,Amount,Currency,Closing_Date,Owner"
EVENT_FIELDS = (
    "Event_Title,Start_DateTime,End_DateTime,Description,Who_Id,What_Id,Participants,Owner,Venue"
)
DEAL_DETAIL_FIELDS = "Deal_Name,Stage,Amount,Currency,Closing_Date,Owner,Account_Name,Contact_Name"
NOTE_FIELDS = "Note_Title,Note_Content,Created_Time"
ACCOUNT_FIELDS = "Account_Name,Industry"


class ZohoError(RuntimeError):
    def __init__(self, status: int, code: str) -> None:
        super().__init__(f"Zoho answered {status} {code}".strip())
        self.status = status
        self.code = code


class ModuleNotAllowed(ValueError):
    pass


class FieldNotAllowed(ValueError):
    """A Deal write named a field outside the AGN allow-list (R12: Stage and Amount above all)."""


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
        parts = path.strip("/").split("/")
        if module not in ("settings", "users"):
            check_read(module)
            # Blueprint (INT-04, D-056): read only, Deals only.
            blueprint = len(parts) == 4 and parts[2:] == ["actions", "blueprint"]
            if blueprint and module != "Deals":
                raise ModuleNotAllowed(path)
            if not blueprint:
                for part in parts[2:3]:  # related list: Contacts/{id}/Deals
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
        return await self._request(method, path, body)

    async def _request(
        self,
        method: str,
        path: str,
        body: dict[str, Any],
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Sends one write. Only `_send` (module allow-list), `update_deal_fields` (AGN field
        allow-list) and `create_agn_fields` call it; there is no path to a Blueprint transition."""
        if "actions" in path.split("/"):
            raise ModuleNotAllowed(path)
        try:
            r = await self._http.request(
                method,
                f"{self._base}/{path.lstrip('/')}",
                json=body,
                params=params,
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

    async def update_deal_fields(self, deal_id: str, record: dict[str, Any]) -> dict[str, Any]:
        """INT-06 (D-069): the one Deal write. Every key must be an AGN field; Stage, Amount and
        any other field are refused before a request is built (R12)."""
        if not deal_id.isdigit():
            raise ValueError("deal id")
        if not record:
            raise FieldNotAllowed("nothing to write")
        extra = sorted(set(record) - AGN_DEAL_FIELDS)
        if extra:
            raise FieldNotAllowed(extra[0])
        return await self._request("PUT", f"Deals/{deal_id}", {"data": [record]})

    async def fields(self, module: str) -> list[dict[str, Any]]:
        """Field metadata (`ZohoCRM.settings.fields.READ`): api_name, field_label, data_type."""
        check_read(module)
        data = await self._get("settings/fields", {"module": module})
        return [
            {
                "api_name": str(f.get("api_name", "")),
                "field_label": str(f.get("field_label", "")),
                "data_type": str(f.get("data_type", "")),
            }
            for f in data.get("fields") or []
            if isinstance(f, dict)
        ]

    async def create_agn_fields(self, defs: list[dict[str, Any]]) -> list[str]:
        """Creates AGN custom fields on Deals (`ZohoCRM.settings.fields.CREATE`, ≤ 5 per call).
        Only definitions from AGN_FIELD_DEFS are accepted. Returns the new field ids."""
        known = {d["field_label"]: d for d in AGN_FIELD_DEFS}
        body: list[dict[str, Any]] = []
        for d in defs:
            src = known.get(str(d.get("field_label", "")))
            if src is None or d != src:
                raise FieldNotAllowed(str(d.get("field_label", "")))
            body.append({k: v for k, v in src.items() if k != "api_name"})
        if not 0 < len(body) <= 5:
            raise FieldNotAllowed("between one and five fields")
        try:
            r = await self._http.post(
                f"{self._base}/settings/fields",
                params={"module": "Deals"},
                json={"fields": body},
                headers=self._headers,
                timeout=TIMEOUT_S,
            )
            data = r.json()
        except (httpx.HTTPError, ValueError) as e:
            raise ZohoError(0, type(e).__name__) from None
        rows = data.get("fields") if isinstance(data, dict) else None
        ok = isinstance(rows, list) and all(
            isinstance(x, dict) and str(x.get("status", "")).lower() == "success" for x in rows
        )
        if r.status_code >= 400 or not ok:
            first = rows[0] if isinstance(rows, list) and rows and isinstance(rows[0], dict) else {}
            code = str(first.get("code") or (data.get("code") if isinstance(data, dict) else ""))
            raise ZohoError(r.status_code, code[:40])
        return [str((x.get("details") or {}).get("id", "")) for x in rows or []]

    async def blueprint(self, deal_id: str) -> dict[str, Any]:
        """INT-04 (D-056): the Deal's Blueprint state and next transitions, read only."""
        if not deal_id.isdigit():
            raise ValueError("deal id")
        data = await self._get(f"Deals/{deal_id}/actions/blueprint")
        bp = data.get("blueprint")
        return bp if isinstance(bp, dict) else {}

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
