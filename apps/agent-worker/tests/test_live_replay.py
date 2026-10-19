"""P2.3 live smoke test: model-ID check against each provider's /models list, and the live replay
(real clock) — exercised here with mocked HTTP and fake models, so no keys or network."""

from __future__ import annotations

import time

import httpx
import pytest

from replay.live import ModelCheck, check_model_ids, replay_live
from sotto_worker.adapters.factory import platform_key
from sotto_worker.router import RoutingConfig, StageRoute
from sotto_worker.scenarios import Scenario, ScriptLine

GROQ = "https://api.groq.com/openai/v1"
GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai/"


def _route(model: str, base_url: str, key: str | None) -> StageRoute:
    return StageRoute(provider="openai_compatible", model=model, base_url=base_url, api_key_env=key)


CONFIG = RoutingConfig(
    stages={
        "stt": StageRoute(provider="fake", model="fake-stt"),
        "suggest": _route("openai/gpt-oss-20b", GROQ, "GROQ_API_KEY"),
        "summary": _route("openai/gpt-oss-120b", GROQ, "GROQ_API_KEY"),
        "suggest_backup": _route("gemini-2.5-flash", GEMINI, "GEMINI_API_KEY"),
        "judge": _route("gemini-9-ultra", GEMINI, "GEMINI_API_KEY"),
    }
)


class ModelsServer:
    """Serves GET {base}/models like Groq (plain ids) and Gemini ("models/…" ids)."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.url.host == "api.groq.com":
            ids = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]
        else:
            ids = ["models/gemini-2.5-flash", "models/gemini-2.5-pro"]
        return httpx.Response(200, json={"object": "list", "data": [{"id": i} for i in ids]})


def test_platform_key_is_bound_to_its_host() -> None:
    env = {"GROQ_API_KEY": "gk"}
    assert platform_key(_route("m", GROQ, "GROQ_API_KEY"), env) == "gk"
    assert platform_key(_route("m", "http://localhost:11434/v1", None), env) is None
    with pytest.raises(ValueError, match=r"may only be sent to api\.groq\.com"):
        platform_key(_route("m", "https://evil.example/v1", "GROQ_API_KEY"), env)


async def test_model_check_reports_ok_missing_and_no_key() -> None:
    server = ModelsServer()
    async with httpx.AsyncClient(transport=httpx.MockTransport(server)) as client:
        results = await check_model_ids(
            CONFIG, {"GROQ_API_KEY": "gk", "GEMINI_API_KEY": "mk"}, client
        )
    by_stage = {r.stage: r for r in results}
    assert "stt" not in by_stage  # only openai_compatible routes are listed
    assert by_stage["suggest"].status == "ok"
    assert by_stage["summary"].status == "ok"
    assert by_stage["suggest_backup"].status == "ok"  # "models/" prefix is ignored
    assert by_stage["judge"].status == "missing"
    # one request per provider, each with its own key, each only to its own host
    assert len(server.requests) == 2
    auth = {r.url.host: r.headers["authorization"] for r in server.requests}
    assert auth == {"api.groq.com": "Bearer gk", "generativelanguage.googleapis.com": "Bearer mk"}


async def test_model_check_without_key_sends_nothing() -> None:
    server = ModelsServer()
    async with httpx.AsyncClient(transport=httpx.MockTransport(server)) as client:
        results = await check_model_ids(CONFIG, {"GROQ_API_KEY": "gk"}, client)
    assert {r.stage: r.status for r in results}["suggest_backup"] == "no key"
    assert all(r.url.host == "api.groq.com" for r in server.requests)


async def test_model_check_reports_http_errors() -> None:
    def deny(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": {"message": "bad key"}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(deny)) as client:
        results = await check_model_ids(CONFIG, {"GROQ_API_KEY": "gk"}, client)
    suggest = next(r for r in results if r.stage == "suggest")
    assert suggest == ModelCheck(
        stage="suggest", model="openai/gpt-oss-20b", host="api.groq.com", status="HTTP 401"
    )


async def test_live_replay_runs_the_real_pipeline_on_a_real_clock() -> None:
    scenario = Scenario(
        id="mini",
        title="mini",
        language="en",
        lines=(
            ScriptLine(
                "customer", "And can I see the show apartment this weekend?", 0, 0, "playbook"
            ),
            ScriptLine("agent", "Sure, Saturday works.", 0, 0, "no_card"),
        ),
    )
    started = time.monotonic()
    report = await replay_live([scenario], env={}, final_after_t0_ms=50, force_fake=True)
    assert time.monotonic() - started < 5
    assert report.cards == 1
    assert report.agent_triggered == 0
    assert report.unmet_expectations == []
    assert report.summary.p95_ms < 1500


def test_live_cli_refuses_without_the_primary_key(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from replay.__main__ import main

    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    assert main(["--live"]) == 1
    assert "GROQ_API_KEY is not set" in capsys.readouterr().out
