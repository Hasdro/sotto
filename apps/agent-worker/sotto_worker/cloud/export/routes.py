"""INT-12 (D-072): `GET /api/v1/export/weekly.csv?week=2026-W46` (admins; the caller's company
only) and `weekly_export_job`, the hook T-081's scheduler calls once a week. No live push."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import Any

from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from sotto_worker.cloud.export.weekly import COLUMNS, build_csv, week_range
from sotto_worker.cloud.store import CloudStore, Principal

SCHEMA = """
CREATE TABLE IF NOT EXISTS export_weeks (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  rows INTEGER NOT NULL,
  csv TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, week)
)
"""


def ensure_schema(store: CloudStore) -> None:
    with store._tx() as db:
        db.execute(SCHEMA)


def weekly_export_job(store: CloudStore, *, now: datetime | None = None) -> int:
    """Scheduler hook (T-081): keeps last week's CSV for every company that had calls, so the
    admin download for that week is the same file every time. Safe to call more than once a
    week (one row per company and week). Returns how many files were written."""
    ensure_schema(store)
    label, start, end = week_range(None, now)
    companies = store._q(
        "SELECT DISTINCT company_id FROM usage WHERE started_at >= ? AND started_at < ?",
        (start, end),
    )
    written = 0
    for c in companies:
        company_id = str(c["company_id"])
        if store._q(
            "SELECT 1 FROM export_weeks WHERE company_id = ? AND week = ?", (company_id, label)
        ):
            continue
        _, text = build_csv(store, company_id, label)
        with store._tx() as db:
            db.execute(
                "INSERT OR IGNORE INTO export_weeks(company_id, week, rows, csv, created_at)"
                " VALUES (?,?,?,?,?)",
                (company_id, label, text.count("\n") - 1, text, int(end)),
            )
            store.audit(db, "export.weekly", f"{label} kept", company_id=company_id)
        written += 1
    return written


def make_routes(
    *, store: CloudStore, app_route: Callable[..., Any], ip_of: Callable[[Request], str]
) -> list[Route]:
    ensure_schema(store)

    @app_route
    async def weekly_csv(r: Request, who: Principal) -> Response:
        who.require("admin")
        week = r.query_params.get("week") or None
        label = week_range(week)[0]
        kept = store._q(
            "SELECT csv FROM export_weeks WHERE company_id = ? AND week = ?",
            (who.company, label),
        )
        text = str(kept[0]["csv"]) if kept else build_csv(store, who.company, label)[1]
        with store._tx() as db:
            store.audit(
                db,
                "export.download",
                f"{label} weekly CSV",
                company_id=who.company,
                actor=who,
                ip=ip_of(r),
            )
        return Response(
            text,
            media_type="text/csv; charset=utf-8",
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": f'attachment; filename="agn-calls-{label}.csv"',
                "X-Export-Columns": str(len(COLUMNS)),
            },
        )

    return [Route("/api/v1/export/weekly.csv", weekly_csv)]
