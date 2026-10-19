"""Builds an LLM adapter for a route. The only place that maps provider names to SDK classes."""

from __future__ import annotations

import importlib
from collections.abc import Mapping
from urllib.parse import urlsplit

from sotto_worker.adapters.llm.fake import FakeLLM
from sotto_worker.clock import Clock
from sotto_worker.contracts import LLMAdapter, LLMRequest
from sotto_worker.router import RoutingConfig, StageRoute

API_KEY_ENV = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY"}
PROVIDER_HOSTS = {"anthropic": "api.anthropic.com", "openai": "api.openai.com"}
# Platform keys for OpenAI-compatible providers, each bound to the one host it may be sent to,
# so a company-chosen endpoint (Phase 6) can never receive a platform key (D-016).
COMPATIBLE_KEY_HOSTS = {
    "GROQ_API_KEY": "api.groq.com",
    "GEMINI_API_KEY": "generativelanguage.googleapis.com",
    "OPENROUTER_API_KEY": "openrouter.ai",
}


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


# Provider name -> adapter module. Imported lazily by make_llm, so a process only pays for the
# SDKs it uses; preload_adapters moves that import to process start.
ADAPTER_MODULES = {
    "anthropic": "sotto_worker.adapters.llm.anthropic",
    "openai": "sotto_worker.adapters.llm.openai",
    "openai_compatible": "sotto_worker.adapters.llm.openai",
}


def preload_adapters(config: RoutingConfig) -> None:
    """Import every provider SDK the config uses, at process start. An SDK import blocks for
    0.6 to 1.1 s; inside a live turn that freezes the event loop past the t0+1400 holding
    line (R2)."""
    for module in sorted(
        {
            ADAPTER_MODULES[r.provider]
            for r in config.stages.values()
            if r.provider in ADAPTER_MODULES
        }
    ):
        importlib.import_module(module)


def make_llm(route: StageRoute, *, clock: Clock, env: Mapping[str, str]) -> LLMAdapter:
    if route.provider == "fake":
        return FakeLLM(
            clock=clock, model=route.model, text=demo_fake_text, first_token_ms=350, chunk_ms=45
        )
    if route.provider == "anthropic":
        from sotto_worker.adapters.llm.anthropic import AnthropicLLM

        if route.base_url:
            _check_host(API_KEY_ENV["anthropic"], PROVIDER_HOSTS["anthropic"], route.base_url)
        return AnthropicLLM(model=route.model, api_key=_key(API_KEY_ENV["anthropic"], env))
    if route.provider in ("openai", "openai_compatible"):
        from sotto_worker.adapters.llm.openai import OpenAILLM

        if route.provider == "openai":
            if route.base_url:
                _check_host(API_KEY_ENV["openai"], PROVIDER_HOSTS["openai"], route.base_url)
            key = _key(API_KEY_ENV["openai"], env)
        else:
            # None: local or self-hosted endpoint without auth (Ollama, vLLM, …)
            key = platform_key(route, env) or "unused"
        return OpenAILLM(
            model=route.model, api_key=key, base_url=route.base_url, provider=route.provider
        )
    raise ValueError(f"unknown provider {route.provider!r}")


def key_env(route: StageRoute) -> str | None:
    """The env var a route needs, or None when it needs no secret."""
    if route.provider == "openai_compatible":
        return route.api_key_env
    return API_KEY_ENV.get(route.provider)


def platform_key(route: StageRoute, env: Mapping[str, str]) -> str | None:
    """The platform key for an openai_compatible route, after checking that the route points at
    the one host that key may be sent to (D-016). None when the route names no key."""
    if not route.api_key_env:
        return None
    _check_key_host(route.api_key_env, route.base_url)
    return _key(route.api_key_env, env)


def has_credentials(route: StageRoute, env: Mapping[str, str]) -> bool:
    name = key_env(route)
    return name is None or bool(env.get(name, ""))


def _check_key_host(name: str, base_url: str | None) -> None:
    host = COMPATIBLE_KEY_HOSTS.get(name)
    if host is None:
        raise ValueError(f"{name} is not a known provider key; add it to COMPATIBLE_KEY_HOSTS")
    _check_host(name, host, base_url)


def _check_host(name: str, host: str, base_url: str | None) -> None:
    parts = urlsplit(base_url or "")
    if parts.username is not None or parts.password is not None:
        raise ValueError(f"{name}: base_url must not carry user info")
    if parts.hostname != host:
        raise ValueError(f"{name} may only be sent to {host}, not {parts.hostname or 'no host'}")
    if parts.scheme != "https":
        raise ValueError(f"{name} may only be sent over https")


def _key(name: str, env: Mapping[str, str]) -> str:
    value = env.get(name, "")
    if not value:
        raise MissingCredentials(f"{name} is not set")
    return value
