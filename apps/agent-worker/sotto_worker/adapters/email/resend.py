"""Resend email adapter (P7.1). POST https://api.resend.com/emails with an Idempotency-Key
(1 to 256 chars, 24 h window), so a retried outbox job never sends the manager a second email.
Docs: https://resend.com/docs/dashboard/emails/idempotency-keys (checked 2026-10-18)."""

from __future__ import annotations

import httpx

from sotto_worker.outbox import EmailMessage

RESEND_URL = "https://api.resend.com/emails"


class ResendError(RuntimeError):
    pass


class ResendEmail:
    provider = "resend"

    def __init__(
        self, *, api_key: str, sender: str, client: httpx.AsyncClient | None = None
    ) -> None:
        self._api_key = api_key
        self._sender = sender
        self._client = client or httpx.AsyncClient(timeout=10.0)

    async def send(self, message: EmailMessage, *, idempotency_key: str) -> None:
        if not 1 <= len(idempotency_key) <= 256:
            raise ValueError("idempotency key must be 1-256 characters")
        response = await self._client.post(
            RESEND_URL,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Idempotency-Key": idempotency_key,
            },
            json={
                "from": self._sender,
                "to": [message.to],
                "subject": message.subject,
                "text": message.text,
            },
        )
        if response.status_code >= 300:
            raise ResendError(f"resend {response.status_code}: {response.text[:200]}")
