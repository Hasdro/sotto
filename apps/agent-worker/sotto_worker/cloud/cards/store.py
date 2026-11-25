"""Per-company and per-agent card tone + banned-phrase storage (C3, D-094).

Precedence (most specific wins): platform → company → agent.
- Platform owner sets platform banned phrases (EN + AR; defaults in seed/cards/tone_defaults.yaml).
- Company admin sets default tone (default: casual), allowed presets for agents, free-text
  "how we talk" (<= 200 chars), and extra company banned phrases (EN + AR).
- Each agent picks their own tone from the company's allowed presets.
Every company-scoped table carries `company_id` and enforces tenant isolation.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import yaml

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

_SEED_PATH = Path(__file__).resolve().parents[4] / "seed" / "cards" / "tone_defaults.yaml"

SCHEMA = """
CREATE TABLE IF NOT EXISTS platform_tone_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    banned_en_json TEXT NOT NULL,
    banned_ar_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS company_tone_settings (
    company_id TEXT PRIMARY KEY,
    default_tone TEXT NOT NULL DEFAULT 'casual',
    allowed_presets_json TEXT NOT NULL,
    how_we_talk TEXT NOT NULL DEFAULT '',
    banned_en_json TEXT NOT NULL DEFAULT '[]',
    banned_ar_json TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_tone_settings (
    company_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    tone TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (company_id, user_id)
);
CREATE INDEX IF NOT EXISTS agent_tone_company ON agent_tone_settings(company_id);
"""


def _now_ms() -> int:
    return int(time.time() * 1000)


def _load_seed_banned() -> tuple[list[str], list[str]]:
    if _SEED_PATH.exists():
        data = yaml.safe_load(_SEED_PATH.read_text(encoding="utf-8")) or {}
        bp = data.get("banned_phrases") or {}
        en = [str(x).strip() for x in (bp.get("en") or []) if str(x).strip()]
        ar = [str(x).strip() for x in (bp.get("ar") or []) if str(x).strip()]
        if en or ar:
            return en, ar
    return list(DEFAULT_BANNED_EN), list(DEFAULT_BANNED_AR)


def _clean_phrases(items: list[str]) -> list[str]:
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
        if len(out) >= MAX_BANNED_PHRASES:
            break
    return out


def _validate_tone(tone: str) -> TonePreset:
    if tone not in TONE_PRESETS:
        raise ValueError(f"invalid tone preset: {tone!r}")
    return tone


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

    def __init__(self, db: sqlite3.Connection, lock: threading.RLock | None = None) -> None:
        self._db = db
        self._lock = lock or threading.RLock()
        with self._lock:
            self._db.executescript(SCHEMA)

    def get_platform_banned(self) -> dict[str, list[str]]:
        with self._lock:
            row = self._db.execute(
                "SELECT banned_en_json, banned_ar_json FROM platform_tone_settings WHERE id = 1"
            ).fetchone()
        if row is None:
            en, ar = _load_seed_banned()
            return {"en": en, "ar": ar}
        return {"en": json.loads(row[0]), "ar": json.loads(row[1])}

    def set_platform_banned(self, *, en: list[str], ar: list[str]) -> dict[str, list[str]]:
        clean_en = _clean_phrases(en)
        clean_ar = _clean_phrases(ar)
        with self._lock:
            self._db.execute(
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
            self._db.commit()
        return {"en": clean_en, "ar": clean_ar}

    def get_company_settings(self, company_id: str) -> dict[str, object]:
        with self._lock:
            row = self._db.execute(
                """
                SELECT default_tone, allowed_presets_json, how_we_talk, banned_en_json, banned_ar_json
                FROM company_tone_settings WHERE company_id = ?
                """,
                (company_id,),
            ).fetchone()
        if row is None:
            return {
                "company_id": company_id,
                "default_tone": "casual",
                "allowed_presets": list(TONE_PRESETS),
                "how_we_talk": "",
                "banned_en": [],
                "banned_ar": [],
            }
        return {
            "company_id": company_id,
            "default_tone": row[0],
            "allowed_presets": json.loads(row[1]),
            "how_we_talk": row[2],
            "banned_en": json.loads(row[3]),
            "banned_ar": json.loads(row[4]),
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
    ) -> dict[str, object]:
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
        with self._lock:
            self._db.execute(
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
                    company_id,
                    tone,
                    json.dumps(presets),
                    note,
                    json.dumps(c_en),
                    json.dumps(c_ar),
                    _now_ms(),
                ),
            )
            self._db.commit()
        return self.get_company_settings(company_id)

    def get_agent_tone(self, company_id: str, user_id: str) -> TonePreset | None:
        with self._lock:
            row = self._db.execute(
                "SELECT tone FROM agent_tone_settings WHERE company_id = ? AND user_id = ?",
                (company_id, user_id),
            ).fetchone()
        return row[0] if row else None

    def set_agent_tone(self, company_id: str, user_id: str, tone: str) -> TonePreset:
        valid = _validate_tone(tone)
        comp = self.get_company_settings(company_id)
        allowed = list(comp["allowed_presets"])
        if valid not in allowed:
            raise PermissionError(f"tone {valid!r} is not allowed by company settings")
        with self._lock:
            self._db.execute(
                """
                INSERT INTO agent_tone_settings(company_id, user_id, tone, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(company_id, user_id) DO UPDATE SET
                    tone = excluded.tone,
                    updated_at = excluded.updated_at
                """,
                (company_id, user_id, valid, _now_ms()),
            )
            self._db.commit()
        return valid

    def clear_agent_tone(self, company_id: str, user_id: str) -> None:
        with self._lock:
            self._db.execute(
                "DELETE FROM agent_tone_settings WHERE company_id = ? AND user_id = ?",
                (company_id, user_id),
            )
            self._db.commit()

    def resolve(self, company_id: str, user_id: str | None = None) -> EffectiveTone:
        """Resolve effective tone and banned phrases: agent > company > platform."""
        plat = self.get_platform_banned()
        comp = self.get_company_settings(company_id)
        allowed = tuple(comp["allowed_presets"])
        company_default: TonePreset = comp["default_tone"]
        agent_pick = self.get_agent_tone(company_id, user_id) if user_id else None

        has_company_row = False
        with self._lock:
            has_company_row = (
                self._db.execute(
                    "SELECT 1 FROM company_tone_settings WHERE company_id = ?", (company_id,)
                ).fetchone()
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

        merged_en = tuple(_clean_phrases([*plat["en"], *comp["banned_en"]]))
        merged_ar = tuple(_clean_phrases([*plat["ar"], *comp["banned_ar"]]))
        return EffectiveTone(
            tone=effective,
            company_default=company_default,
            allowed_presets=allowed,
            how_we_talk=str(comp["how_we_talk"]),
            banned_en=merged_en,
            banned_ar=merged_ar,
            source=source,
        )
