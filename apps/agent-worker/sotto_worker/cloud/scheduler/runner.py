"""The in-process scheduler (D-055): one runner per process, no new dependency.

Every `period_s` it (1) moves follow-up steps whose time has come to `due` (each exactly once,
see plans.tick) and (2) runs each registered job whose interval has passed. A job's last run is
kept in SQLite and claimed in one transaction before it runs, so a restart neither repeats nor
skips it. The clock is injected; tests drive `tick(now)` and never sleep.

Nothing here sends a message to a customer: due steps only notify their agent (R12, D-033).
Jobs are server housekeeping (Zoho watch renewal) or opt-in emails to our own users (the weekly
coaching digest), each idempotent on its own."""

from __future__ import annotations

import asyncio
import contextlib
import weakref
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from sotto_worker.cloud.scheduler.plans import PlanStore
from sotto_worker.cloud.store import CloudStore, now_ms

SCHEMA = """
CREATE TABLE IF NOT EXISTS scheduler_jobs (
  name TEXT PRIMARY KEY,
  last_run_at INTEGER NOT NULL
);
"""
HOUR_MS = 3600 * 1000
DAY_MS = 24 * HOUR_MS
_running: weakref.WeakSet[CloudStore] = weakref.WeakSet()


@dataclass(frozen=True)
class Job:
    name: str
    every_ms: int
    run: Callable[[int], Awaitable[Any]]


class Scheduler:
    def __init__(
        self,
        store: CloudStore,
        *,
        clock: Callable[[], int] = now_ms,
        log: Callable[[str], None] = lambda _l: None,
    ) -> None:
        self.store = store
        self.plans = PlanStore(store)
        self.clock = clock
        self.log = log
        self.jobs: dict[str, Job] = {}
        with store._lock:
            store._db.executescript(SCHEMA)

    def register(self, name: str, every_ms: int, run: Callable[[int], Awaitable[Any]]) -> None:
        if name in self.jobs:
            raise ValueError(f"job {name} is registered twice")
        self.jobs[name] = Job(name, every_ms, run)

    def _claim(self, job: Job, now: int) -> bool:
        with self.store._tx() as db:
            row = db.execute(
                "SELECT last_run_at FROM scheduler_jobs WHERE name = ?", (job.name,)
            ).fetchone()
            if row is not None and now - int(row["last_run_at"]) < job.every_ms:
                return False
            db.execute(
                "INSERT INTO scheduler_jobs(name, last_run_at) VALUES (?, ?)"
                " ON CONFLICT(name) DO UPDATE SET last_run_at = excluded.last_run_at",
                (job.name, now),
            )
        return True

    async def tick(self, now: int | None = None) -> dict[str, Any]:
        t = self.clock() if now is None else now
        due = self.plans.tick(t)
        ran: list[str] = []
        for job in self.jobs.values():
            if not self._claim(job, t):
                continue
            try:
                await job.run(t)
                ran.append(job.name)
            except Exception as e:  # one failing job never stops the others or the server
                self.log(f"scheduler: job {job.name} failed: {type(e).__name__}")
        return {"due": due, "jobs": ran}

    async def run(self, stop: asyncio.Event, *, period_s: float = 30.0) -> None:
        """The loop; one per process (a second start on the same store is refused)."""
        if self.store in _running:
            raise RuntimeError("a scheduler already runs for this database in this process")
        _running.add(self.store)
        try:
            while not stop.is_set():
                try:
                    await self.tick()
                except Exception as e:
                    self.log(f"scheduler: tick failed: {type(e).__name__}")
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(stop.wait(), timeout=period_s)
        finally:
            _running.discard(self.store)
