"""Wires company, playbook, prompts and router for a process (demo, replay; Phase 4 per call)."""

from __future__ import annotations

import dataclasses
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from sotto_worker.adapters.factory import has_credentials, make_llm
from sotto_worker.clock import Clock
from sotto_worker.company import CompanyProfile
from sotto_worker.playbook import PlaybookIndex
from sotto_worker.prompts import PromptRegistry
from sotto_worker.router import ModelRouter, RoutingConfig, StageRoute

REPO_ROOT = Path(__file__).resolve().parents[3]
SEED = REPO_ROOT / "seed"
DEMO = SEED / "demo"
LIVE_ROUTED = ("suggest", "suggest_backup")


@dataclass(frozen=True)
class Runtime:
    company: CompanyProfile
    playbook: PlaybookIndex
    prompts: PromptRegistry
    router: ModelRouter
    mode: Literal["fake", "live"]
    notes: tuple[str, ...] = ()


def build_demo_runtime(
    clock: Clock, env: Mapping[str, str], *, force_fake: bool = False
) -> Runtime:
    """Live mode when the primary suggest provider has credentials; otherwise fake models.
    A backup without credentials is switched off for this run (R2 allows a disabled backup)."""
    config = RoutingConfig.load(SEED / "models" / "default.yaml")
    company = CompanyProfile.load(DEMO / "company.yaml")
    notes: list[str] = []
    primary = config.stages["suggest"]
    if force_fake or not has_credentials(primary.provider, env):
        fake = StageRoute(provider="fake", model="demo-fake", first_token_ms=primary.first_token_ms)
        stages = {**config.stages, "suggest": fake}
        stages.pop("suggest_backup", None)
        config = RoutingConfig(stages=stages)
        mode: Literal["fake", "live"] = "fake"
        notes.append("fake models: set ANTHROPIC_API_KEY in .env for real suggestions")
    else:
        mode = "live"
        backup = config.stages.get("suggest_backup")
        if backup is not None and not has_credentials(backup.provider, env):
            company = dataclasses.replace(
                company, backup_disabled=(*company.backup_disabled, "suggest_backup")
            )
            notes.append(f"backup off: no credentials for {backup.provider}")
    router = ModelRouter(config, lambda route: make_llm(route, clock=clock, env=env), clock)
    return Runtime(
        company=company,
        playbook=PlaybookIndex.from_directory(DEMO / "playbook"),
        prompts=PromptRegistry.from_seed(SEED / "prompts"),
        router=router,
        mode=mode,
        notes=tuple(notes),
    )
