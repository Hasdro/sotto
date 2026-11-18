"""The call bundle (D-022): everything a client app needs to run calls on its own device — company
profile and settings, the stage routes (seed + the admin's choices), the prompts, the company's
own playbook and, while the plan allows calls, the provider keys. Real accounts never get the demo
company's sample playbook or scripted calls (D-024); only the demo fixture asks for them.

Built from the same seed files the Python worker uses, so both engines share one source."""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from sotto_worker.company import CompanyProfile
from sotto_worker.playbook import PlaybookIndex
from sotto_worker.router import RoutingConfig
from sotto_worker.runtime import SEED
from sotto_worker.scenarios import Scenario, load_all
from sotto_worker.server.catalog import Catalog, apply_overrides

BUNDLE_VERSION = 1
CLIENT_STAGES = ("stt", "stt_backup", "suggest", "suggest_backup", "summary")


@dataclass(frozen=True)
class Seed:
    routing: RoutingConfig
    catalog: Catalog
    company: CompanyProfile
    demo_company: CompanyProfile
    prompts: dict[str, dict[str, Any]]
    playbook: list[dict[str, Any]]
    scenarios: list[dict[str, Any]]
    # Example answers every new company starts with (seed/company/examples.yaml).
    examples: list[dict[str, Any]] = field(default_factory=list)
    # The neutral practice script every account can run (seed/practice, D-073).
    practice: dict[str, Any] | None = None

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
        scenarios = [_scenario(s) for s in load_all(root / "demo" / "calls")]
        practice_file = root / "practice" / "practice.json"
        practice = _scenario(Scenario.load(practice_file)) if practice_file.exists() else None
        return cls(
            routing=RoutingConfig.load(root / "models" / "default.yaml"),
            catalog=Catalog.load(root / "models" / "providers.yaml"),
            company=CompanyProfile.load(root / "company" / "default.yaml"),
            demo_company=CompanyProfile.load(root / "demo" / "company.yaml"),
            prompts=prompts,
            playbook=playbook,
            scenarios=scenarios,
            examples=list(yaml.safe_load((root / "company" / "examples.yaml").read_text()) or []),
            practice=practice,
        )


def _scenario(s: Scenario) -> dict[str, Any]:
    """A scripted call as the app plays it (the replay's `expect` stays on the server)."""
    return {
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


def build_bundle(
    seed: Seed,
    *,
    company_name: str,
    settings: dict[str, Any],
    routes: dict[str, tuple[str, str]],
    own_playbook: list[dict[str, Any]],
    keys: dict[str, str] | None,
    samples: bool = False,
    prompts: dict[str, dict[str, Any]] | None = None,
    demoted: dict[str, int] | None = None,
) -> dict[str, Any]:
    """`routes` are the effective choices (AGN's platform routes, plus the company's own under
    BYO). `prompts`: the effective prompt versions (DD-2); `demoted`: vendors demoted for
    everyone {vendor: until ms} (ZC-06), which the app's router skips to the backup while they
    last. Round 2 (D-079): the bundle no longer names the provider catalogue or any model —
    `overrides` is always empty and `providers` carries no model list, so the client cannot show
    which models are used. The stages still carry the provider+model the call needs (D-038)."""
    from sotto_worker.cloud.owner.platform import vendor_of

    routing = apply_overrides(seed.routing, seed.catalog, routes)
    profile = seed.demo_company if samples else seed.company
    card_language = settings.get("card_language", "en")
    stages: dict[str, dict[str, Any]] = {}
    for name, route in routing.stages.items():
        if name not in CLIENT_STAGES:
            continue
        entry = {k: v for k, v in dataclasses.asdict(route).items() if v not in (None, {})}
        vendor = vendor_of(seed.catalog, route)
        if vendor is not None:
            entry["vendor"] = vendor
            if demoted and vendor in demoted:
                entry["demoted_until"] = demoted[vendor]
        stages[name] = entry
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
            "base_url": p.route.get("base_url") or p.test_url,
            "client": p.client,
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
            # The company's own tone and goal (Company defaults, ZC-11c), else the seed's.
            "tone": settings.get("tone") or profile.tone,
            "call_goal": settings.get("call_goal") or profile.call_goal,
            "holding_line": profile.holding_line,
            "escalation_label": profile.escalation_label,
            "card_language": card_language if card_language in ("en", "ar") else "auto",
            "ai_answers_allowed": settings.get("ai_answers_allowed", profile.ai_answers_allowed),
            # D-062: a platform default from the seed, not a company setting.
            "agent_context": profile.agent_context,
            "backup_disabled": backup_off,
            "context": settings.get("context", ""),
        },
        "stages": stages,
        # D-079: always empty — the client no longer shows model configuration.
        "overrides": [],
        "providers": providers,
        "stage_slots": {
            s.id: {"kind": s.kind, "label": s.label} for s in seed.catalog.stages.values()
        },
        "prompts": seed.prompts if prompts is None else prompts,
        "playbook": own + (seed.playbook if samples else []),
        "scenarios": seed.scenarios if samples else [],
        "practice": seed.practice,
        "keys": keys,
    }
