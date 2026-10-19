"""Routing configuration: the platform default from seed/models/default.yaml (DB in Phase 6),
plus per-company overrides and per-stage backup switches (R2, R6)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

import yaml

from sotto_worker.contracts import STAGES, Stage


@dataclass(frozen=True)
class StageRoute:
    provider: str
    model: str
    first_token_ms: int | None = None
    settings: dict[str, Any] = field(default_factory=dict)
    # For openai_compatible endpoints (Ollama, vLLM, LM Studio, Groq, OpenRouter, …).
    base_url: str | None = None
    # Name of the platform env var holding this endpoint's key (seed only, never from the DB);
    # the adapter factory sends it only to that provider's own host.
    api_key_env: str | None = None


@dataclass(frozen=True)
class RoutingConfig:
    stages: dict[str, StageRoute]

    @classmethod
    def load(cls, path: Path) -> RoutingConfig:
        raw = yaml.safe_load(path.read_text())
        stages: dict[str, StageRoute] = {}
        for name, cfg in cast(dict[str, dict[str, Any]], raw["stages"]).items():
            if name not in STAGES:
                raise ValueError(f"{path}: unknown stage {name!r}")
            stages[name] = StageRoute(
                provider=cfg["provider"],
                model=cfg["model"],
                first_token_ms=cfg.get("first_token_ms"),
                settings=dict(cfg.get("settings") or {}),
                base_url=cfg.get("base_url"),
                api_key_env=cfg.get("api_key_env"),
            )
        return cls(stages=stages)


# Which stage backs up which (R2). Only live suggestions have a model backup today.
BACKUP_STAGE: dict[Stage, Stage] = {"suggest": "suggest_backup", "stt": "stt_backup"}


@dataclass(frozen=True)
class CompanyRouting:
    company_id: str
    overrides: dict[str, StageRoute] = field(default_factory=dict)
    # Stages a company admin switched off (R2: "A company admin can disable any backup provider").
    backup_disabled: set[str] = field(default_factory=set)
