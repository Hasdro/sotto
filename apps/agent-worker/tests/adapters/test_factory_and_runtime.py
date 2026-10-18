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


def test_has_credentials() -> None:
    assert has_credentials("fake", {})
    assert has_credentials("openai_compatible", {})
    assert not has_credentials("openai", {})
    assert has_credentials("openai", {"OPENAI_API_KEY": "x"})


def test_demo_fake_answers_objections_and_declines_unknown_facts() -> None:
    def req(kind: str) -> LLMRequest:
        return LLMRequest(
            system="", messages=[Message(role="user", content=f"Kind of turn: {kind}.")]
        )

    assert demo_fake_text(req("objection")).startswith("ANSWER:")
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
    assert any("ANTHROPIC_API_KEY" in note for note in rt.notes)


def test_runtime_is_live_with_a_key_and_drops_a_backup_without_one() -> None:
    rt = build_demo_runtime(FakeClock(), {"ANTHROPIC_API_KEY": "a"})
    assert rt.mode == "live"
    assert rt.router.resolve("suggest", rt.company.routing()).provider == "anthropic"
    assert "suggest_backup" in rt.company.backup_disabled

    both = build_demo_runtime(FakeClock(), {"ANTHROPIC_API_KEY": "a", "OPENAI_API_KEY": "o"})
    assert "suggest_backup" not in both.company.backup_disabled
