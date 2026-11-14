"""Benchmark-based model routing (ZC-05, D-067): settings, canaries and the run log.

The job (routing/job.py) benchmarks candidate models per live stage, stages the winner as a
canary on AGN's own demo org only, and on the next run promotes it to every company or rolls it
back if the demo org's calls got a worse p95 or quality. R6 holds throughout: only a model whose
last benchmark met R1 is staged or promoted (platform.set_route's guard).

Settings (platform_settings, owner console > Routing job), no defaults (D-067):
- `routing.monthly_cap_usd`: while unset the job does not run;
- `routing.demo_company_id`: the org a canary runs on; without it a winner is staged but waits."""

from __future__ import annotations

import json
from typing import Any

from sotto_worker.cloud.store import CloudError, CloudStore, Principal, now_ms

CAP_KEY = "routing.monthly_cap_usd"
DEMO_KEY = "routing.demo_company_id"
MAX_CAP_USD = 10_000.0

SCHEMA = """
CREATE TABLE IF NOT EXISTS routing_canaries (
  stage TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  from_provider TEXT,
  from_model TEXT,
  bench_p95 INTEGER NOT NULL,
  baseline_p95 INTEGER,
  baseline_quality REAL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  since INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS routing_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  cost_usd REAL NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '[]'
)
"""


def _setting(store: CloudStore, key: str) -> str | None:
    rows = store._q("SELECT value FROM platform_settings WHERE key = ?", (key,))
    return str(rows[0]["value"]) if rows else None


def cap_usd(store: CloudStore) -> float | None:
    value = _setting(store, CAP_KEY)
    return float(value) if value else None


def demo_company(store: CloudStore) -> str | None:
    value = _setting(store, DEMO_KEY)
    if not value:
        return None
    return value if store._q("SELECT 1 FROM companies WHERE id = ?", (value,)) else None


def set_settings(store: CloudStore, owner: Principal, data: dict[str, Any], *, ip: str) -> None:
    if owner.role != "owner":
        raise CloudError("forbidden", "only the platform owner sets the routing job")
    unknown = set(data) - {"monthly_cap_usd", "demo_company_id"}
    if unknown:
        raise CloudError("invalid", f"unknown setting {sorted(unknown)[0]!r}")
    writes: dict[str, str | None] = {}
    if "monthly_cap_usd" in data:
        cap = data["monthly_cap_usd"]
        if cap is not None and (
            not isinstance(cap, int | float) or isinstance(cap, bool) or not 0 < cap <= MAX_CAP_USD
        ):
            raise CloudError(
                "invalid", f"the cap is US dollars per month, above 0, at most {MAX_CAP_USD:.0f}"
            )
        writes[CAP_KEY] = None if cap is None else str(float(cap))
    if "demo_company_id" in data:
        cid = data["demo_company_id"]
        if cid is not None:
            if not isinstance(cid, str):
                raise CloudError("invalid", "send the demo company's id")
            store.company_row(cid)
            # A canary may use a vendor outside a company's "primary vendors only" choice
            # (D-063): only an org whose consent record allows all vendors can run canaries.
            consent = store._defaults_raw(cid).get("consent")
            if not isinstance(consent, dict) or consent.get("choice") != "all":
                raise CloudError(
                    "invalid",
                    "the demo org must accept all AI vendors (its consent record) to run canaries",
                )
        writes[DEMO_KEY] = cid
    t = now_ms()
    with store._tx() as db:
        for key, value in writes.items():
            if value is None:
                db.execute("DELETE FROM platform_settings WHERE key = ?", (key,))
            else:
                db.execute(
                    "INSERT INTO platform_settings(key, value, updated_at) VALUES (?,?,?)"
                    " ON CONFLICT(key) DO UPDATE SET value = excluded.value,"
                    " updated_at = excluded.updated_at",
                    (key, value, t),
                )
            store.audit(db, "owner.routing_job.set", f"{key}={value}", actor=owner, ip=ip)
        if DEMO_KEY in writes:  # canaries move to the new demo org and start over (or wait)
            db.execute(
                "UPDATE routing_canaries SET company_id = ?, since = ?, baseline_p95 = NULL,"
                " baseline_quality = NULL",
                (writes[DEMO_KEY], t),
            )


def canaries(store: CloudStore) -> dict[str, dict[str, Any]]:
    return {str(r["stage"]): dict(r) for r in store._q("SELECT * FROM routing_canaries")}


def canary_routes(store: CloudStore, company_id: str) -> dict[str, tuple[str, str]]:
    """The staged routes a company runs: only the canary's own org (platform.effective_routes),
    and only while the model's last benchmark still meets R1 (R6 holds during a canary too)."""
    from sotto_worker.cloud.owner import platform

    out: dict[str, tuple[str, str]] = {}
    for stage, c in canaries(store).items():
        if c["company_id"] != company_id:
            continue
        bench = platform.benchmark(store, str(c["provider_id"]), str(c["model"]), stage)
        if bench is not None and bench["ok"]:
            out[stage] = (str(c["provider_id"]), str(c["model"]))
    return out


def month_cost(store: CloudStore, month_start_ms: int) -> float:
    rows = store._q(
        "SELECT COALESCE(SUM(cost_usd), 0) AS c FROM routing_runs WHERE at >= ?", (month_start_ms,)
    )
    return float(rows[0]["c"])


def record_run(
    store: CloudStore, status: str, source: str, cost: float, detail: list[dict[str, Any]]
) -> int:
    with store._tx() as db:
        cur = db.execute(
            "INSERT INTO routing_runs(at, status, source, cost_usd, detail) VALUES (?,?,?,?,?)",
            (now_ms(), status, source, cost, json.dumps(detail)[:20_000]),
        )
        store.audit(db, "routing_job.run", f"{status} ({source})")
        return int(cur.lastrowid or 0)


def runs(store: CloudStore, limit: int = 10) -> list[dict[str, Any]]:
    return [
        {
            "id": int(r["id"]),
            "at": int(r["at"]),
            "status": str(r["status"]),
            "source": str(r["source"]),
            "cost_usd": float(r["cost_usd"]),
            "detail": json.loads(r["detail"]),
        }
        for r in store._q("SELECT * FROM routing_runs ORDER BY id DESC LIMIT ?", (limit,))
    ]
