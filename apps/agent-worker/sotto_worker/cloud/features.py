"""Feature flags (D-028, D-036): the catalog and the one function that decides a feature's state.

The server is the only place that computes a state. Each person gets one of five, checked in this
order over the feature and everything it depends on:

1. off_by_platform  — AGN did not entitle the organisation, or the global kill switch is on;
2. off_by_org       — the organisation's admin turned it off (default on);
3. needs_connection — a connection it needs (Zoho, Gallabox, an approved sender) is missing, or
                      the version that ships it is not out yet;
4. no_permission    — the person's role is not one the feature is for (checked on the feature
                      itself only: a dependency an agent cannot manage still counts for them);
5. available.

The catalog is `features.json`, which the app's tests read too, so both sides share one list."""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

State = Literal["available", "off_by_platform", "off_by_org", "needs_connection", "no_permission"]
STATES: tuple[State, ...] = (
    "available",
    "off_by_platform",
    "off_by_org",
    "needs_connection",
    "no_permission",
)
CATALOG_FILE = Path(__file__).parent / "features.json"


@dataclass(frozen=True)
class Feature:
    id: str
    roles: tuple[str, ...]
    requires: tuple[str, ...]  # connections
    depends: tuple[str, ...]  # other features
    built: bool
    default_on: bool = True  # False: off_by_org until the admin turns it on (D-070, D-071)


@dataclass(frozen=True)
class Effective:
    state: State
    cause: str | None = None  # the feature or connection that decided it, when not this one

    def out(self) -> dict[str, Any]:
        return {"state": self.state, **({"cause": self.cause} if self.cause else {})}


def load_catalog(path: Path = CATALOG_FILE) -> dict[str, Feature]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, Feature] = {}
    for f in raw["features"]:
        out[f["id"]] = Feature(
            id=f["id"],
            roles=tuple(f["roles"]),
            requires=tuple(f["requires"]),
            depends=tuple(f["depends"]),
            built=bool(f["built"]),
            default_on=f.get("default", "on") != "off",
        )
    for f in out.values():
        for dep in f.depends:
            if dep not in out:
                raise ValueError(f"feature {f.id} depends on unknown feature {dep}")
    return out


CATALOG = load_catalog()
FEATURE_IDS = tuple(CATALOG)
DEFAULT_OFF = frozenset(f.id for f in CATALOG.values() if not f.default_on)
# D-095: per-user owner overrides are permitted ONLY for these three feature IDs.
PER_USER_OVERRIDE_IDS: frozenset[str] = frozenset(
    {"call_logs_github", "local_models_text", "local_models_voice"}
)


class FeatureUnavailable(Exception):
    """A route served a capability whose state is not `available` (answered as 403)."""

    def __init__(self, feature: str, effective: Effective) -> None:
        super().__init__(f"{feature} is {effective.state}")
        self.feature = feature
        self.effective = effective


@dataclass(frozen=True)
class Layers:
    """What the store knows about one organisation, gathered once per request."""

    killed: frozenset[str]  # global kill switch (owner)
    not_entitled: frozenset[str]  # owner's entitlement matrix for this org (default entitled)
    org_off: frozenset[str]  # Admin → Features toggles turned off (default on)
    connections: frozenset[str]  # connections this org (or person) has
    # D-095: owner-only per-user overrides for PER_USER_OVERRIDE_IDS (True=on, False=off).
    user_overrides: Mapping[str, bool] = field(default_factory=dict)


def _chain(feature: str, catalog: Mapping[str, Feature]) -> list[Feature]:
    """The feature and every feature it depends on, each once, the feature first."""
    seen: list[str] = []
    todo = [feature]
    while todo:
        fid = todo.pop(0)
        if fid in seen:
            continue
        seen.append(fid)
        todo.extend(catalog[fid].depends)
    return [catalog[f] for f in seen]


def evaluate(
    feature: str,
    role: str | None,
    layers: Layers,
    catalog: Mapping[str, Feature] = CATALOG,
) -> Effective:
    if feature not in catalog:
        raise KeyError(feature)
    chain = _chain(feature, catalog)

    def cause(f: Feature, what: str | None = None) -> str | None:
        if what is not None:
            return what
        return None if f.id == feature else f.id

    override: bool | None = (
        layers.user_overrides.get(feature) if feature in PER_USER_OVERRIDE_IDS else None
    )
    for f in chain:
        if f.id in layers.killed:
            return Effective("off_by_platform", cause(f))
        if f.id == feature and override is False:
            return Effective("off_by_platform")
        if f.id == feature and override is True:
            continue
        if f.id in layers.not_entitled:
            return Effective("off_by_platform", cause(f))
    for f in chain:
        if f.id == feature and override is True:
            continue
        if f.id in layers.org_off:
            return Effective("off_by_org", cause(f))
    for f in chain:
        if not f.built:
            return Effective("needs_connection", cause(f, "release" if f.id == feature else None))
        missing = [c for c in f.requires if c not in layers.connections]
        if missing:
            return Effective("needs_connection", cause(f, missing[0]))
    if role is not None and role not in catalog[feature].roles:
        return Effective("no_permission")
    return Effective("available")


def effective_map(
    role: str, layers: Layers, features: Iterable[str] = FEATURE_IDS
) -> dict[str, dict[str, Any]]:
    """Every feature's state for one person: what the session config carries (D-036)."""
    return {f: evaluate(f, role, layers).out() for f in features}
