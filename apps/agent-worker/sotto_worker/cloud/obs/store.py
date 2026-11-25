"""Tenant-isolated storage for observability, GitHub call-log switches, and D-095 overrides (L3, L4)."""

from __future__ import annotations

import sqlite3
from typing import Any

from sotto_worker.cloud.features import PER_USER_OVERRIDE_IDS
from sotto_worker.cloud.store import CloudError, CloudStore, Principal, now_ms

LOGS_REPO_KEY = "obs.logs_repo"
LOGS_TOKEN_KEY = "obs.logs_token"

SCHEMA = """
CREATE TABLE IF NOT EXISTS obs_company_switches (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  call_logs_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS obs_user_overrides (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, user_id, feature_id)
);
CREATE TABLE IF NOT EXISTS obs_call_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  call_id TEXT,
  fingerprint TEXT,
  issue_number INTEGER NOT NULL,
  issue_url TEXT NOT NULL,
  label TEXT NOT NULL,
  state TEXT NOT NULL,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_obs_call_issues_company_fp
  ON obs_call_issues(company_id, fingerprint, state);
"""


def ensure_schema(store: CloudStore) -> None:
    """Idempotently create the obs tables on the given CloudStore database."""
    with store._tx() as db:
        for stmt in SCHEMA.split(';'):
            if stmt.strip():
                db.execute(stmt)


def _require_owner(actor: Principal) -> None:
    if actor.role != "owner":
        raise CloudError("forbidden", "only the platform owner may change call-log settings")


def _require_tenant(actor: Principal, company_id: str) -> None:
    if actor.role == "owner":
        return
    if actor.company_id != company_id:
        raise CloudError("forbidden", "cannot access another company's observability records")


def set_logs_repo(
    store: CloudStore, owner: Principal, repo: str, token: str, *, ip: str = "127.0.0.1"
) -> None:
    """Owner sets the private GitHub logs repo (e.g. Hasdro/sales-shield-logs) and token."""
    _require_owner(owner)
    ensure_schema(store)
    cleaned = repo.strip()
    if "/" not in cleaned or len(cleaned) > 120:
        raise CloudError("invalid", "repo must be in owner/name format")
    if not token.strip():
        raise CloudError("invalid", "token is required")
    t = now_ms()
    with store._tx() as db:
        for k, v in ((LOGS_REPO_KEY, cleaned), (LOGS_TOKEN_KEY, token.strip())):
            db.execute(
                "INSERT INTO platform_settings(key, value, updated_at) VALUES (?,?,?)"
                " ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                (k, v, t),
            )
        store.audit(db, "owner.call_logs.repo_set", f"repo={cleaned}", actor=owner, ip=ip)


def get_logs_repo(store: CloudStore) -> tuple[str, str] | None:
    ensure_schema(store)
    r1 = store._q("SELECT value FROM platform_settings WHERE key = ?", (LOGS_REPO_KEY,))
    r2 = store._q("SELECT value FROM platform_settings WHERE key = ?", (LOGS_TOKEN_KEY,))
    if not r1 or not r2:
        return None
    return str(r1[0]["value"]), str(r2[0]["value"])


def set_company_call_logs(
    store: CloudStore,
    owner: Principal,
    company_id: str,
    enabled: bool,
    *,
    ip: str = "127.0.0.1",
) -> None:
    """Owner-only per-company switch for GitHub call logs (default off, audit-logged, L4)."""
    _require_owner(owner)
    ensure_schema(store)
    store.company_row(company_id)
    t = now_ms()
    with store._tx() as db:
        db.execute(
            "INSERT INTO obs_company_switches(company_id, call_logs_enabled, updated_at) VALUES (?,?,?)"
            " ON CONFLICT(company_id) DO UPDATE SET call_logs_enabled = excluded.call_logs_enabled,"
            " updated_at = excluded.updated_at",
            (company_id, 1 if enabled else 0, t),
        )
        store.audit(
            db,
            "owner.call_logs.company_switch",
            f"company={company_id} enabled={enabled}",
            actor=owner,
            ip=ip,
        )


def set_user_override(
    store: CloudStore,
    owner: Principal,
    company_id: str,
    user_id: str,
    feature_id: str,
    enabled: bool | None,
    *,
    ip: str = "127.0.0.1",
) -> None:
    """Owner-only per-user override for D-095 feature IDs (None resets to inherit company)."""
    _require_owner(owner)
    ensure_schema(store)
    if feature_id not in PER_USER_OVERRIDE_IDS:
        raise CloudError(
            "invalid",
            f"per-user override is only allowed for {sorted(PER_USER_OVERRIDE_IDS)}",
        )
    store.company_row(company_id)
    t = now_ms()
    with store._tx() as db:
        if enabled is None:
            db.execute(
                "DELETE FROM obs_user_overrides WHERE company_id = ? AND user_id = ? AND feature_id = ?",
                (company_id, user_id, feature_id),
            )
        else:
            db.execute(
                "INSERT INTO obs_user_overrides(company_id, user_id, feature_id, enabled, updated_at)"
                " VALUES (?,?,?,?,?)"
                " ON CONFLICT(company_id, user_id, feature_id) DO UPDATE"
                " SET enabled = excluded.enabled, updated_at = excluded.updated_at",
                (company_id, user_id, feature_id, 1 if enabled else 0, t),
            )
        store.audit(
            db,
            "owner.feature_override.set",
            f"company={company_id} user={user_id} feature={feature_id} enabled={enabled}",
            actor=owner,
            ip=ip,
        )


def user_overrides_for(store: CloudStore, company_id: str, user_id: str) -> dict[str, bool]:
    """Return active D-095 per-user overrides for (company_id, user_id)."""
    ensure_schema(store)
    rows = store._q(
        "SELECT feature_id, enabled FROM obs_user_overrides WHERE company_id = ? AND user_id = ?",
        (company_id, user_id),
    )
    return {
        str(r["feature_id"]): bool(r["enabled"])
        for r in rows
        if str(r["feature_id"]) in PER_USER_OVERRIDE_IDS
    }


def call_logs_enabled_for(store: CloudStore, company_id: str, user_id: str) -> bool:
    """Effective L4 switch: user override wins if set, else company switch (default False)."""
    ensure_schema(store)
    overrides = user_overrides_for(store, company_id, user_id)
    if "call_logs_github" in overrides:
        return overrides["call_logs_github"]
    rows = store._q(
        "SELECT call_logs_enabled FROM obs_company_switches WHERE company_id = ?",
        (company_id,),
    )
    return bool(rows[0]["call_logs_enabled"]) if rows else False


def find_open_issue_by_fingerprint(
    store: CloudStore, company_id: str, fingerprint: str
) -> dict[str, Any] | None:
    ensure_schema(store)
    rows = store._q(
        "SELECT * FROM obs_call_issues"
        " WHERE company_id = ? AND fingerprint = ? AND state = 'open'"
        " ORDER BY id DESC LIMIT 1",
        (company_id, fingerprint),
    )
    return dict(rows[0]) if rows else None


def record_call_issue(
    store: CloudStore,
    actor: Principal,
    *,
    company_id: str,
    user_id: str,
    call_id: str | None,
    fingerprint: str | None,
    issue_number: int,
    issue_url: str,
    label: str,
    state: str,
    comment_count: int = 0,
) -> int:
    _require_tenant(actor, company_id)
    ensure_schema(store)
    with store._tx() as db:
        cur: sqlite3.Cursor = db.execute(
            "INSERT INTO obs_call_issues"
            "(company_id, user_id, call_id, fingerprint, issue_number, issue_url, label, state, comment_count, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                company_id,
                user_id,
                call_id,
                fingerprint,
                issue_number,
                issue_url,
                label,
                state,
                comment_count,
                now_ms(),
            ),
        )
        return int(cur.lastrowid or 0)


def increment_issue_comments(store: CloudStore, actor: Principal, company_id: str, issue_id: int) -> None:
    _require_tenant(actor, company_id)
    ensure_schema(store)
    with store._tx() as db:
        db.execute(
            "UPDATE obs_call_issues SET comment_count = comment_count + 1"
            " WHERE id = ? AND company_id = ?",
            (issue_id, company_id),
        )


def list_call_issues(store: CloudStore, actor: Principal, company_id: str) -> list[dict[str, Any]]:
    _require_tenant(actor, company_id)
    ensure_schema(store)
    rows = store._q(
        "SELECT * FROM obs_call_issues WHERE company_id = ? ORDER BY id DESC LIMIT 100",
        (company_id,),
    )
    return [dict(r) for r in rows]


def delete_call_issue(store: CloudStore, actor: Principal, company_id: str, issue_id: int) -> bool:
    _require_tenant(actor, company_id)
    ensure_schema(store)
    with store._tx() as db:
        cur = db.execute(
            "DELETE FROM obs_call_issues WHERE id = ? AND company_id = ?",
            (issue_id, company_id),
        )
        return cur.rowcount > 0
