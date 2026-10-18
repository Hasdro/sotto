from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import yaml

VARIABLE = re.compile(r"{{\s*([a-z0-9_.]+)\s*}}")
# Most specific first (R6: "the most specific wins").
SCOPES = ("campaign", "team", "company", "platform")


class PromptNotFound(KeyError):
    pass


class PromptRenderError(ValueError):
    pass


@dataclass(frozen=True)
class PromptVersion:
    key: str
    version: int
    scope: str
    scope_id: str | None
    stage: str
    variables: tuple[str, ...]
    body: str
    description: str = ""


@dataclass(frozen=True)
class PromptContext:
    company_id: str | None = None
    team_id: str | None = None
    campaign_id: str | None = None

    def scope_id(self, scope: str) -> str | None:
        return {
            "campaign": self.campaign_id,
            "team": self.team_id,
            "company": self.company_id,
            "platform": None,
        }[scope]


@dataclass(frozen=True)
class RenderedPrompt:
    text: str
    prompt: PromptVersion
    # True when the most specific version failed to render and a platform version was used (F-11).
    fell_back: bool = False


def render(body: str, variables: Mapping[str, str]) -> str:
    missing = sorted({name for name in VARIABLE.findall(body) if name not in variables})
    if missing:
        raise PromptRenderError(f"missing prompt variable(s): {', '.join(missing)}")
    return VARIABLE.sub(lambda m: variables[m.group(1)], body)


class PromptRegistry:
    def __init__(self) -> None:
        self._versions: dict[tuple[str, str, str | None], dict[int, PromptVersion]] = {}
        self._published: dict[tuple[str, str, str | None], int] = {}

    @classmethod
    def from_seed(cls, directory: Path) -> PromptRegistry:
        registry = cls()
        for path in sorted(directory.glob("*.md")):
            if path.name == "README.md":
                continue
            _, front, body = path.read_text().split("---\n", 2)
            meta = cast(dict[str, Any], yaml.safe_load(front))
            registry.add(
                PromptVersion(
                    key=meta["key"],
                    version=int(meta["version"]),
                    scope=meta["scope"],
                    scope_id=None,
                    stage=meta["stage"],
                    variables=tuple(meta["variables"]),
                    body=body.strip() + "\n",
                    description=meta.get("description", ""),
                ),
                publish=True,
            )
        return registry

    def add(self, version: PromptVersion, *, publish: bool = False) -> None:
        if version.scope not in SCOPES:
            raise ValueError(f"unknown scope {version.scope!r}")
        slot = (version.key, version.scope, version.scope_id)
        self._versions.setdefault(slot, {})[version.version] = version
        if publish:
            self._published[slot] = version.version

    def publish(self, key: str, scope: str, scope_id: str | None, version: int) -> None:
        """Publish any stored version; publishing an older one is the one-click rollback (R6)."""
        slot = (key, scope, scope_id)
        if version not in self._versions.get(slot, {}):
            raise PromptNotFound(f"{key} v{version} at {scope}:{scope_id}")
        self._published[slot] = version

    def history(self, key: str, scope: str, scope_id: str | None) -> list[PromptVersion]:
        versions = self._versions.get((key, scope, scope_id), {})
        return [versions[v] for v in sorted(versions)]

    def candidates(self, key: str, ctx: PromptContext) -> list[PromptVersion]:
        """Published versions that apply to this call, most specific first."""
        found = []
        for scope in SCOPES:
            scope_id = ctx.scope_id(scope)
            if scope != "platform" and scope_id is None:
                continue
            slot = (key, scope, scope_id)
            if slot in self._published:
                found.append(self._versions[slot][self._published[slot]])
        return found

    def get(self, key: str, ctx: PromptContext) -> PromptVersion:
        found = self.candidates(key, ctx)
        if not found:
            raise PromptNotFound(key)
        return found[0]

    def render(self, key: str, ctx: PromptContext, variables: Mapping[str, str]) -> RenderedPrompt:
        found = self.candidates(key, ctx)
        if not found:
            raise PromptNotFound(key)
        try:
            return RenderedPrompt(render(found[0].body, variables), found[0])
        except PromptRenderError:
            platform = next((p for p in found if p.scope == "platform"), None)
            if platform is None or platform is found[0]:
                raise
            return RenderedPrompt(render(platform.body, variables), platform, fell_back=True)
