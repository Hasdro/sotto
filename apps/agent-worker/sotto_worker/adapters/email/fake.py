from __future__ import annotations

from sotto_worker.outbox import EmailMessage


class FakeEmailError(RuntimeError):
    pass


class FakeEmail:
    provider = "fake"

    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.sent: list[tuple[EmailMessage, str]] = []

    async def send(self, message: EmailMessage, *, idempotency_key: str) -> None:
        if self.error is not None:
            raise self.error
        self.sent.append((message, idempotency_key))
