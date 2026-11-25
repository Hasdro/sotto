"""Owner console backend for Call Logs to GitHub (L3, L4, D-095, D-098)."""

from __future__ import annotations

from typing import Any

from sotto_worker.cloud.obs import store as obs_store
from sotto_worker.cloud.store import CloudStore, Principal


def logs_overview(store: CloudStore) -> dict[str, Any]:
    """Summary for owner console Logs panel: repo configured, company switches, user overrides."""
    obs_store.ensure_schema(store)
    cfg = obs_store.get_logs_repo(store)
    companies = store._q("SELECT id, name FROM companies ORDER BY name")
    switches = {
        str(r["company_id"]): bool(r["call_logs_enabled"])
        for r in store._q("SELECT company_id, call_logs_enabled FROM obs_company_switches")
    }
    overrides = [
        dict(r)
        for r in store._q(
            "SELECT company_id, user_id, feature_id, enabled, updated_at"
            " FROM obs_user_overrides WHERE feature_id = 'call_logs_github'"
        )
    ]
    return {
        "repo": cfg[0] if cfg else None,
        "configured": cfg is not None,
        "companies": [
            {
                "id": str(c["id"]),
                "name": str(c["name"]),
                "enabled": switches.get(str(c["id"]), False),
            }
            for c in companies
        ],
        "user_overrides": overrides,
    }


def save_repo(
    store: CloudStore, owner: Principal, repo: str, token: str, *, ip: str
) -> dict[str, Any]:
    obs_store.set_logs_repo(store, owner, repo, token, ip=ip)
    return {"ok": True, "repo": repo.strip()}


def toggle_company(
    store: CloudStore, owner: Principal, company_id: str, enabled: bool, *, ip: str
) -> dict[str, Any]:
    obs_store.set_company_call_logs(store, owner, company_id, enabled, ip=ip)
    return {"ok": True, "company_id": company_id, "enabled": enabled}


def toggle_user(
    store: CloudStore,
    owner: Principal,
    company_id: str,
    user_id: str,
    enabled: bool | None,
    *,
    ip: str,
) -> dict[str, Any]:
    obs_store.set_user_override(
        store, owner, company_id, user_id, "call_logs_github", enabled, ip=ip
    )
    return {"ok": True, "company_id": company_id, "user_id": user_id, "enabled": enabled}
