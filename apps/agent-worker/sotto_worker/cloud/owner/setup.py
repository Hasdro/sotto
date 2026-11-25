"""Owner console Setup Guide backend (L2): live status and Test it checks for owner steps."""

from __future__ import annotations

from typing import Any

from sotto_worker.cloud.obs import store as obs_store
from sotto_worker.cloud.routing import local_models as lm
from sotto_worker.cloud.store import CloudStore, Principal


def owner_setup_steps(store: CloudStore, owner: Principal | None = None) -> list[dict[str, Any]]:
    """Return owner-role setup steps with live status, what-this-does, default, and Fix it href."""
    if owner is not None:
        obs_store._require_owner(owner)
    obs_store.ensure_schema(store)
    lm.ensure_schema(store)
    logs_cfg = obs_store.get_logs_repo(store)
    company_count = int(store._q("SELECT COUNT(*) AS c FROM companies")[0]["c"])
    provider_keys = (
        int(store._q("SELECT COUNT(*) AS c FROM platform_keys")[0]["c"])
        if _has_table(store, "platform_keys")
        else 0
    )

    return [
        {
            "id": "providers",
            "title": "AI & speech provider keys",
            "what_it_does": "Configures shared platform LLM and STT vendors used across companies.",
            "recommended_default": "Primary + backup LLM and STT connected",
            "ok": provider_keys > 0,
            "status": (
                f"Providers: {provider_keys} key(s) configured ✓"
                if provider_keys > 0
                else "Providers: not set up"
            ),
            "fix_href": "/owner#providers",
        },
        {
            "id": "call_logs",
            "title": "Private call-logs GitHub repo",
            "what_it_does": (
                "Receives automatic redacted call diagnostics when enabled per company or user."
            ),
            "recommended_default": (
                "Dedicated private repo (e.g. Hasdro/sales-shield-logs), off by default"
            ),
            "ok": logs_cfg is not None,
            "status": f"Logs repo: {logs_cfg[0]} ✓" if logs_cfg else "Logs repo: not set up",
            "fix_href": "/owner/logs.html",
        },
        {
            "id": "local_models",
            "title": "Local / offline model policy",
            "what_it_does": (
                "Controls which companies or users may connect local text or voice servers."
            ),
            "recommended_default": "Off by default; Allow cloud backup on",
            "ok": True,
            "status": "Local models: policy ready ✓",
            "fix_href": "/owner/local-models.html",
        },
        {
            "id": "companies",
            "title": "Companies & seats",
            "what_it_does": "Creates tenant organisations, plans, and initial admin invites.",
            "recommended_default": "14-day trial with seat & minute limits",
            "ok": company_count > 0,
            "status": (
                f"Companies: {company_count} active ✓"
                if company_count > 0
                else "Companies: none yet"
            ),
            "fix_href": "/owner",
        },
    ]


def _has_table(store: CloudStore, name: str) -> bool:
    rows = store._q("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,))
    return bool(rows)
