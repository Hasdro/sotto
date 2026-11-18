"""D-059: companies change keys, models and prompts only when AGN allows BYO. Tests of those
company routes switch it on first, the way the owner console does."""

from __future__ import annotations

from typing import Any

from sotto_worker.cloud.store import CloudStore


def allow_byo(store: CloudStore, session: dict[str, Any]) -> None:
    with store._tx() as db:
        db.execute(
            "INSERT OR IGNORE INTO company_byo(company_id, enabled_at) VALUES (?, 1)",
            (session["company"]["id"],),
        )


def _admin(store: CloudStore, session: dict[str, Any]) -> Any:
    from sotto_worker.cloud.store import Principal

    cid = session["company"]["id"]
    row = store._q(
        "SELECT id, email, name FROM users WHERE company_id = ? AND role = 'admin'", (cid,)
    )[0]
    return Principal(row["id"], cid, "admin", None, row["email"], row["name"])


def own_key(store: CloudStore, session: dict[str, Any], env: str, value: str) -> None:
    """D-078 removed the company key routes; a company's own key now exists only when the
    store holds one (legacy rows, owner tooling). Set it at the store, as the old route did."""
    allow_byo(store, session)
    store.set_key(_admin(store, session), env, value)


def own_route(owner: Any, session: dict[str, Any], stage: str, provider: str, model: str) -> Any:
    """The vendor sets a company's model route in the owner console (D-078/D-079)."""
    cid = session["company"]["id"]
    return owner.put(
        f"/api/owner/companies/{cid}/routes/{stage}",
        json={"provider": provider, "model": model},
        headers={"origin": "https://cloud.example.com", "content-type": "application/json"},
    )
