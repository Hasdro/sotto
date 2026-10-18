from sotto_worker.adapters.email.fake import FakeEmail, FakeEmailError
from sotto_worker.clock import FakeClock
from sotto_worker.outbox import (
    RETRY_SCHEDULE_MS,
    EmailMessage,
    InMemoryOutbox,
    OutboxJob,
    OutboxProcessor,
)


def _job(key: str = "escalation:call-1:abc") -> OutboxJob:
    return OutboxJob(
        id="job-1",
        company_id="acme",
        kind="escalation_email",
        idempotency_key=key,
        message=EmailMessage(to="manager@acme.test", subject="Unanswered question", text="Pets?"),
    )


async def test_sends_due_jobs_once_with_the_idempotency_key() -> None:
    clock = FakeClock()
    store, email = InMemoryOutbox(), FakeEmail()
    store.enqueue(_job(), now_ms=0)
    store.enqueue(_job(), now_ms=0)  # duplicate key: ignored
    await OutboxProcessor(store, email, clock).run_once()
    assert [(m.to, key) for m, key in email.sent] == [
        ("manager@acme.test", "escalation:call-1:abc")
    ]
    assert store.jobs["escalation:call-1:abc"].status == "sent"


async def test_failures_retry_on_schedule_then_dead_letter() -> None:
    clock = FakeClock()
    store, email = InMemoryOutbox(), FakeEmail(error=FakeEmailError("provider down"))
    store.enqueue(_job(), now_ms=0)
    processor = OutboxProcessor(store, email, clock)
    for delay in RETRY_SCHEDULE_MS:
        await processor.run_once()
        job = store.jobs["escalation:call-1:abc"]
        assert job.status == "pending"
        assert job.next_attempt_ms == clock.now_ms() + delay
        await clock.advance(delay)
    await processor.run_once()
    job = store.jobs["escalation:call-1:abc"]
    assert job.status == "dead"
    assert job.attempts == len(RETRY_SCHEDULE_MS) + 1
    assert "provider down" in (job.last_error or "")


async def test_first_retry_keeps_the_one_minute_escalation_sla() -> None:
    assert RETRY_SCHEDULE_MS[0] + RETRY_SCHEDULE_MS[1] < 60_000


async def test_jobs_that_are_not_due_wait() -> None:
    clock = FakeClock()
    store, email = InMemoryOutbox(), FakeEmail()
    store.enqueue(_job(), now_ms=5_000)
    await OutboxProcessor(store, email, clock).run_once()
    assert email.sent == []
    await clock.advance(5_000)
    await OutboxProcessor(store, email, clock).run_once()
    assert len(email.sent) == 1
