"""The in-process scheduler (INT-08, D-055): due steps fire once, also after a restart; a
cancelled or paused plan fires nothing; jobs run once per interval across restarts; the clock is
injected (no sleeps); and the scheduler alone never reaches the SMTP or Gallabox adapter."""

from __future__ import annotations

import ast
import asyncio
from pathlib import Path
from typing import Any

from sotto_worker.cloud.scheduler.plans import PlanStore
from sotto_worker.cloud.scheduler.runner import DAY_MS, HOUR_MS, Scheduler
from sotto_worker.cloud.store import CloudStore, Principal
from sotto_worker.server.vault import Vault
from tests.cloud.conftest import PASSWORD, SECRET

T0 = 1_800_000_000_000
SCHEDULER_DIR = Path(__file__).parents[2] / "sotto_worker" / "cloud" / "scheduler"


def people(store: CloudStore) -> tuple[Principal, Principal]:
    out = []
    for name in ("Acme", "Beta"):
        company, user = store.signup(
            company=name, name="Ada Admin", email=f"admin@{name.lower()}.test", password=PASSWORD
        )
        out.append(Principal(user, company, "admin", None, f"admin@{name.lower()}.test", "Ada"))
    return out[0], out[1]


def plan(plans: PlanStore, who: Principal, *dues: int) -> dict[str, Any]:
    return plans.create(
        who,
        call_id="call-1",
        customer_name="Jane",
        steps=[{"kind": "reminder", "due_at": d, "prepared": {"note": "call Jane"}} for d in dues],
        now=T0,
    )


def run(coro: Any) -> Any:
    return asyncio.run(coro)


def test_a_due_step_fires_once_and_not_again_after_a_restart(tmp_path: Path) -> None:
    store = CloudStore(tmp_path / "cloud.db", Vault(SECRET))
    acme, _ = people(store)
    sched = Scheduler(store)
    p = plan(sched.plans, acme, T0 + HOUR_MS, T0 + 2 * DAY_MS)
    assert run(sched.tick(T0))["due"] == []  # nothing is due yet
    first = run(sched.tick(T0 + HOUR_MS))["due"]
    assert [d["id"] for d in first] == [p["steps"][0]["id"]]
    assert run(sched.tick(T0 + HOUR_MS + 1))["due"] == []
    store.close()

    # A restart: a new store and a new scheduler on the same file.
    store = CloudStore(tmp_path / "cloud.db", Vault(SECRET))
    again = Scheduler(store)
    assert run(again.tick(T0 + HOUR_MS + 2))["due"] == []  # the first step never fires twice
    assert [d["id"] for d in again.plans.due(acme)] == [p["steps"][0]["id"]]  # still waiting
    late = run(again.tick(T0 + 3 * DAY_MS))["due"]  # the server was down at day 2: fires now
    assert [d["id"] for d in late] == [p["steps"][1]["id"]]
    store.close()


def test_a_cancelled_plan_fires_nothing_and_a_paused_one_waits(store: CloudStore) -> None:
    acme, _ = people(store)
    sched = Scheduler(store)
    gone = plan(sched.plans, acme, T0 + HOUR_MS)
    held = plan(sched.plans, acme, T0 + HOUR_MS)
    sched.plans.set_status(acme, gone["id"], "cancelled", now=T0)
    sched.plans.set_status(acme, held["id"], "paused", now=T0)
    assert run(sched.tick(T0 + DAY_MS))["due"] == []
    assert sched.plans.step(acme, gone["steps"][0]["id"])["state"] == "cancelled"
    assert "prepared" not in sched.plans.step(acme, gone["steps"][0]["id"])  # draft cleared
    sched.plans.set_status(acme, held["id"], "active", now=T0 + DAY_MS)
    assert len(run(sched.tick(T0 + DAY_MS + 1))["due"]) == 1


def test_pausing_a_due_step_puts_it_back_and_it_is_announced_again(store: CloudStore) -> None:
    acme, _ = people(store)
    sched = Scheduler(store)
    p = plan(sched.plans, acme, T0 + HOUR_MS)
    assert len(run(sched.tick(T0 + HOUR_MS))["due"]) == 1
    sched.plans.set_status(acme, p["id"], "paused", now=T0 + HOUR_MS)
    assert sched.plans.due(acme) == []
    sched.plans.set_status(acme, p["id"], "active", now=T0 + 2 * HOUR_MS)
    assert len(run(sched.tick(T0 + 2 * HOUR_MS))["due"]) == 1


def test_jobs_run_once_per_interval_and_survive_a_restart(tmp_path: Path) -> None:
    store = CloudStore(tmp_path / "cloud.db", Vault(SECRET))
    calls: list[int] = []

    async def job(now: int) -> None:
        calls.append(now)

    sched = Scheduler(store)
    sched.register("digest", DAY_MS, job)
    run(sched.tick(T0))
    run(sched.tick(T0 + HOUR_MS))
    assert calls == [T0]
    store.close()
    store = CloudStore(tmp_path / "cloud.db", Vault(SECRET))
    sched = Scheduler(store)
    sched.register("digest", DAY_MS, job)
    run(sched.tick(T0 + 2 * HOUR_MS))  # a restart inside the interval does not re-run it
    assert calls == [T0]
    run(sched.tick(T0 + DAY_MS))
    assert calls == [T0, T0 + DAY_MS]
    store.close()


def test_a_failing_job_does_not_stop_the_others(store: CloudStore) -> None:
    seen: list[str] = []
    logs: list[str] = []

    async def bad(_now: int) -> None:
        raise RuntimeError("boom")

    async def good(_now: int) -> None:
        seen.append("good")

    sched = Scheduler(store, log=logs.append)
    sched.register("bad", HOUR_MS, bad)
    sched.register("good", HOUR_MS, good)
    assert run(sched.tick(T0))["jobs"] == ["good"]
    assert seen == ["good"]
    assert logs == ["scheduler: job bad failed: RuntimeError"]


def test_one_runner_per_process_and_it_stops_cleanly(store: CloudStore) -> None:
    ticks: list[int] = []
    clock = iter(range(T0, T0 + 1000))
    sched = Scheduler(store, clock=lambda: next(clock))

    async def job(now: int) -> None:
        ticks.append(now)

    sched.register("j", 1, job)

    async def go() -> None:
        stop = asyncio.Event()
        task = asyncio.create_task(sched.run(stop, period_s=0.001))
        await asyncio.sleep(0)
        second = asyncio.create_task(Scheduler(store).run(stop, period_s=0.001))
        await asyncio.sleep(0.01)
        assert second.done()
        assert isinstance(second.exception(), RuntimeError)
        stop.set()
        await task

    run(go())
    assert ticks  # the loop ticked with the injected clock


def test_the_scheduler_package_imports_no_sender() -> None:
    """R12, D-033: the runner and the plan store cannot reach an email or WhatsApp adapter."""
    banned = ("sotto_worker.adapters", "smtplib", "httpx", "sotto_worker.outbox")
    for path in SCHEDULER_DIR.glob("*.py"):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom):
                names = [node.module or ""]
            for n in names:
                assert not n.startswith(banned), f"{path.name} imports {n}"
