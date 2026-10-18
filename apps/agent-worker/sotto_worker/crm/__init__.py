"""CRM interface (P7.3, R6 modules): Zoho first (P7.4, needs the owner's account), HubSpot and
Salesforce later; each is one adapter in sotto_worker/adapters/crm/. Calls never block the live
path: they run from the outbox after the call (F-10)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class CRMContact:
    ref: str
    name: str
    phone: str
    deal_stage: str = ""
    url: str = ""


@dataclass(frozen=True)
class CallLog:
    contact_ref: str
    call_id: str
    summary: str
    open_questions: tuple[str, ...] = ()


class CRMAdapter(Protocol):
    provider: str

    async def get_contact(self, ref: str) -> CRMContact | None: ...

    async def log_call(self, log: CallLog, *, idempotency_key: str) -> None: ...
