"""The provider catalogue (seed/models/providers.yaml) and how a panel choice becomes a route."""

from __future__ import annotations

import dataclasses
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, cast
from urllib.parse import urlsplit

import yaml

from sotto_worker.router import RoutingConfig, StageRoute

Kind = Literal["llm", "stt"]


@dataclass(frozen=True)
class ModelInfo:
    """One model in a provider's catalogue (OpenCode §2): the ID is immutable, the display
    name is editable, and `enabled` is the selection mechanism — only enabled models are
    offered by any picker. Built-ins list bare IDs, which become enabled ModelInfos."""

    id: str
    display_name: str
    enabled: bool = True


@dataclass(frozen=True)
class Provider:
    id: str
    name: str
    kind: Kind
    key_env: str
    key_page: str
    free: str
    steps: str
    route: dict[str, Any]
    models: tuple[str, ...] = ()
    test_url: str | None = None  # LLM vendors without an OpenAI-compatible base_url
    custom: bool = False  # an endpoint the owner added in the panel (Ollama, vLLM, …)
    client: bool = True  # the apps' own engine can run it (D-022 calls run on the device)
    # OpenCode §2 (D-081): how a custom provider is called. Built-ins keep the defaults
    # (chat-completions over Bearer); only chat-completions/Bearer is wired to an adapter
    # this round — other formats/auth modes are stored, not wired.
    format: str = "chat-completions"
    auth_mode: str = "bearer"
    auth_header: str | None = None
    models_detailed: tuple[ModelInfo, ...] = ()

    def __post_init__(self) -> None:
        if not self.models_detailed and self.models:
            object.__setattr__(
                self,
                "models_detailed",
                tuple(ModelInfo(id=m, display_name=m) for m in self.models),
            )

    def enabled_models(self) -> tuple[str, ...]:
        """The model IDs a picker may offer (OpenCode §7: enabled only)."""
        return tuple(m.id for m in self.models_detailed if m.enabled)

    def model_available(self, model: str) -> bool:
        """True when `model` may run on this provider (D-081): a listed model must be
        enabled (seed override or custom list); an unlisted model is free-form on a
        built-in (the vendor is the authority) but unknown on a custom provider."""
        known = {m.id: m.enabled for m in self.models_detailed}
        if model in known:
            return known[model]
        return not self.custom

    def models_url(self) -> str | None:
        """Where "Test" lists models: the vendor's own models endpoint (LLM vendors only)."""
        if self.test_url:
            return self.test_url
        base = self.route.get("base_url")
        return f"{str(base).rstrip('/')}/models" if base else None


@dataclass(frozen=True)
class StageSlot:
    id: str
    kind: Kind
    label: str


@dataclass(frozen=True)
class Catalog:
    providers: dict[str, Provider]
    stages: dict[str, StageSlot]
    key_envs: frozenset[str] = field(default_factory=frozenset)
    local_providers: dict[str, dict[str, Any]] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path) -> Catalog:
        raw = cast(dict[str, Any], yaml.safe_load(path.read_text(encoding="utf-8")))
        providers = {
            pid: Provider(
                id=pid,
                name=str(p["name"]),
                kind=p["kind"],
                key_env=str(p["key_env"]),
                key_page=str(p["key_page"]),
                free=str(p.get("free", "")),
                steps=str(p.get("steps", "")),
                route=dict(p["route"]),
                models=tuple(p.get("models") or ()),
                test_url=p.get("test_url"),
                client=bool(p.get("client", True)),
            )
            for pid, p in cast(dict[str, dict[str, Any]], raw["providers"]).items()
        }
        stages = {
            sid: StageSlot(id=sid, kind=s["kind"], label=str(s["label"]))
            for sid, s in cast(dict[str, dict[str, Any]], raw["stages"]).items()
        }
        local_raw = cast(dict[str, dict[str, Any]], raw.get("local_providers") or {})
        local_providers = {
            pid: {
                "id": pid,
                "name": str(p.get("name", pid)),
                "kind": str(p.get("kind", "llm")),
                "route": dict(p.get("route") or {}),
                "steps": str(p.get("steps", "")),
            }
            for pid, p in local_raw.items()
        }
        for p in providers.values():
            for url in (p.key_page, p.models_url() or "https://"):
                if not url.startswith("https://"):
                    raise ValueError(f"{p.id}: {url} must be https")
        return cls(
            providers,
            stages,
            frozenset(p.key_env for p in providers.values()),
            local_providers,
        )

    def with_endpoints(self, endpoints: list[dict[str, Any]]) -> Catalog:
        """This catalogue plus the owner's own OpenAI-compatible endpoints (P6.4)."""
        extra = {
            e["id"]: Provider(
                id=e["id"],
                name=str(e["name"]),
                kind="llm",
                key_env=endpoint_key_env(e["id"]),
                key_page="",
                free="",
                steps="",
                route={
                    "provider": "openai_compatible",
                    "base_url": e["base_url"],
                    **({"api_key_env": endpoint_key_env(e["id"])} if e.get("has_key") else {}),
                },
                models=tuple(e.get("models") or ()),
                custom=True,
            )
            for e in endpoints
        }
        return dataclasses.replace(
            self,
            providers={**self.providers, **extra},
            key_envs=self.key_envs | {p.key_env for p in extra.values()},
        )

    def with_custom_providers(self, rows: list[dict[str, Any]]) -> Catalog:
        """This catalogue plus one company's DB custom providers (D-084, OpenCode §2/§5):
        each row is a `custom_providers` record as returned by
        `cloud.owner.platform.custom_providers` — id, name, kind, base_url, format,
        auth_mode, auth_header, models (a list of {id, display_name, enabled} dicts),
        has_key. The endpoint is resolved from the stored record (D-082): the client
        never supplies a base_url. A row whose id collides with a built-in is skipped
        (built-ins win); a row with an unknown kind is skipped."""
        extra: dict[str, Provider] = {}
        for row in rows:
            pid = str(row["id"])
            if pid in self.providers or pid in extra:
                continue
            kind = str(row.get("kind") or "llm")
            if kind not in ("llm", "stt"):
                continue
            detailed = tuple(
                ModelInfo(
                    id=str(m.get("id", "")),
                    display_name=str(m.get("display_name") or m.get("id", "")),
                    enabled=bool(m.get("enabled", True)),
                )
                for m in (row.get("models") or [])
                if isinstance(m, dict) and str(m.get("id", "")).strip()
            )
            key_env = endpoint_key_env(pid)
            extra[pid] = Provider(
                id=pid,
                name=str(row.get("name") or pid),
                kind=cast(Kind, kind),  # the guard above narrowed it to llm|stt
                key_env=key_env,
                key_page="",
                free="",
                steps="",
                route={
                    "provider": "openai_compatible",
                    "base_url": str(row["base_url"]),
                    **({"api_key_env": key_env} if row.get("has_key") else {}),
                },
                models=tuple(m.id for m in detailed),
                models_detailed=detailed,
                format=str(row.get("format") or "chat-completions"),
                auth_mode=str(row.get("auth_mode") or "bearer"),
                auth_header=str(row["auth_header"]) if row.get("auth_header") else None,
                custom=True,
            )
        if not extra:
            return self
        return dataclasses.replace(
            self,
            providers={**self.providers, **extra},
            key_envs=self.key_envs | {p.key_env for p in extra.values()},
        )

    def with_model_overrides(self, overrides: dict[tuple[str, str], bool]) -> Catalog:
        """This catalogue with platform-level per-model enablement applied (D-081): a
        seed model the owner disabled shows disabled in every picker and cannot be set
        on a stage. An override naming a model the provider does not list is ignored
        (nothing to toggle). Custom providers are untouched — they carry their own
        per-model flags in models_json."""
        if not overrides:
            return self
        providers: dict[str, Provider] = {}
        changed = False
        for pid, p in self.providers.items():
            detailed = tuple(
                dataclasses.replace(m, enabled=overrides.get((pid, m.id), m.enabled))
                for m in p.models_detailed
            )
            if detailed != p.models_detailed:
                changed = True
                providers[pid] = dataclasses.replace(p, models_detailed=detailed)
            else:
                providers[pid] = p
        if not changed:
            return self
        return dataclasses.replace(self, providers=providers)

    def provider_for_route(self, route: StageRoute) -> str | None:
        """Which catalogue vendor a route uses (None: fake, local or custom endpoint)."""
        for p in self.providers.values():
            if p.route.get("provider") != route.provider:
                continue
            if route.provider == "openai_compatible" and p.route.get("api_key_env") != (
                route.api_key_env
            ):
                continue
            return p.id
        return None

    def route_for(
        self,
        stage: str,
        provider_id: str,
        model: str,
        base: StageRoute | None,
        *,
        require_enabled: bool = False,
    ) -> StageRoute:
        """The route a stage gets when the owner picks `provider_id` + `model` in the panel.
        Stage limits (first-token deadline, max_tokens, temperature) stay from the seed route.
        Built-in models are free-form strings (the vendor is the authority — OpenRouter /
        OpenAI / Anthropic list none). For a custom provider, `require_enabled` (the panel
        set path) insists the model is in that provider's ENABLED list; the bundle path
        leaves it off, so disabling a model never breaks a live call — the console flags
        the stage unavailable and the owner re-picks (D-081)."""
        slot = self.stages.get(stage)
        provider = self.providers.get(provider_id)
        if slot is None:
            raise ValueError(f"stage {stage!r} cannot be set from the panel")
        if provider is None:
            raise ValueError(f"unknown provider {provider_id!r}")
        if provider.kind != slot.kind:
            raise ValueError(f"{provider.name} cannot serve {slot.label} ({slot.kind} stage)")
        model = model.strip()
        if not model or len(model) > 200 or any(c.isspace() for c in model):
            raise ValueError("model must be a non-empty ID without spaces")
        if require_enabled:
            # A listed model must be enabled (seed override or custom list); an
            # unlisted model is free-form on a built-in but unknown on a custom.
            known = {m.id: m.enabled for m in provider.models_detailed}
            if (model in known and not known[model]) or (provider.custom and model not in known):
                raise ValueError(f"{model!r} is not an enabled model of {provider.name}")
        template = provider.route
        stage_settings = {
            k: v
            for k, v in (base.settings if base else {}).items()
            if k in ("max_tokens", "temperature")
        }
        return StageRoute(
            provider=str(template["provider"]),
            model=model,
            first_token_ms=base.first_token_ms if base else None,
            settings={**dict(template.get("settings") or {}), **stage_settings},
            base_url=template.get("base_url"),
            api_key_env=template.get("api_key_env"),
        )


def endpoint_key_env(endpoint_id: str) -> str:
    """The vault name of a custom endpoint's key, e.g. custom-ollama → ENDPOINT_CUSTOMOLLAMA_KEY."""
    return "ENDPOINT_" + re.sub(r"[^A-Z0-9]", "", endpoint_id.upper()) + "_KEY"


def apply_overrides(
    config: RoutingConfig, catalog: Catalog, overrides: dict[str, tuple[str, str]]
) -> RoutingConfig:
    """Seed routing plus the panel's per-stage choices {stage: (provider_id, model)}."""
    stages = dict(config.stages)
    for stage, (provider_id, model) in overrides.items():
        stages[stage] = catalog.route_for(stage, provider_id, model, config.stages.get(stage))
    return dataclasses.replace(config, stages=stages)


def endpoint_env(endpoints: list[dict[str, Any]]) -> dict[str, str]:
    """`<key name>_HOST` for each endpoint with a key: the one host its key may go to (D-016)."""
    return {
        f"{endpoint_key_env(e['id'])}_HOST": str(urlsplit(e["base_url"]).hostname or "")
        for e in endpoints
        if e.get("has_key")
    }


BLOCKED_HOSTS = ("169.254.", "metadata.google.internal", "metadata", "fd00:ec2::254")


def check_endpoint_url(base_url: str, *, has_key: bool) -> str:
    """An owner-added endpoint: http(s) only, no user info, never a cloud metadata address;
    a key only travels over https."""
    url = base_url.strip().rstrip("/")
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("the address must start with http:// or https://")
    if parts.username is not None or parts.password is not None:
        raise ValueError("put the key in the key field, not in the address")
    host = parts.hostname.lower()
    if host.startswith(BLOCKED_HOSTS) or host.startswith("fe80:"):
        raise ValueError("that address is not allowed")
    if has_key and parts.scheme != "https":
        raise ValueError("a key is only sent over https; use an https address or no key")
    return url
