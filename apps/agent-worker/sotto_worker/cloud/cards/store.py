"""Per-company and per-agent card tone + banned-phrase storage (C3, D-094).

Precedence (most specific wins): platform → company → agent.
- Platform owner sets platform banned phrases (EN + AR; defaults in seed/cards/tone_defaults.yaml).
- Company admin sets default tone (default: casual), allowed presets for agents, free-text
  "how we talk" (<= 200 chars), and extra company banned phrases (EN + AR).
- Each agent picks their own tone from the company's allowed presets.
Every company-scoped table carries `company_id` with foreign-key cascade and tenant isolation.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

import yaml

if TYPE_CHECKING:
    from sotto_worker.cloud.store import CloudStore, Principal

TonePreset = Literal["casual", "direct", "warm", "formal"]
TONE_PRESETS: tuple[TonePreset, ...] = ("casual", "direct", "warm", "formal")
HOW_WE_TALK_MAX = 200
MAX_BANNED_PHRASES = 50
MAX_PHRASE_LEN = 80

DEFAULT_BANNED_EN: tuple[str, ...] = (
    "I hear you",
    "I understand your concern",
    "Great question",
    "That's a great question",
    "I completely understand",
)
DEFAULT_BANNED_AR: tuple[str, ...] = (
    "أفهمك تماماً",
    "أتفهم قلقك",
    "سؤال رائع",
    "هذا سؤال رائع",
    "أفهم قلقك",
)

_SEED_PATH = Path(__file__).resolve().parents[5] / "seed" / "cards" / "tone_defaults.yaml"

SCHEMA = """
CREATE TABLE IF NOT EXISTS platform_tone_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    banned_en_json TEXT NOT NULL,
    banned_ar_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS company_tone_settings (
    company_id TEXT PRIMARY KEY NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    default_tone TEXT NOT NULL DEFAULT 'casual',
    allowed_presets_json TEXT NOT NULL,
    how_we_talk TEXT NOT NULL DEFAULT '',
    banned_en_json TEXT NOT NULL DEFAULT '[]',
    banned_ar_json TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_tone_settings (
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    tone TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (company_id, user_id)
);
CREATE INDEX IF NOT EXISTS agent_tone_company ON agent_tone_settings(company_id);
"""


def _now_ms() -> int:
    return int(time.time() * 1000)


def _require_non_empty(value: str, field: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{field} is required")
    return cleaned


def _load_seed_banned() -> tuple[list[str], list[str]]:
    if _SEED_PATH.exists():
        data = yaml.safe_load(_SEED_PATH.read_text(encoding="utf-8")) or {}
        bp = data.get("banned_phrases") or {}
        en = [str(x).strip() for x in (bp.get("en") or []) if str(x).strip()]
        ar = [str(x).strip() for x in (bp.get("ar") or []) if str(x).strip()]
        if en or ar:
            return en, ar
    return list(DEFAULT_BANNED_EN), list(DEFAULT_BANNED_AR)


def _clean_phrases(items: list[str], *, cap: int = MAX_BANNED_PHRASES) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in items:
        p = " ".join(str(raw).split()).strip()[:MAX_PHRASE_LEN]
        if not p:
            continue
        k = p.casefold()
        if k in seen:
            continue
        seen.add(k)
        out.append(p)
        if len(out) >= cap:
            break
    return out


def _validate_tone(tone: str) -> TonePreset:
    for preset in TONE_PRESETS:
        if tone == preset:
            return preset
    raise ValueError(f"invalid tone preset: {tone!r}")


@dataclass(frozen=True)
class EffectiveTone:
    tone: TonePreset
    company_default: TonePreset
    allowed_presets: tuple[TonePreset, ...]
    how_we_talk: str
    banned_en: tuple[str, ...]
    banned_ar: tuple[str, ...]
    source: Literal["agent", "company", "platform"]

    def banned_for(self, language: str) -> tuple[str, ...]:
        return self.banned_ar if language == "ar" else self.banned_en


class CardToneStore:
    """SQLite-backed tone + banned-phrase store with strict company_id isolation."""

    def __init__(
        self,
        db_or_store: sqlite3.Connection | CloudStore,
        lock: threading.Lock | threading.RLock | None = None,
    ) -> None:
        if isinstance(db_or_store, sqlite3.Connection):
            self._store: CloudStore | None = None
            self._db = db_or_store
            self._lock: threading.Lock | threading.RLock = lock or threading.RLock()
            self._owns_commit = self._db.isolation_level is not None
        else:
            self._store = db_or_store
            self._db = db_or_store._db
            self._lock = db_or_store._lock
            self._owns_commit = False
        with self._lock:
            self._db.executescript(SCHEMA)

    @contextmanager
    def _write(self) -> Iterator[sqlite3.Connection]:
        if self._store is not None:
            with self._store._tx() as db:
                yield db
            return
        with self._lock:
            yield self._db
            if self._owns_commit:
                self._db.commit()

    def _read_all(self, sql: str, args: tuple[Any, ...] = ()) -> list[Any]:
        with self._lock:
            return list(self._db.execute(sql, args).fetchall())

    def _read_one(self, sql: str, args: tuple[Any, ...] = ()) -> Any | None:
        with self._lock:
            return self._db.execute(sql, args).fetchone()

    def _assert_company_member(self, db: sqlite3.Connection, company_id: str, user_id: str) -> None:
        if self._store is None:
            return
        row = db.execute(
            "SELECT 1 FROM users WHERE id = ? AND company_id = ?",
            (user_id, company_id),
        ).fetchone()
        if row is None:
            raise ValueError("user does not belong to company")

    def get_platform_banned(self) -> dict[str, list[str]]:
        row = self._read_one(
            "SELECT banned_en_json, banned_ar_json FROM platform_tone_settings WHERE id = 1"
        )
        if row is None:
            en, ar = _load_seed_banned()
            return {"en": en, "ar": ar}
        return {"en": list(json.loads(row[0])), "ar": list(json.loads(row[1]))}

    def set_platform_banned(
        self,
        *,
        en: list[str],
        ar: list[str],
        actor: Principal | None = None,
        ip: str = "",
    ) -> dict[str, list[str]]:
        clean_en = _clean_phrases(en)
        clean_ar = _clean_phrases(ar)
        with self._write() as db:
            db.execute(
                """
                INSERT INTO platform_tone_settings(id, banned_en_json, banned_ar_json, updated_at)
                VALUES (1, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    banned_en_json = excluded.banned_en_json,
                    banned_ar_json = excluded.banned_ar_json,
                    updated_at = excluded.updated_at
                """,
                (json.dumps(clean_en), json.dumps(clean_ar), _now_ms()),
            )
            if self._store is not None:
                self._store.audit(
                    db,
                    "owner.cards.banned_updated",
                    f"en={len(clean_en)} ar={len(clean_ar)}",
                    actor=actor,
                    ip=ip,
                )
        return {"en": clean_en, "ar": clean_ar}

    def get_company_settings(self, company_id: str) -> dict[str, Any]:
        cid = _require_non_empty(company_id, "company_id")
        row = self._read_one(
            """
            SELECT default_tone, allowed_presets_json, how_we_talk, banned_en_json, banned_ar_json
            FROM company_tone_settings WHERE company_id = ?
            """,
            (cid,),
        )
        if row is None:
            return {
                "company_id": cid,
                "default_tone": "casual",
                "allowed_presets": list(TONE_PRESETS),
                "how_we_talk": "",
                "banned_en": [],
                "banned_ar": [],
            }
        return {
            "company_id": cid,
            "default_tone": _validate_tone(str(row[0])),
            "allowed_presets": [_validate_tone(str(x)) for x in json.loads(row[1])],
            "how_we_talk": str(row[2]),
            "banned_en": [str(x) for x in json.loads(row[3])],
            "banned_ar": [str(x) for x in json.loads(row[4])],
        }

    def set_company_settings(
        self,
        company_id: str,
        *,
        default_tone: str = "casual",
        allowed_presets: list[str] | None = None,
        how_we_talk: str = "",
        banned_en: list[str] | None = None,
        banned_ar: list[str] | None = None,
        actor: Principal | None = None,
        ip: str = "",
    ) -> dict[str, Any]:
        cid = _require_non_empty(company_id, "company_id")
        tone = _validate_tone(default_tone)
        presets_raw = allowed_presets if allowed_presets is not None else list(TONE_PRESETS)
        presets: list[TonePreset] = []
        for p in presets_raw:
            vp = _validate_tone(p)
            if vp not in presets:
                presets.append(vp)
        if tone not in presets:
            presets.insert(0, tone)
        note = " ".join(how_we_talk.split()).strip()
        if len(note) > HOW_WE_TALK_MAX:
            raise ValueError(f"how_we_talk must be <= {HOW_WE_TALK_MAX} characters")
        c_en = _clean_phrases(banned_en or [])
        c_ar = _clean_phrases(banned_ar or [])
        with self._write() as db:
            db.execute(
                """
                INSERT INTO company_tone_settings(
                    company_id, default_tone, allowed_presets_json, how_we_talk,
                    banned_en_json, banned_ar_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(company_id) DO UPDATE SET
                    default_tone = excluded.default_tone,
                    allowed_presets_json = excluded.allowed_presets_json,
                    how_we_talk = excluded.how_we_talk,
                    banned_en_json = excluded.banned_en_json,
                    banned_ar_json = excluded.banned_ar_json,
                    updated_at = excluded.updated_at
                """,
                (
                    cid,
                    tone,
                    json.dumps(presets),
                    note,
                    json.dumps(c_en),
                    json.dumps(c_ar),
                    _now_ms(),
                ),
            )
            if self._store is not None:
                self._store.audit(
                    db,
                    "cards.tone.company",
                    f"default={tone} allowed={len(presets)}",
                    company_id=cid,
                    actor=actor,
                    ip=ip,
                )
        return self.get_company_settings(cid)

    def get_agent_tone(self, company_id: str, user_id: str) -> TonePreset | None:
        cid = _require_non_empty(company_id, "company_id")
        uid = _require_non_empty(user_id, "user_id")
        row = self._read_one(
            "SELECT tone FROM agent_tone_settings WHERE company_id = ? AND user_id = ?",
            (cid, uid),
        )
        return _validate_tone(str(row[0])) if row else None

    def set_agent_tone(self, company_id: str, user_id: str, tone: str) -> TonePreset:
        cid = _require_non_empty(company_id, "company_id")
        uid = _require_non_empty(user_id, "user_id")
        valid = _validate_tone(tone)
        comp = self.get_company_settings(cid)
        allowed = list(comp["allowed_presets"])
        if valid not in allowed:
            raise PermissionError(f"tone {valid!r} is not allowed by company settings")
        with self._write() as db:
            self._assert_company_member(db, cid, uid)
            db.execute(
                """
                INSERT INTO agent_tone_settings(company_id, user_id, tone, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(company_id, user_id) DO UPDATE SET
                    tone = excluded.tone,
                    updated_at = excluded.updated_at
                """,
                (cid, uid, valid, _now_ms()),
            )
        return valid

    def clear_agent_tone(self, company_id: str, user_id: str) -> None:
        cid = _require_non_empty(company_id, "company_id")
        uid = _require_non_empty(user_id, "user_id")
        with self._write() as db:
            self._assert_company_member(db, cid, uid)
            db.execute(
                "DELETE FROM agent_tone_settings WHERE company_id = ? AND user_id = ?",
                (cid, uid),
            )

    def resolve(self, company_id: str, user_id: str | None = None) -> EffectiveTone:
        """Resolve effective tone and banned phrases: agent > company > platform."""
        cid = _require_non_empty(company_id, "company_id")
        plat = self.get_platform_banned()
        comp = self.get_company_settings(cid)
        allowed = tuple(_validate_tone(str(p)) for p in comp["allowed_presets"])
        company_default: TonePreset = _validate_tone(str(comp["default_tone"]))
        agent_pick = self.get_agent_tone(cid, user_id) if user_id else None

        has_company_row = (
            self._read_one("SELECT 1 FROM company_tone_settings WHERE company_id = ?", (cid,))
            is not None
        )

        if agent_pick is not None and agent_pick in allowed:
            effective: TonePreset = agent_pick
            source: Literal["agent", "company", "platform"] = "agent"
        elif has_company_row:
            effective = company_default
            source = "company"
        else:
            effective = "casual"
            source = "platform"

        merged_en = tuple(
            _clean_phrases([*plat["en"], *comp["banned_en"]], cap=MAX_BANNED_PHRASES * 2)
        )
        merged_ar = tuple(
            _clean_phrases([*plat["ar"], *comp["banned_ar"]], cap=MAX_BANNED_PHRASES * 2)
        )
        return EffectiveTone(
            tone=effective,
            company_default=company_default,
            allowed_presets=allowed,
            how_we_talk=str(comp["how_we_talk"]),
            banned_en=merged_en,
            banned_ar=merged_ar,
            source=source,
        )
