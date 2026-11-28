"""Management data (D-022): one SQLite file. Every company-scoped row carries `company_id`, and
every company-scoped method takes the caller's company id and filters on it, so one company can
never read or change another's rows (tests/cloud/test_isolation.py checks every route).

Times are milliseconds since the epoch (UTC). Provider keys are AES-GCM encrypted (vault.py);
the vault name binds a ciphertext to its company and key slot."""

from __future__ import annotations

import calendar
import dataclasses
import hashlib
import hmac
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
from typing import Any, cast

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
    # Round 3 (D-088): starter is 3 seats, to match the Zoho Billing Starter product (3 agents).
    "starter": {"seats": 3, "minutes": 2_000},
    "growth": {"seats": 10, "minutes": 5_000},
    "scale": {"seats": 100, "minutes": 20_000},
    "team": {"seats": 20, "minutes": 10_000},
    "custom": {"seats": 50, "minutes": 50_000},
}
# Round 3 (D-087/D-090): the Zoho Billing plan codes the CRM sends, and what the client billing
# section shows. Prices are the Zoho Billing prices (AED/month); the hosted payment page URLs
# are TODO placeholders until the owner copies them from Zoho Billing — never guess them.
ZOHO_PLAN_MAP = {
    "SHIELD-STARTER": "starter",
    "SHIELD-GROWTH": "growth",
    "SHIELD-SCALE": "scale",
}
# internal plan -> (display name, monthly price in AED, Zoho code, next plan up). `team`/`custom`
# predate the Zoho ladder and have no Zoho price or upgrade page.
BILLING_PLANS: dict[str, dict[str, Any]] = {
    "trial": {"name": "Trial", "price_aed": 0, "zoho_code": None, "upgrade_to": "starter"},
    "starter": {
        "name": "Starter",
        "price_aed": 990,
        "zoho_code": "SHIELD-STARTER",
        "upgrade_to": "growth",
    },
    "growth": {
        "name": "Growth",
        "price_aed": 2490,
        "zoho_code": "SHIELD-GROWTH",
        "upgrade_to": "scale",
    },
    "scale": {"name": "Scale", "price_aed": 4990, "zoho_code": "SHIELD-SCALE", "upgrade_to": None},
    "team": {"name": "Team", "price_aed": None, "zoho_code": None, "upgrade_to": None},
    "custom": {"name": "Custom", "price_aed": None, "zoho_code": None, "upgrade_to": None},
}
ZOHO_HOSTED_URLS = {
    "SHIELD-STARTER": "https://billing.zohosecure.com/subscribe/395005657ac33fead73baa455ab040b3b9de07abf9a0975fad482bf477cf719e/SHIELD-STARTER",
    "SHIELD-GROWTH": "https://billing.zohosecure.com/subscribe/395005657ac33fead73baa455ab040b3b9de07abf9a0975fad482bf477cf719e/SHIELD-GROWTH",
    "SHIELD-SCALE": "https://billing.zohosecure.com/subscribe/395005657ac33fead73baa455ab040b3b9de07abf9a0975fad482bf477cf719e/SHIELD-SCALE",
}
SETTINGS: dict[str, tuple[type, tuple[object, ...]]] = {
    "ai_answers_allowed": (bool, ()),
    "backup_allowed": (bool, ()),
    "card_language": (str, ("auto", "en", "ar")),
    "audio_retention_days": (int, (0, 7, 30, 90, 365)),
    # Company knowledge the AI reads on every card and review (owner, 22 Oct 2026).
    "context": (str, ()),
    # Where unanswered questions are emailed (R2 step 4); empty = the managers (owner, 22 Oct).
    "manager_email": (str, ()),
}
CONTEXT_MAX_CHARS = 8000
# D-062: the agent-track context is a platform default; older apps may still send it (ignored).
RETIRED_SETTINGS = frozenset({"agent_context"})
# ZC-11c: tone and call goal in the company defaults (the bundle uses them over the seed's).
TEXT_DEFAULTS = {"tone": 300, "call_goal": 300}
# ZC-11: company defaults (data only; the legal text is the owner's, DD-4).
RECORD_CALLS = ("agent_choice", "on", "off")  # A4: the org policy; agent_choice = as before
CONSENT_CHOICES = ("all", "primary_only")
VENDOR_ID = re.compile(r"^[a-z0-9][a-z0-9_.-]{0,39}$")
MAX_VENDORS = 30
# ZC-14 (draft D-057 (backlog)): where each health reason is fixed in the apps.
HEALTH_FIX = {
    "zoho_token_expired": "/settings#zoho",
    "zoho_scopes_outdated": "/settings#zoho",  # T-082 (D-069): reconnect once for the bundle
    "smtp_failing": "/admin/integrations#email",
    "minutes_low": "/account#plan",
    "trial_ending": "/account#plan",
}
MINUTES_LOW_SHARE = 0.8
TRIAL_ENDING_DAYS = 3
RESET_TTL_MS = 30 * 60_000

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
-- Zoho (D-031). The platform OAuth client (owner; one row, no company data) and an optional
-- per-org client that overrides it. Both hold an AES-GCM blob of {client_id, client_secret}.
CREATE TABLE IF NOT EXISTS zoho_platform_client (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ciphertext BLOB NOT NULL,
  dc TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS company_zoho_client (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  ciphertext BLOB NOT NULL,
  dc TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Each person's own Zoho connection: the refresh token, encrypted, and where to use it.
CREATE TABLE IF NOT EXISTS zoho_connections (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ciphertext BLOB NOT NULL,
  accounts_server TEXT NOT NULL,
  api_domain TEXT NOT NULL,
  client_scope TEXT NOT NULL,
  connected_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, user_id)
);
-- Zoho writes the agent approved (D-031): one row per idempotency key, so a retried request
-- returns the first result instead of writing twice.
CREATE TABLE IF NOT EXISTS zoho_writes (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idem_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  zoho_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, user_id, idem_key)
);
-- The structured pre-call brief saved with a call (R10, T-056); company-scoped like usage.
CREATE TABLE IF NOT EXISTS call_briefs (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  call_id TEXT NOT NULL,
  brief_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, call_id)
);
-- One-time OAuth `state` values (hash only), bound to the person and device that asked.
CREATE TABLE IF NOT EXISTS zoho_states (
  state_hash TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT,
  redirect_uri TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  browser_hash TEXT
);
-- ZC-02 (draft D-046 (backlog)): the org's Zoho data centre, set by the first detected
-- connection; a default
-- for the connect page. Each person's own DC is on their connection row.
-- ZC-11 (draft D-044 (backlog) data part): the org's defaults an admin sets once; one row per
-- key, audited.
CREATE TABLE IF NOT EXISTS company_defaults (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (company_id, key)
);
-- UX-39 (draft D-053 (backlog)): emailed password-reset tokens (hash only), single use, 30 minutes.
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE TABLE IF NOT EXISTS zoho_org_dc (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  dc TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Round 3 (D-087): emailed sign-in codes. Hash only, one live code per address+purpose,
-- 10 minutes, at most 5 guesses, single use — the password-reset shape, with digits.
CREATE TABLE IF NOT EXISTS otp_codes (
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at INTEGER,
  PRIMARY KEY (email, purpose)
);
-- Round 3 (D-085): the vendor's GitHub repo + token for issue reporting. One platform-wide row;
-- the token is an AES-GCM blob (vault name "platform:github"), the repo name is plain text.
CREATE TABLE IF NOT EXISTS platform_github (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ciphertext BLOB NOT NULL,
  repo TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Round 3 (D-086): in-app bug reports, reviewed by the vendor before they become GitHub issues.
CREATE TABLE IF NOT EXISTS bug_reports (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  page_url TEXT NOT NULL DEFAULT '',
  screenshot_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  github_issue_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bug_reports_created ON bug_reports(created_at);
-- Round 3 (D-085): screenshot attachments for issue reports. The bytes live beside the DB
-- (no filesystem path to configure); the public URL is an unguessable token, image only.
CREATE TABLE IF NOT EXISTS issue_attachments (
  token TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
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


ZOHO_NOTIFY_SCOPE = "ZohoCRM.notifications.ALL"


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
    # D-029 amendment: the refresh token the current pair replaced, and whether that pair has
    # been used yet; until it is, the old one may renew again (a lost response is not theft).
    ("sessions", "prev_refresh_hash", "TEXT"),
    ("sessions", "pair_used", "INTEGER"),
    ("zoho_connections", "scopes", "TEXT"),  # zoho-actions: scopes granted (NULL = read-only era)
    ("sessions", "legacy_hash", "TEXT"),  # the 0.2.0 token a migrated pair replaced
    ("zoho_states", "dc", "TEXT"),  # ZC-02: the DC the person chose with "Change" (else NULL)
    ("zoho_connections", "dc", "TEXT"),  # ZC-02: the person's detected (or chosen) DC
    ("zoho_connections", "failed_at", "INTEGER"),  # ZC-14: last refresh Zoho refused
    ("companies", "billing_plan_code", "TEXT"),  # Round 3 (D-087): the Zoho Billing plan code
    ("usage", "exclude_p95_alarm", "INTEGER"),  # Round 4 (D-096): slow local model excluded
)
OTP_TTL_MS = 10 * 60_000  # a sign-in code works for 10 minutes
OTP_MAX_ATTEMPTS = 5  # then the code is spent; ask for a new one
OTP_PURPOSES = ("signup", "login")
BUG_STATUSES = ("new", "reviewed", "submitted", "closed")
GITHUB_VAULT = "platform:github"  # the vault name binds the token to this one slot
GITHUB_REPO = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")  # owner/repo, nothing else
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
        self._platform_schema()

    def _platform_schema(self) -> None:
        """T-079 tables (owner platform). On the first start after the upgrade, every company that
        already has its own keys or model routes keeps them working: BYO is switched on for it
        (D-059 BYO, so nothing a company set up stops working; the owner may switch it off)."""
        from sotto_worker.cloud.owner.platform import SCHEMA as PLATFORM_SCHEMA

        self._db.executescript(PLATFORM_SCHEMA)
        done = self._db.execute(
            "SELECT 1 FROM platform_settings WHERE key = 'byo_migrated'"
        ).fetchone()
        if done is None:
            t = now_ms()
            self._db.execute("BEGIN IMMEDIATE")
            self._db.execute(
                "INSERT OR IGNORE INTO company_byo(company_id, enabled_at)"
                " SELECT company_id, ? FROM company_keys UNION"
                " SELECT company_id, ? FROM company_routes",
                (t, t),
            )
            self._db.execute(
                "INSERT INTO platform_settings(key, value, updated_at)"
                " VALUES ('byo_migrated', '1', ?)",
                (t,),
            )
            self._db.execute("COMMIT")

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
        if not row:
            raise CloudError("wrong_password", "current password is wrong")
        if not who.must_change and not verify_password(current, str(row[0]["pw_hash"])):
            # First password: the OTP sign-in is the proof, and the admin created by the
            # CRM has a random password nobody knows (D-087) — so no current password
            # is asked for while must_change is set. Rotating a known password still
            # needs the current one.
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

    def refresh(self, refresh_token: str, *, ip: str = "") -> dict[str, Any] | str:
        """Spends a refresh token for a new pair, or says why not (`signed_out` or
        `device_removed`). The token the current pair replaced may renew again as long as that
        pair was never used: its answer was lost (sleep, Wi-Fi). Any other spent token coming
        back is a copy, so the whole device session is revoked (D-029)."""
        if not refresh_token.startswith(auth.REFRESH_PREFIX) or len(refresh_token) > 200:
            return "signed_out"
        h = _token_hash(refresh_token)
        t = now_ms()
        query = (
            "SELECT s.*, u.active, d.revoked_at AS device_revoked FROM sessions s"
            " JOIN users u ON u.id = s.user_id LEFT JOIN devices d ON d.id = s.device_id"
        )
        with self._tx() as db:
            s = db.execute(f"{query} WHERE s.refresh_hash = ?", (h,)).fetchone()
            again = False
            if s is None:
                s = db.execute(
                    f"{query} WHERE s.prev_refresh_hash = ? AND s.pair_used = 0", (h,)
                ).fetchone()
                again = s is not None
            if s is None:
                return self._spent_refresh(db, h, t, ip)
            if s["device_revoked"]:
                return "device_removed"
            if s["kind"] != "app" or s["revoked_at"] or s["expires_at"] < t or not s["active"]:
                return "signed_out"
            access, new_refresh = auth.new_access(), auth.new_refresh()
            # A repeat answer replaces the unused pair; the token the app holds stays the
            # predecessor until the new pair is used.
            prev = h if again else s["refresh_hash"]
            db.execute(
                "INSERT OR REPLACE INTO spent_refresh(token_hash, company_id, sid, spent_at)"
                " VALUES (?,?,?,?)",
                (s["refresh_hash"], s["company_id"], s["sid"], t),
            )
            db.execute(
                "UPDATE sessions SET token_hash = ?, refresh_hash = ?, prev_refresh_hash = ?,"
                " pair_used = 0, access_until = ?, expires_at = ?, last_seen_at = ?"
                " WHERE token_hash = ?",
                (
                    _token_hash(access),
                    _token_hash(new_refresh),
                    prev,
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

    def _spent_refresh(self, db: sqlite3.Connection, h: str, t: int, ip: str) -> str:
        """A refresh token that is neither current nor a renewable predecessor. If it was spent
        before, someone copied it: the device session is revoked."""
        spent = db.execute(
            "SELECT sid, company_id FROM spent_refresh WHERE token_hash = ?", (h,)
        ).fetchone()
        if spent is None:
            return "signed_out"
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
        return "signed_out"

    def migrate_token(self, token: str) -> dict[str, Any] | str:
        """`/auth/migrate` with a 0.2.0 token: the first call turns its session into a pair; a
        repeat (the answer was lost) gets a fresh pair while the pair is unused (D-029)."""
        who = self.principal(token, kind="app")
        if who is not None:
            return self.migrate(who)
        if not token or len(token) > 200:
            return "signed_out"
        t = now_ms()
        with self._tx() as db:
            s = db.execute(
                "SELECT s.*, u.active, d.revoked_at AS device_revoked FROM sessions s"
                " JOIN users u ON u.id = s.user_id LEFT JOIN devices d ON d.id = s.device_id"
                " WHERE s.legacy_hash = ? AND s.pair_used = 0",
                (_token_hash(token),),
            ).fetchone()
            if s is None:
                return "signed_out"
            if s["device_revoked"]:
                return "device_removed"
            if s["kind"] != "app" or s["revoked_at"] or s["expires_at"] < t or not s["active"]:
                return "signed_out"
            access, refresh = auth.new_access(), auth.new_refresh()
            db.execute(
                "UPDATE sessions SET token_hash = ?, refresh_hash = ?, access_until = ?,"
                " last_seen_at = ? WHERE token_hash = ?",
                (
                    _token_hash(access),
                    _token_hash(refresh),
                    t + auth.ACCESS_TTL_MS,
                    t,
                    s["token_hash"],
                ),
            )
            expires = int(s["expires_at"])
        return {**_pair_out(access, refresh, t), "refresh_expires_at": expires}

    def ended_reason(self, token: str | None) -> str:
        """Why an app token no longer works: `device_removed` when its device was signed out by
        the person or an admin (the app then wipes that device's calls), else `signed_out`."""
        if not token or len(token) > 200:
            return "signed_out"
        rows = self._q(
            "SELECT d.revoked_at FROM sessions s JOIN devices d ON d.id = s.device_id"
            " WHERE s.token_hash = ?",
            (_token_hash(token),),
        )
        return "device_removed" if rows and rows[0]["revoked_at"] else "signed_out"

    def migrate(self, who: Principal) -> dict[str, Any]:
        """Turns a 0.2.0 session (one 30-day token) into a pair in place: same device, no new
        sign-in (D-029). The old token stops working."""
        if who.session is None:
            raise CloudError("signed_out", "sign in again")
        t = now_ms()
        access, refresh = auth.new_access(), auth.new_refresh()
        with self._tx() as db:
            s = db.execute(
                "SELECT sid, kind, expires_at FROM sessions WHERE token_hash = ?", (who.session,)
            ).fetchone()
            if s is None or s["kind"] != "app":
                raise CloudError("signed_out", "sign in again")
            if s["sid"]:
                raise CloudError("invalid", "this session already uses refresh tokens")
            expires = int(s["expires_at"])
            # The old token's end date stays until the first renewal, so migrating never gives a
            # 0.2.0 token more time than it had (security review L4).
            db.execute(
                "UPDATE sessions SET token_hash = ?, sid = ?, refresh_hash = ?, access_until = ?,"
                " last_seen_at = ?, legacy_hash = ?, pair_used = 0 WHERE token_hash = ?",
                (
                    _token_hash(access),
                    auth.new_sid(),
                    _token_hash(refresh),
                    t + auth.ACCESS_TTL_MS,
                    t,
                    who.session,
                    who.session,
                ),
            )
            self.audit(db, "session.migrated", who.email, company_id=who.company_id, actor=who)
        return {**_pair_out(access, refresh, t), "refresh_expires_at": expires}

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
        if s["sid"] and not s["pair_used"]:
            # The pair is in use: its predecessor (or 0.2.0 token) can no longer renew (D-029).
            with self._tx() as db:
                db.execute(
                    "UPDATE sessions SET pair_used = 1, prev_refresh_hash = NULL,"
                    " legacy_hash = NULL WHERE token_hash = ?",
                    (s["token_hash"],),
                )
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
            if key in RETIRED_SETTINGS:
                continue
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
        """The keys a call of this company can use (D-059): AGN's platform keys, and the
        company's own while BYO is on (its own key wins). Times only, never a key."""
        return {env: at for env, (at, _source) in self.key_sources(who).items()}

    def own_key_status(self, who: Principal) -> dict[str, int]:
        rows = self._q(
            "SELECT key_env, updated_at FROM company_keys WHERE company_id = ?", (who.company,)
        )
        return {r["key_env"]: int(r["updated_at"]) for r in rows}

    def key_sources(self, who: Principal) -> dict[str, tuple[int, str]]:
        """{key name: (updated_at, "platform" | "company")}."""
        from sotto_worker.cloud.owner import platform

        out = (
            {}
            if who.company_id is not None and platform.pending_signup(self, who.company)
            else {
                env: (int(s["updated_at"]), "platform")
                for env, s in platform.platform_key_status(self).items()
            }
        )
        if who.company_id is not None and platform.byo_on(self, who.company):
            out.update({env: (at, "company") for env, at in self.own_key_status(who).items()})
        return out

    def effective_key(
        self, who: Principal, key_env: str, *, platform_withheld: bool = False
    ) -> str | None:
        """The key a server-side use (a short-lived STT token) takes for this company.
        `platform_withheld` (ZC-12 spend cap reached) leaves only the company's own BYO key."""
        from sotto_worker.cloud.owner import platform

        if who.company_id is not None and platform.byo_on(self, who.company):
            own = self.stored_key(who, key_env)
            if own:
                return own
        if platform_withheld:
            return None
        if who.company_id is not None and platform.pending_signup(self, who.company):
            return None
        return platform.platform_key(self, key_env)

    def keys_for_call(
        self,
        who: Principal,
        needed: set[str] | None = None,
        *,
        ip: str = "",
        platform_withheld: bool = False,
    ) -> dict[str, str]:
        """Decrypted keys for a signed-in user of this company whose plan allows calls (D-022):
        only the ones in `needed` (the keys the company's current model routes use), never a key
        that has a short-lived token path. Each delivery is in the audit log. `platform_withheld`
        (ZC-12: the company reached its monthly spend cap) drops AGN's platform keys; BYO keys
        are the company's own spend and still go out (D-059)."""
        from sotto_worker.cloud.owner import platform

        out = (
            {}
            if platform_withheld or platform.pending_signup(self, who.company)
            else platform.platform_keys(self, needed)
        )
        if platform.byo_on(self, who.company):  # D-059: the company's own keys only with BYO
            rows = self._q(
                "SELECT key_env, ciphertext FROM company_keys WHERE company_id = ?",
                (who.company,),
            )
            for r in rows:
                if needed is not None and r["key_env"] not in needed:
                    continue
                try:
                    out[r["key_env"]] = self._vault.decrypt(
                        self._vault_name(who.company, r["key_env"]), r["ciphertext"]
                    )
                except VaultError:
                    continue
        if needed is not None and out:
            with self._tx() as db:
                names = ",".join(sorted(out))
                self.audit(db, "keys.delivered", names, company_id=who.company, actor=who, ip=ip)
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
            1 if data.get("exclude_p95_alarm") is True else 0,
        )
        with self._tx() as db:
            db.execute(
                "INSERT OR IGNORE INTO usage(id, company_id, user_id, device_id, started_at,"
                " duration_s, cards, playbook_cards, ai_cards, holding_lines, escalations, p50_ms,"
                " p95_ms, stt_vendor, llm_vendor, platform, reported_at, source, exclude_p95_alarm)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                row,
            )
        return call_id

    def require_own_call(self, who: Principal, call_id: str) -> None:
        """The call was started or reported by this person in this company; anything else is
        "no such call" (404), so a client-sent id cannot write on someone else's call."""
        key = f"{who.company}:{_clean(call_id, 'call_id', 64)}"
        rows = self._q(
            "SELECT 1 FROM call_starts WHERE id = ? AND company_id = ? AND user_id = ?"
            " UNION ALL SELECT 1 FROM usage WHERE id = ? AND company_id = ? AND user_id = ?",
            (key, who.company, who.user_id, key, who.company, who.user_id),
        )
        if not rows:
            raise CloudError("not_found", "no such call")

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
        from sotto_worker.cloud.email.data import has_sender
        from sotto_worker.cloud.gallabox.data import configured as gallabox_configured

        found = set()
        if has_sender(self, company_id):
            found.add("email_sender")
        if gallabox_configured(self, company_id):
            found.add("gallabox")
        return frozenset(found)

    def feature_layers(self, company_id: str) -> features.Layers:
        killed = {r["feature"] for r in self._q("SELECT feature FROM feature_kill")}
        not_entitled = {
            r["feature"]
            for r in self._q(
                "SELECT feature FROM company_entitlements WHERE company_id = ? AND entitled = 0",
                (company_id,),
            )
        }
        chosen = {
            str(r["feature"]): bool(r["enabled"])
            for r in self._q(
                "SELECT feature, enabled FROM company_features WHERE company_id = ?",
                (company_id,),
            )
        }
        # D-070, D-071: a default-off feature stays off until the admin turns it on.
        org_off = {f for f, on in chosen.items() if not on} | {
            f for f in features.DEFAULT_OFF if not chosen.get(f, False)
        }
        # L4 / L6 / D-095: owner-only features stay off_by_platform until enabled by the owner.
        if self._table_exists("obs_company_switches"):
            sw = self._q(
                "SELECT call_logs_enabled FROM obs_company_switches WHERE company_id = ?",
                (company_id,),
            )
            logs_on = bool(sw[0]["call_logs_enabled"]) if sw else False
        else:
            logs_on = False
        if not logs_on:
            not_entitled.add("call_logs_github")
        else:
            org_off.discard("call_logs_github")

        if self._table_exists("local_model_company_policy"):
            pol = self._q(
                "SELECT text_enabled, voice_enabled FROM local_model_company_policy"
                " WHERE company_id = ?",
                (company_id,),
            )
            text_on = bool(pol[0]["text_enabled"]) if pol else False
            voice_on = bool(pol[0]["voice_enabled"]) if pol else False
        else:
            text_on = False
            voice_on = False
        if not text_on:
            not_entitled.add("local_models_text")
        else:
            org_off.discard("local_models_text")
        if not voice_on:
            not_entitled.add("local_models_voice")
        else:
            org_off.discard("local_models_voice")

        if self._table_exists("coach_caps"):
            cap_rows = self._q(
                "SELECT cap_usd, enabled, stages_configured FROM coach_caps WHERE company_id = ?",
                (company_id,),
            )
            cr = cap_rows[0] if cap_rows else None
            vc_on = bool(
                cr
                and cr["stages_configured"]
                and cr["enabled"]
                and cr["cap_usd"] is not None
                and float(cr["cap_usd"]) > 0
            )
        else:
            vc_on = False
        if not vc_on:
            not_entitled.add("voice_coach")
        elif chosen.get("voice_coach") is not False:
            org_off.discard("voice_coach")

        return features.Layers(
            killed=frozenset(killed),
            not_entitled=frozenset(not_entitled),
            org_off=frozenset(org_off),
            connections=self.connections(company_id),
        )

    def _table_exists(self, table: str) -> bool:
        rows = self._q("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,))
        return bool(rows)

    def person_layers(self, who: Principal) -> features.Layers:
        """The org's layers plus the person's connections (Zoho) and D-095 owner overrides."""
        layers = self.feature_layers(who.company)
        user_overrides: dict[str, bool] = {}
        if self._table_exists("obs_user_overrides"):
            rows = self._q(
                "SELECT feature_id, enabled FROM obs_user_overrides"
                " WHERE company_id = ? AND user_id = ?",
                (who.company, who.user_id),
            )
            user_overrides = {
                str(r["feature_id"]): bool(r["enabled"])
                for r in rows
                if str(r["feature_id"]) in features.PER_USER_OVERRIDE_IDS
            }
        connections = layers.connections
        if self.zoho_connected(who):
            mine = {"zoho"}
            # INT-13: the watch needs the Notifications scope on this person's connection
            # (added to the one scope bundle by D-069); until they reconnect, needs_connection.
            if ZOHO_NOTIFY_SCOPE in self.zoho_scopes(who):
                mine.add("zoho_notifications")
            connections = connections | mine
        return dataclasses.replace(layers, connections=connections, user_overrides=user_overrides)

    def feature_state(self, who: Principal, feature: str) -> features.Effective:
        return features.evaluate(feature, who.role, self.person_layers(who))

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
        from sotto_worker.cloud.owner import platform

        out = features.effective_map(who.role, self.person_layers(who))
        # D-059: not a catalog feature (no Admin → Features toggle); AGN's entitlement only.
        byo = platform.byo_state(self, who.company)
        out[platform.BYO] = (
            byo
            if byo.state != "available" or who.role == "admin"
            else features.Effective("no_permission")
        ).out()
        return out

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
        if feature in features.PER_USER_OVERRIDE_IDS:
            raise CloudError("forbidden", "only the platform owner can change this setting")
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
    def _p95_30d(self, since: int, company_id: str | None = None) -> tuple[int | None, int]:
        """Single source of truth for 30-day speed p95 across Overview, Companies, and /stats/speed
        (F-01, F-06). Excludes slow local-model calls flagged exclude_p95_alarm=1."""
        sql = (
            "SELECT p95_ms FROM usage WHERE started_at >= ? AND p95_ms IS NOT NULL"
            " AND COALESCE(exclude_p95_alarm, 0) = 0"
        )
        args: tuple[Any, ...] = (since,)
        if company_id is not None:
            sql += " AND company_id = ?"
            args = (*args, company_id)
        p95s = sorted(int(r["p95_ms"]) for r in self._q(sql, args))
        if not p95s:
            return None, 0
        idx = min(len(p95s) - 1, int(len(p95s) * 0.95))
        return p95s[idx], len(p95s)

    def owner_speed_stats(self, window_days: int = 30) -> dict[str, Any]:
        t = now_ms()
        p95_ms, calls_count = self._p95_30d(t - window_days * DAY_MS)
        return {
            "p95_ms": p95_ms,
            "window_days": window_days,
            "computed_at": t,
            "calls_count": calls_count,
        }

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
        p95_ms_30d, p95_calls_30d = self._p95_30d(day0)
        return {
            "now": t,
            "computed_at": t,
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
            "calls_30d": sum(int(r["calls"]) for r in daily),
            "p95_ms_30d": p95_ms_30d,
            "p95_window_days": 30,
            "p95_calls_30d": p95_calls_30d,
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
        day0 = t - 30 * DAY_MS
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
            (month0, day0, day0),
        )
        out = []
        for r in rows:
            used = -(-int(r["month_seconds"]) // 60)
            p95_30d, _ = self._p95_30d(day0, company_id=str(r["id"]))
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
                    "p95_ms_30d": p95_30d,
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

    def create_company_from_crm(
        self,
        *,
        company: str,
        admin_name: str,
        admin_email: str,
        zoho_plan_code: str,
        trial: bool,
        ip: str = "",
    ) -> tuple[str, str] | None:
        """Round 3 (D-087): a company created by the CRM after a Zoho Billing signup. The first
        admin gets a random password nobody knows (they sign in with the emailed OTP and then
        choose their own). Returns (company_id, admin_id), or None when this address already
        has an account — the CRM answers 200 either way, like the Forms path."""
        email = _clean(admin_email, "admin email", 254).lower()
        if not EMAIL.match(email):
            raise CloudError("invalid", "enter a valid email address")
        code = _clean(zoho_plan_code, "Zoho plan code", 40)
        if code not in ZOHO_PLAN_MAP:
            raise CloudError("invalid", "unknown Zoho plan code")
        plan = "trial" if trial else ZOHO_PLAN_MAP[code]
        preset = PLANS[plan]
        if self._q("SELECT 1 FROM users WHERE email = ?", (email,)):
            return None
        password = new_temporary_password()
        t = now_ms()
        company_id = str(uuid.uuid4())
        with self._tx() as db:
            db.execute(
                "INSERT INTO companies(id, name, plan, trial_ends_at, paid_until, seats,"
                " minutes_month, billing_plan_code, created_at, updated_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    company_id,
                    _clean(company, "company name", 120),
                    plan,
                    t + PLANS["trial"]["days"] * DAY_MS if plan == "trial" else None,
                    None if plan == "trial" else t + 30 * DAY_MS,
                    preset["seats"],
                    preset["minutes"],
                    code,
                    t,
                    t,
                ),
            )
            user_id = self._new_user(
                db,
                company_id=company_id,
                email=email,
                name=admin_name,
                password=password,
                role="admin",
                must_change=True,
            )
            self.audit(
                db,
                "company.crm.created",
                f"{company} ({plan}, {code})",
                company_id=company_id,
                ip=ip,
            )
        return company_id, user_id

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
            # ZC-10: the sign-up's personal data (email, phone, IP) goes with the company.
            db.execute("DELETE FROM signups WHERE company_id = ?", (company_id,))
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

    # --- Zoho (D-031) --------------------------------------------------------------------------
    # Secrets are written here and read only by the server's own Zoho calls; no method that
    # answers an API request returns a client secret, a client ID or a token.
    PLATFORM_ZOHO = "zoho-client:platform"

    def _zoho_client_blob(self, client_id: str, client_secret: str) -> str:
        client_id, client_secret = client_id.strip(), client_secret.strip()
        for value, what in ((client_id, "client ID"), (client_secret, "client secret")):
            if not 8 <= len(value) <= 200 or any(c.isspace() for c in value):
                raise CloudError("invalid", f"that does not look like a Zoho {what}")
        return json.dumps({"client_id": client_id, "client_secret": client_secret})

    @staticmethod
    def _zoho_dc(dc: str) -> str:
        from sotto_worker.cloud.zoho.oauth import ACCOUNTS

        dc = (dc or "us").strip().lower()
        if dc not in ACCOUNTS:
            raise CloudError("invalid", "unknown Zoho data centre")
        return dc

    def set_platform_zoho_client(
        self, owner: Principal, client_id: str, client_secret: str, dc: str, *, ip: str = ""
    ) -> None:
        if not owner.is_owner:
            raise CloudError("forbidden", "only the platform owner can do this")
        blob = self._vault.encrypt(
            self.PLATFORM_ZOHO, self._zoho_client_blob(client_id, client_secret)
        )
        with self._tx() as db:
            db.execute(
                "INSERT INTO zoho_platform_client(id, ciphertext, dc, updated_at) VALUES (1,?,?,?)"
                " ON CONFLICT(id) DO UPDATE SET ciphertext = excluded.ciphertext,"
                " dc = excluded.dc, updated_at = excluded.updated_at",
                (blob, self._zoho_dc(dc), now_ms()),
            )
            self.audit(db, "owner.zoho_client.set", self._zoho_dc(dc), actor=owner, ip=ip)

    def delete_platform_zoho_client(self, owner: Principal, *, ip: str = "") -> None:
        if not owner.is_owner:
            raise CloudError("forbidden", "only the platform owner can do this")
        with self._tx() as db:
            db.execute("DELETE FROM zoho_platform_client")
            self.audit(db, "owner.zoho_client.deleted", "", actor=owner, ip=ip)

    def set_org_zoho_client(
        self, who: Principal, client_id: str, client_secret: str, dc: str, *, ip: str = ""
    ) -> None:
        who.require("admin")
        blob = self._vault.encrypt(
            f"zoho-client:{who.company}", self._zoho_client_blob(client_id, client_secret)
        )
        with self._tx() as db:
            db.execute(
                "INSERT INTO company_zoho_client(company_id, ciphertext, dc, updated_at)"
                " VALUES (?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET"
                " ciphertext = excluded.ciphertext, dc = excluded.dc,"
                " updated_at = excluded.updated_at",
                (who.company, blob, self._zoho_dc(dc), now_ms()),
            )
            self.audit(
                db, "zoho_client.set", self._zoho_dc(dc), company_id=who.company, actor=who, ip=ip
            )

    def owner_set_org_zoho_client(
        self,
        owner: Principal,
        company_id: str,
        client_id: str,
        client_secret: str,
        dc: str,
        *,
        ip: str = "",
    ) -> None:
        """D-064: the per-org client is an owner-console override now."""
        if not owner.is_owner:
            raise CloudError("forbidden", "only the platform owner can do this")
        self.company_row(company_id)
        blob = self._vault.encrypt(
            f"zoho-client:{company_id}", self._zoho_client_blob(client_id, client_secret)
        )
        with self._tx() as db:
            db.execute(
                "INSERT INTO company_zoho_client(company_id, ciphertext, dc, updated_at)"
                " VALUES (?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET"
                " ciphertext = excluded.ciphertext, dc = excluded.dc,"
                " updated_at = excluded.updated_at",
                (company_id, blob, self._zoho_dc(dc), now_ms()),
            )
            self.audit(
                db,
                "owner.zoho_client.override",
                self._zoho_dc(dc),
                company_id=company_id,
                actor=owner,
                ip=ip,
            )

    def owner_delete_org_zoho_client(
        self, owner: Principal, company_id: str, *, ip: str = ""
    ) -> None:
        if not owner.is_owner:
            raise CloudError("forbidden", "only the platform owner can do this")
        with self._tx() as db:
            db.execute("DELETE FROM company_zoho_client WHERE company_id = ?", (company_id,))
            self.audit(
                db,
                "owner.zoho_client.override_removed",
                "",
                company_id=company_id,
                actor=owner,
                ip=ip,
            )

    def delete_org_zoho_client(self, who: Principal, *, ip: str = "") -> None:
        who.require("admin")
        with self._tx() as db:
            db.execute("DELETE FROM company_zoho_client WHERE company_id = ?", (who.company,))
            self.audit(db, "zoho_client.deleted", "", company_id=who.company, actor=who, ip=ip)

    def zoho_client_status(self, company_id: str | None) -> dict[str, Any]:
        """What the screens may know: whether each client exists, its data centre and date."""
        out: dict[str, Any] = {}
        rows = self._q("SELECT dc, updated_at FROM zoho_platform_client") or self._q(
            "SELECT dc, updated_at FROM zoho_dc_clients ORDER BY dc = 'us' DESC, dc LIMIT 1"
        )  # ZC-01: per-DC platform clients count as the platform client too
        out["platform"] = (
            {"configured": True, "dc": rows[0]["dc"], "updated_at": int(rows[0]["updated_at"])}
            if rows
            else {"configured": False}
        )
        if company_id is not None:
            rows = self._q(
                "SELECT dc, updated_at FROM company_zoho_client WHERE company_id = ?",
                (company_id,),
            )
            out["org"] = (
                {"configured": True, "dc": rows[0]["dc"], "updated_at": int(rows[0]["updated_at"])}
                if rows
                else {"configured": False}
            )
            org = self._zoho_org_client(company_id) if rows else None
            if org is not None:  # the last 4 of the client ID only, never the secret (D-064)
                out["org"]["client_id_tail"] = str(org["client_id"])[-4:]
            out["active"] = (
                "org"
                if out["org"]["configured"]
                else "platform"
                if out["platform"]["configured"]
                else None
            )
        return out

    def zoho_client_main(self) -> dict[str, Any] | None:
        """The platform client (server-side), with its home DC and date."""
        rows = self._q("SELECT ciphertext, dc, updated_at FROM zoho_platform_client")
        if not rows:
            return None
        try:
            data = json.loads(self._vault.decrypt(self.PLATFORM_ZOHO, rows[0]["ciphertext"]))
        except VaultError:
            return None
        return {**data, "dc": str(rows[0]["dc"]), "updated_at": int(rows[0]["updated_at"])}

    def zoho_client(self, company_id: str, dc: str | None = None) -> dict[str, Any] | None:
        """The OAuth client this org's people use (ZC-01, D-064): the owner-set override for the
        org, else the platform client of the person's DC family, else the main platform client.
        `by_dc` carries the platform's per-DC credentials, so the code swap at another DC's
        accounts server uses that DC's secret (Zoho multi-DC: same client ID, a secret per DC).
        Server-side use only (`scope` says which, for the connection row)."""
        from sotto_worker.cloud.owner import platform

        org = self._zoho_org_client(company_id)
        if org is not None:
            return {**org, "by_dc": {}}
        per_dc = platform.dc_clients(self)
        main = self.zoho_client_main()
        by_dc = {
            k: {"client_id": v["client_id"], "client_secret": v["client_secret"]}
            for k, v in per_dc.items()
        }
        if dc is not None and dc in per_dc:
            return {**per_dc[dc], "dc": dc, "scope": "platform", "by_dc": by_dc}
        if main is not None:
            return {
                "client_id": main["client_id"],
                "client_secret": main["client_secret"],
                "dc": main["dc"],
                "scope": "platform",
                "by_dc": by_dc,
            }
        if per_dc:  # only per-DC clients: the US one first, else any
            first = "us" if "us" in per_dc else sorted(per_dc)[0]
            return {**per_dc[first], "dc": first, "scope": "platform", "by_dc": by_dc}
        return None

    def _zoho_org_client(self, company_id: str) -> dict[str, str] | None:
        rows = self._q(
            "SELECT ciphertext, dc FROM company_zoho_client WHERE company_id = ?", (company_id,)
        )
        if not rows:
            return None
        try:
            data = json.loads(
                self._vault.decrypt(f"zoho-client:{company_id}", rows[0]["ciphertext"])
            )
        except VaultError:
            return None
        return {**data, "dc": str(rows[0]["dc"]), "scope": "org"}

    def zoho_new_state(
        self, who: Principal, redirect_uri: str, *, ttl_ms: int = 10 * 60_000
    ) -> str:
        state = secrets.token_urlsafe(32)
        t = now_ms()
        with self._tx() as db:
            db.execute("DELETE FROM zoho_states WHERE expires_at < ?", (t - DAY_MS,))
            db.execute(
                "INSERT INTO zoho_states(state_hash, company_id, user_id, device_id,"
                " redirect_uri, expires_at) VALUES (?,?,?,?,?,?)",
                (
                    _token_hash(state),
                    who.company,
                    who.user_id,
                    who.device_id,
                    redirect_uri,
                    t + ttl_ms,
                ),
            )
        return state

    def zoho_peek_state(self, state: str) -> sqlite3.Row | None:
        """A live, unused state (for /auth/zoho/start); does not spend it."""
        if not state or len(state) > 100:
            return None
        rows = self._q(
            "SELECT s.*, u.email FROM zoho_states s JOIN users u ON u.id = s.user_id"
            " WHERE s.state_hash = ? AND s.used_at IS NULL AND s.expires_at >= ?",
            (_token_hash(state), now_ms()),
        )
        return rows[0] if rows else None

    def zoho_bind_browser(self, state: str, browser: str) -> bool:
        """/auth/zoho/start: the first browser that opens the link gets a cookie; only that
        browser may reopen it ("Change"), cancel or complete the flow. A leaked link opened
        later in another browser is refused (security review, T-074)."""
        with self._tx() as db:
            cur = db.execute(
                "UPDATE zoho_states SET browser_hash = ? WHERE state_hash = ? AND used_at IS NULL"
                " AND (browser_hash IS NULL OR browser_hash = ?)",
                (_token_hash(browser), _token_hash(state), _token_hash(browser)),
            )
            return cur.rowcount == 1

    def zoho_spend_state(self, state: str, browser: str) -> sqlite3.Row | None:
        """Spends a state once (the callback), from the browser bound at /start. A replay, an
        unknown or expired state, or another browser: None."""
        if not state or len(state) > 100 or not browser or len(browser) > 100:
            return None
        h, t = _token_hash(state), now_ms()
        with self._tx() as db:
            row = db.execute(
                "SELECT s.*, u.role, u.email FROM zoho_states s JOIN users u ON u.id = s.user_id"
                " WHERE s.state_hash = ? AND s.used_at IS NULL AND s.expires_at >= ?"
                " AND u.active = 1",
                (h, t),
            ).fetchone()
            if row is None or not secrets.compare_digest(
                str(row["browser_hash"] or ""), _token_hash(browser)
            ):
                return None
            db.execute("UPDATE zoho_states SET used_at = ? WHERE state_hash = ?", (t, h))
        return cast(sqlite3.Row, row)

    def zoho_save_connection(
        self,
        company_id: str,
        user_id: str,
        *,
        refresh_token: str,
        accounts_server: str,
        api_domain: str,
        client_scope: str,
        scopes: str = "",
        dc: str | None = None,
        ip: str = "",
    ) -> None:
        blob = self._vault.encrypt(f"zoho-refresh:{company_id}:{user_id}", refresh_token)
        with self._tx() as db:
            db.execute(
                "INSERT INTO zoho_connections(company_id, user_id, ciphertext, accounts_server,"
                " api_domain, client_scope, connected_at, scopes, dc, failed_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,NULL)"
                " ON CONFLICT(company_id, user_id) DO UPDATE SET ciphertext = excluded.ciphertext,"
                " accounts_server = excluded.accounts_server, api_domain = excluded.api_domain,"
                " client_scope = excluded.client_scope, connected_at = excluded.connected_at,"
                " scopes = excluded.scopes, dc = excluded.dc, failed_at = NULL",
                (
                    company_id,
                    user_id,
                    blob,
                    accounts_server,
                    api_domain,
                    client_scope,
                    now_ms(),
                    scopes,
                    dc,
                ),
            )
            if dc:  # the first detected DC becomes the org's default (ZC-02)
                db.execute(
                    "INSERT OR IGNORE INTO zoho_org_dc(company_id, dc, updated_at) VALUES (?,?,?)",
                    (company_id, dc, now_ms()),
                )
            db.execute(
                "INSERT INTO audit(at, company_id, actor_id, action, detail, ip)"
                " VALUES (?,?,?,?,?,?)",
                (now_ms(), company_id, user_id, "zoho.connected", api_domain, ip),
            )

    def zoho_choose_dc(self, state: str, dc: str | None) -> None:
        """/auth/zoho/start?dc=…: the person's manual DC choice for this flow (None = detect)."""
        with self._tx() as db:
            db.execute(
                "UPDATE zoho_states SET dc = ? WHERE state_hash = ? AND used_at IS NULL",
                (dc, _token_hash(state)),
            )

    def zoho_known_dc(self, company_id: str, user_id: str) -> str | None:
        """The DC this person connected from before, else the org's default (ZC-02)."""
        rows = self._q(
            "SELECT dc FROM zoho_connections"
            " WHERE company_id = ? AND user_id = ? AND dc IS NOT NULL",
            (company_id, user_id),
        ) or self._q("SELECT dc FROM zoho_org_dc WHERE company_id = ?", (company_id,))
        return str(rows[0]["dc"]) if rows else None

    def zoho_mark_refresh(self, who: Principal, *, ok: bool) -> None:
        """ZC-14: remember that Zoho refused this person's refresh token (cleared on success)."""
        with self._tx() as db:
            db.execute(
                "UPDATE zoho_connections SET failed_at = ? WHERE company_id = ? AND user_id = ?",
                (None if ok else now_ms(), who.company, who.user_id),
            )

    def zoho_connected(self, who: Principal) -> bool:
        if who.company_id is None:
            return False
        return bool(
            self._q(
                "SELECT 1 FROM zoho_connections WHERE company_id = ? AND user_id = ?",
                (who.company_id, who.user_id),
            )
        )

    def zoho_scopes(self, who: Principal) -> set[str]:
        """The scopes this person's Zoho connection was granted (no token is decrypted)."""
        rows = self._q(
            "SELECT scopes FROM zoho_connections WHERE company_id = ? AND user_id = ?",
            (who.company, who.user_id),
        )
        return set(str(rows[0]["scopes"] or "").split(",")) if rows else set()

    def zoho_connection(self, who: Principal) -> dict[str, Any] | None:
        """This person's connection with the refresh token decrypted (server-side use only)."""
        rows = self._q(
            "SELECT * FROM zoho_connections WHERE company_id = ? AND user_id = ?",
            (who.company, who.user_id),
        )
        if not rows:
            return None
        r = rows[0]
        try:
            token = self._vault.decrypt(
                f"zoho-refresh:{r['company_id']}:{r['user_id']}", r["ciphertext"]
            )
        except VaultError:
            return None
        return {
            "refresh_token": token,
            "accounts_server": str(r["accounts_server"]),
            "api_domain": str(r["api_domain"]),
            "client_scope": str(r["client_scope"]),
            "connected_at": int(r["connected_at"]),
            "scopes": str(r["scopes"] or ""),
        }

    def zoho_connection_status(self, who: Principal) -> dict[str, Any]:
        rows = self._q(
            "SELECT api_domain, connected_at, scopes, dc, failed_at FROM zoho_connections"
            " WHERE company_id = ? AND user_id = ?",
            (who.company, who.user_id),
        )
        if not rows:
            return {"connected": False}
        from sotto_worker.cloud.zoho.oauth import missing_scopes

        return {
            "connected": True,
            "api_domain": str(rows[0]["api_domain"]),
            "connected_at": int(rows[0]["connected_at"]),
            # Connected before writes existed: reads work, saving to Zoho needs a reconnect.
            "needs_reconnect": bool(missing_scopes(rows[0]["scopes"]))
            or rows[0]["failed_at"] is not None,
            "dc": rows[0]["dc"],
        }

    def zoho_delete_connection(self, who: Principal, *, ip: str = "") -> None:
        with self._tx() as db:
            db.execute(
                "DELETE FROM zoho_connections WHERE company_id = ? AND user_id = ?",
                (who.company, who.user_id),
            )
            self.audit(db, "zoho.disconnected", "", company_id=who.company, actor=who, ip=ip)

    def zoho_audit(self, who: Principal, action: str, detail: str, *, ip: str = "") -> None:
        with self._tx() as db:
            self.audit(db, action, detail, company_id=who.company, actor=who, ip=ip)

    def zoho_write_begin(self, who: Principal, idem_key: str, kind: str) -> dict[str, Any] | None:
        """Claims an idempotency key. Returns the earlier result when this key already wrote
        (a retry), raises when the same key is still in flight, None when the caller may write."""
        if not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", idem_key or ""):
            raise CloudError("invalid", "send an idempotency key")
        with self._tx() as db:
            row = db.execute(
                "SELECT kind, status, zoho_id FROM zoho_writes"
                " WHERE company_id = ? AND user_id = ? AND idem_key = ?",
                (who.company, who.user_id, idem_key),
            ).fetchone()
            if row is not None:
                if row["kind"] != kind:
                    raise CloudError("invalid", "that key was used for another action")
                if row["status"] == "done":
                    return {"id": row["zoho_id"], "repeat": True}
                if row["status"] == "unknown":
                    raise CloudError(
                        "zoho_unknown", "Zoho did not confirm; check Zoho before trying again"
                    )
                raise CloudError("in_flight", "this action is still being saved")
            db.execute(
                "INSERT INTO zoho_writes(company_id, user_id, idem_key, kind, status, created_at)"
                " VALUES (?,?,?,?, 'pending', ?)",
                (who.company, who.user_id, idem_key, kind, now_ms()),
            )
        return None

    def zoho_write_done(
        self, who: Principal, idem_key: str, kind: str, zoho_id: str, detail: str, *, ip: str = ""
    ) -> None:
        with self._tx() as db:
            db.execute(
                "UPDATE zoho_writes SET status = 'done', zoho_id = ?"
                " WHERE company_id = ? AND user_id = ? AND idem_key = ?",
                (zoho_id, who.company, who.user_id, idem_key),
            )
            self.audit(db, f"zoho.write.{kind}", detail, company_id=who.company, actor=who, ip=ip)

    def zoho_write_failed(self, who: Principal, idem_key: str, kind: str, why: str) -> None:
        """Nothing was written: free the key so the agent can try again (and log the try)."""
        with self._tx() as db:
            db.execute(
                "DELETE FROM zoho_writes WHERE company_id = ? AND user_id = ? AND idem_key = ?"
                " AND status = 'pending'",
                (who.company, who.user_id, idem_key),
            )
            self.audit(db, f"zoho.write.{kind}.failed", why[:60], company_id=who.company, actor=who)

    def zoho_write_unknown(self, who: Principal, idem_key: str, kind: str, why: str) -> None:
        """Zoho may have written it (timeout, 5xx): keep the key so a retry never doubles."""
        with self._tx() as db:
            db.execute(
                "UPDATE zoho_writes SET status = 'unknown'"
                " WHERE company_id = ? AND user_id = ? AND idem_key = ? AND status = 'pending'",
                (who.company, who.user_id, idem_key),
            )
            self.audit(
                db, f"zoho.write.{kind}.unknown", why[:60], company_id=who.company, actor=who
            )

    def save_call_brief(self, who: Principal, call_id: str, brief: dict[str, Any]) -> None:
        call_id = _clean(call_id, "call_id", 64)
        raw = json.dumps(brief, ensure_ascii=False)
        if len(raw) > 8000:
            raise CloudError("too_large", "the brief is too long")
        with self._tx() as db:
            owner = db.execute(
                "SELECT user_id FROM call_briefs WHERE company_id = ? AND call_id = ?",
                (who.company, call_id),
            ).fetchone()
            if owner is not None and owner["user_id"] != who.user_id:
                raise CloudError("taken", "that call belongs to someone else")
            db.execute(
                "INSERT INTO call_briefs(company_id, user_id, call_id, brief_json, updated_at)"
                " VALUES (?,?,?,?,?) ON CONFLICT(company_id, call_id) DO UPDATE SET"
                " brief_json = excluded.brief_json, updated_at = excluded.updated_at",
                (who.company, who.user_id, call_id, raw, now_ms()),
            )

    def call_brief(self, who: Principal, call_id: str) -> dict[str, Any] | None:
        """The caller's own brief; admins and managers see their company's."""
        sql = "SELECT brief_json FROM call_briefs WHERE company_id = ? AND call_id = ?"
        args: tuple[Any, ...] = (who.company, call_id)
        if who.role == "agent":
            sql += " AND user_id = ?"
            args = (*args, who.user_id)
        rows = self._q(sql, args)
        return cast(dict[str, Any], json.loads(rows[0]["brief_json"])) if rows else None

    # --- ZC-11: company defaults -----------------------------------------------------------------
    def _defaults_raw(self, company_id: str) -> dict[str, Any]:
        rows = self._q(
            "SELECT key, value_json FROM company_defaults WHERE company_id = ?", (company_id,)
        )
        return {r["key"]: json.loads(r["value_json"]) for r in rows}

    def text_defaults(self, company_id: str) -> dict[str, str]:
        """The tone and call goal an admin set (ZC-11c); the bundle uses them over the seed's."""
        raw = self._defaults_raw(company_id)
        return {k: raw[k] for k in TEXT_DEFAULTS if isinstance(raw.get(k), str) and raw[k]}

    def manager_of(self, company_id: str) -> dict[str, Any]:
        """B9: the address an admin set, else the active managers, else the active admins."""
        chosen = str(self.settings(company_id).get("manager_email") or "").strip()
        if chosen:
            return {"emails": [chosen], "source": "setting"}
        for role, source in (("manager", "managers"), ("admin", "admins")):
            rows = self._q(
                "SELECT email FROM users WHERE company_id = ? AND role = ? AND active = 1"
                " ORDER BY created_at",
                (company_id, role),
            )
            if rows:
                return {"emails": [str(r["email"]) for r in rows], "source": source}
        return {"emails": [], "source": "none"}

    def company_defaults(self, who: Principal) -> dict[str, Any]:
        """Admins see all; everyone else only the org's recording policy (A4)."""
        raw = self._defaults_raw(who.company)
        record = raw.get("record_calls", "agent_choice")
        if who.role != "admin":
            return {"record_calls": record}
        out = {
            "record_calls": record,
            "consent": raw.get("consent"),
            "vendor_allow_list": raw.get("vendor_allow_list", []),
            "manager": self.manager_of(who.company),
        }
        out.update(self.text_defaults(who.company))
        return out

    def set_company_defaults(
        self, who: Principal, changes: dict[str, Any], *, ip: str = ""
    ) -> dict[str, Any]:
        who.require("admin")
        clean: dict[str, tuple[Any, str]] = {}  # key → (value, audit detail)
        for key, value in changes.items():
            if key == "record_calls":
                if value not in RECORD_CALLS:
                    raise CloudError("invalid", "record_calls must be agent_choice, on or off")
                clean[key] = (value, str(value))
            elif key == "consent":
                if not isinstance(value, dict) or set(value) - {"choice", "text_version"}:
                    raise CloudError("invalid", "send consent as {choice, text_version}")
                choice, version = value.get("choice"), value.get("text_version")
                if choice not in CONSENT_CHOICES:
                    raise CloudError("invalid", "consent choice must be all or primary_only")
                if not isinstance(version, str) or not re.fullmatch(r"[\w.-]{1,40}", version):
                    raise CloudError("invalid", "text_version is required")
                record = {
                    "choice": choice,
                    "accepted_by": who.user_id,
                    "accepted_at": now_ms(),
                    "text_version": version,
                }
                clean[key] = (record, f"{choice} v{version}")
            elif key == "vendor_allow_list":
                if not isinstance(value, list) or len(value) > MAX_VENDORS:
                    raise CloudError("invalid", f"send up to {MAX_VENDORS} vendor ids")
                if not all(isinstance(v, str) and VENDOR_ID.match(v) for v in value):
                    raise CloudError("invalid", "vendor ids are short lowercase names")
                vendors = sorted(set(value))
                clean[key] = (vendors, ",".join(vendors) or "(all approved)")
            elif key in TEXT_DEFAULTS:
                if not isinstance(value, str) or len(value.strip()) > TEXT_DEFAULTS[key]:
                    raise CloudError("invalid", f"{key} is text up to {TEXT_DEFAULTS[key]} chars")
                clean[key] = (value.strip(), value.strip()[:60])
            else:
                raise CloudError("invalid", f"unknown default {key!r}")
        t = now_ms()
        with self._tx() as db:
            for key, (value, detail) in clean.items():
                db.execute(
                    "INSERT INTO company_defaults(company_id, key, value_json, updated_at,"
                    " updated_by) VALUES (?,?,?,?,?) ON CONFLICT(company_id, key) DO UPDATE SET"
                    " value_json = excluded.value_json, updated_at = excluded.updated_at,"
                    " updated_by = excluded.updated_by",
                    (who.company, key, json.dumps(value), t, who.user_id),
                )
                self.audit(db, f"defaults.{key}", detail, company_id=who.company, actor=who, ip=ip)
        return self.company_defaults(who)

    # --- ZC-14: config health --------------------------------------------------------------------
    def config_health(self, who: Principal) -> dict[str, Any]:
        """One status per org (draft D-057 (backlog)), shipped with the feature map. Reasons are
        machine codes
        with the app route that fixes them; nothing secret. A Zoho token counts for the person
        asking (admins: anyone in the org), since each person connects their own."""
        company = who.company
        t = now_ms()
        reasons: list[str] = []
        sql = "SELECT 1 FROM zoho_connections WHERE company_id = ? AND failed_at IS NOT NULL"
        args: tuple[Any, ...] = (company,)
        if who.role != "admin":
            sql += " AND user_id = ?"
            args = (*args, who.user_id)
        if self._q(sql + " LIMIT 1", args):
            reasons.append("zoho_token_expired")
        # T-082 (D-069): a connection made before the scope bundle needs one reconnect.
        from sotto_worker.cloud.zoho.oauth import scopes_outdated

        scope_sql = "SELECT scopes FROM zoho_connections WHERE company_id = ?"
        if who.role != "admin":
            scope_sql += " AND user_id = ?"
        if any(scopes_outdated(r["scopes"]) for r in self._q(scope_sql, args)):
            reasons.append("zoho_scopes_outdated")
        try:
            last = self._q(
                "SELECT status FROM email_sends WHERE company_id = ? AND status IN"
                " ('sent', 'failed') AND at > ? ORDER BY at DESC LIMIT 1",
                (company, t - DAY_MS),
            )
        except sqlite3.OperationalError:  # the email module never ran on this server
            last = []
        if last and last[0]["status"] == "failed":
            reasons.append("smtp_failing")
        plan = plan_state(self.company_row(company), self.minutes_used(company, t), t)
        if plan["minutes_month"] and plan["minutes_used"] >= (
            plan["minutes_month"] * MINUTES_LOW_SHARE
        ):
            reasons.append("minutes_low")
        if plan["status"] == "trial" and (plan["days_left"] or 0) <= TRIAL_ENDING_DAYS:
            reasons.append("trial_ending")
        return {
            "status": "needs_attention" if reasons else "ok",
            "reasons": [{"code": r, "fix": HEALTH_FIX[r]} for r in reasons],
        }

    # --- UX-39: password reset -------------------------------------------------------------------
    def reset_request(self, email: str, *, ip: str = "") -> tuple[str, sqlite3.Row] | None:
        """A single-use token for an active app user, or None (unknown, owner, inactive): the
        route answers the same either way. Earlier unused tokens of that person stop working."""
        rows = self._q(
            "SELECT * FROM users WHERE email = ? AND active = 1 AND role != 'owner'",
            (email.strip().lower(),),
        )
        if not rows:
            return None
        user = rows[0]
        token = secrets.token_urlsafe(32)
        t = now_ms()
        with self._tx() as db:
            db.execute("DELETE FROM password_resets WHERE expires_at < ?", (t - DAY_MS,))
            db.execute(
                "UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
                (t, user["id"]),
            )
            db.execute(
                "INSERT INTO password_resets(token_hash, company_id, user_id, created_at,"
                " expires_at) VALUES (?,?,?,?,?)",
                (_token_hash(token), user["company_id"], user["id"], t, t + RESET_TTL_MS),
            )
            db.execute(
                "INSERT INTO audit(at, company_id, actor_id, action, detail, ip)"
                " VALUES (?,?,?,?,?,?)",
                (t, user["company_id"], user["id"], "user.reset.requested", "", ip),
            )
        return token, user

    def reset_confirm(self, token: str, new: str, *, ip: str = "") -> None:
        """Spends the token, sets the password and ends every session (and so every refresh
        token) of that person (D-029): whoever had the old password is signed out."""
        if not token or len(token) > 100:
            raise CloudError("reset_invalid", "this reset link is not valid; ask for a new one")
        problem = password_problem(new)
        if problem:
            raise CloudError("weak_password", problem)
        h, t = _token_hash(token), now_ms()
        with self._tx() as db:
            row = db.execute(
                "SELECT r.*, u.email FROM password_resets r JOIN users u ON u.id = r.user_id"
                " WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at >= ?"
                " AND u.active = 1",
                (h, t),
            ).fetchone()
            if row is None:
                raise CloudError("reset_invalid", "this reset link is not valid; ask for a new one")
            db.execute("UPDATE password_resets SET used_at = ? WHERE token_hash = ?", (t, h))
            db.execute(
                "UPDATE users SET pw_hash = ?, must_change_pw = 0 WHERE id = ?",
                (hash_password(new), row["user_id"]),
            )
            db.execute(
                "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
                (t, row["user_id"]),
            )
            db.execute(
                "INSERT INTO audit(at, company_id, actor_id, action, detail, ip)"
                " VALUES (?,?,?,?,?,?)",
                (t, row["company_id"], row["user_id"], "user.reset.done", str(row["email"]), ip),
            )

    # --- Round 3: one-time sign-in codes (D-087) -------------------------------------------------
    def request_otp(self, email: str, purpose: str, *, ip: str = "") -> str | None:
        """Mints a 6-digit code for an active app user, or None (unknown, owner, inactive).
        The code itself is returned so the caller can email it; only its hash is stored.
        An earlier unused code for the same address and purpose stops working."""
        if purpose not in OTP_PURPOSES:
            raise CloudError("invalid", "unknown OTP purpose")
        rows = self._q(
            "SELECT * FROM users WHERE email = ? AND active = 1 AND role != 'owner'",
            (email.strip().lower(),),
        )
        if not rows:
            return None
        user = rows[0]
        code = f"{secrets.randbelow(900_000) + 100_000:06d}"
        t = now_ms()
        with self._tx() as db:
            db.execute(
                "INSERT OR REPLACE INTO otp_codes(email, purpose, code_hash, created_at,"
                " expires_at, attempts, used_at) VALUES (?,?,?,?,?,0,NULL)",
                (email.strip().lower(), purpose, _token_hash(code), t, t + OTP_TTL_MS),
            )
            db.execute(
                "INSERT INTO audit(at, company_id, actor_id, action, detail, ip)"
                " VALUES (?,?,?,?,?,?)",
                (t, user["company_id"], user["id"], f"user.otp.{purpose}.requested", "", ip),
            )
        return code

    def verify_otp(self, email: str, code: str, purpose: str, *, ip: str = "") -> sqlite3.Row:
        """Spends a code and returns the user, or raises otp_invalid / otp_expired. Guessing
        costs: after OTP_MAX_ATTEMPTS wrong tries the code is spent."""
        if purpose not in OTP_PURPOSES:
            raise CloudError("invalid", "unknown OTP purpose")
        email = email.strip().lower()
        if not code or len(code) > 10:
            raise CloudError("otp_invalid", "that code is not valid; ask for a new one")
        t = now_ms()
        # The bookkeeping UPDATEs (spend the code, count the guess) must COMMIT even
        # when the call fails: _tx rolls back on any exception, so a raise inside the
        # block would undo the UPDATE that just ran. Capture the outcome and raise
        # after the block, once the transaction has committed.
        error: CloudError | None = None
        user_id = ""
        with self._tx() as db:
            row = db.execute(
                "SELECT o.*, u.* FROM otp_codes o JOIN users u ON u.email = o.email"
                " WHERE o.email = ? AND o.purpose = ? AND o.used_at IS NULL",
                (email, purpose),
            ).fetchone()
            if row is None:
                error = CloudError("otp_invalid", "that code is not valid; ask for a new one")
            elif int(row["expires_at"]) < t:
                db.execute(
                    "UPDATE otp_codes SET used_at = ? WHERE email = ? AND purpose = ?",
                    (t, email, purpose),
                )
                error = CloudError("otp_expired", "that code expired; ask for a new one")
            elif int(row["attempts"]) >= OTP_MAX_ATTEMPTS:
                db.execute(
                    "UPDATE otp_codes SET used_at = ? WHERE email = ? AND purpose = ?",
                    (t, email, purpose),
                )
                error = CloudError("otp_invalid", "too many tries; ask for a new one")
            elif not hmac.compare_digest(_token_hash(code), str(row["code_hash"])):
                db.execute(
                    "UPDATE otp_codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ?",
                    (email, purpose),
                )
                error = CloudError("otp_invalid", "that code is not valid; ask for a new one")
            else:
                db.execute(
                    "UPDATE otp_codes SET used_at = ? WHERE email = ? AND purpose = ?",
                    (t, email, purpose),
                )
                db.execute(
                    "INSERT INTO audit(at, company_id, actor_id, action, detail, ip)"
                    " VALUES (?,?,?,?,?,?)",
                    (t, row["company_id"], row["id"], f"user.otp.{purpose}.verified", "", ip),
                )
                user_id = str(row["id"])
        if error is not None:
            raise error
        # Read after the commit: _q takes the store lock, which _tx already holds inside.
        user = self._q("SELECT * FROM users WHERE id = ?", (user_id,))[0]
        if not user["active"]:
            raise CloudError("otp_invalid", "that code is not valid; ask for a new one")
        return user

    # --- Round 3: the CRM's shared secret (D-087) ------------------------------------------------
    # The Forms webhook's secret lives in owner/platform.py; the CRM gets its own second secret
    # in the same table, checked with the same HMAC pattern. The owner rotates it from the
    # console; only the hash is kept.
    CRM_SECRET_KEY = "crm_signup_secret_sha256"  # noqa: S105 - a settings key name, not a secret

    def rotate_crm_secret(self, owner: Principal, *, ip: str = "") -> str:
        """A new CRM secret, shown once; only its hash is kept."""
        owner.require("owner")
        secret = secrets.token_urlsafe(32)
        with self._tx() as db:
            db.execute(
                "INSERT OR REPLACE INTO platform_settings(key, value, updated_at) VALUES (?,?,?)",
                (self.CRM_SECRET_KEY, hashlib.sha256(secret.encode()).hexdigest(), now_ms()),
            )
            self.audit(db, "owner.crm_secret.rotated", "", actor=owner, ip=ip)
        return secret

    def crm_secret_ok(self, given: str | None) -> bool:
        rows = self._q("SELECT value FROM platform_settings WHERE key = ?", (self.CRM_SECRET_KEY,))
        if not rows or not given or len(given) > 200:
            return False
        return hmac.compare_digest(
            hashlib.sha256(given.encode()).hexdigest(), str(rows[0]["value"])
        )

    # --- Round 3: GitHub issue reporting (D-085) -------------------------------------------------
    def github_status(self) -> dict[str, Any]:
        """What the console may know: the repo and when the token was saved. Never the token."""
        rows = self._q("SELECT repo, updated_at FROM platform_github WHERE id = 1")
        if not rows:
            return {"configured": False, "repo": None, "updated_at": None}
        return {
            "configured": True,
            "repo": str(rows[0]["repo"]),
            "updated_at": int(rows[0]["updated_at"]),
        }

    def github_save(
        self, owner: Principal, *, repo: str, token: str, ip: str = ""
    ) -> dict[str, Any]:
        """Saves the vendor's repo + token. An empty token keeps the saved one (it is never
        shown, so never retyped) — the repo alone may change."""
        owner.require("owner")
        repo = _clean(repo, "repo", 200)
        if not GITHUB_REPO.match(repo):
            raise CloudError("invalid", "repo must look like owner/repo")
        old = self._q("SELECT ciphertext FROM platform_github WHERE id = 1")
        if token:
            if len(token) > 500 or "\n" in token:
                raise CloudError("invalid", "that does not look like a token")
            blob = self._vault.encrypt(GITHUB_VAULT, token)
        elif old:
            blob = bytes(old[0]["ciphertext"])
        else:
            raise CloudError("invalid", "a token is required")
        with self._tx() as db:
            db.execute(
                "INSERT OR REPLACE INTO platform_github(id, ciphertext, repo, updated_at)"
                " VALUES (1,?,?,?)",
                (blob, repo, now_ms()),
            )
            self.audit(db, "owner.github.saved", repo, actor=owner, ip=ip)
        return self.github_status()

    def github_delete(self, owner: Principal, *, ip: str = "") -> None:
        owner.require("owner")
        with self._tx() as db:
            db.execute("DELETE FROM platform_github WHERE id = 1")
            self.audit(db, "owner.github.removed", "", actor=owner, ip=ip)

    def github_token(self) -> tuple[str, str] | None:
        """Server-side only: (repo, token), or None when nothing is saved or the vault refuses."""
        rows = self._q("SELECT ciphertext, repo FROM platform_github WHERE id = 1")
        if not rows:
            return None
        try:
            token = self._vault.decrypt(GITHUB_VAULT, bytes(rows[0]["ciphertext"]))
        except VaultError:
            return None
        return str(rows[0]["repo"]), token

    # --- Round 3: screenshot attachments (D-085) -------------------------------------------------
    def save_issue_attachment(self, token: str, content_type: str, data: bytes) -> None:
        with self._tx() as db:
            db.execute(
                "INSERT INTO issue_attachments(token, content_type, data, created_at)"
                " VALUES (?,?,?,?)",
                (token, content_type, data, now_ms()),
            )

    def issue_attachment(self, token: str) -> tuple[str, bytes] | None:
        rows = self._q("SELECT content_type, data FROM issue_attachments WHERE token = ?", (token,))
        if not rows:
            return None
        return str(rows[0]["content_type"]), bytes(rows[0]["data"])

    # --- Round 3: bug reports (D-086) ------------------------------------------------------------
    def create_bug_report(
        self,
        who: Principal,
        *,
        title: str,
        description: str,
        page_url: str = "",
        screenshot_url: str = "",
        ip: str = "",
    ) -> str:
        title = _clean(title, "title", 200)
        description = _clean(description, "description", 4000)
        page_url = _clean(page_url, "page address", 1000, required=False)
        screenshot_url = _clean(screenshot_url, "screenshot", 1000, required=False)
        if screenshot_url and not screenshot_url.startswith("/api/v1/issue-attachments/"):
            raise CloudError("invalid", "screenshot must be an uploaded attachment link")
        report_id = str(uuid.uuid4())
        t = now_ms()
        with self._tx() as db:
            db.execute(
                "INSERT INTO bug_reports(id, company_id, user_id, title, description, page_url,"
                " screenshot_url, status, created_at, updated_at)"
                " VALUES (?,?,?,?,?,?,?, 'new',?,?)",
                (
                    report_id,
                    who.company,
                    who.user_id,
                    title,
                    description,
                    page_url,
                    screenshot_url,
                    t,
                    t,
                ),
            )
            self.audit(db, "bug.reported", title, company_id=who.company, actor=who, ip=ip)
        return report_id

    def bug_reports(self, status: str | None = None) -> list[dict[str, Any]]:
        """Every company's reports, newest first, with who reported them. Owner only."""
        sql = (
            "SELECT b.*, c.name AS company_name, u.email AS user_email FROM bug_reports b"
            " JOIN companies c ON c.id = b.company_id JOIN users u ON u.id = b.user_id"
        )
        args: tuple[Any, ...] = ()
        if status is not None:
            if status not in BUG_STATUSES:
                raise CloudError("invalid", "unknown bug status")
            sql += " WHERE b.status = ?"
            args = (status,)
        sql += " ORDER BY b.created_at DESC"
        return [dict(r) for r in self._q(sql, args)]

    def bug_report(self, report_id: str) -> dict[str, Any]:
        rows = self._q(
            "SELECT b.*, c.name AS company_name, u.email AS user_email FROM bug_reports b"
            " JOIN companies c ON c.id = b.company_id JOIN users u ON u.id = b.user_id"
            " WHERE b.id = ?",
            (report_id,),
        )
        if not rows:
            raise CloudError("not_found", "bug report not found")
        return dict(rows[0])

    def update_bug_report(
        self, owner: Principal, report_id: str, data: dict[str, Any], *, ip: str = ""
    ) -> dict[str, Any]:
        owner.require("owner")
        self.bug_report(report_id)  # 404 when missing
        fields: dict[str, Any] = {}
        if "title" in data:
            fields["title"] = _clean(data["title"], "title", 200)
        if "description" in data:
            fields["description"] = _clean(data["description"], "description", 4000)
        if "status" in data:
            if data["status"] not in BUG_STATUSES:
                raise CloudError("invalid", "unknown bug status")
            fields["status"] = data["status"]
        if not fields:
            raise CloudError("invalid", "nothing to change")
        fields["updated_at"] = now_ms()
        sets = ", ".join(f"{k} = ?" for k in fields)
        with self._tx() as db:
            db.execute(f"UPDATE bug_reports SET {sets} WHERE id = ?", (*fields.values(), report_id))  # noqa: S608 — keys are from the fixed list above
            self.audit(db, "bug.reviewed", report_id, actor=owner, ip=ip)
        return self.bug_report(report_id)

    def mark_bug_report_submitted(self, report_id: str, issue_url: str) -> None:
        with self._tx() as db:
            db.execute(
                "UPDATE bug_reports SET status = 'submitted', github_issue_url = ?,"
                " updated_at = ? WHERE id = ?",
                (issue_url, now_ms(), report_id),
            )

    # --- Round 3: client billing (D-090) ---------------------------------------------------------
    def billing_info(self, who: Principal) -> dict[str, Any]:
        """What the client billing section shows: the plan, its monthly price, and the upgrade
        page. There is no payment history in the repo (the Zoho Billing payment side is the
        owner's); 'what they paid' is the current plan's monthly price plus paid_until."""
        company = self.company_row(who.company)
        state = plan_state(company, self.minutes_used(who.company), now_ms())
        plan = state["plan"]
        info = BILLING_PLANS.get(plan, BILLING_PLANS["custom"])
        upgrade_url = None
        if info["upgrade_to"] is not None:
            code = BILLING_PLANS[info["upgrade_to"]]["zoho_code"]
            upgrade_url = ZOHO_HOSTED_URLS.get(code) if code else None
        seats_used = self._q(
            "SELECT COUNT(*) AS n FROM users WHERE company_id = ? AND active = 1",
            (who.company,),
        )[0]["n"]
        return {
            **state,
            "seats_used": seats_used,
            "plan_name": info["name"],
            "price_aed": info["price_aed"],
            "currency": "AED",
            "billing_period": "monthly",
            "zoho_plan_code": info["zoho_code"],
            # plan_state exposes this as ends_at (trial_ends_at for trials); the billing
            # section wants the paid-through date under its own name (D-090).
            "paid_until": company["paid_until"],
            "upgrade_url": upgrade_url,
        }
