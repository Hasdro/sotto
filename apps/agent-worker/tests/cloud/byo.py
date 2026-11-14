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
