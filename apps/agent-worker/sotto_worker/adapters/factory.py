"""Builds an LLM adapter for a route. The only place that maps provider names to SDK classes."""

from __future__ import annotations

from collections.abc import Mapping

from sotto_worker.adapters.llm.fake import FakeLLM
from sotto_worker.clock import Clock
from sotto_worker.contracts import LLMAdapter, LLMRequest
from sotto_worker.router import StageRoute

API_KEY_ENV = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY"}


class MissingCredentials(RuntimeError):
    pass


def demo_fake_text(req: LLMRequest) -> str:
    """Offline demo behaviour: objections get a generic coaching line; factual questions the
    playbook does not cover get NO_SAFE_ANSWER, which shows the holding line + escalation (R2)."""
    prompt = (req.messages[-1].content if req.messages else "") + req.system
    if "Kind of turn: objection" in prompt:
        if "in Arabic" in prompt:
            return "ANSWER: أفهمك تماماً. ما الذي يجعل هذا القرار مريحاً لك؟"
        return "ANSWER: I hear you. What would make this feel like the right decision for you?"
    return "NO_SAFE_ANSWER"


def make_llm(route: StageRoute, *, clock: Clock, env: Mapping[str, str]) -> LLMAdapter:
    if route.provider == "fake":
        return FakeLLM(
            clock=clock, model=route.model, text=demo_fake_text, first_token_ms=350, chunk_ms=45
        )
    if route.provider == "anthropic":
        from sotto_worker.adapters.llm.anthropic import AnthropicLLM

        return AnthropicLLM(model=route.model, api_key=_key(route.provider, env))
    if route.provider in ("openai", "openai_compatible"):
        from sotto_worker.adapters.llm.openai import OpenAILLM

        key = (
            _key(route.provider, env)
            if route.provider == "openai"
            else env.get("OPENAI_COMPATIBLE_API_KEY", "unused")
        )
        return OpenAILLM(
            model=route.model, api_key=key, base_url=route.base_url, provider=route.provider
        )
    raise ValueError(f"unknown provider {route.provider!r}")


def _key(provider: str, env: Mapping[str, str]) -> str:
    name = API_KEY_ENV[provider]
    value = env.get(name, "")
    if not value:
        raise MissingCredentials(f"{name} is not set")
    return value


def has_credentials(provider: str, env: Mapping[str, str]) -> bool:
    if provider in ("fake", "openai_compatible"):
        return True
    return bool(env.get(API_KEY_ENV.get(provider, ""), ""))
