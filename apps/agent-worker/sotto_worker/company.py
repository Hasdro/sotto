"""Per-company settings the live path reads at call start (BRIEF; DB `companies` in Phase 5)."""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

import yaml

from sotto_worker.router import CompanyRouting


@dataclass(frozen=True)
class CompanyProfile:
    company_id: str
    name: str
    tone: str
    call_goal: str
    holding_line: dict[str, str]
    escalation_label: dict[str, str]
    # "en", "ar", or anything else (e.g. "auto") for "same language as the customer".
    # Platform default is English (D-018); a company can still choose otherwise.
    card_language: str = "en"
    ai_answers_allowed: bool = True
    agent_context: bool = True
    backup_disabled: tuple[str, ...] = ()
    context: str = ""  # company knowledge the AI reads (owner, 22 Oct 2026)
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path) -> CompanyProfile:
        raw = cast(dict[str, Any], yaml.safe_load(path.read_text(encoding="utf-8")))
        known = {f.name for f in dataclasses.fields(cls)}
        data = {k: v for k, v in raw.items() if k in known}
        data["backup_disabled"] = tuple(raw.get("backup_disabled") or ())
        data["extra"] = {k: v for k, v in raw.items() if k not in known}
        return cls(**data)

    def with_overrides(self, **changes: Any) -> CompanyProfile:
        return dataclasses.replace(self, **changes)

    def routing(self) -> CompanyRouting:
        return CompanyRouting(company_id=self.company_id, backup_disabled=set(self.backup_disabled))

    def language_for(self, customer_text: str) -> str:
        if self.card_language in ("en", "ar"):
            return self.card_language
        return "ar" if any("؀" <= ch <= "ۿ" for ch in customer_text) else "en"
