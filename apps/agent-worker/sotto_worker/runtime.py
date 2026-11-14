"""Wires company, playbook, prompts and router for a process (demo, replay; Phase 4 per call)."""

from __future__ import annotations

import dataclasses
import hashlib
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from sotto_worker.adapters.factory import (
    has_credentials,
    key_env,
    make_llm,
    preload_adapters,
    stt_key_env,
)
from sotto_worker.clock import Clock
from sotto_worker.company import COMPANY_SETTINGS, CompanyProfile
from sotto_worker.contracts import LLMAdapter
from sotto_worker.playbook import PlaybookEntry, PlaybookIndex
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
    # Real-time STT for a spoken customer track, primary first (empty: no STT key set).
    stt_routes: tuple[StageRoute, ...] = ()
    env: Mapping[str, str] = field(default_factory=dict, repr=False)


BACKUP_STAGES = ("suggest_backup", "stt_backup")


def apply_settings(company: CompanyProfile, settings: Mapping[str, Any]) -> CompanyProfile:
    """The company file plus what the admin changed in the app (server store, D-020)."""
    changes: dict[str, Any] = {}
    for name in COMPANY_SETTINGS:
        if name in settings:
            changes[name] = settings[name]
    if settings.get("backup_allowed") is False:  # R2: an admin can switch backups off
        changes["backup_disabled"] = tuple({*company.backup_disabled, *BACKUP_STAGES})
    elif settings.get("backup_allowed") is True:
        changes["backup_disabled"] = tuple(
            s for s in company.backup_disabled if s not in BACKUP_STAGES
        )
    return dataclasses.replace(company, **changes) if changes else company


def build_demo_runtime(
    clock: Clock,
    env: Mapping[str, str],
    *,
    force_fake: bool = False,
    config: RoutingConfig | None = None,
    extra_playbook: Sequence[PlaybookEntry] = (),
    settings: Mapping[str, Any] | None = None,
    adapters: dict[str, LLMAdapter] | None = None,
) -> Runtime:
    """Live mode when the primary suggest provider has credentials; otherwise fake models.
    A backup without credentials is switched off for this run (R2 allows a disabled backup).
    `config` is the seed routing plus the Keys & providers panel's choices (server, P6.7);
    `extra_playbook` holds answers a manager added from the inbox (R2 step 5); `settings` the
    admin's company settings (COMPANY_SETTINGS and backup_allowed)."""
    config = config or RoutingConfig.load(SEED / "models" / "default.yaml")
    company = apply_settings(CompanyProfile.load(DEMO / "company.yaml"), settings or {})
    stt_routes = tuple(
        route
        for stage in ("stt", "stt_backup")
        if stage not in company.backup_disabled
        and (route := config.stages.get(stage)) is not None
        and (name := stt_key_env(route)) is not None
        and env.get(name)
        and not force_fake
    )
    notes: list[str] = []
    primary = config.stages["suggest"]
    if force_fake or not has_credentials(primary, env):
        fake = StageRoute(provider="fake", model="demo-fake", first_token_ms=primary.first_token_ms)
        stages = {**config.stages, "suggest": fake}
        stages.pop("suggest_backup", None)
        config = RoutingConfig(stages=stages)
        mode: Literal["fake", "live"] = "fake"
        notes.append(f"fake models: add {key_env(primary)} (Admin → Keys & providers, or .env)")
    else:
        mode = "live"
        backup = config.stages.get("suggest_backup")
        if backup is not None and not has_credentials(backup, env):
            company = dataclasses.replace(
                company, backup_disabled=(*company.backup_disabled, "suggest_backup")
            )
            notes.append(f"backup off: add {key_env(backup)} (Admin → Keys & providers, or .env)")
    preload_adapters(config)  # SDK imports at start, never inside a live turn (R2 timers)

    def llm(route: StageRoute) -> LLMAdapter:
        if adapters is None or route.provider == "fake":
            return make_llm(route, clock=clock, env=env)
        # Shared across calls (server): warm HTTPS connections survive from call to call; a new
        # key or model is a new cache entry, so changes still apply to the next call.
        name = key_env(route)
        secret = hashlib.sha256(env.get(name, "").encode()).hexdigest() if name else ""
        cache_key = f"{route!r}|{secret}"
        if cache_key not in adapters:
            adapters[cache_key] = make_llm(route, clock=clock, env=env)
        return adapters[cache_key]

    router = ModelRouter(config, llm, clock)
    return Runtime(
        company=company,
        playbook=PlaybookIndex(
            [*PlaybookIndex.from_directory(DEMO / "playbook").entries, *extra_playbook]
        ),
        prompts=PromptRegistry.from_seed(SEED / "prompts"),
        router=router,
        mode=mode,
        notes=tuple(notes),
        stt_routes=stt_routes,
        env=env,
    )
