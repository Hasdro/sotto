"""Owner console backend for Local / Offline Models (L6, D-095, D-096)."""

from __future__ import annotations

from typing import Any

from sotto_worker.cloud.obs import store as obs_store
from sotto_worker.cloud.routing import local_models as lm
from sotto_worker.cloud.store import CloudStore, Principal


def overview(store: CloudStore) -> dict[str, Any]:
    lm.ensure_schema(store)
    companies = store._q("SELECT id, name FROM companies ORDER BY name")
    items = []
    for c in companies:
        cid = str(c["id"])
        pol = lm.get_company_policy(store, cid)
        items.append({"id": cid, "name": str(c["name"]), **pol})
    overrides = [
        dict(r)
        for r in store._q(
            "SELECT company_id, user_id, feature_id, enabled, updated_at"
            " FROM obs_user_overrides WHERE feature_id IN ('local_models_text', 'local_models_voice')"
        )
    ]
    return {"companies": items, "user_overrides": overrides}


def update_company(
    store: CloudStore,
    owner: Principal,
    company_id: str,
    *,
    text_enabled: bool | None = None,
    voice_enabled: bool | None = None,
    allow_cloud_backup: bool | None = None,
    ip: str = "127.0.0.1",
) -> dict[str, Any]:
    return lm.set_company_policy(
        store,
        owner,
        company_id,
        text_enabled=text_enabled,
        voice_enabled=voice_enabled,
        allow_cloud_backup=allow_cloud_backup,
        ip=ip,
    )


def update_user_override(
    store: CloudStore,
    owner: Principal,
    company_id: str,
    user_id: str,
    feature_id: str,
    enabled: bool | None,
    *,
    ip: str = "127.0.0.1",
) -> dict[str, Any]:
    obs_store.set_user_override(store, owner, company_id, user_id, feature_id, enabled, ip=ip)
    return {"ok": True, "company_id": company_id, "user_id": user_id, "feature_id": feature_id, "enabled": enabled}
