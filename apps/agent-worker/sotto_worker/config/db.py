"""Per-call company config from Supabase (P6.1, R6: change models and prompts without a deploy).

The worker authenticates with its per-call JWT (D-012), so RLS limits every read to its company;
the explicit `company_id` filter is defence in depth. PostgREST docs:
https://supabase.com/docs/guides/api (`/rest/v1/<table>?select=*&company_id=eq.<id>`).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, cast

import httpx

from sotto_worker.config.endpoints import (
    Deployment,
    EndpointRejected,
    check_endpoint,
    system_resolve,
)
from sotto_worker.playbook import PlaybookEntry, PlaybookIndex
from sotto_worker.prompts import PromptRegistry, PromptVersion
from sotto_worker.router import CompanyRouting, StageRoute
from sotto_worker.router.config import BACKUP_STAGE

DB_TIMEOUT_S = 2.0  # ENGINEERING §6
PLATFORM_KEYED_PROVIDERS = frozenset({"anthropic", "openai"})


class SupabaseRest:
    def __init__(
        self, *, url: str, anon_key: str, jwt: str, client: httpx.AsyncClient | None = None
    ) -> None:
        self._base = url.rstrip("/") + "/rest/v1"
        self._headers = {"apikey": anon_key, "Authorization": f"Bearer {jwt}"}
        self._client = client or httpx.AsyncClient(timeout=DB_TIMEOUT_S)

    async def select(self, table: str, company_id: str, **filters: str) -> list[dict[str, Any]]:
        params = {"select": "*", "company_id": f"eq.{company_id}", **filters}
        response = await self._client.get(
            f"{self._base}/{table}", params=params, headers=self._headers
        )
        response.raise_for_status()
        return cast(list[dict[str, Any]], response.json())


@dataclass(frozen=True)
class CompanyConfig:
    routing: CompanyRouting
    prompts: tuple[PromptVersion, ...]
    playbook: PlaybookIndex
    # Overrides dropped at load time (e.g. an unsafe endpoint); the platform default serves them.
    rejected: tuple[str, ...] = ()

    def apply_prompts(self, registry: PromptRegistry) -> None:
        for prompt in self.prompts:
            registry.add(prompt, publish=True)


async def load_company_config(
    rest: SupabaseRest,
    company_id: str,
    *,
    deployment: Deployment = "cloud",
    resolve: Callable[[str], list[str]] = system_resolve,
) -> CompanyConfig:
    routes = await rest.select("model_routes", company_id)
    prompts = await rest.select("prompt_versions", company_id, status="eq.published")
    entries = await rest.select("playbook_entries", company_id)

    overrides: dict[str, StageRoute] = {}
    backup_disabled: set[str] = set()
    rejected: list[str] = []
    for row in routes:
        if row["provider"] in PLATFORM_KEYED_PROVIDERS:
            # These adapters use the platform's own key; a company brings its own endpoint and key
            # through openai_compatible instead (company secrets: Phase 6, D-016).
            rejected.append(f"{row['stage']}: provider {row['provider']!r} needs a company key")
            continue
        if row.get("base_url"):
            try:
                check_endpoint(row["base_url"], deployment=deployment, resolve=resolve)
            except EndpointRejected as err:
                rejected.append(f"{row['stage']}: {err}")
                continue
        overrides[row["stage"]] = StageRoute(
            provider=row["provider"],
            model=row["model"],
            base_url=row.get("base_url"),
            settings=dict(row.get("settings") or {}),
        )
        backup = BACKUP_STAGE.get(row["stage"])
        if backup is not None and row.get("backup_allowed") is False:
            backup_disabled.add(backup)

    versions = tuple(
        PromptVersion(
            key=row["key"],
            version=int(row["version"]),
            scope=row["scope"],
            scope_id=company_id if row["scope"] == "company" else row.get("scope_id"),
            stage=row["stage"],
            variables=tuple(row.get("variables") or ()),
            body=row["body"],
        )
        for row in sorted(prompts, key=lambda r: int(r["version"]))
    )
    playbook = PlaybookIndex(
        [
            PlaybookEntry(
                id=str(row["id"]),
                kind=row["kind"],
                question=row["question"],
                short_answer=row["short_answer"],
                details=row.get("details") or "",
                follow_up=row.get("follow_up") or "",
                tags=tuple(row.get("tags") or ()),
            )
            for row in entries
        ]
    )
    routing = CompanyRouting(
        company_id=company_id, overrides=overrides, backup_disabled=backup_disabled
    )
    return CompanyConfig(
        routing=routing, prompts=versions, playbook=playbook, rejected=tuple(rejected)
    )
