"""Outbox (P7.1): email and CRM jobs leave the live path and are sent asynchronously with
retries, an idempotency key and a dead letter (ARCHITECTURE §5, F-09). The DB `outbox` table
(Phase 5 migration) backs this in production; InMemoryOutbox serves tests and the demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Protocol

from sotto_worker.clock import Clock

# Immediate first send, then 10 s, 30 s, 1, 5 and 15 min (the first two keep the 1-minute
# escalation SLA, R2); after the last retry the job is dead-lettered and an admin is alerted.
RETRY_SCHEDULE_MS = (10_000, 30_000, 60_000, 300_000, 900_000)


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str


class EmailSender(Protocol):
    provider: str

    async def send(self, message: EmailMessage, *, idempotency_key: str) -> None: ...


@dataclass
class OutboxJob:
    id: str
    company_id: str
    kind: Literal["escalation_email"]
    idempotency_key: str
    message: EmailMessage
    status: Literal["pending", "sent", "dead"] = "pending"
    attempts: int = 0
    next_attempt_ms: int = 0
    last_error: str | None = None


@dataclass
class InMemoryOutbox:
    jobs: dict[str, OutboxJob] = field(default_factory=dict)

    def enqueue(self, job: OutboxJob, *, now_ms: int) -> bool:
        """False if a job with the same idempotency key already exists (R2: one email)."""
        if job.idempotency_key in self.jobs:
            return False
        job.next_attempt_ms = now_ms
        self.jobs[job.idempotency_key] = job
        return True

    def due(self, now_ms: int) -> list[OutboxJob]:
        return [
            j for j in self.jobs.values() if j.status == "pending" and j.next_attempt_ms <= now_ms
        ]


class OutboxProcessor:
    def __init__(self, store: InMemoryOutbox, email: EmailSender, clock: Clock) -> None:
        self._store, self._email, self._clock = store, email, clock

    async def run_once(self) -> int:
        """Send every due job once; returns how many were sent."""
        sent = 0
        for job in self._store.due(self._clock.now_ms()):
            job.attempts += 1
            try:
                await self._email.send(job.message, idempotency_key=job.idempotency_key)
            except Exception as err:  # any provider failure is retried, never raised into callers
                job.last_error = f"{type(err).__name__}: {err}"
                if job.attempts > len(RETRY_SCHEDULE_MS):
                    job.status = "dead"
                else:
                    job.next_attempt_ms = self._clock.now_ms() + RETRY_SCHEDULE_MS[job.attempts - 1]
                continue
            job.status = "sent"
            sent += 1
        return sent
