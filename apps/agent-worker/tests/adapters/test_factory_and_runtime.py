import pytest

from sotto_worker.adapters.factory import (
    MissingCredentials,
    demo_fake_text,
    has_credentials,
    make_llm,
)
from sotto_worker.adapters.llm.anthropic import AnthropicLLM, _system_blocks
from sotto_worker.adapters.llm.fake import FakeLLM
from sotto_worker.adapters.llm.openai import OpenAILLM
from sotto_worker.clock import FakeClock
from sotto_worker.contracts import LLMRequest, Message
from sotto_worker.router import StageRoute
from sotto_worker.runtime import build_demo_runtime


def test_factory_builds_each_provider() -> None:
    clock = FakeClock()
    env = {"ANTHROPIC_API_KEY": "a", "OPENAI_API_KEY": "o"}
    assert isinstance(make_llm(StageRoute("fake", "f"), clock=clock, env=env), FakeLLM)
    assert isinstance(make_llm(StageRoute("anthropic", "m"), clock=clock, env=env), AnthropicLLM)
    openai = make_llm(StageRoute("openai", "m"), clock=clock, env=env)
    assert isinstance(openai, OpenAILLM)
    assert openai.provider == "openai"
    local = make_llm(
        StageRoute("openai_compatible", "llama", base_url="http://127.0.0.1:11434/v1"),
        clock=clock,
        env={},
    )
    assert isinstance(local, OpenAILLM)
    assert local.provider == "openai_compatible"


def test_factory_refuses_missing_keys_and_unknown_providers() -> None:
    with pytest.raises(MissingCredentials, match="ANTHROPIC_API_KEY"):
        make_llm(StageRoute("anthropic", "m"), clock=FakeClock(), env={})
    with pytest.raises(ValueError, match="unknown provider"):
        make_llm(StageRoute("nope", "m"), clock=FakeClock(), env={})


GROQ = StageRoute(
    "openai_compatible",
    "m",
    base_url="https://api.groq.com/openai/v1",
    api_key_env="GROQ_API_KEY",
)


def test_has_credentials() -> None:
    assert has_credentials(StageRoute("fake", "f"), {})
    assert has_credentials(StageRoute("openai_compatible", "m"), {})
    assert not has_credentials(StageRoute("openai", "m"), {})
    assert has_credentials(StageRoute("openai", "m"), {"OPENAI_API_KEY": "x"})
    assert not has_credentials(GROQ, {})
    assert has_credentials(GROQ, {"GROQ_API_KEY": "g"})


def test_compatible_endpoint_gets_its_platform_key() -> None:
    llm = make_llm(GROQ, clock=FakeClock(), env={"GROQ_API_KEY": "g"})
    assert isinstance(llm, OpenAILLM)
    assert llm.provider == "openai_compatible"
    assert llm._client.api_key == "g"
    with pytest.raises(MissingCredentials, match="GROQ_API_KEY"):
        make_llm(GROQ, clock=FakeClock(), env={})


def test_platform_key_is_only_sent_to_its_own_host() -> None:
    # A company-chosen endpoint (Phase 6) must never receive the platform's provider key.
    env = {"GROQ_API_KEY": "g"}
    hostile = ("https://evil.example/openai/v1", "https://api.groq.com.evil.example/v1", None)
    for base_url in hostile:
        stolen = StageRoute("openai_compatible", "m", base_url=base_url, api_key_env="GROQ_API_KEY")
        with pytest.raises(ValueError, match=r"only be sent to api\.groq\.com,"):
            make_llm(stolen, clock=FakeClock(), env=env)
    plain_http = StageRoute(
        "openai_compatible", "m", base_url="http://api.groq.com/v1", api_key_env="GROQ_API_KEY"
    )
    with pytest.raises(ValueError, match="https"):
        make_llm(plain_http, clock=FakeClock(), env=env)
    unknown = StageRoute(
        "openai_compatible", "m", base_url="https://x.example/v1", api_key_env="SUPABASE_KEY"
    )
    with pytest.raises(ValueError, match="not a known provider key"):
        make_llm(unknown, clock=FakeClock(), env={"SUPABASE_KEY": "s"})


def test_platform_provider_keys_never_follow_a_custom_base_url() -> None:
    env = {"OPENAI_API_KEY": "o", "ANTHROPIC_API_KEY": "a"}
    for provider in ("openai", "anthropic"):
        hostile = StageRoute(provider, "m", base_url="https://attacker.example/v1")
        with pytest.raises(ValueError, match="may only be sent to"):
            make_llm(hostile, clock=FakeClock(), env=env)
    official = StageRoute("openai", "m", base_url="https://api.openai.com/v1")
    assert isinstance(make_llm(official, clock=FakeClock(), env=env), OpenAILLM)


def test_key_host_rejects_userinfo() -> None:
    sneaky = StageRoute(
        "openai_compatible", "m", base_url="https://u@api.groq.com/v1", api_key_env="GROQ_API_KEY"
    )
    with pytest.raises(ValueError, match="user info"):
        make_llm(sneaky, clock=FakeClock(), env={"GROQ_API_KEY": "g"})


def test_endpoint_without_a_key_name_gets_no_secret() -> None:
    llm = make_llm(
        StageRoute("openai_compatible", "m", base_url="https://x.example/v1"),
        clock=FakeClock(),
        env={"GROQ_API_KEY": "g", "OPENAI_COMPATIBLE_API_KEY": "old"},
    )
    assert isinstance(llm, OpenAILLM)
    assert llm._client.api_key == "unused"


def test_demo_fake_answers_objections_and_declines_unknown_facts() -> None:
    def req(kind: str) -> LLMRequest:
        return LLMRequest(
            system="", messages=[Message(role="user", content=f"Kind of turn: {kind}.")]
        )

    assert demo_fake_text(req("objection")).startswith("ANSWER: I hear you")
    arabic = LLMRequest(
        system="",
        messages=[
            Message(role="user", content="Kind of turn: objection. Write the card in Arabic.")
        ],
    )
    assert demo_fake_text(arabic).startswith("ANSWER: أفهمك")
    assert demo_fake_text(req("question")) == "NO_SAFE_ANSWER"


def test_system_blocks_without_cacheable_prefix() -> None:
    assert _system_blocks(LLMRequest(system="", messages=[])) == []
    assert _system_blocks(LLMRequest(system="abc", messages=[], cacheable_prefix="zzz")) == [
        {"type": "text", "text": "abc"}
    ]
    assert _system_blocks(LLMRequest(system="abc", messages=[], cacheable_prefix="abc")) == [
        {"type": "text", "text": "abc", "cache_control": {"type": "ephemeral"}}
    ]


def test_runtime_is_fake_without_keys() -> None:
    rt = build_demo_runtime(FakeClock(), {})
    assert rt.mode == "fake"
    assert rt.router.resolve("suggest", rt.company.routing()).provider == "fake"
    assert any("GROQ_API_KEY" in note for note in rt.notes)


def test_runtime_is_live_with_a_key_and_drops_a_backup_without_one() -> None:
    rt = build_demo_runtime(FakeClock(), {"GROQ_API_KEY": "g"})
    assert rt.mode == "live"
    route = rt.router.resolve("suggest", rt.company.routing())
    assert route.api_key_env == "GROQ_API_KEY"
    assert "suggest_backup" in rt.company.backup_disabled
    assert any("GEMINI_API_KEY" in note for note in rt.notes)

    both = build_demo_runtime(FakeClock(), {"GROQ_API_KEY": "g", "GEMINI_API_KEY": "m"})
    assert "suggest_backup" not in both.company.backup_disabled


def test_default_routing_needs_no_anthropic_key() -> None:
    # The owner does not use Claude (D-016): the seed must run on the free providers alone.
    rt = build_demo_runtime(FakeClock(), {"GROQ_API_KEY": "g", "GEMINI_API_KEY": "m"})
    for stage in ("trigger", "suggest", "suggest_backup", "summary", "judge"):
        route = rt.router.resolve(stage, rt.company.routing())
        assert route.provider != "anthropic", stage
        assert has_credentials(route, {"GROQ_API_KEY": "g", "GEMINI_API_KEY": "m"}), stage


def test_preload_imports_provider_modules_at_start(monkeypatch: pytest.MonkeyPatch) -> None:
    """Importing a provider SDK takes 0.6 to 1.1 s of blocking work. Done lazily inside the first
    live turn it froze the event loop past the t0+1400 holding line (live replay 2026-10-20)."""
    import importlib

    from sotto_worker.adapters import factory
    from sotto_worker.router import RoutingConfig

    imported: list[str] = []
    monkeypatch.setattr(importlib, "import_module", lambda name: imported.append(name))
    config = RoutingConfig(
        stages={
            "suggest": StageRoute("openai_compatible", "m", base_url="https://api.groq.com/v1"),
            "summary": StageRoute("anthropic", "m"),
            "stt": StageRoute("fake", "f"),
        }
    )
    factory.preload_adapters(config)
    assert sorted(imported) == [
        "sotto_worker.adapters.llm.anthropic",
        "sotto_worker.adapters.llm.openai",
    ]


def test_demo_runtime_preloads_its_adapters(monkeypatch: pytest.MonkeyPatch) -> None:
    import sotto_worker.runtime as runtime

    seen: list[set[str]] = []
    monkeypatch.setattr(runtime, "preload_adapters", lambda config: seen.append(set(config.stages)))
    build_demo_runtime(FakeClock(), {"GROQ_API_KEY": "g"})
    assert seen
    assert "suggest" in seen[0]


def test_preload_refuses_a_provider_it_does_not_know() -> None:
    """A new SDK adapter must be registered, or it silently goes back to a lazy in-turn import."""
    from sotto_worker.adapters import factory
    from sotto_worker.router import RoutingConfig

    config = RoutingConfig(stages={"suggest": StageRoute("mistral", "m")})
    with pytest.raises(ValueError, match="mistral"):
        factory.preload_adapters(config)


def test_server_runtimes_share_model_clients_until_the_key_or_model_changes() -> None:
    """T-014: warm HTTPS connections survive from call to call on the server."""
    from sotto_worker.clock import RealClock
    from sotto_worker.contracts import LLMAdapter
    from sotto_worker.runtime import build_demo_runtime

    shared: dict[str, LLMAdapter] = {}
    env = {"GROQ_API_KEY": "gsk-test-not-real", "GEMINI_API_KEY": "g-test-not-real"}
    first = build_demo_runtime(RealClock(), env, adapters=shared)
    second = build_demo_runtime(RealClock(), env, adapters=shared)
    company = first.company.routing()
    assert first.router.adapter_for("suggest", company) is second.router.adapter_for(
        "suggest", company
    )
    rotated = build_demo_runtime(RealClock(), {**env, "GROQ_API_KEY": "gsk-new"}, adapters=shared)
    assert rotated.router.adapter_for("suggest", company) is not first.router.adapter_for(
        "suggest", company
    )
