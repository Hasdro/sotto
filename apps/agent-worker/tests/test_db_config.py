"""P6.1: per-call config from Supabase (PostgREST) with the worker JWT; RLS does the scoping."""

import json

import httpx
import pytest

from sotto_worker.clock import FakeClock
from sotto_worker.config.db import CompanyConfig, SupabaseRest, load_company_config
from sotto_worker.prompts import PromptContext, PromptRegistry
from sotto_worker.router import ModelRouter, RoutingConfig
from tests.conftest import REPO_ROOT

COMPANY = "aaaaaaaa-0000-4000-8000-000000000000"
ROWS = {
    "model_routes": [
        {
            "stage": "suggest",
            "provider": "openai_compatible",
            "model": "llama-local",
            "base_url": "http://10.0.0.5:8000/v1",
            "settings": {"max_tokens": 90},
            "backup_allowed": False,
        },
    ],
    "prompt_versions": [
        {
            "key": "suggest",
            "version": 3,
            "scope": "company",
            "scope_id": None,
            "stage": "suggest",
            "variables": ["turn.text"],
            "body": "Company prompt: {{turn.text}}",
            "status": "published",
        },
    ],
    "playbook_entries": [
        {
            "id": "11111111-0000-4000-8000-000000000000",
            "kind": "faq",
            "question": "Is there parking?",
            "short_answer": "Yes, one space.",
            "details": "",
            "follow_up": "",
            "tags": ["parking"],
        },
    ],
}


def _client(seen: list[httpx.Request], status: int = 200) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        table = request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(
            status, json=ROWS.get(table, []) if status == 200 else {"message": "denied"}
        )

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_loads_routes_prompts_and_playbook_with_the_worker_jwt() -> None:
    seen: list[httpx.Request] = []
    rest = SupabaseRest(
        url="https://proj.supabase.co", anon_key="anon", jwt="worker.jwt", client=_client(seen)
    )
    config = await load_company_config(rest, COMPANY, deployment="local")
    assert isinstance(config, CompanyConfig)
    assert {r.headers["Authorization"] for r in seen} == {"Bearer worker.jwt"}
    assert {r.headers["apikey"] for r in seen} == {"anon"}
    assert all(r.url.params["company_id"] == f"eq.{COMPANY}" for r in seen)
    route = config.routing.overrides["suggest"]
    assert (route.provider, route.model, route.base_url) == (
        "openai_compatible",
        "llama-local",
        "http://10.0.0.5:8000/v1",
    )
    assert "suggest_backup" in config.routing.backup_disabled
    assert config.playbook.lookup("is there parking") is not None


async def test_company_prompt_overrides_the_platform_seed() -> None:
    rest = SupabaseRest(
        url="https://proj.supabase.co", anon_key="anon", jwt="j", client=_client([])
    )
    config = await load_company_config(rest, COMPANY)
    registry = PromptRegistry.from_seed(REPO_ROOT / "seed" / "prompts")
    config.apply_prompts(registry)
    assert (
        registry.get("suggest", PromptContext(company_id=COMPANY)).body
        == "Company prompt: {{turn.text}}"
    )
    assert registry.get("suggest", PromptContext(company_id="other")).scope == "platform"


async def test_router_uses_the_db_override_for_the_next_call() -> None:
    rest = SupabaseRest(
        url="https://proj.supabase.co", anon_key="anon", jwt="j", client=_client([])
    )
    config = await load_company_config(rest, COMPANY, deployment="local")
    base = RoutingConfig.load(REPO_ROOT / "seed" / "models" / "default.yaml")
    router = ModelRouter(base, lambda r: pytest.fail("not built"), FakeClock())
    assert router.resolve("suggest", config.routing).model == "llama-local"
    assert router.resolve("summary", config.routing).provider == "anthropic"  # platform default


async def test_http_errors_raise() -> None:
    rest = SupabaseRest(
        url="https://proj.supabase.co", anon_key="anon", jwt="j", client=_client([], status=401)
    )
    with pytest.raises(httpx.HTTPStatusError):
        await load_company_config(rest, COMPANY)


def test_rows_round_trip_as_json() -> None:
    assert json.loads(json.dumps(ROWS))["model_routes"][0]["stage"] == "suggest"


async def test_cloud_drops_a_private_company_endpoint_and_keeps_the_platform_default() -> None:
    rest = SupabaseRest(
        url="https://proj.supabase.co", anon_key="anon", jwt="j", client=_client([])
    )
    config = await load_company_config(rest, COMPANY, deployment="cloud", resolve=lambda _h: [])
    assert "suggest" not in config.routing.overrides
    assert config.rejected
    assert "suggest" in config.rejected[0]
