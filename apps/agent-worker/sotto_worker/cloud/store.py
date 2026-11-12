"""Management data (D-022): one SQLite file. Every company-scoped row carries `company_id`, and
every company-scoped method takes the caller's company id and filters on it, so one company can
never read or change another's rows (tests/cloud/test_isolation.py checks every route).

Times are milliseconds since the epoch (UTC). Provider keys are AES-GCM encrypted (vault.py);
the vault name binds a ciphertext to its company and key slot."""

from __future__ import annotations

import calendar
import hashlib
import json
import re
import secrets
import sqlite3
import threading
import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sotto_worker.cloud import auth, features
from sotto_worker.cloud.passwords import (
    DUMMY_HASH,
    hash_password,
    new_temporary_password,
    password_problem,
    verify_password,
)
from sotto_worker.server.vault import Vault, VaultError

DAY_MS = 86_400_000
SESSION_DAYS = 30
OWNER_SESSION_HOURS = 12
ROLES = ("admin", "manager", "agent")
PLATFORMS = ("ios", "android", "web", "windows", "mac", "linux", "extension", "unknown")
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$")
KEY_ENV = re.compile(r"^[A-Z][A-Z0-9_]{2,63}$")
# Plan presets: seats and monthly call minutes. The owner can override both per company.
PLANS: dict[str, dict[str, int]] = {
    "trial": {"seats": 3, "minutes": 300, "days": 14},
    "starter": {"seats": 5, "minutes": 2_000},
    "team": {"seats": 20, "minutes": 10_000},
    "custom": {"seats": 50, "minutes": 50_000},
}
SETTINGS: dict[str, tuple[type, tuple[object, ...]]] = {
    "ai_answers_allowed": (bool, ()),
    "backup_allowed": (bool, ()),
    "agent_context": (bool, ()),
    "card_language": (str, ("auto", "en", "ar")),
    "audio_retention_days": (int, (0, 7, 30, 90, 365)),
    # Company knowledge the AI reads on every card and review (owner, 22 Oct 2026).
    "context": (str, ()),
    # Where unanswered questions are emailed (R2 step 4); empty = the managers (owner, 22 Oct).
    "manager_email": (str, ()),
}
CONTEXT_MAX_CHARS = 8000

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL,
  suspended INTEGER NOT NULL DEFAULT 0,
  trial_ends_at INTEGER,
  paid_until INTEGER,
  seats INTEGER NOT NULL,
  minutes_month INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  pw_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_pw INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER
);
CREATE INDEX IF NOT EXISTS users_company ON users(company_id);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  label TEXT NOT NULL,
  app_version TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS devices_company ON devices(company_id);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT REFERENCES devices(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS usage (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  device_id TEXT,
  started_at INTEGER NOT NULL,
  duration_s INTEGER NOT NULL,
  cards INTEGER NOT NULL,
  playbook_cards INTEGER NOT NULL,
  ai_cards INTEGER NOT NULL,
  holding_lines INTEGER NOT NULL,
  escalations INTEGER NOT NULL,
  p50_ms INTEGER,
  p95_ms INTEGER,
  stt_vendor TEXT NOT NULL DEFAULT '',
  llm_vendor TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL,
  reported_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_company_time ON usage(company_id, started_at);
CREATE TABLE IF NOT EXISTS call_starts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  started_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS company_keys (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key_env TEXT NOT NULL,
  ciphertext BLOB NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, key_env)
);
CREATE TABLE IF NOT EXISTS company_settings (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, key)
);
CREATE TABLE IF NOT EXISTS company_routes (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, stage)
);
CREATE TABLE IF NOT EXISTS playbook (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS playbook_company ON playbook(company_id);
CREATE TABLE IF NOT EXISTS escalations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  question TEXT NOT NULL,
  asked_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  answer TEXT,
  updated_at INTEGER NOT NULL,
  transcript_excerpt TEXT,
  call_id TEXT
);
CREATE INDEX IF NOT EXISTS escalations_company ON escalations(company_id, status);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  company_id TEXT,
  actor_id TEXT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_company ON audit(company_id, at);
CREATE TABLE IF NOT EXISTS spent_refresh (
  token_hash TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  sid TEXT NOT NULL,
  spent_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS company_features (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, feature)
);
CREATE TABLE IF NOT EXISTS company_entitlements (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  entitled INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, feature)
);
-- Platform-wide, no company data: the owner's global kill switch (D-028).
CREATE TABLE IF NOT EXISTS feature_kill (
  feature TEXT PRIMARY KEY,
  killed_at INTEGER NOT NULL
);
"""


class CloudError(ValueError):
    """A request the caller can fix; `code` is stable for the apps, the message is plain English."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class Principal:
    """Who is calling: resolved from a session token, never from anything the client claims."""

    user_id: str
    company_id: str | None  # None for the platform owner
    role: str  # owner | admin | manager | agent
    device_id: str | None
    email: str
    name: str
    must_change: bool = False
    session: str | None = None  # hash of the token this request came with

    @property
    def is_owner(self) -> bool:
        return self.role == "owner"

    def require(self, *roles: str) -> None:
        if self.role not in roles:
            raise CloudError("forbidden", "your role cannot do this")

    @property
    def company(self) -> str:
        if self.company_id is None:
            raise CloudError("forbidden", "this needs a company account")
        return self.company_id


def now_ms() -> int:
    return int(time.time() * 1000)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _pair_out(access: str, refresh: str, t: int) -> dict[str, Any]:
    return {
        "token": access,
        "refresh_token": refresh,
        "access_expires_at": t + auth.ACCESS_TTL_MS,
        "refresh_expires_at": t + auth.REFRESH_TTL_MS,
    }


def _month_start(t: int) -> int:
    tm = time.gmtime(t / 1000)
    return calendar.timegm((tm.tm_year, tm.tm_mon, 1, 0, 0, 0)) * 1000


def _clean(text: object, field: str, limit: int, *, required: bool = True) -> str:
    value = str(text or "").strip()
    if required and not value:
        raise CloudError("invalid", f"{field} is required")
    if len(value) > limit:
        raise CloudError("invalid", f"{field} is too long (max {limit})")
    return value


def plan_state(row: sqlite3.Row | dict[str, Any], used_minutes: int, t: int) -> dict[str, Any]:
    """What the apps and the dashboard show: status, days left, and whether calls are allowed."""
    plan = str(row["plan"])
    if row["suspended"]:
        status = "suspended"
    elif plan == "trial":
        status = "trial" if (row["trial_ends_at"] or 0) > t else "expired"
    elif row["paid_until"] and int(row["paid_until"]) < t:
        status = "expired"
    else:
        status = "active"
    ends = row["trial_ends_at"] if plan == "trial" else row["paid_until"]
    days_left = None if not ends else max(0, -(-(int(ends) - t) // DAY_MS))
    minutes = int(row["minutes_month"])
    can_call = status in ("trial", "active") and used_minutes < minutes
    reason = None
    if status in ("suspended", "expired"):
        reason = f"plan {status}"
    elif not can_call:
        reason = "monthly minutes used up"
    return {
        "plan": plan,
        "status": status,
        "days_left": days_left,
        "ends_at": ends,
        "seats": int(row["seats"]),
        "minutes_month": minutes,
        "minutes_used": used_minutes,
        "can_call": can_call,
        "blocked_reason": reason,
    }


# (table, column, type) added since the first release; see CloudStore._add_missing_columns.
ADDED_COLUMNS = (
    ("escalations", "transcript_excerpt", "TEXT"),  # T-034: the conversation around the question
    ("escalations", "call_id", "TEXT"),
    ("usage", "recording_bytes", "INTEGER"),  # owner, 22 Oct 2026: uploaded call recording
    ("usage", "source", "TEXT"),  # owner, 22 Oct 2026: zoom, teams, meet, 3cx, mic…
    ("usage", "review_json", "TEXT"),  # owner, 22 Oct 2026: the after-call review's numbers
    ("sessions", "sid", "TEXT"),  # D-029: stable id of a refresh-token session (NULL = 0.2.0)
    ("sessions", "refresh_hash", "TEXT"),  # D-029: hash of the current refresh token
    ("sessions", "access_until", "INTEGER"),  # D-029: when the current access token ends
)
EXCERPT_MAX_CHARS = 2000
REVIEW_DIMENSIONS = ("opening", "discovery", "listening", "objections", "clarity", "next_step")
# Where a call came from (owner, 22 Oct 2026); anything else is stored as "computer".
CALL_SOURCES = frozenset(
    {
        *("zoom", "teams", "meet", "webex", "3cx", "yeastar", "whatsapp", "facetime"),
        *("slack", "telegram", "discord", "softphone", "browser", "computer", "mic", "practice"),
    }
)


class CloudStore:
    def __init__(self, path: Path | str, vault: Vault) -> None:
        self._vault = vault
        self._lock = threading.Lock()
        self._db = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        self.last_escalation_new = False  # set by add_escalation: was the question new?
        self._db.executescript(SCHEMA)
        self._add_missing_columns()

    def _add_missing_columns(self) -> None:
        """Columns added after a database was created (CREATE TABLE IF NOT EXISTS keeps the old
        shape): add them, empty, so an existing server keeps its data."""
        for table, column, kind in ADDED_COLUMNS:
            have = {r["name"] for r in self._db.execute(f"PRAGMA table_info({table})")}
            if column not in have:
                self._db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {kind}")
        self._db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS sessions_refresh ON sessions(refresh_hash)"
        )

    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                yield self._db
            except BaseException:
                self._db.execute("ROLLBACK")
                raise
            self._db.execute("COMMIT")

    def _q(self, sql: str, args: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
        with self._lock:
            return list(self._db.execute(sql, args).fetchall())

    def close(self) -> None:
        self._db.close()

    def backup(self, target: Path) -> None:
        with self._lock:
            dest = sqlite3.connect(str(target))
            try:
                self._db.backup(dest)
            finally:
                dest.close()

    def audit(
        self,
        db: sqlite3.Connection,
        action: str,
        detail: str,
        *,
        company_id: str | None = None,
        actor: Principal | None = None,
        ip: str = "",
    ) -> None:
        db.execute(
            "INSERT INTO audit(at, company_id, actor_id, action, detail, ip) VALUES (?,?,?,?,?,?)",
            (now_ms(), company_id, actor.user_id if actor else None, action, detail[:500], ip),
        )

    # --- accounts ------------------------------------------------------------------------------
    def _new_user(
        self,
        db: sqlite3.Connection,
        *,
        company_id: str | None,
        email: str,
        name: str,
        password: str,
        role: str,
        must_change: bool = False,
    ) -> str:
        email = _clean(email, "email", 254).lower()
        if not EMAIL.match(email):
            raise CloudError("invalid", "enter a valid email address")
        problem = password_problem(password)
        if problem:
            raise CloudError("weak_password", problem)
        if db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            raise CloudError("email_taken", "an account with this email already exists")
        user_id = str(uuid.uuid4())
        db.execute(
            "INSERT INTO users(id, company_id, email, name, pw_hash, role, must_change_pw,"
            " created_at) VALUES (?,?,?,?,?,?,?,?)",
            (
                user_id,
                company_id,
                email,
                _clean(name, "name", 120),
                hash_password(password),
                role,
                int(must_change),
                now_ms(),
            ),
        )
        return user_id

    def signup(
        self,
        *,
        company: str,
        name: str,
        email: str,
        password: str,
        ip: str = "",
        examples: list[dict[str, Any]] | None = None,
    ) -> tuple[str, str]:
        """A new company on a trial, with the signer as its admin. Returns (company_id, user_id)."""
        t = now_ms()
        trial = PLANS["trial"]
        company_id = str(uuid.uuid4())
        with self._tx() as db:
            db.execute(
                "INSERT INTO companies(id, name, plan, trial_ends_at, seats, minutes_month,"
                " created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                (
                    company_id,
                    _clean(company, "company name", 120),
                    "trial",
                    t + trial["days"] * DAY_MS,
                    trial["seats"],
                    trial["minutes"],
                    t,
                    t,
                ),
            )
            user_id = self._new_user(
                db, company_id=company_id, email=email, name=name, password=password, role="admin"
            )
            self.audit(db, "company.signup", f"{company} ({email})", company_id=company_id, ip=ip)
        if examples:
            self.add_examples(company_id, examples)
        return company_id, user_id

    def add_examples(self, company_id: str, examples: list[dict[str, Any]]) -> int:
        """Adds the example answers this company does not have yet; returns how many."""
        have = {e["question"] for e in self.playbook(company_id)}
        added = 0
        with self._tx() as db:
            for e in examples:
                q, a, tags = self._entry(e)
                if q in have:
                    continue
                db.execute(
                    "INSERT INTO playbook(id, company_id, question, answer, tags_json, updated_at)"
                    " VALUES (?,?,?,?,?,?)",
                    (str(uuid.uuid4()), company_id, q, a, json.dumps(tags), now_ms()),
                )
                added += 1
            if added:
                self.audit(db, "playbook.examples", f"{added} added", company_id=company_id)
        return added

    def company_by_name(self, name: str) -> str | None:
        rows = self._q("SELECT id FROM companies WHERE lower(name) = lower(?)", (name.strip(),))
        return str(rows[0]["id"]) if len(rows) == 1 else None

    def create_owner(self, email: str, name: str, password: str) -> str:
        with self._tx() as db:
            user_id = self._new_user(
                db,
                company_id=None,
                email=email,
                name=name,
                password=password,
                role="owner",
                must_change=True,
            )
            self.audit(db, "owner.created", email)
        return user_id

    def owner_exists(self) -> bool:
        return bool(self._q("SELECT 1 FROM users WHERE role = 'owner' LIMIT 1"))

    def check_login(self, email: str, password: str) -> sqlite3.Row | None:
        rows = self._q("SELECT * FROM users WHERE email = ?", (email.strip().lower(),))
        if not rows:
            verify_password(password, DUMMY_HASH)  # same time as a real check
            return None
        user = rows[0]
        if not verify_password(password, str(user["pw_hash"])) or not user["active"]:
            return None
        return user

    def change_password(self, who: Principal, current: str, new: str) -> None:
        row = self._q("SELECT pw_hash FROM users WHERE id = ?", (who.user_id,))
        if not row or not verify_password(current, str(row[0]["pw_hash"])):
            raise CloudError("wrong_password", "current password is wrong")
        problem = password_problem(new)
        if problem:
            raise CloudError("weak_password", problem)
        with self._tx() as db:
            db.execute(
                "UPDATE users SET pw_hash = ?, must_change_pw = 0 WHERE id = ?",
                (hash_password(new), who.user_id),
            )
            # Every other session of this person ends; the one that changed it stays.
            db.execute(
                "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL"
                " AND token_hash != ?",
                (now_ms(), who.user_id, who.session or ""),
            )
            self.audit(db, "user.password", who.email, company_id=who.company_id, actor=who)

    # --- sessions and devices ------------------------------------------------------------------
    def open_session(
        self, user: sqlite3.Row, *, kind: str, device: dict[str, Any] | None = None
    ) -> str:
        """A 0.2.0-style session: one token (30 days for apps, 12 hours for the owner)."""
        t = now_ms()
        token = secrets.token_urlsafe(32)
        device_id: str | None = None
        company_id = user["company_id"]
        with self._tx() as db:
            if device is not None:
                device_id = self._device(db, user, device, t)
            ttl = OWNER_SESSION_HOURS * 3_600_000 if kind == "owner" else SESSION_DAYS * DAY_MS
            db.execute(
                "INSERT INTO sessions(token_hash, company_id, user_id, device_id, kind, created_at,"
                " expires_at, last_seen_at) VALUES (?,?,?,?,?,?,?,?)",
                (_token_hash(token), company_id, user["id"], device_id, kind, t, t + ttl, t),
            )
            db.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (t, user["id"]))
        return token

    def open_pair(self, user: sqlite3.Row, *, device: dict[str, Any]) -> dict[str, Any]:
        """A refresh-token session for an app (D-029): a short access token + a refresh token."""
        t = now_ms()
        access, refresh = auth.new_access(), auth.new_refresh()
        with self._tx() as db:
            device_id = self._device(db, user, device, t)
            db.execute(
                "INSERT INTO sessions(token_hash, company_id, user_id, device_id, kind, created_at,"
                " expires_at, last_seen_at, sid, refresh_hash, access_until)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (
                    _token_hash(access),
                    user["company_id"],
                    user["id"],
                    device_id,
                    "app",
                    t,
                    t + auth.REFRESH_TTL_MS,
                    t,
                    auth.new_sid(),
                    _token_hash(refresh),
                    t + auth.ACCESS_TTL_MS,
                ),
            )
            db.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (t, user["id"]))
        return _pair_out(access, refresh, t)

    def refresh(self, refresh_token: str, *, ip: str = "") -> dict[str, Any] | None:
        """Spends a refresh token for a new pair, or None (sign in again). A spent token
        presented again revokes its whole device session (D-029)."""
        if not refresh_token.startswith(auth.REFRESH_PREFIX) or len(refresh_token) > 200:
            return None
        h = _token_hash(refresh_token)
        t = now_ms()
        with self._tx() as db:
            s = db.execute(
                "SELECT s.*, u.active, d.revoked_at AS device_revoked FROM sessions s"
                " JOIN users u ON u.id = s.user_id LEFT JOIN devices d ON d.id = s.device_id"
                " WHERE s.refresh_hash = ?",
                (h,),
            ).fetchone()
            if s is None:
                self._spent_refresh(db, h, t, ip)
                return None
            if (
                s["kind"] != "app"
                or s["revoked_at"]
                or s["device_revoked"]
                or s["expires_at"] < t
                or not s["active"]
            ):
                return None
            access, new_refresh = auth.new_access(), auth.new_refresh()
            db.execute(
                "INSERT OR REPLACE INTO spent_refresh(token_hash, company_id, sid, spent_at)"
                " VALUES (?,?,?,?)",
                (h, s["company_id"], s["sid"], t),
            )
            db.execute(
                "UPDATE sessions SET token_hash = ?, refresh_hash = ?, access_until = ?,"
                " expires_at = ?, last_seen_at = ? WHERE token_hash = ?",
                (
                    _token_hash(access),
                    _token_hash(new_refresh),
                    t + auth.ACCESS_TTL_MS,
                    t + auth.REFRESH_TTL_MS,
                    t,
                    s["token_hash"],
                ),
            )
            db.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (t, s["user_id"]))
            if s["device_id"]:
                db.execute("UPDATE devices SET last_seen = ? WHERE id = ?", (t, s["device_id"]))
            db.execute("DELETE FROM spent_refresh WHERE spent_at < ?", (t - auth.SPENT_KEEP_MS,))
        return _pair_out(access, new_refresh, t)

    def _spent_refresh(self, db: sqlite3.Connection, h: str, t: int, ip: str) -> None:
        """A refresh token that is not current: if it was spent before, someone copied it."""
        spent = db.execute(
            "SELECT sid, company_id FROM spent_refresh WHERE token_hash = ?", (h,)
        ).fetchone()
        if spent is None:
            return
        db.execute(
            "UPDATE sessions SET revoked_at = ? WHERE sid = ? AND revoked_at IS NULL",
            (t, spent["sid"]),
        )
        self.audit(
            db,
            "session.refresh_reused",
            "a used refresh token came back; the device session was revoked",
            company_id=spent["company_id"],
            ip=ip,
        )

    def migrate(self, who: Principal) -> dict[str, Any]:
        """Turns a 0.2.0 session (one 30-day token) into a pair in place: same device, no new
        sign-in (D-029). The old token stops working."""
        if who.session is None:
            raise CloudError("signed_out", "sign in again")
        t = now_ms()
        access, refresh = auth.new_access(), auth.new_refresh()
        with self._tx() as db:
            s = db.execute(
                "SELECT sid, kind FROM sessions WHERE token_hash = ?", (who.session,)
            ).fetchone()
            if s is None or s["kind"] != "app":
                raise CloudError("signed_out", "sign in again")
            if s["sid"]:
                raise CloudError("invalid", "this session already uses refresh tokens")
            db.execute(
                "UPDATE sessions SET token_hash = ?, sid = ?, refresh_hash = ?, access_until = ?,"
                " expires_at = ?, last_seen_at = ? WHERE token_hash = ?",
                (
                    _token_hash(access),
                    auth.new_sid(),
                    _token_hash(refresh),
                    t + auth.ACCESS_TTL_MS,
                    t + auth.REFRESH_TTL_MS,
                    t,
                    who.session,
                ),
            )
            self.audit(db, "session.migrated", who.email, company_id=who.company_id, actor=who)
        return _pair_out(access, refresh, t)

    def _device(
        self, db: sqlite3.Connection, user: sqlite3.Row, device: dict[str, Any], t: int
    ) -> str:
        raw_id = str(device.get("id") or "")
        platform = str(device.get("platform") or "unknown")
        if platform not in PLATFORMS:
            platform = "unknown"
        label = _clean(device.get("label") or platform, "device label", 80)
        version = _clean(device.get("app_version") or "0", "app version", 40)
        # Device ids are per user: the same id from another user is a different device row.
        device_id = hashlib.sha256(f"{user['id']}:{raw_id or uuid.uuid4()}".encode()).hexdigest()[
            :32
        ]
        found = db.execute("SELECT revoked_at FROM devices WHERE id = ?", (device_id,)).fetchone()
        if found:
            db.execute(
                "UPDATE devices SET last_seen = ?, label = ?, app_version = ?, platform = ?,"
                " revoked_at = NULL WHERE id = ?",
                (t, label, version, platform, device_id),
            )
        else:
            db.execute(
                "INSERT INTO devices(id, company_id, user_id, platform, label, app_version,"
                " first_seen, last_seen) VALUES (?,?,?,?,?,?,?,?)",
                (device_id, user["company_id"], user["id"], platform, label, version, t, t),
            )
        return device_id

    def principal(self, token: str | None, *, kind: str) -> Principal | None:
        if not token or len(token) > 200:
            return None
        t = now_ms()
        rows = self._q(
            "SELECT s.*, u.email, u.name, u.role, u.active, u.must_change_pw,"
            " d.revoked_at AS device_revoked"
            " FROM sessions s JOIN users u ON u.id = s.user_id"
            " LEFT JOIN devices d ON d.id = s.device_id WHERE s.token_hash = ?",
            (_token_hash(token),),
        )
        if not rows:
            return None
        s = rows[0]
        if (
            s["kind"] != kind
            or s["revoked_at"]
            or s["device_revoked"]
            or s["expires_at"] < t
            or (s["access_until"] is not None and s["access_until"] < t)
            or not s["active"]
        ):
            return None
        if t - int(s["last_seen_at"]) > 60_000:  # at most one write a minute per session
            with self._tx() as db:
                db.execute(
                    "UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?",
                    (t, s["token_hash"]),
                )
                db.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (t, s["user_id"]))
                if s["device_id"]:
                    db.execute("UPDATE devices SET last_seen = ? WHERE id = ?", (t, s["device_id"]))
        return Principal(
            user_id=str(s["user_id"]),
            company_id=s["company_id"],
            role=str(s["role"]),
            device_id=s["device_id"],
            email=str(s["email"]),
            name=str(s["name"]),
            must_change=bool(s["must_change_pw"]),
            session=str(s["token_hash"]),
        )

    def close_session(self, token: str) -> None:
        with self._tx() as db:
            db.execute(
                "UPDATE sessions SET revoked_at = ? WHERE token_hash = ?",
                (now_ms(), _token_hash(token)),
            )

    def devices(self, who: Principal, *, all_users: bool = False) -> list[dict[str, Any]]:
        if all_users:
            who.require("admin")
            rows = self._q(
                "SELECT d.*, u.email, u.name FROM devices d JOIN users u ON u.id = d.user_id"
                " WHERE d.company_id = ? ORDER BY d.last_seen DESC",
                (who.company,),
            )
        else:
            rows = self._q(
                "SELECT d.*, u.email, u.name FROM devices d JOIN users u ON u.id = d.user_id"
                " WHERE d.company_id = ? AND d.user_id = ? ORDER BY d.last_seen DESC",
                (who.company, who.user_id),
            )
        return [self._device_out(r, who.device_id) for r in rows]

    @staticmethod
    def _device_out(r: sqlite3.Row, current: str | None = None) -> dict[str, Any]:
        return {
            "id": r["id"],
            "user": {"email": r["email"], "name": r["name"]},
            "platform": r["platform"],
            "label": r["label"],
            "app_version": r["app_version"],
            "first_seen": r["first_seen"],
            "last_seen": r["last_seen"],
            "revoked": r["revoked_at"] is not None,
            "this_device": r["id"] == current,
        }

    def revoke_device(self, who: Principal, device_id: str, *, ip: str = "") -> None:
        """A user signs out one of their own devices; an admin any device of the company."""
        rows = self._q(
            "SELECT * FROM devices WHERE id = ? AND company_id = ?", (device_id, who.company)
        )
        if not rows or (rows[0]["user_id"] != who.user_id and who.role != "admin"):
            raise CloudError("not_found", "device not found")
        with self._tx() as db:
            self._revoke(db, device_id)
            self.audit(
                db, "device.revoked", rows[0]["label"], company_id=who.company, actor=who, ip=ip
            )

    @staticmethod
    def _revoke(db: sqlite3.Connection, device_id: str) -> None:
        t = now_ms()
        db.execute("UPDATE devices SET revoked_at = ? WHERE id = ?", (t, device_id))
        db.execute(
            "UPDATE sessions SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL",
            (t, device_id),
        )

    # --- company view (apps) -------------------------------------------------------------------
    def minutes_used(self, company_id: str, t: int | None = None) -> int:
        t = t or now_ms()
        rows = self._q(
            "SELECT COALESCE(SUM(duration_s), 0) AS s FROM usage"
            " WHERE company_id = ? AND started_at >= ?",
            (company_id, _month_start(t)),
        )
        return -(-int(rows[0]["s"]) // 60)

    def company_row(self, company_id: str) -> sqlite3.Row:
        rows = self._q("SELECT * FROM companies WHERE id = ?", (company_id,))
        if not rows:
            raise CloudError("not_found", "company not found")
        return rows[0]

    def me(self, who: Principal) -> dict[str, Any]:
        user = self._q("SELECT must_change_pw FROM users WHERE id = ?", (who.user_id,))[0]
        out: dict[str, Any] = {
            "user": {
                "id": who.user_id,
                "email": who.email,
                "name": who.name,
                "role": who.role,
                "must_change_password": bool(user["must_change_pw"]),
            },
            "company": None,
        }
        if who.company_id:
            c = self.company_row(who.company_id)
            seats_used = self._q(
                "SELECT COUNT(*) AS n FROM users WHERE company_id = ? AND active = 1",
                (who.company_id,),
            )[0]["n"]
            state = plan_state(c, self.minutes_used(who.company_id), now_ms())
            out["company"] = {"id": c["id"], "name": c["name"], "seats_used": seats_used, **state}
        out["features"] = self.features_for(who)
        return out

    def settings(self, company_id: str) -> dict[str, Any]:
        rows = self._q(
            "SELECT key, value_json FROM company_settings WHERE company_id = ?", (company_id,)
        )
        return {r["key"]: json.loads(r["value_json"]) for r in rows}

    def set_settings(self, who: Principal, changes: dict[str, Any], *, ip: str = "") -> None:
        who.require("admin")
        clean: dict[str, Any] = {}
        for key, value in changes.items():
            if key not in SETTINGS:
                raise CloudError("invalid", f"unknown setting {key!r}")
            kind, allowed = SETTINGS[key]
            if type(value) is not kind or (allowed and value not in allowed):
                raise CloudError("invalid", f"bad value for {key}")
            if key == "manager_email" and isinstance(value, str):
                value = value.strip()
                if value and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value):
                    raise CloudError("invalid", "that is not an email address")
            if key == "context" and isinstance(value, str):
                value = value.strip()
                if len(value) > CONTEXT_MAX_CHARS:
                    raise CloudError("too_large", f"keep it under {CONTEXT_MAX_CHARS} characters")
            clean[key] = value
        t = now_ms()
        with self._tx() as db:
            for key, value in clean.items():
                db.execute(
                    "INSERT INTO company_settings(company_id, key, value_json, updated_at)"
                    " VALUES (?,?,?,?) ON CONFLICT(company_id, key) DO UPDATE SET"
                    " value_json = excluded.value_json, updated_at = excluded.updated_at",
                    (who.company, key, json.dumps(value), t),
                )
            self.audit(db, "settings", json.dumps(clean), company_id=who.company, actor=who, ip=ip)

    # --- provider keys --------------------------------------------------------------------------
    def _vault_name(self, company_id: str, key_env: str) -> str:
        return f"{company_id}:{key_env}"

    def set_key(self, who: Principal, key_env: str, value: str, *, ip: str = "") -> None:
        who.require("admin")
        if not KEY_ENV.match(key_env):
            raise CloudError("invalid", "unknown key name")
        value = value.strip()
        if not 8 <= len(value) <= 400 or any(c.isspace() for c in value):
            raise CloudError("invalid", "that does not look like a key")
        blob = self._vault.encrypt(self._vault_name(who.company, key_env), value)
        with self._tx() as db:
            db.execute(
                "INSERT INTO company_keys(company_id, key_env, ciphertext, updated_at)"
                " VALUES (?,?,?,?) ON CONFLICT(company_id, key_env) DO UPDATE SET"
                " ciphertext = excluded.ciphertext, updated_at = excluded.updated_at",
                (who.company, key_env, blob, now_ms()),
            )
            self.audit(db, "key.set", key_env, company_id=who.company, actor=who, ip=ip)

    def delete_key(self, who: Principal, key_env: str, *, ip: str = "") -> None:
        who.require("admin")
        with self._tx() as db:
            db.execute(
                "DELETE FROM company_keys WHERE company_id = ? AND key_env = ?",
                (who.company, key_env),
            )
            self.audit(db, "key.deleted", key_env, company_id=who.company, actor=who, ip=ip)

    def stored_key(self, who: Principal, key_env: str) -> str | None:
        """One key for a server-side use (minting a short-lived STT token); never sent out."""
        rows = self._q(
            "SELECT ciphertext FROM company_keys WHERE company_id = ? AND key_env = ?",
            (who.company, key_env),
        )
        if not rows:
            return None
        try:
            return self._vault.decrypt(
                self._vault_name(who.company, key_env), rows[0]["ciphertext"]
            )
        except VaultError:
            return None

    def key_status(self, who: Principal) -> dict[str, int]:
        rows = self._q(
            "SELECT key_env, updated_at FROM company_keys WHERE company_id = ?", (who.company,)
        )
        return {r["key_env"]: int(r["updated_at"]) for r in rows}

    def keys_for_call(
        self, who: Principal, needed: set[str] | None = None, *, ip: str = ""
    ) -> dict[str, str]:
        """Decrypted keys for a signed-in user of this company whose plan allows calls (D-022):
        only the ones in `needed` (the keys the company's current model routes use), never a key
        that has a short-lived token path. Each delivery is in the audit log."""
        rows = self._q(
            "SELECT key_env, ciphertext FROM company_keys WHERE company_id = ?", (who.company,)
        )
        rows = [r for r in rows if needed is None or r["key_env"] in needed]
        if needed is not None and rows:
            with self._tx() as db:
                names = ",".join(sorted(r["key_env"] for r in rows))
                self.audit(db, "keys.delivered", names, company_id=who.company, actor=who, ip=ip)
        out: dict[str, str] = {}
        for r in rows:
            try:
                out[r["key_env"]] = self._vault.decrypt(
                    self._vault_name(who.company, r["key_env"]), r["ciphertext"]
                )
            except VaultError:
                continue
        return out

    # --- routes (which vendor/model per stage) --------------------------------------------------
    def routes(self, company_id: str) -> dict[str, tuple[str, str]]:
        rows = self._q(
            "SELECT stage, provider_id, model FROM company_routes WHERE company_id = ?",
            (company_id,),
        )
        return {r["stage"]: (r["provider_id"], r["model"]) for r in rows}

    def set_route(
        self, who: Principal, stage: str, provider_id: str, model: str, *, ip: str = ""
    ) -> None:
        who.require("admin")
        with self._tx() as db:
            db.execute(
                "INSERT INTO company_routes(company_id, stage, provider_id, model, updated_at)"
                " VALUES (?,?,?,?,?) ON CONFLICT(company_id, stage) DO UPDATE SET"
                " provider_id = excluded.provider_id, model = excluded.model,"
                " updated_at = excluded.updated_at",
                (who.company, stage, provider_id, model, now_ms()),
            )
            self.audit(
                db,
                "route.set",
                f"{stage}={provider_id}/{model}",
                company_id=who.company,
                actor=who,
                ip=ip,
            )

    def reset_route(self, who: Principal, stage: str, *, ip: str = "") -> None:
        who.require("admin")
        with self._tx() as db:
            db.execute(
                "DELETE FROM company_routes WHERE company_id = ? AND stage = ?",
                (who.company, stage),
            )
            self.audit(db, "route.reset", stage, company_id=who.company, actor=who, ip=ip)

    # --- playbook --------------------------------------------------------------------------------
    def playbook(self, company_id: str) -> list[dict[str, Any]]:
        rows = self._q(
            "SELECT * FROM playbook WHERE company_id = ? ORDER BY updated_at DESC", (company_id,)
        )
        return [
            {
                "id": r["id"],
                "question": r["question"],
                "answer": r["answer"],
                "tags": json.loads(r["tags_json"]),
                "updated_at": r["updated_at"],
            }
            for r in rows
        ]

    @staticmethod
    def _entry(data: dict[str, Any]) -> tuple[str, str, list[str]]:
        q = _clean(data.get("question"), "question", 300)
        a = _clean(data.get("answer"), "answer", 600)
        if len(a.split()) > 40:
            raise CloudError("invalid", "keep the answer to 40 words (what an agent can say)")
        tags_raw = data.get("tags") or []
        if not isinstance(tags_raw, list):
            raise CloudError("invalid", "tags must be a list")
        tags = [_clean(t, "tag", 40) for t in tags_raw][:10]
        return q, a, tags

    def add_entry(self, who: Principal, data: dict[str, Any], *, ip: str = "") -> str:
        who.require("admin", "manager")
        q, a, tags = self._entry(data)
        entry_id = str(uuid.uuid4())
        with self._tx() as db:
            db.execute(
                "INSERT INTO playbook(id, company_id, question, answer, tags_json, updated_at)"
                " VALUES (?,?,?,?,?,?)",
                (entry_id, who.company, q, a, json.dumps(tags), now_ms()),
            )
            self.audit(db, "playbook.add", q, company_id=who.company, actor=who, ip=ip)
        return entry_id

    def update_entry(
        self, who: Principal, entry_id: str, data: dict[str, Any], *, ip: str = ""
    ) -> None:
        who.require("admin", "manager")
        q, a, tags = self._entry(data)
        with self._tx() as db:
            cur = db.execute(
                "UPDATE playbook SET question = ?, answer = ?, tags_json = ?, updated_at = ?"
                " WHERE id = ? AND company_id = ?",
                (q, a, json.dumps(tags), now_ms(), entry_id, who.company),
            )
            if cur.rowcount == 0:
                raise CloudError("not_found", "entry not found")
            self.audit(db, "playbook.edit", q, company_id=who.company, actor=who, ip=ip)

    def delete_entry(self, who: Principal, entry_id: str, *, ip: str = "") -> None:
        who.require("admin", "manager")
        with self._tx() as db:
            cur = db.execute(
                "DELETE FROM playbook WHERE id = ? AND company_id = ?", (entry_id, who.company)
            )
            if cur.rowcount == 0:
                raise CloudError("not_found", "entry not found")
            self.audit(db, "playbook.delete", entry_id, company_id=who.company, actor=who, ip=ip)

    # --- escalations (R2 inbox) ------------------------------------------------------------------
    def add_escalation(
        self, who: Principal, question: str, excerpt: str = "", call_id: str = ""
    ) -> str:
        """The asking agent is the signed-in user; the excerpt keeps its last 2000 characters
        (the lines nearest the question)."""
        q = _clean(question, "question", 500)
        context = str(excerpt or "").strip()[-EXCERPT_MAX_CHARS:] or None
        call = str(call_id or "").strip()[:64] or None
        with self._tx() as db:
            dup = db.execute(
                "SELECT id FROM escalations WHERE company_id = ? AND question = ? AND status ="
                " 'open'",
                (who.company, q),
            ).fetchone()
            if dup:
                self.last_escalation_new = False
                return str(dup["id"])
            self.last_escalation_new = True
            item_id = str(uuid.uuid4())
            t = now_ms()
            db.execute(
                "INSERT INTO escalations(id, company_id, user_id, question, asked_at, updated_at,"
                " transcript_excerpt, call_id) VALUES (?,?,?,?,?,?,?,?)",
                (item_id, who.company, who.user_id, q, t, t, context, call),
            )
        return item_id

    def escalation_recipients(self, company_id: str) -> list[str]:
        """Who gets the manager email (R2 step 4): the company's manager address if an admin set
        one, else every active manager, else every active admin."""
        settings = self.settings(company_id)
        chosen = str(settings.get("manager_email") or "").strip()
        if chosen:
            return [chosen]
        for role in ("manager", "admin"):
            rows = self._q(
                "SELECT email FROM users WHERE company_id = ? AND role = ? AND active = 1",
                (company_id, role),
            )
            if rows:
                return [str(r["email"]) for r in rows]
        return []

    def escalations(self, who: Principal) -> list[dict[str, Any]]:
        who.require("admin", "manager")
        rows = self._q(
            "SELECT e.*, u.name AS agent_name FROM escalations e"
            " LEFT JOIN users u ON u.id = e.user_id AND u.company_id = e.company_id"
            " WHERE e.company_id = ? ORDER BY e.asked_at DESC LIMIT 200",
            (who.company,),
        )
        return [
            {
                "id": r["id"],
                "question": r["question"],
                "asked_at": r["asked_at"],
                "status": r["status"],
                "answer": r["answer"],
                "transcript_excerpt": r["transcript_excerpt"],
                "call_id": r["call_id"],
                "agent_id": r["user_id"],
                "agent_name": r["agent_name"],
            }
            for r in rows
        ]

    def answer_escalation(
        self, who: Principal, item_id: str, answer: str, *, add: bool, ip: str = ""
    ) -> None:
        who.require("admin", "manager")
        rows = self._q(
            "SELECT * FROM escalations WHERE id = ? AND company_id = ?", (item_id, who.company)
        )
        if not rows:
            raise CloudError("not_found", "question not found")
        q, a, _ = self._entry({"question": rows[0]["question"], "answer": answer})
        with self._tx() as db:
            db.execute(
                "UPDATE escalations SET answer = ?, status = ?, updated_at = ? WHERE id = ?",
                (a, "added" if add else "answered", now_ms(), item_id),
            )
            if add:
                db.execute(
                    "INSERT INTO playbook(id, company_id, question, answer, tags_json, updated_at)"
                    " VALUES (?,?,?,?,?,?)",
                    (str(uuid.uuid4()), who.company, q, a, "[]", now_ms()),
                )
            self.audit(
                db,
                "escalation." + ("added" if add else "answered"),
                q,
                company_id=who.company,
                actor=who,
                ip=ip,
            )

    # --- team ------------------------------------------------------------------------------------
    def team(self, who: Principal) -> list[dict[str, Any]]:
        who.require("admin", "manager")
        rows = self._q(
            "SELECT id, email, name, role, active, created_at, last_seen_at FROM users"
            " WHERE company_id = ? ORDER BY created_at",
            (who.company,),
        )
        return [dict(r) | {"active": bool(r["active"])} for r in rows]

    def invite(
        self, who: Principal, email: str, name: str, role: str, *, ip: str = ""
    ) -> tuple[str, str]:
        """Creates a user with a one-time password the admin passes on. Returns (id, password)."""
        who.require("admin")
        if role not in ROLES:
            raise CloudError("invalid", "role must be admin, manager or agent")
        password = new_temporary_password()
        with self._tx() as db:
            self._check_seat(db, who.company)
            user_id = self._new_user(
                db,
                company_id=who.company,
                email=email,
                name=name,
                password=password,
                role=role,
                must_change=True,
            )
            self.audit(
                db, "user.invited", f"{email} as {role}", company_id=who.company, actor=who, ip=ip
            )
        return user_id, password

    @staticmethod
    def _check_seat(db: sqlite3.Connection, company_id: str) -> None:
        """Inside the write transaction, so parallel invites cannot overshoot the limit."""
        seats = db.execute("SELECT seats FROM companies WHERE id = ?", (company_id,)).fetchone()
        used = db.execute(
            "SELECT COUNT(*) FROM users WHERE company_id = ? AND active = 1", (company_id,)
        ).fetchone()[0]
        if seats is None or used >= int(seats[0]):
            limit = seats[0] if seats else 0
            raise CloudError("no_seats", f"all {limit} seats are used; ask for more seats")

    def set_member(
        self, who: Principal, user_id: str, data: dict[str, Any], *, ip: str = ""
    ) -> None:
        who.require("admin")
        rows = self._q(
            "SELECT * FROM users WHERE id = ? AND company_id = ?", (user_id, who.company)
        )
        if not rows:
            raise CloudError("not_found", "user not found")
        if user_id == who.user_id:
            raise CloudError("invalid", "you cannot change your own role or access")
        role = data.get("role", rows[0]["role"])
        active = data.get("active", bool(rows[0]["active"]))
        if role not in ROLES or not isinstance(active, bool):
            raise CloudError("invalid", "bad role or active flag")
        with self._tx() as db:
            if active and not rows[0]["active"]:
                self._check_seat(db, who.company)  # re-enabling takes a seat again
            db.execute(
                "UPDATE users SET role = ?, active = ? WHERE id = ?", (role, int(active), user_id)
            )
            if not active:
                db.execute(
                    "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
                    (now_ms(), user_id),
                )
            self.audit(
                db,
                "user.changed",
                f"{rows[0]['email']}: role={role} active={active}",
                company_id=who.company,
                actor=who,
                ip=ip,
            )

    # --- usage (reported by the apps after each call) --------------------------------------------
    def start_call(self, who: Principal, call_id: str) -> None:
        """The server's own record of when a call began: reported minutes cannot exceed the real
        time since then (security review M4)."""
        call_id = _clean(call_id, "call_id", 64)
        with self._tx() as db:
            db.execute(
                "INSERT OR IGNORE INTO call_starts(id, company_id, user_id, started_at)"
                " VALUES (?,?,?,?)",
                (f"{who.company}:{call_id}", who.company, who.user_id, now_ms()),
            )

    def report_usage(self, who: Principal, data: dict[str, Any], platform: str) -> str:
        def num(key: str, hi: int, *, optional: bool = False) -> int | None:
            v = data.get(key)
            if v is None and optional:
                return None
            if not isinstance(v, int) or isinstance(v, bool) or not 0 <= v <= hi:
                raise CloudError("invalid", f"{key} must be a whole number 0 to {hi}")
            return v

        t = now_ms()
        started = num("started_at", t + DAY_MS) or t
        if started < t - 30 * DAY_MS:
            raise CloudError("invalid", "started_at is too old")
        call_id = _clean(data.get("call_id") or uuid.uuid4(), "call_id", 64)
        source = str(data.get("source") or "computer")
        usage_id = f"{who.company}:{call_id}"  # one company's ids can never shadow another's
        duration = num("duration_s", 6 * 3600) or 0
        began = self._q("SELECT started_at FROM call_starts WHERE id = ?", (usage_id,))
        if began:
            started = int(began[0]["started_at"])
            duration = min(duration, max(0, (t - started) // 1000) + 30)
        row = (
            usage_id,
            who.company,
            who.user_id,
            who.device_id,
            started,
            duration,
            num("cards", 10_000),
            num("playbook_cards", 10_000),
            num("ai_cards", 10_000),
            num("holding_lines", 10_000),
            num("escalations", 10_000),
            num("p50_ms", 600_000, optional=True),
            num("p95_ms", 600_000, optional=True),
            _clean(data.get("stt_vendor"), "stt_vendor", 40, required=False),
            _clean(data.get("llm_vendor"), "llm_vendor", 40, required=False),
            platform if platform in PLATFORMS else "unknown",
            t,
            source if source in CALL_SOURCES else "computer",
        )
        with self._tx() as db:
            db.execute(
                "INSERT OR IGNORE INTO usage(id, company_id, user_id, device_id, started_at,"
                " duration_s, cards, playbook_cards, ai_cards, holding_lines, escalations, p50_ms,"
                " p95_ms, stt_vendor, llm_vendor, platform, reported_at, source)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                row,
            )
        return call_id

    def recording_call(self, who: Principal, call_id: str, *, upload: bool) -> str:
        """The call's own company-scoped id, if this person may upload (the agent who made the
        call) or play (that agent, or the company's admins and managers) its recording."""
        rows = self._q(
            "SELECT user_id FROM usage WHERE id = ? AND company_id = ?",
            (f"{who.company}:{call_id}", who.company),
        )
        if not rows:
            raise CloudError("not_found", "no such call")
        mine = rows[0]["user_id"] == who.user_id
        if not (mine or (not upload and who.role in ("admin", "manager"))):
            raise CloudError("not_found", "no such call")
        return call_id

    def set_review(self, who: Principal, call_id: str, data: dict[str, Any]) -> dict[str, Any]:
        """The after-call review's numbers for Reports (owner, 22 Oct 2026): six skill scores
        0-10, the chance to close 0-100 and the customer's mood. No words from the call."""
        self.recording_call(who, call_id, upload=True)  # the agent's own call, same company
        scores = data.get("scores")
        if not isinstance(scores, dict) or set(scores) != set(REVIEW_DIMENSIONS):
            raise CloudError("invalid", "scores must name the six skills")
        clean: dict[str, Any] = {"scores": {}}
        for k in REVIEW_DIMENSIONS:
            v = scores[k]
            if type(v) is not int or not 0 <= v <= 10:
                raise CloudError("invalid", f"{k} must be 0 to 10")
            clean["scores"][k] = v
        success, mood = data.get("success"), data.get("sentiment")
        if type(success) is not int or not 0 <= success <= 100:
            raise CloudError("invalid", "success must be 0 to 100")
        if mood not in ("positive", "neutral", "negative"):
            raise CloudError("invalid", "sentiment must be positive, neutral or negative")
        clean["success"], clean["sentiment"] = success, mood
        with self._tx() as db:
            db.execute(
                "UPDATE usage SET review_json = ? WHERE id = ? AND company_id = ?",
                (json.dumps(clean), f"{who.company}:{call_id}", who.company),
            )
        return clean

    def set_recording(self, who: Principal, call_id: str, size: int | None) -> None:
        with self._tx() as db:
            db.execute(
                "UPDATE usage SET recording_bytes = ? WHERE id = ? AND company_id = ?",
                (size, f"{who.company}:{call_id}", who.company),
            )

    def company_usage(self, who: Principal, days: int = 30) -> list[dict[str, Any]]:
        """Calls of the last `days` days: the whole company for admins and managers, an agent's
        own calls for an agent (Reports, owner 22 Oct 2026). Numbers only, never call words."""
        who.require("admin", "manager", "agent")
        since = now_ms() - days * DAY_MS
        only = who.user_id if who.role == "agent" else None
        rows = self._q(
            "SELECT u.*, us.email, us.name FROM usage u JOIN users us ON us.id = u.user_id"
            " WHERE u.company_id = ? AND u.started_at >= ? AND (? IS NULL OR u.user_id = ?)"
            " ORDER BY u.started_at DESC LIMIT 2000",
            (who.company, since, only, only),
        )
        out = []
        for r in rows:
            row = dict(r)
            raw = row.pop("review_json", None)
            row["review"] = json.loads(raw) if raw else None
            out.append(row)
        return out

    # --- feature flags (D-028, D-036) ----------------------------------------------------------
    def connections(self, company_id: str) -> frozenset[str]:
        """Connections this organisation has. None exist before 0.4.0 (Zoho) and 0.6.0 (Gallabox,
        approved email senders); their modules add themselves here."""
        return frozenset()

    def feature_layers(self, company_id: str) -> features.Layers:
        killed = {r["feature"] for r in self._q("SELECT feature FROM feature_kill")}
        not_entitled = {
            r["feature"]
            for r in self._q(
                "SELECT feature FROM company_entitlements WHERE company_id = ? AND entitled = 0",
                (company_id,),
            )
        }
        org_off = {
            r["feature"]
            for r in self._q(
                "SELECT feature FROM company_features WHERE company_id = ? AND enabled = 0",
                (company_id,),
            )
        }
        return features.Layers(
            killed=frozenset(killed),
            not_entitled=frozenset(not_entitled),
            org_off=frozenset(org_off),
            connections=self.connections(company_id),
        )

    def feature_state(self, who: Principal, feature: str) -> features.Effective:
        return features.evaluate(feature, who.role, self.feature_layers(who.company))

    def org_feature_on(self, company_id: str, feature: str) -> bool:
        """On for the organisation as a whole, whoever manages it: e.g. the company knowledge
        every agent's calls read, which only admins edit."""
        layers = self.feature_layers(company_id)
        return features.evaluate(feature, None, layers).state == "available"

    def require_feature(self, who: Principal, feature: str) -> None:
        """Every route that serves a capability calls this first (D-036)."""
        state = self.feature_state(who, feature)
        if state.state != "available":
            raise features.FeatureUnavailable(feature, state)

    def features_for(self, who: Principal) -> dict[str, dict[str, Any]]:
        """The person's effective map: what the session config carries."""
        if who.company_id is None:
            return {}
        return features.effective_map(who.role, self.feature_layers(who.company_id))

    def company_features(self, who: Principal) -> list[dict[str, Any]]:
        """Admin → Features: only the features AGN entitled this organisation to, each with the
        org toggle and the state an admin gets (D-028)."""
        who.require("admin")
        layers = self.feature_layers(who.company)
        out = []
        for fid, f in features.CATALOG.items():
            if fid in layers.not_entitled:
                continue
            out.append(
                {
                    "id": fid,
                    "enabled": fid not in layers.org_off,
                    "roles": list(f.roles),
                    "depends": list(f.depends),
                    "requires": list(f.requires),
                    **features.evaluate(fid, "admin", layers).out(),
                }
            )
        return out

    def set_company_feature(
        self, who: Principal, feature: str, enabled: object, *, ip: str = ""
    ) -> None:
        who.require("admin")
        if not isinstance(enabled, bool):
            raise CloudError("invalid", "enabled must be true or false")
        if (
            feature not in features.CATALOG
            or feature in self.feature_layers(who.company).not_entitled
        ):
            raise CloudError("not_found", "unknown feature")
        with self._tx() as db:
            db.execute(
                "INSERT INTO company_features(company_id, feature, enabled, updated_at)"
                " VALUES (?,?,?,?) ON CONFLICT(company_id, feature) DO UPDATE SET"
                " enabled = excluded.enabled, updated_at = excluded.updated_at",
                (who.company, feature, int(enabled), now_ms()),
            )
            self.audit(
                db,
                "features.toggle",
                f"{feature} {'on' if enabled else 'off'}",
                company_id=who.company,
                actor=who,
                ip=ip,
            )

    def owner_features(self) -> dict[str, Any]:
        """The owner's matrix: every organisation by every feature, plus the kill switch."""
        killed = {r["feature"]: r["killed_at"] for r in self._q("SELECT * FROM feature_kill")}
        off: dict[str, list[str]] = {}
        for r in self._q("SELECT company_id, feature FROM company_entitlements WHERE entitled = 0"):
            off.setdefault(str(r["company_id"]), []).append(str(r["feature"]))
        companies = self._q("SELECT id, name FROM companies ORDER BY name COLLATE NOCASE")
        return {
            "features": [
                {"id": fid, "built": f.built, "killed_at": killed.get(fid)}
                for fid, f in features.CATALOG.items()
            ],
            "companies": [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "entitled": {
                        fid: fid not in off.get(str(c["id"]), []) for fid in features.CATALOG
                    },
                }
                for c in companies
            ],
        }

    def owner_set_entitlements(
        self, owner: Principal, company_id: str, changes: dict[str, Any], *, ip: str = ""
    ) -> None:
        self.company_row(company_id)
        if not changes:
            raise CloudError("invalid", "nothing to change")
        for fid, value in changes.items():
            if fid not in features.CATALOG:
                raise CloudError("invalid", f"unknown feature {fid!r}")
            if not isinstance(value, bool):
                raise CloudError("invalid", f"{fid} must be true or false")
        t = now_ms()
        with self._tx() as db:
            for fid, value in changes.items():
                db.execute(
                    "INSERT INTO company_entitlements(company_id, feature, entitled, updated_at)"
                    " VALUES (?,?,?,?) ON CONFLICT(company_id, feature) DO UPDATE SET"
                    " entitled = excluded.entitled, updated_at = excluded.updated_at",
                    (company_id, fid, int(value), t),
                )
            self.audit(
                db,
                "owner.features.entitlement",
                json.dumps(changes, sort_keys=True),
                company_id=company_id,
                actor=owner,
                ip=ip,
            )

    def owner_set_kill(
        self, owner: Principal, feature: str, killed: object, *, ip: str = ""
    ) -> None:
        if feature not in features.CATALOG:
            raise CloudError("not_found", "unknown feature")
        if not isinstance(killed, bool):
            raise CloudError("invalid", "killed must be true or false")
        with self._tx() as db:
            if killed:
                db.execute(
                    "INSERT OR IGNORE INTO feature_kill(feature, killed_at) VALUES (?,?)",
                    (feature, now_ms()),
                )
            else:
                db.execute("DELETE FROM feature_kill WHERE feature = ?", (feature,))
            self.audit(
                db,
                "owner.features.kill",
                f"{feature} {'killed for every organisation' if killed else 'restored'}",
                actor=owner,
                ip=ip,
            )

    # --- owner (platform) ------------------------------------------------------------------------
    def owner_stats(self) -> dict[str, Any]:
        t = now_ms()
        companies = self.owner_companies()
        by_status: dict[str, int] = {}
        for c in companies:
            by_status[c["status"]] = by_status.get(c["status"], 0) + 1
        day0 = t - 30 * DAY_MS
        daily = self._q(
            "SELECT (started_at / 86400000) AS day, COUNT(*) AS calls,"
            " SUM(duration_s) AS seconds, SUM(cards) AS cards FROM usage"
            " WHERE started_at >= ? GROUP BY day ORDER BY day",
            (day0,),
        )
        active_today = self._q(
            "SELECT COUNT(*) AS n FROM users WHERE last_seen_at >= ? AND role != 'owner'",
            (t - DAY_MS,),
        )[0]["n"]
        users = self._q("SELECT COUNT(*) AS n FROM users WHERE role != 'owner'")[0]["n"]
        devices = self._q("SELECT COUNT(*) AS n FROM devices WHERE revoked_at IS NULL")[0]["n"]
        platforms = self._q(
            "SELECT platform, COUNT(*) AS n FROM devices WHERE revoked_at IS NULL"
            " GROUP BY platform ORDER BY n DESC"
        )
        month = self._q(
            "SELECT COUNT(*) AS calls, COALESCE(SUM(duration_s), 0) AS seconds,"
            " COALESCE(SUM(cards), 0) AS cards, COALESCE(SUM(holding_lines), 0) AS holds,"
            " COALESCE(SUM(escalations), 0) AS escalations FROM usage WHERE started_at >= ?",
            (_month_start(t),),
        )[0]
        p95s = [
            int(r["p95_ms"])
            for r in self._q(
                "SELECT p95_ms FROM usage WHERE started_at >= ? AND p95_ms IS NOT NULL", (day0,)
            )
        ]
        p95s.sort()
        return {
            "now": t,
            "companies": len(companies),
            "by_status": by_status,
            "users": users,
            "active_today": active_today,
            "devices": devices,
            "platforms": {r["platform"]: r["n"] for r in platforms},
            "month": {
                "calls": month["calls"],
                "minutes": -(-int(month["seconds"]) // 60),
                "cards": month["cards"],
                "holding_lines": month["holds"],
                "escalations": month["escalations"],
            },
            "p95_ms_30d": p95s[int(len(p95s) * 0.95)] if p95s else None,
            "daily": [
                {
                    "day": int(r["day"]) * DAY_MS,
                    "calls": r["calls"],
                    "minutes": -(-int(r["seconds"] or 0) // 60),
                    "cards": r["cards"] or 0,
                }
                for r in daily
            ],
            "trials_ending": [
                c
                for c in companies
                if c["status"] == "trial" and c["days_left"] is not None and c["days_left"] <= 3
            ],
        }

    def owner_companies(self) -> list[dict[str, Any]]:
        t = now_ms()
        month0 = _month_start(t)
        rows = self._q(
            "SELECT c.*,"
            " (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id AND u.active = 1)"
            "   AS seats_used,"
            " (SELECT COUNT(*) FROM devices d WHERE d.company_id = c.id AND d.revoked_at IS NULL)"
            "   AS devices,"
            " (SELECT MAX(last_seen_at) FROM users u WHERE u.company_id = c.id) AS last_active,"
            " (SELECT COALESCE(SUM(duration_s), 0) FROM usage g WHERE g.company_id = c.id"
            "   AND g.started_at >= ?) AS month_seconds,"
            " (SELECT COUNT(*) FROM usage g WHERE g.company_id = c.id AND g.started_at >= ?)"
            "   AS calls_30d,"
            " (SELECT AVG(p95_ms) FROM usage g WHERE g.company_id = c.id AND g.started_at >= ?)"
            "   AS p95_avg,"
            " (SELECT email FROM users u WHERE u.company_id = c.id AND u.role = 'admin'"
            "   ORDER BY created_at LIMIT 1) AS admin_email"
            " FROM companies c ORDER BY c.created_at DESC",
            (month0, t - 30 * DAY_MS, t - 30 * DAY_MS),
        )
        out = []
        for r in rows:
            used = -(-int(r["month_seconds"]) // 60)
            out.append(
                {
                    "id": r["id"],
                    "name": r["name"],
                    "admin_email": r["admin_email"],
                    "created_at": r["created_at"],
                    "notes": r["notes"],
                    "suspended": bool(r["suspended"]),
                    "seats_used": r["seats_used"],
                    "devices": r["devices"],
                    "last_active": r["last_active"],
                    "calls_30d": r["calls_30d"],
                    "p95_avg_ms": round(r["p95_avg"]) if r["p95_avg"] is not None else None,
                    **plan_state(r, used, t),
                }
            )
        return out

    def owner_company(self, company_id: str) -> dict[str, Any]:
        found = [c for c in self.owner_companies() if c["id"] == company_id]
        if not found:
            raise CloudError("not_found", "company not found")
        users = self._q(
            "SELECT id, email, name, role, active, created_at, last_seen_at FROM users"
            " WHERE company_id = ? ORDER BY created_at",
            (company_id,),
        )
        devices = self._q(
            "SELECT d.*, u.email, u.name FROM devices d JOIN users u ON u.id = d.user_id"
            " WHERE d.company_id = ? ORDER BY d.last_seen DESC",
            (company_id,),
        )
        calls = self._q(
            "SELECT u.started_at, u.duration_s, u.cards, u.holding_lines, u.escalations,"
            " u.p95_ms, u.platform, us.email FROM usage u JOIN users us ON us.id = u.user_id"
            " WHERE u.company_id = ? ORDER BY u.started_at DESC LIMIT 50",
            (company_id,),
        )
        return {
            **found[0],
            "users": [dict(r) | {"active": bool(r["active"])} for r in users],
            "devices": [self._device_out(r) for r in devices],
            "calls": [dict(r) for r in calls],
            "audit": self.owner_audit(company_id, 50),
        }

    def owner_create_company(
        self,
        owner: Principal,
        *,
        name: str,
        admin_email: str,
        admin_name: str,
        plan: str,
        ip: str = "",
    ) -> tuple[str, str]:
        if plan not in PLANS:
            raise CloudError("invalid", "unknown plan")
        password = new_temporary_password()
        t = now_ms()
        preset = PLANS[plan]
        company_id = str(uuid.uuid4())
        with self._tx() as db:
            db.execute(
                "INSERT INTO companies(id, name, plan, trial_ends_at, seats, minutes_month,"
                " created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                (
                    company_id,
                    _clean(name, "company name", 120),
                    plan,
                    t + PLANS["trial"]["days"] * DAY_MS if plan == "trial" else None,
                    preset["seats"],
                    preset["minutes"],
                    t,
                    t,
                ),
            )
            self._new_user(
                db,
                company_id=company_id,
                email=admin_email,
                name=admin_name,
                password=password,
                role="admin",
                must_change=True,
            )
            self.audit(
                db,
                "owner.company.created",
                f"{name} ({plan})",
                company_id=company_id,
                actor=owner,
                ip=ip,
            )
        return company_id, password

    def owner_update_company(
        self, owner: Principal, company_id: str, data: dict[str, Any], *, ip: str = ""
    ) -> None:
        c = self.company_row(company_id)
        fields: dict[str, Any] = {}
        if "name" in data:
            fields["name"] = _clean(data["name"], "company name", 120)
        if "plan" in data:
            if data["plan"] not in PLANS:
                raise CloudError("invalid", "unknown plan")
            fields["plan"] = data["plan"]
            if data["plan"] != c["plan"] and "seats" not in data:
                fields["seats"] = PLANS[data["plan"]]["seats"]
            if data["plan"] != c["plan"] and "minutes_month" not in data:
                fields["minutes_month"] = PLANS[data["plan"]]["minutes"]
        for key, hi in (("seats", 10_000), ("minutes_month", 10_000_000)):
            if key in data:
                v = data[key]
                if not isinstance(v, int) or isinstance(v, bool) or not 1 <= v <= hi:
                    raise CloudError("invalid", f"{key} must be 1 to {hi}")
                fields[key] = v
        if "suspended" in data:
            if not isinstance(data["suspended"], bool):
                raise CloudError("invalid", "suspended must be true or false")
            fields["suspended"] = int(data["suspended"])
        if "extend_days" in data:
            days = data["extend_days"]
            if not isinstance(days, int) or isinstance(days, bool) or not 1 <= days <= 366:
                raise CloudError("invalid", "extend_days must be 1 to 366")
            plan = fields.get("plan", c["plan"])
            col = "trial_ends_at" if plan == "trial" else "paid_until"
            base = max(int(c[col] or 0), now_ms())
            fields[col] = base + days * DAY_MS
        if "notes" in data:
            fields["notes"] = _clean(data["notes"], "notes", 2000, required=False)
        if not fields:
            raise CloudError("invalid", "nothing to change")
        fields["updated_at"] = now_ms()
        sets = ", ".join(f"{k} = ?" for k in fields)
        with self._tx() as db:
            db.execute(f"UPDATE companies SET {sets} WHERE id = ?", (*fields.values(), company_id))  # noqa: S608 — keys are from the fixed list above
            shown = {k: v for k, v in fields.items() if k != "updated_at"}
            self.audit(
                db,
                "owner.company.changed",
                json.dumps(shown),
                company_id=company_id,
                actor=owner,
                ip=ip,
            )

    def owner_reset_password(self, owner: Principal, user_id: str, *, ip: str = "") -> str:
        rows = self._q("SELECT * FROM users WHERE id = ? AND role != 'owner'", (user_id,))
        if not rows:
            raise CloudError("not_found", "user not found")
        password = new_temporary_password()
        with self._tx() as db:
            db.execute(
                "UPDATE users SET pw_hash = ?, must_change_pw = 1 WHERE id = ?",
                (hash_password(password), user_id),
            )
            db.execute(
                "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
                (now_ms(), user_id),
            )
            self.audit(
                db,
                "owner.password.reset",
                rows[0]["email"],
                company_id=rows[0]["company_id"],
                actor=owner,
                ip=ip,
            )
        return password

    def owner_set_user_active(
        self, owner: Principal, user_id: str, active: bool, *, ip: str = ""
    ) -> None:
        rows = self._q("SELECT * FROM users WHERE id = ? AND role != 'owner'", (user_id,))
        if not rows:
            raise CloudError("not_found", "user not found")
        with self._tx() as db:
            db.execute("UPDATE users SET active = ? WHERE id = ?", (int(active), user_id))
            if not active:
                db.execute(
                    "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
                    (now_ms(), user_id),
                )
            self.audit(
                db,
                "owner.user." + ("enabled" if active else "disabled"),
                rows[0]["email"],
                company_id=rows[0]["company_id"],
                actor=owner,
                ip=ip,
            )

    def owner_revoke_device(self, owner: Principal, device_id: str, *, ip: str = "") -> None:
        rows = self._q("SELECT * FROM devices WHERE id = ?", (device_id,))
        if not rows:
            raise CloudError("not_found", "device not found")
        with self._tx() as db:
            self._revoke(db, device_id)
            self.audit(
                db,
                "owner.device.revoked",
                rows[0]["label"],
                company_id=rows[0]["company_id"],
                actor=owner,
                ip=ip,
            )

    def owner_delete_company(self, owner: Principal, company_id: str, *, ip: str = "") -> None:
        c = self.company_row(company_id)
        with self._tx() as db:
            db.execute("DELETE FROM companies WHERE id = ?", (company_id,))
            self.audit(db, "owner.company.deleted", str(c["name"]), actor=owner, ip=ip)

    def company_audit(self, who: Principal, limit: int = 200) -> list[dict[str, Any]]:
        """The company's own activity log for its admins (owner, 22 Oct 2026): who changed
        roles, keys (names only), settings, routes and the playbook, and when."""
        who.require("admin")
        rows = self._q(
            "SELECT a.id, a.at, a.action, a.detail, u.email AS actor, u.name AS actor_name"
            " FROM audit a"
            " LEFT JOIN users u ON u.id = a.actor_id"
            " WHERE a.company_id = ? AND a.action NOT LIKE 'owner.%' ORDER BY a.id DESC LIMIT ?",
            (who.company, limit),
        )
        return [dict(r) for r in rows]

    def owner_audit(self, company_id: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
        if company_id:
            rows = self._q(
                "SELECT a.*, u.email AS actor FROM audit a LEFT JOIN users u ON u.id = a.actor_id"
                " WHERE a.company_id = ? ORDER BY a.id DESC LIMIT ?",
                (company_id, limit),
            )
        else:
            rows = self._q(
                "SELECT a.*, u.email AS actor, c.name AS company FROM audit a"
                " LEFT JOIN users u ON u.id = a.actor_id"
                " LEFT JOIN companies c ON c.id = a.company_id"
                " ORDER BY a.id DESC LIMIT ?",
                (limit,),
            )
        return [dict(r) for r in rows]
