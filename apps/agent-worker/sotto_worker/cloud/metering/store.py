"""Per-company metering, spend caps and the owner alert (ZC-12, D-061).

Spend is an ESTIMATE from what the apps already report per call (`usage`: minutes, AI cards) and
the seed price table on the company's effective routes; no new client field is needed. The owner
sets a monthly cap per company; there is no default (D-061): with no cap nothing is enforced and
the console shows "Cap not set". With a cap:

- at 80 % of the month's cap the owner gets one alert (one per company, month and level);
- at 100 % the owner gets a second alert and `cap_reached` is true: the server then withholds
  AGN's platform keys and short-lived STT tokens for that company until the owner raises the cap
  or the month ends (calls blocked like an exhausted plan; sign-in, history and data stay). BYO
  keys (D-059) are the company's own spend and are never withheld.

The withholding and the scheduled `check_all` are wired by the master at merge (cloud/store.py
`keys_for_call`, cloud/app.py `stt_token` and `usage`, T-081's scheduler; D-058 hub lines)."""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sotto_worker.cloud.metering.prices import PriceTable, call_cost
from sotto_worker.cloud.store import CloudError, CloudStore, Principal, now_ms
from sotto_worker.server.catalog import apply_overrides

if TYPE_CHECKING:
    from sotto_worker.cloud.bundle import Seed

ALERT_LEVELS = (80, 100)
MAX_CAP_USD = 1_000_000.0

SCHEMA = """
CREATE TABLE IF NOT EXISTS spend_caps (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  cap_usd REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS spend_alerts (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  level INTEGER NOT NULL,
  spend_usd REAL NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (company_id, month, level)
)
"""

Send = Callable[[str, str], Awaitable[None]]  # (subject, text) to the owner


def month_of(t_ms: int) -> str:
    return datetime.fromtimestamp(t_ms / 1000, UTC).strftime("%Y-%m")


def month_start(t_ms: int) -> int:
    d = datetime.fromtimestamp(t_ms / 1000, UTC)
    return int(datetime(d.year, d.month, 1, tzinfo=UTC).timestamp() * 1000)


class Metering:
    def __init__(self, store: CloudStore, seed: Seed, table: PriceTable | None = None) -> None:
        self.s = store
        self.seed = seed
        self.table = table or PriceTable.load()
        with store._tx() as db:
            for stmt in SCHEMA.split(";"):
                if stmt.strip():
                    db.execute(stmt)

    # --- spend -----------------------------------------------------------------------------------
    def spend(self, company_id: str, t: int | None = None) -> float:
        """This month's estimated spend on AGN's keys: a BYO company's own routes are its own
        spend; the stages it leaves on AGN's routes still count."""
        from sotto_worker.cloud.owner import platform

        t = now_ms() if t is None else t
        own = (
            frozenset(self.s.routes(company_id))
            if platform.byo_on(self.s, company_id)
            else frozenset()
        )
        routing = apply_overrides(
            self.seed.routing, self.seed.catalog, platform.effective_routes(self.s, company_id)
        )
        rows = self.s._q(
            "SELECT duration_s, ai_cards FROM usage WHERE company_id = ? AND started_at >= ?"
            " AND source != 'practice'",
            (company_id, month_start(t)),
        )
        return sum(
            call_cost(
                self.table,
                self.seed.catalog,
                routing,
                duration_s=int(r["duration_s"]),
                ai_cards=int(r["ai_cards"]),
                skip=own,
            )
            for r in rows
        )

    def cap(self, company_id: str) -> float | None:
        rows = self.s._q("SELECT cap_usd FROM spend_caps WHERE company_id = ?", (company_id,))
        return float(rows[0]["cap_usd"]) if rows else None

    def set_cap(self, owner: Principal, company_id: str, cap: object, *, ip: str = "") -> None:
        """`cap` in USD per month, or None to remove it (back to "Cap not set")."""
        if owner.role != "owner":
            raise CloudError("forbidden", "only the platform owner sets spend caps")
        self.s.company_row(company_id)  # not_found for an unknown company
        with self.s._tx() as db:
            if cap is None:
                db.execute("DELETE FROM spend_caps WHERE company_id = ?", (company_id,))
                self.s.audit(
                    db, "owner.spend_cap.cleared", "", company_id=company_id, actor=owner, ip=ip
                )
                return
            if (
                not isinstance(cap, int | float)
                or isinstance(cap, bool)
                or not 0 < cap <= MAX_CAP_USD
            ):
                raise CloudError("invalid", "the cap is a number of US dollars per month above 0")
            db.execute(
                "INSERT INTO spend_caps(company_id, cap_usd, updated_at) VALUES (?,?,?)"
                " ON CONFLICT(company_id) DO UPDATE SET cap_usd = excluded.cap_usd,"
                " updated_at = excluded.updated_at",
                (company_id, float(cap), now_ms()),
            )
            self.s.audit(
                db,
                "owner.spend_cap.set",
                f"{float(cap):.2f} USD/month",
                company_id=company_id,
                actor=owner,
                ip=ip,
            )

    def state(self, company_id: str, t: int | None = None) -> dict[str, Any]:
        t = now_ms() if t is None else t
        spend = self.spend(company_id, t)
        cap = self.cap(company_id)
        if cap is None:
            status, ratio = "cap_not_set", None
        else:
            ratio = spend / cap
            status = "capped" if ratio >= 1 else "alert" if ratio >= 0.8 else "ok"
        alerts = [
            int(r["level"])
            for r in self.s._q(
                "SELECT level FROM spend_alerts WHERE company_id = ? AND month = ? ORDER BY level",
                (company_id, month_of(t)),
            )
        ]
        return {
            "month": month_of(t),
            "spend_usd": round(spend, 4),
            "cap_usd": cap,
            "ratio": None if ratio is None else round(ratio, 4),
            "status": status,
            "alerts": alerts,
            "estimate": True,
        }

    def cap_reached(self, company_id: str, t: int | None = None) -> bool:
        """True only with a cap set and this month's spend at or above it (see the module doc)."""
        cap = self.cap(company_id)
        return cap is not None and self.spend(company_id, t) >= cap

    async def check(self, company_id: str, send: Send | None, t: int | None = None) -> list[int]:
        """Records and sends each alert level crossed this month, once. Returns the new levels."""
        t = now_ms() if t is None else t
        cap = self.cap(company_id)
        if cap is None:
            return []
        spend = self.spend(company_id, t)
        month = month_of(t)
        new: list[int] = []
        for level in ALERT_LEVELS:
            if spend < cap * level / 100:
                continue
            with self.s._tx() as db:
                cur = db.execute(
                    "INSERT OR IGNORE INTO spend_alerts(company_id, month, level, spend_usd, at)"
                    " VALUES (?,?,?,?,?)",
                    (company_id, month, level, spend, t),
                )
                if cur.rowcount:
                    self.s.audit(db, "spend.alert", f"{level}% of {cap:.2f}", company_id=company_id)
                    new.append(level)
        if new and send is not None:
            name = str(self.s.company_row(company_id)["name"])
            level = new[-1]
            what = (
                "AGN keys are now withheld for this company until you raise the cap"
                if level >= 100
                else "nothing is blocked yet"
            )
            await send(
                f"{name}: {level} % of its AI spend cap",
                f"{name} has used an estimated {spend:.2f} USD of its {cap:.2f} USD cap for "
                f"{month} ({level} %); {what}. Owner console > Spend.",
            )
        return new

    async def check_all(self, send: Send | None, t: int | None = None) -> dict[str, list[int]]:
        out: dict[str, list[int]] = {}
        for r in self.s._q("SELECT company_id FROM spend_caps"):
            levels = await self.check(str(r["company_id"]), send, t)
            if levels:
                out[str(r["company_id"])] = levels
        return out

    def overview(self, t: int | None = None) -> list[dict[str, Any]]:
        t = int(time.time() * 1000) if t is None else t
        rows = self.s._q("SELECT id, name FROM companies ORDER BY name COLLATE NOCASE")
        return [{"id": r["id"], "name": r["name"], **self.state(str(r["id"]), t)} for r in rows]
