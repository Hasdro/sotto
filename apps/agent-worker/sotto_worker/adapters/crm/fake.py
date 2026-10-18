from __future__ import annotations

from sotto_worker.crm import CallLog, CRMContact


class FakeCRM:
    provider = "fake"

    def __init__(self, contacts: list[CRMContact] | None = None) -> None:
        self.contacts = {c.ref: c for c in contacts or []}
        self.logs: dict[str, CallLog] = {}

    async def get_contact(self, ref: str) -> CRMContact | None:
        return self.contacts.get(ref)

    async def log_call(self, log: CallLog, *, idempotency_key: str) -> None:
        self.logs.setdefault(idempotency_key, log)  # idempotent like the real adapters must be
