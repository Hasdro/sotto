"""The call bundle (D-022): everything a client app needs to run calls on its own device — company
profile and settings, the stage routes (seed + the admin's choices), the prompts, the playbook
(sample entries + the company's own) and, while the plan allows calls, the provider keys.

Built from the same seed files the Python worker uses, so both engines share one source."""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from sotto_worker.company import CompanyProfile
from sotto_worker.playbook import PlaybookIndex
from sotto_worker.router import RoutingConfig
from sotto_worker.runtime import SEED
from sotto_worker.scenarios import load_all
from sotto_worker.server.catalog import Catalog, apply_overrides

BUNDLE_VERSION = 1
CLIENT_STAGES = ("stt", "stt_backup", "suggest", "suggest_backup", "summary")


@dataclass(frozen=True)
class Seed:
    routing: RoutingConfig
    catalog: Catalog
    company: CompanyProfile
    prompts: dict[str, dict[str, Any]]
    playbook: list[dict[str, Any]]
    scenarios: list[dict[str, Any]]

    @classmethod
    def load(cls, root: Path = SEED) -> Seed:
        prompts: dict[str, dict[str, Any]] = {}
        for path in sorted((root / "prompts").glob("*.md")):
            if path.name == "README.md":
                continue
            _, front, body = path.read_text(encoding="utf-8").split("---\n", 2)
            meta = yaml.safe_load(front)
            prompts[str(meta["key"])] = {
                "key": meta["key"],
                "version": int(meta["version"]),
                "stage": meta["stage"],
                "variables": list(meta["variables"]),
                "body": body.strip() + "\n",
            }
        index = PlaybookIndex.from_directory(root / "demo" / "playbook")
        playbook = [
            {
                "id": e.id,
                "kind": e.kind,
                "question": e.question,
                "short_answer": e.short_answer,
                "details": e.details,
                "follow_up": e.follow_up,
                "tags": list(e.tags),
                "sample": True,
            }
            for e in index.entries
        ]
        scenarios = [
            {
                "id": s.id,
                "title": s.title,
                "lines": [
                    {
                        "speaker": ln.speaker,
                        "text": ln.text,
                        "gap_ms": ln.gap_ms,
                        "duration_ms": ln.duration_ms,
                    }
                    for ln in s.lines
                ],
            }
            for s in load_all(root / "demo" / "calls")
        ]
        return cls(
            routing=RoutingConfig.load(root / "models" / "default.yaml"),
            catalog=Catalog.load(root / "models" / "providers.yaml"),
            company=CompanyProfile.load(root / "demo" / "company.yaml"),
            prompts=prompts,
            playbook=playbook,
            scenarios=scenarios,
        )


def build_bundle(
    seed: Seed,
    *,
    company_name: str,
    settings: dict[str, Any],
    routes: dict[str, tuple[str, str]],
    own_playbook: list[dict[str, Any]],
    keys: dict[str, str] | None,
) -> dict[str, Any]:
    routing = apply_overrides(seed.routing, seed.catalog, routes)
    profile = seed.company
    card_language = settings.get("card_language", "en")
    stages = {
        name: {k: v for k, v in dataclasses.asdict(route).items() if v not in (None, {})}
        for name, route in routing.stages.items()
        if name in CLIENT_STAGES
    }
    backup_off: list[str] = []
    if settings.get("backup_allowed") is False:
        backup_off = ["suggest_backup", "stt_backup"]
    providers = {
        pid: {
            "name": p.name,
            "kind": p.kind,
            "key_env": p.key_env,
            "key_page": p.key_page,
            "free": p.free,
            "steps": p.steps,
            "models": list(p.models),
            "base_url": p.route.get("base_url") or p.test_url,
        }
        for pid, p in seed.catalog.providers.items()
    }
    own = [
        {
            "id": e["id"],
            "kind": "faq",
            "question": e["question"],
            "short_answer": e["answer"],
            "details": "",
            "follow_up": "",
            "tags": e["tags"],
            "sample": False,
        }
        for e in own_playbook
    ]
    return {
        "v": BUNDLE_VERSION,
        "company": {
            "name": company_name,
            # Sample tone and goal until the company sets its own (P0.3 playbook interview).
            "tone": profile.tone,
            "call_goal": profile.call_goal,
            "holding_line": profile.holding_line,
            "escalation_label": profile.escalation_label,
            "card_language": card_language if card_language in ("en", "ar") else "auto",
            "ai_answers_allowed": settings.get("ai_answers_allowed", profile.ai_answers_allowed),
            "agent_context": settings.get("agent_context", profile.agent_context),
            "backup_disabled": backup_off,
        },
        "stages": stages,
        "overrides": sorted(routes),
        "providers": providers,
        "stage_slots": {
            s.id: {"kind": s.kind, "label": s.label} for s in seed.catalog.stages.values()
        },
        "prompts": seed.prompts,
        "playbook": own + seed.playbook,
        "scenarios": seed.scenarios,
        "keys": keys,
    }
