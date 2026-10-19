"""Server state for the hosted demo (D-020): provider keys (encrypted), per-stage vendor choices,
call history and an audit log, in one SQLite file under SOTTO_DATA_DIR. Supabase replaces this
in Phase 5/6; the API shapes stay. Keys are write-only: nothing here returns a key to a caller
except `env_overlay`, which only the call runtime uses."""

from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sotto_worker.server.vault import Vault, VaultError

SCHEMA = """
CREATE TABLE IF NOT EXISTS provider_keys (
  key_env TEXT PRIMARY KEY,
  ciphertext BLOB NOT NULL,
  updated_at INTEGER NOT NULL,
  test_ok INTEGER,
  test_at INTEGER,
  test_detail TEXT,
  models_json TEXT
);
CREATE TABLE IF NOT EXISTS stage_routes (
  stage TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  title TEXT NOT NULL,
  mode TEXT NOT NULL,
  cards INTEGER NOT NULL DEFAULT 0,
  p50_ms INTEGER,
  p95_ms INTEGER,
  transcript_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS escalations (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL,
  question TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  asked_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  answer TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE (call_id, question_hash)
);
CREATE TABLE IF NOT EXISTS playbook_added (
  escalation_id TEXT PRIMARY KEY REFERENCES escalations(id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  added_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL
);
"""
MAX_CALLS = 200  # demo history is a rolling window
MAX_ANSWER_WORDS = 25  # R2: what the agent can say from one card (as approve_escalation())


class EscalationError(ValueError):
    """not_found | already_added | empty | too_long (same codes as the app's flow.ts)."""


@dataclass(frozen=True)
class KeyStatus:
    key_env: str
    updated_at: int
    test_ok: bool | None
    test_at: int | None
    test_detail: str | None
    models: tuple[str, ...]


def _now() -> int:
    return int(time.time() * 1000)


class Store:
    def __init__(self, path: Path | str, vault: Vault) -> None:
        self._vault = vault
        self._lock = threading.Lock()
        self._db = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.executescript(SCHEMA)

    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            self._db.execute("BEGIN")
            try:
                yield self._db
            except BaseException:
                self._db.execute("ROLLBACK")
                raise
            self._db.execute("COMMIT")

    def close(self) -> None:
        self._db.close()

    # --- keys -----------------------------------------------------------------------------
    def set_key(self, key_env: str, value: str, *, actor: str = "") -> None:
        blob = self._vault.encrypt(key_env, value)
        with self._tx() as db:
            db.execute(
                "INSERT INTO provider_keys (key_env, ciphertext, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(key_env) DO UPDATE SET ciphertext = excluded.ciphertext, "
                "updated_at = excluded.updated_at, test_ok = NULL, test_at = NULL, "
                "test_detail = NULL, models_json = NULL",
                (key_env, blob, _now()),
            )
            self._audit(db, "key.set", key_env, actor)

    def delete_key(self, key_env: str, *, actor: str = "") -> bool:
        with self._tx() as db:
            gone = db.execute("DELETE FROM provider_keys WHERE key_env = ?", (key_env,)).rowcount
            if gone:
                self._audit(db, "key.delete", key_env, actor)
        return bool(gone)

    def record_test(self, key_env: str, ok: bool, detail: str, models: list[str]) -> None:
        with self._tx() as db:
            db.execute(
                "UPDATE provider_keys SET test_ok = ?, test_at = ?, test_detail = ?, "
                "models_json = ? WHERE key_env = ?",
                (int(ok), _now(), detail[:300], json.dumps(models[:200]), key_env),
            )

    def key_statuses(self) -> dict[str, KeyStatus]:
        with self._lock:
            rows = self._db.execute(
                "SELECT key_env, updated_at, test_ok, test_at, test_detail, models_json "
                "FROM provider_keys"
            ).fetchall()
        return {
            r["key_env"]: KeyStatus(
                key_env=r["key_env"],
                updated_at=r["updated_at"],
                test_ok=None if r["test_ok"] is None else bool(r["test_ok"]),
                test_at=r["test_at"],
                test_detail=r["test_detail"],
                models=tuple(json.loads(r["models_json"] or "[]")),
            )
            for r in rows
        }

    def env_overlay(self, base: Mapping[str, str]) -> dict[str, str]:
        """The process env plus panel keys (panel wins). Only the call runtime calls this."""
        with self._lock:
            rows = self._db.execute("SELECT key_env, ciphertext FROM provider_keys").fetchall()
        env = dict(base)
        for r in rows:
            try:
                env[r["key_env"]] = self._vault.decrypt(r["key_env"], bytes(r["ciphertext"]))
            except VaultError:
                continue  # unreadable row: behaves as "not set"; the panel shows it as set
        return env

    # --- stage routes ---------------------------------------------------------------------
    def set_stage(self, stage: str, provider_id: str, model: str, *, actor: str = "") -> None:
        with self._tx() as db:
            db.execute(
                "INSERT INTO stage_routes (stage, provider_id, model, updated_at) "
                "VALUES (?, ?, ?, ?) ON CONFLICT(stage) DO UPDATE SET "
                "provider_id = excluded.provider_id, model = excluded.model, "
                "updated_at = excluded.updated_at",
                (stage, provider_id, model, _now()),
            )
            self._audit(db, "stage.set", f"{stage} -> {provider_id} {model}", actor)

    def reset_stage(self, stage: str, *, actor: str = "") -> None:
        with self._tx() as db:
            db.execute("DELETE FROM stage_routes WHERE stage = ?", (stage,))
            self._audit(db, "stage.reset", stage, actor)

    def stage_overrides(self) -> dict[str, tuple[str, str]]:
        with self._lock:
            rows = self._db.execute("SELECT stage, provider_id, model FROM stage_routes").fetchall()
        return {r["stage"]: (r["provider_id"], r["model"]) for r in rows}

    # --- calls ----------------------------------------------------------------------------
    def call_started(self, call_id: str, title: str, mode: str) -> None:
        with self._tx() as db:
            db.execute(
                "INSERT INTO calls (id, started_at, title, mode) VALUES (?, ?, ?, ?)",
                (call_id, _now(), title[:200], mode),
            )
            db.execute(
                "DELETE FROM calls WHERE id NOT IN "
                "(SELECT id FROM calls ORDER BY started_at DESC LIMIT ?)",
                (MAX_CALLS,),
            )

    def call_ended(
        self,
        call_id: str,
        *,
        cards: int,
        p50_ms: int | None,
        p95_ms: int | None,
        transcript: list[dict[str, Any]],
    ) -> None:
        with self._tx() as db:
            db.execute(
                "UPDATE calls SET ended_at = ?, cards = ?, p50_ms = ?, p95_ms = ?, "
                "transcript_json = ? WHERE id = ?",
                (_now(), cards, p50_ms, p95_ms, json.dumps(transcript[-500:]), call_id),
            )

    def calls(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._db.execute(
                "SELECT id, started_at, ended_at, title, mode, cards, p50_ms, p95_ms "
                "FROM calls ORDER BY started_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def call(self, call_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._db.execute("SELECT * FROM calls WHERE id = ?", (call_id,)).fetchone()
        if row is None:
            return None
        out = dict(row)
        out["transcript"] = json.loads(out.pop("transcript_json"))
        return out

    # --- escalations → playbook (R2 steps 4-5) -------------------------------------------
    def add_escalation(self, call_id: str, question: str, question_hash: str) -> str | None:
        """One inbox item per (call, question); returns its id, or None if already there."""
        item_id = str(uuid.uuid4())
        with self._tx() as db:
            added = db.execute(
                "INSERT OR IGNORE INTO escalations "
                "(id, call_id, question, question_hash, asked_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (item_id, call_id, question[:500], question_hash, _now(), _now()),
            ).rowcount
        return item_id if added else None

    def escalations(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._db.execute(
                "SELECT id, call_id, question, asked_at, status, answer FROM escalations "
                "ORDER BY asked_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def _checked(self, db: sqlite3.Connection, item_id: str, answer: str) -> sqlite3.Row:
        row: sqlite3.Row | None = db.execute(
            "SELECT * FROM escalations WHERE id = ?", (item_id,)
        ).fetchone()
        if row is None:
            raise EscalationError("not_found")
        if row["status"] == "added":
            raise EscalationError("already_added")
        words = len(answer.split())
        if words == 0:
            raise EscalationError("empty")
        if words > MAX_ANSWER_WORDS:
            raise EscalationError("too_long")
        return row

    def answer_escalation(self, item_id: str, answer: str, *, actor: str = "") -> None:
        answer = answer.strip()
        with self._tx() as db:
            self._checked(db, item_id, answer)
            db.execute(
                "UPDATE escalations SET status = 'answered', answer = ?, updated_at = ? "
                "WHERE id = ?",
                (answer, _now(), item_id),
            )
            self._audit(db, "escalation.answer", item_id, actor)

    def add_to_playbook(self, item_id: str, answer: str, *, actor: str = "") -> None:
        """The answer becomes a playbook entry (once) and the item is marked added, together."""
        answer = answer.strip()
        with self._tx() as db:
            row = self._checked(db, item_id, answer)
            db.execute(
                "UPDATE escalations SET status = 'added', answer = ?, updated_at = ? WHERE id = ?",
                (answer, _now(), item_id),
            )
            db.execute(
                "INSERT INTO playbook_added (escalation_id, question, answer, added_at) "
                "VALUES (?, ?, ?, ?)",
                (item_id, row["question"], answer, _now()),
            )
            self._audit(db, "playbook.add", f"{item_id}: {row['question'][:80]}", actor)

    def playbook_added(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._db.execute(
                "SELECT escalation_id AS id, question, answer, added_at FROM playbook_added "
                "ORDER BY added_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]

    # --- audit ----------------------------------------------------------------------------
    def _audit(self, db: sqlite3.Connection, action: str, detail: str, actor: str = "") -> None:
        if actor:
            detail = f"{detail} (from {actor})"
        db.execute(
            "INSERT INTO audit_log (at, action, detail) VALUES (?, ?, ?)", (_now(), action, detail)
        )

    def audit(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._db.execute(
                "SELECT at, action, detail FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]
