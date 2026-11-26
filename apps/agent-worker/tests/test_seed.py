"""Seed data must be well-formed before the router (P2.2) and registry (P2.4) read it."""

import re
from pathlib import Path
from typing import Any

import pytest
import yaml

from tests.conftest import REPO_ROOT

SEED = REPO_ROOT / "seed"
STAGES = {
    "stt",
    "stt_backup",
    "turn",
    "trigger",
    "suggest",
    "suggest_backup",
    "summary",
    "embed",
    "judge",
    "memory_merge",
    "call_state",
    "quality_judge",
    "coach_stt",
    "coach_llm",
    "coach_tts",
}
LIVE_STAGES = {"trigger", "suggest", "suggest_backup"}
SCOPES = {"platform", "company", "team", "campaign"}
VARIABLE = re.compile(r"{{\s*([a-z0-9_.]+)\s*}}")


def _models() -> dict[str, Any]:
    data = yaml.safe_load((SEED / "models" / "default.yaml").read_text())
    assert isinstance(data, dict)
    return data


def test_every_stage_has_a_provider_and_model() -> None:
    stages = _models()["stages"]
    assert set(stages) == STAGES
    for name, cfg in stages.items():
        assert isinstance(cfg["provider"], str), name
        assert cfg["provider"]
        assert isinstance(cfg["model"], str), name
        assert cfg["model"]


def test_live_stages_have_a_first_token_deadline_within_r2() -> None:
    stages = _models()["stages"]
    for name in LIVE_STAGES:
        deadline = stages[name]["first_token_ms"]
        assert isinstance(deadline, int)
        # D-025: measured from the end of speech; must leave room before the holding line (1400 ms).
        assert 0 < deadline <= 1150, f"{name}: the backup must be raced by 1150 ms (D-025)"


def test_backup_is_a_different_provider_host_than_the_primary() -> None:
    # R2: one provider outage must not take out both the primary and the backup.
    stages = _models()["stages"]
    primary, backup = stages["suggest"], stages["suggest_backup"]
    assert (primary["provider"], primary.get("base_url")) != (
        backup["provider"],
        backup.get("base_url"),
    )


def test_compatible_stages_name_their_key_and_use_https() -> None:
    for name, cfg in _models()["stages"].items():
        if cfg["provider"] == "openai_compatible" and cfg.get("api_key_env"):
            assert str(cfg["base_url"]).startswith("https://"), name
            assert re.fullmatch(r"[A-Z][A-Z0-9_]*_API_KEY", cfg["api_key_env"]), name


def _prompt_files() -> list[Path]:
    files = sorted((SEED / "prompts").glob("*.md"))
    files = [f for f in files if f.name != "README.md"]
    assert files, "no seed prompts"
    return files


def _split(path: Path) -> tuple[dict[str, Any], str]:
    text = path.read_text()
    assert text.startswith("---\n"), f"{path.name}: missing front matter"
    _, front, body = text.split("---\n", 2)
    meta = yaml.safe_load(front)
    assert isinstance(meta, dict)
    return meta, body


@pytest.mark.parametrize("path", _prompt_files(), ids=lambda p: p.name)
def test_prompt_front_matter_is_complete(path: Path) -> None:
    meta, body = _split(path)
    assert meta["key"] == path.stem
    assert isinstance(meta["version"], int)
    assert meta["version"] >= 1
    assert meta["scope"] in SCOPES
    assert meta["stage"] in STAGES
    assert meta["description"]
    assert body.strip()


@pytest.mark.parametrize("path", _prompt_files(), ids=lambda p: p.name)
def test_prompt_uses_exactly_the_declared_variables(path: Path) -> None:
    meta, body = _split(path)
    assert set(VARIABLE.findall(body)) == set(meta["variables"])


# --- W4-COST and ZC-12 seed tables ---------------------------------------------------------------
def test_every_price_cites_a_source_and_a_date() -> None:
    from sotto_worker.cloud.metering.prices import PriceTable

    table = PriceTable.load()
    assert table.prices, "seed/models/prices.yaml lists no prices"
    for p in table.prices.values():
        assert p.source.startswith("https://"), p
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", p.checked), p
        assert p.confidence in ("vendor", "aggregator", "upper_bound"), p
        assert (
            (p.usd > 0)
            if p.unit in ("per_hour", "per_1k_chars")
            else (p.in_usd > 0 and p.out_usd > 0)
        ), p


def test_default_routes_have_a_price() -> None:
    from sotto_worker.cloud.metering.prices import PriceTable
    from sotto_worker.server.catalog import Catalog

    table = PriceTable.load()
    catalog = Catalog.load(SEED / "models" / "providers.yaml")
    from sotto_worker.router import RoutingConfig

    config = RoutingConfig.load(SEED / "models" / "default.yaml")
    for stage in ("stt", "stt_backup", "suggest", "suggest_backup", "summary"):
        assert table.for_route(catalog, config.stages[stage]) is not None, stage


def test_tenant_auth_research_covers_every_catalogue_vendor() -> None:
    providers = yaml.safe_load((SEED / "models" / "providers.yaml").read_text())["providers"]
    research = yaml.safe_load((SEED / "models" / "tenant-auth.yaml").read_text())["vendors"]
    assert set(research) == set(providers)
    for vendor, row in research.items():
        assert row["mode"] in ("short_token", "sub_key", "console_only", "none"), vendor
        assert row["source"].startswith("https://"), vendor
