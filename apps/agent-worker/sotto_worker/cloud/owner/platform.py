"""What AGN runs for every company from the owner console (T-079):

- platform provider keys (D-059, D-061): write-only, AES-GCM, one set for all companies;
- platform model routing per stage with history and one-click rollback, guarded by the last
  benchmark of each model (R6: a live stage only takes a model that met R1);
- platform circuit breaking (ZC-06): primary failures reported by the apps across tenants demote a
  vendor for everyone for a while; the session config carries the demotion (D-036 refresh);
- the "bring your own" entitlement (BYO, D-059), default off;
- persisted prompt versions (DD-2, R6): platform, company, team and campaign levels, the most
  specific published one wins;
- Zoho per-DC platform clients and per-company overrides (ZC-01, D-064);
- the Zoho Forms self-signup queue (ZC-10, D-068).

Every company-scoped row carries `company_id`; the company-facing helpers take the caller's
company and filter on it (tests/cloud/test_owner_prompts.py checks isolation)."""

from __future__ import annotations

import dataclasses
import hashlib
import hmac
import json
import re
import secrets
import uuid
from collections.abc import Iterable
from typing import TYPE_CHECKING, Any

from sotto_worker.cloud import features
from sotto_worker.cloud.bootstrap.store import SCHEMA as BOOTSTRAP_SCHEMA
from sotto_worker.cloud.metering.store import SCHEMA as METERING_SCHEMA
from sotto_worker.cloud.routing.store import SCHEMA as ROUTING_SCHEMA
from sotto_worker.cloud.store import KEY_ENV, CloudError, Principal, now_ms
from sotto_worker.server.vault import VaultError

if TYPE_CHECKING:
    from sotto_worker.cloud.bundle import Seed
    from sotto_worker.cloud.store import CloudStore
    from sotto_worker.router import StageRoute
    from sotto_worker.server.catalog import Catalog

SCHEMA = """
-- T-079 (D-059, D-061): AGN's own provider keys, one row per key name, no company data.
CREATE TABLE IF NOT EXISTS platform_keys (
  key_env TEXT PRIMARY KEY,
  ciphertext BLOB NOT NULL,
  updated_at INTEGER NOT NULL,
  tested_at INTEGER,
  test_ok INTEGER,
  test_detail TEXT
);
-- Platform model routing per stage (seed + these), and every change, for rollback.
CREATE TABLE IF NOT EXISTS platform_routes (
  stage TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_route_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stage TEXT NOT NULL,
  provider_id TEXT,             -- NULL: back to the seed default
  model TEXT,
  at INTEGER NOT NULL,
  actor_id TEXT
);
-- Last benchmark per vendor, model and stage (R6): replay numbers recorded by AGN.
CREATE TABLE IF NOT EXISTS model_benchmarks (
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  stage TEXT NOT NULL,
  p50_ms INTEGER,
  p95_ms INTEGER,
  samples INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  source TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (provider_id, model, stage)
);
-- ZC-06: primary-model failures the apps report, and the vendors demoted for everyone.
CREATE TABLE IF NOT EXISTS provider_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  count INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS provider_failures_at ON provider_failures(provider_id, at);
CREATE TABLE IF NOT EXISTS provider_demotions (
  provider_id TEXT PRIMARY KEY,
  since INTEGER NOT NULL,
  until INTEGER NOT NULL,
  reason TEXT NOT NULL,
  manual INTEGER NOT NULL DEFAULT 0
);
-- D-059: AGN lets a company bring its own keys, models and prompts (default: no row = off).
CREATE TABLE IF NOT EXISTS company_byo (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  enabled_at INTEGER NOT NULL
);
-- DD-2 (R6): every prompt version. company_id is NULL only for platform versions.
CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  scope TEXT NOT NULL,
  scope_id TEXT NOT NULL DEFAULT '',
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  variables TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,         -- draft | published | retired
  created_at INTEGER NOT NULL,
  created_by TEXT,
  published_at INTEGER,
  test_json TEXT,
  UNIQUE (key, scope, scope_id, company_id, version)
);
-- ZC-01 (D-064): a platform Zoho client per DC family (multi-DC: the same client ID, a secret
-- per DC), and an owner-set override per company.
CREATE TABLE IF NOT EXISTS zoho_dc_clients (
  dc TEXT PRIMARY KEY,
  ciphertext BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);
-- ZC-10 (D-068): one row per address that signed up through the Zoho Forms webhook.
CREATE TABLE IF NOT EXISTS signups (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  invited_at INTEGER,
  approved_at INTEGER           -- security review H1: AGN's keys only after the owner approves
);
-- ZC-12 (D-061): the key a rotation replaced, kept only for its window (then deleted).
CREATE TABLE IF NOT EXISTS platform_keys_retiring (
  key_env TEXT PRIMARY KEY,
  ciphertext BLOB NOT NULL,
  rotated_at INTEGER NOT NULL,
  retire_at INTEGER NOT NULL
);
-- Round 3 (D-081/D-084): per-company custom providers (OpenCode model). The endpoint and the
-- model list live here; the key lives in company_keys under ENDPOINT_<SLUG>_KEY (the same
-- name the local server uses), so keys_for_call can deliver it to devices through the
-- existing allow-list. Never a secret in this table.
CREATE TABLE IF NOT EXISTS custom_providers (
  id TEXT PRIMARY KEY,               -- custom-<slug>, immutable
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                -- llm | stt (tts is not a stage yet, D-081)
  base_url TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'chat-completions',
  auth_mode TEXT NOT NULL DEFAULT 'bearer',
  auth_header TEXT,
  models_json TEXT NOT NULL DEFAULT '[]',
  tested_at INTEGER,
  test_ok INTEGER,
  test_detail TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS custom_providers_company ON custom_providers(company_id);
-- Round 3 (D-081): platform-level per-model enablement for seed providers. A disabled
-- model is excluded from every picker and cannot be set on a stage; a stored route
-- using it is flagged unavailable (never silently swapped). A missing row means
-- enabled; custom providers are NOT toggled here — they carry their own per-model
-- flags in models_json.
CREATE TABLE IF NOT EXISTS platform_model_overrides (
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider_id, model)
);
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
"""

# Wave 4 tables, each defined in its own module, created with the platform tables at store start
# (in place: CREATE TABLE IF NOT EXISTS keeps every existing row).
SCHEMA = ";\n".join((SCHEMA, ROUTING_SCHEMA, METERING_SCHEMA, BOOTSTRAP_SCHEMA)) + ";\n"

BYO = "byo_providers"  # the entitlement's id in 403 bodies and the feature map (not a catalog id)
LIVE_STAGES = ("trigger", "suggest", "suggest_backup")
R1_P95_MS = 1500
# ZC-06 circuit: this many failures from at least two companies within the window demote the
# vendor for everyone for DEMOTE_MS. One tenant alone can never demote a vendor.
FAIL_WINDOW_MS = 10 * 60_000
FAIL_THRESHOLD = 6
FAIL_MIN_COMPANIES = 2
DEMOTE_MS = 15 * 60_000
FAIL_REASONS = ("error", "timeout")
PROMPT_SCOPES = ("platform", "company", "team", "campaign")
PROMPT_MAX_CHARS = 20_000
SCOPE_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")
INVITE_TTL_MS = 7 * 86_400_000
# ZC-12: apps refetch the bundle on the 10-minute config refresh (D-036); a retiring key is kept
# for two refresh cycles, so every device has switched before the owner revokes it at the vendor.
ROTATE_WINDOW_MS = 20 * 60_000


def _owner(who: Principal) -> None:
    if not who.is_owner:
        raise CloudError("forbidden", "only the platform owner can do this")


# --- BYO entitlement -----------------------------------------------------------------------------
def byo_on(store: CloudStore, company_id: str) -> bool:
    return bool(store._q("SELECT 1 FROM company_byo WHERE company_id = ?", (company_id,)))


def byo_state(store: CloudStore, company_id: str | None) -> features.Effective:
    if company_id is not None and byo_on(store, company_id):
        return features.Effective("available")
    return features.Effective("off_by_platform")


def require_byo(store: CloudStore, who: Principal) -> None:
    """Company writes to keys, models and prompts need AGN's BYO entitlement (D-059)."""
    state = byo_state(store, who.company_id)
    if state.state != "available":
        raise features.FeatureUnavailable(BYO, state)


def set_byo(store: CloudStore, owner: Principal, company_id: str, on: object, *, ip: str) -> None:
    _owner(owner)
    store.company_row(company_id)
    if not isinstance(on, bool):
        raise CloudError("invalid", "enabled must be true or false")
    with store._tx() as db:
        if on:
            db.execute(
                "INSERT OR IGNORE INTO company_byo(company_id, enabled_at) VALUES (?,?)",
                (company_id, now_ms()),
            )
        else:
            db.execute("DELETE FROM company_byo WHERE company_id = ?", (company_id,))
        store.audit(
            db, "owner.byo", "on" if on else "off", company_id=company_id, actor=owner, ip=ip
        )


def pending_signup(store: CloudStore, company_id: str) -> bool:
    """A self-signup company the owner has not approved yet: it can sign in and look around,
    but gets none of AGN's paid keys (security review H1: a throwaway sign-up must not be a way
    to read AGN's vendor keys off a device). Per-tenant sub-keys replace this in ZC-12."""
    return bool(
        store._q(
            "SELECT 1 FROM signups WHERE company_id = ? AND approved_at IS NULL", (company_id,)
        )
    )


def approve_signup(store: CloudStore, owner: Principal, signup_id: str, *, ip: str) -> None:
    _owner(owner)
    rows = store._q("SELECT company_id FROM signups WHERE id = ?", (signup_id,))
    if not rows or rows[0]["company_id"] is None:
        raise CloudError("not_found", "no such sign-up")
    with store._tx() as db:
        db.execute("UPDATE signups SET approved_at = ? WHERE id = ?", (now_ms(), signup_id))
        store.audit(
            db, "owner.signup.approved", "", company_id=rows[0]["company_id"], actor=owner, ip=ip
        )


# --- platform keys -------------------------------------------------------------------------------
def _key_vault(key_env: str) -> str:
    return f"platform-key:{key_env}"


def set_key(store: CloudStore, owner: Principal, key_env: str, value: str, *, ip: str) -> None:
    _owner(owner)
    if not KEY_ENV.match(key_env):
        raise CloudError("invalid", "unknown key name")
    value = value.strip()
    if not 8 <= len(value) <= 400 or any(c.isspace() for c in value):
        raise CloudError("invalid", "that does not look like a key")
    blob = store._vault.encrypt(_key_vault(key_env), value)
    with store._tx() as db:
        db.execute(
            "INSERT INTO platform_keys(key_env, ciphertext, updated_at) VALUES (?,?,?)"
            " ON CONFLICT(key_env) DO UPDATE SET ciphertext = excluded.ciphertext,"
            " updated_at = excluded.updated_at, tested_at = NULL, test_ok = NULL,"
            " test_detail = NULL",
            (key_env, blob, now_ms()),
        )
        store.audit(db, "owner.key.set", key_env, actor=owner, ip=ip)


def rotate_key(
    store: CloudStore, owner: Principal, key_env: str, value: str, *, ip: str, t: int | None = None
) -> dict[str, Any]:
    """ZC-12: the next key becomes the one every bundle carries from the next config refresh; the
    old one is marked retiring for ROTATE_WINDOW_MS (shown in the console, then deleted). No
    release, and no key in the answer."""
    _owner(owner)
    t = now_ms() if t is None else t
    rows = store._q("SELECT ciphertext FROM platform_keys WHERE key_env = ?", (key_env,))
    if not rows:
        raise CloudError("not_found", "there is no key to rotate; add one first")
    if platform_key(store, key_env) == value.strip():
        raise CloudError("invalid", "the next key must be a new key")
    set_key(store, owner, key_env, value, ip=ip)
    retire_at = t + ROTATE_WINDOW_MS
    with store._tx() as db:
        db.execute(
            "INSERT OR REPLACE INTO platform_keys_retiring(key_env, ciphertext, rotated_at,"
            " retire_at) VALUES (?,?,?,?)",
            (key_env, rows[0]["ciphertext"], t, retire_at),
        )
        store.audit(db, "owner.key.rotated", key_env, actor=owner, ip=ip)
    return {"key_env": key_env, "rotated_at": t, "retire_at": retire_at}


def purge_retired(store: CloudStore, t: int | None = None) -> list[str]:
    """Deletes retiring keys past their window; the names, for the log."""
    t = now_ms() if t is None else t
    rows = store._q("SELECT key_env FROM platform_keys_retiring WHERE retire_at <= ?", (t,))
    if rows:
        with store._tx() as db:
            db.execute("DELETE FROM platform_keys_retiring WHERE retire_at <= ?", (t,))
            for r in rows:
                store.audit(db, "owner.key.retired", str(r["key_env"]))
    return [str(r["key_env"]) for r in rows]


def retiring_key(store: CloudStore, key_env: str, t: int | None = None) -> str | None:
    """The replaced key while its window lasts (server-side fallback only; never in a bundle)."""
    t = now_ms() if t is None else t
    rows = store._q(
        "SELECT ciphertext FROM platform_keys_retiring WHERE key_env = ? AND retire_at > ?",
        (key_env, t),
    )
    if not rows:
        return None
    try:
        return store._vault.decrypt(_key_vault(key_env), rows[0]["ciphertext"])
    except VaultError:
        return None


def delete_key(store: CloudStore, owner: Principal, key_env: str, *, ip: str) -> None:
    _owner(owner)
    with store._tx() as db:
        db.execute("DELETE FROM platform_keys WHERE key_env = ?", (key_env,))
        db.execute("DELETE FROM platform_keys_retiring WHERE key_env = ?", (key_env,))
        store.audit(db, "owner.key.deleted", key_env, actor=owner, ip=ip)


def platform_key(store: CloudStore, key_env: str) -> str | None:
    """One platform key, for server-side use (a test, a short-lived STT token) or a call bundle."""
    rows = store._q("SELECT ciphertext FROM platform_keys WHERE key_env = ?", (key_env,))
    if not rows:
        return None
    try:
        return store._vault.decrypt(_key_vault(key_env), rows[0]["ciphertext"])
    except VaultError:
        return None


def platform_keys(store: CloudStore, names: Iterable[str] | None = None) -> dict[str, str]:
    wanted = None if names is None else set(names)
    out: dict[str, str] = {}
    for r in store._q("SELECT key_env FROM platform_keys"):
        env = str(r["key_env"])
        if wanted is not None and env not in wanted:
            continue
        value = platform_key(store, env)
        if value:
            out[env] = value
    return out


def platform_key_status(store: CloudStore) -> dict[str, dict[str, Any]]:
    """Status only (set, when, last test, rotation window): never a key, not even a part."""
    purge_retired(store)
    retiring = {
        str(r["key_env"]): {"rotated_at": int(r["rotated_at"]), "retire_at": int(r["retire_at"])}
        for r in store._q("SELECT key_env, rotated_at, retire_at FROM platform_keys_retiring")
    }
    return {
        str(r["key_env"]): {
            "updated_at": int(r["updated_at"]),
            "test": None
            if r["tested_at"] is None
            else {
                "ok": bool(r["test_ok"]),
                "at": int(r["tested_at"]),
                "detail": str(r["test_detail"] or ""),
            },
            "retiring": retiring.get(str(r["key_env"])),
        }
        for r in store._q("SELECT * FROM platform_keys")
    }


def record_key_test(store: CloudStore, key_env: str, ok: bool, detail: str) -> None:
    with store._tx() as db:
        db.execute(
            "UPDATE platform_keys SET tested_at = ?, test_ok = ?, test_detail = ?"
            " WHERE key_env = ?",
            (now_ms(), int(ok), detail[:200], key_env),
        )


# --- routing -------------------------------------------------------------------------------------
def platform_routes(store: CloudStore) -> dict[str, tuple[str, str]]:
    return {
        str(r["stage"]): (str(r["provider_id"]), str(r["model"]))
        for r in store._q("SELECT stage, provider_id, model FROM platform_routes")
    }


def benchmark(store: CloudStore, provider_id: str, model: str, stage: str) -> dict[str, Any] | None:
    rows = store._q(
        "SELECT * FROM model_benchmarks WHERE provider_id = ? AND model = ? AND stage = ?",
        (provider_id, model, stage),
    )
    if not rows:
        return None
    r = rows[0]
    return {
        "ok": bool(r["ok"]),
        "p50_ms": r["p50_ms"],
        "p95_ms": r["p95_ms"],
        "samples": int(r["samples"]),
        "source": str(r["source"]),
        "at": int(r["at"]),
    }


def record_benchmark(
    store: CloudStore,
    *,
    provider_id: str,
    model: str,
    stage: str,
    p50_ms: int | None,
    p95_ms: int | None,
    samples: int,
    source: str,
) -> dict[str, Any]:
    """A replay result for one vendor/model/stage; live stages pass only with p95 ≤ 1500 ms."""
    ok = samples > 0 and p95_ms is not None and (stage not in LIVE_STAGES or p95_ms <= R1_P95_MS)
    at = now_ms()
    with store._tx() as db:
        db.execute(
            "INSERT OR REPLACE INTO model_benchmarks(provider_id, model, stage, p50_ms, p95_ms,"
            " samples, ok, source, at) VALUES (?,?,?,?,?,?,?,?,?)",
            (provider_id, model, stage, p50_ms, p95_ms, samples, int(ok), source[:40], at),
        )
    return {
        "ok": ok,
        "p50_ms": p50_ms,
        "p95_ms": p95_ms,
        "samples": samples,
        "source": source[:40],
        "at": at,
    }


def check_route(
    seed: Seed, stage: str, provider_id: str, model: str, *, catalog: Catalog | None = None
) -> None:
    """The same validation as the company route (kind match, model ID shape, app can run it).
    `catalog` is the seed catalogue, or the company's merged catalogue for a company route —
    a custom provider only exists in the latter. A custom provider must offer the model
    (enabled) and must be runnable: only chat-completions over Bearer is wired to an
    adapter this round (D-081), and there is no custom STT adapter at all."""
    catalog = catalog or seed.catalog
    try:
        catalog.route_for(
            stage, provider_id, model, seed.routing.stages.get(stage), require_enabled=True
        )
    except ValueError as e:
        # A stored model that was disabled or removed since (D-081) gets its own code so
        # the console can tell it apart from a malformed choice; both are a 400.
        if "is not an enabled model of" in str(e):
            raise CloudError("model_unavailable", str(e)) from None
        raise CloudError("invalid", str(e)) from None
    chosen = catalog.providers.get(provider_id)
    if chosen is not None and not chosen.client:
        raise CloudError("invalid", f"{chosen.name} is not available in the app yet")
    if chosen is not None and chosen.custom:
        if chosen.kind != "llm":
            raise CloudError(
                "invalid", "a custom speech provider cannot run a stage yet (no STT adapter)"
            )
        if chosen.format != "chat-completions" or chosen.auth_mode != "bearer":
            raise CloudError(
                "invalid",
                "this provider's format is stored but not runnable yet;"
                " only chat-completions over Bearer is wired",
            )


def set_route(
    store: CloudStore,
    seed: Seed,
    owner: Principal,
    stage: str,
    provider_id: str,
    model: str,
    *,
    ip: str,
) -> None:
    _owner(owner)
    write_route(store, seed, stage, provider_id, model, actor=owner, ip=ip)


def write_route(
    store: CloudStore,
    seed: Seed,
    stage: str,
    provider_id: str,
    model: str,
    *,
    actor: Principal | None,
    ip: str = "",
    action: str = "owner.route.set",
) -> None:
    """A platform route change with history (for rollback), behind R6's benchmark guard. The
    owner (set_route) and the routing job (actor None, ZC-05) both come through here."""
    model = model.strip()
    check_route(seed, stage, provider_id, model, catalog=platform_catalog(store, seed))
    bench = benchmark(store, provider_id, model, stage)
    if stage in LIVE_STAGES and bench is not None and not bench["ok"]:
        raise CloudError(
            "benchmark_failed",
            f"its last benchmark missed R1 (p95 {bench['p95_ms']} ms); benchmark it again first",
        )
    t = now_ms()
    with store._tx() as db:
        db.execute(
            "INSERT INTO platform_routes(stage, provider_id, model, updated_at) VALUES (?,?,?,?)"
            " ON CONFLICT(stage) DO UPDATE SET provider_id = excluded.provider_id,"
            " model = excluded.model, updated_at = excluded.updated_at",
            (stage, provider_id, model, t),
        )
        db.execute(
            "INSERT INTO platform_route_history(stage, provider_id, model, at, actor_id)"
            " VALUES (?,?,?,?,?)",
            (stage, provider_id, model, t, actor.user_id if actor else None),
        )
        store.audit(db, action, f"{stage}={provider_id}/{model}", actor=actor, ip=ip)


def reset_route(store: CloudStore, owner: Principal, stage: str, *, ip: str) -> None:
    _owner(owner)
    t = now_ms()
    with store._tx() as db:
        db.execute("DELETE FROM platform_routes WHERE stage = ?", (stage,))
        db.execute(
            "INSERT INTO platform_route_history(stage, provider_id, model, at, actor_id)"
            " VALUES (?,NULL,NULL,?,?)",
            (stage, t, owner.user_id),
        )
        store.audit(db, "owner.route.reset", stage, actor=owner, ip=ip)


def route_history(store: CloudStore, stage: str, limit: int = 20) -> list[dict[str, Any]]:
    return [
        {
            "id": int(r["id"]),
            "provider_id": r["provider_id"],
            "model": r["model"],
            "at": int(r["at"]),
        }
        for r in store._q(
            "SELECT * FROM platform_route_history WHERE stage = ? ORDER BY id DESC LIMIT ?",
            (stage, limit),
        )
    ]


def rollback_route(
    store: CloudStore, seed: Seed, owner: Principal, stage: str, *, ip: str
) -> dict[str, Any]:
    """One click: back to what the stage used before its latest change."""
    _owner(owner)
    history = route_history(store, stage, limit=2)
    if len(history) < 2:
        if history:  # only one change ever: before it was the seed default
            reset_route(store, owner, stage, ip=ip)
            return {"provider_id": None, "model": None}
        raise CloudError("not_found", "nothing to roll back")
    before = history[1]
    if before["provider_id"] is None:
        reset_route(store, owner, stage, ip=ip)
    else:
        # A rollback may return to a model benchmarked after it was chosen; the guard still holds.
        set_route(store, seed, owner, stage, before["provider_id"], before["model"], ip=ip)
    return {"provider_id": before["provider_id"], "model": before["model"]}


def effective_routes(store: CloudStore, company_id: str) -> dict[str, tuple[str, str]]:
    """Seed ← AGN's platform routes ← the company's own (only while AGN allows BYO)."""
    from sotto_worker.cloud.routing.store import canary_routes

    routes = platform_routes(store)
    routes.update(canary_routes(store, company_id))  # ZC-05: only AGN's demo org runs a canary
    if byo_on(store, company_id):
        routes.update(store.routes(company_id))
    return routes


# --- per-company routes (round 2, D-078/D-079) ---------------------------------------------------
def company_routes_out(store: CloudStore, seed: Seed, company_id: str) -> dict[str, Any]:
    """What the company profile shows per stage: the route that actually runs, and whether the
    company overrides the platform's. The client never sees this; the vendor sets it.
    `model_available` is False when the stored route names a provider or model that is gone
    or disabled since — the picker must force a re-pick, never silently fall back (D-081)."""
    store.company_row(company_id)
    catalog = company_catalog(store, seed, company_id)
    eff = effective_routes(store, company_id)
    own = store.routes(company_id)
    plat = platform_routes(store)
    stages = []
    for slot in seed.catalog.stages.values():
        default = seed.routing.stages.get(slot.id)
        chosen = eff.get(slot.id)
        provider_id = (
            chosen[0] if chosen else (vendor_of(seed.catalog, default) if default else None)
        )
        model = chosen[1] if chosen else (default.model if default else None)
        provider = catalog.providers.get(provider_id) if provider_id else None
        model_available = True
        if provider_id and model:
            if provider is None:
                model_available = False
            elif not provider.model_available(model):
                model_available = False
        stages.append(
            {
                "id": slot.id,
                "label": slot.label,
                "kind": slot.kind,
                "provider_id": provider_id,
                "model": model,
                "model_available": model_available,
                "source": "company"
                if slot.id in own
                else "platform"
                if slot.id in plat
                else "default",
                "live": slot.id in LIVE_STAGES,
                "deadline_ms": default.first_token_ms if default else None,
                "benchmark": benchmark(store, provider_id, model, slot.id)
                if provider_id and model
                else None,
            }
        )
    return {"stages": stages, "byo": byo_on(store, company_id)}


def set_company_route(
    store: CloudStore,
    seed: Seed,
    owner: Principal,
    company_id: str,
    stage: str,
    provider_id: str,
    model: str,
    *,
    ip: str,
) -> None:
    """The vendor sets one company's route from the company profile. Setting a route also turns
    BYO on for the company, so `effective_routes` applies it — the company's own keys pay for
    its own model choice (D-079)."""
    _owner(owner)
    store.company_row(company_id)
    catalog = company_catalog(store, seed, company_id)
    check_route(seed, stage, provider_id, model, catalog=catalog)
    bench = benchmark(store, provider_id, model, stage)
    if stage in LIVE_STAGES and bench is not None and not bench["ok"]:
        raise CloudError(
            "benchmark_failed",
            f"its last benchmark missed R1 (p95 {bench['p95_ms']} ms); benchmark it again first",
        )
    with store._tx() as db:
        db.execute(
            "INSERT INTO company_routes(company_id, stage, provider_id, model, updated_at)"
            " VALUES (?,?,?,?,?) ON CONFLICT(company_id, stage) DO UPDATE SET"
            " provider_id = excluded.provider_id, model = excluded.model,"
            " updated_at = excluded.updated_at",
            (company_id, stage, provider_id, model, now_ms()),
        )
        store.audit(
            db,
            "owner.route.set",
            f"{stage}={provider_id}/{model}",
            company_id=company_id,
            actor=owner,
            ip=ip,
        )
    if not byo_on(store, company_id):
        set_byo(store, owner, company_id, True, ip=ip)


def reset_company_route(
    store: CloudStore, owner: Principal, company_id: str, stage: str, *, ip: str
) -> None:
    """Back to the platform's route for this stage (the company's override is deleted)."""
    _owner(owner)
    store.company_row(company_id)
    with store._tx() as db:
        db.execute(
            "DELETE FROM company_routes WHERE company_id = ? AND stage = ?",
            (company_id, stage),
        )
        store.audit(db, "owner.route.reset", stage, company_id=company_id, actor=owner, ip=ip)


def vendor_of(catalog: Catalog, route: StageRoute) -> str | None:
    """The catalog vendor of a stage route: openai_compatible routes are told apart by key."""
    if route.provider == "openai_compatible":
        return next(
            (p.id for p in catalog.providers.values() if p.key_env == route.api_key_env), None
        )
    return route.provider if route.provider in catalog.providers else None


# --- custom providers (round 3, D-081/D-084, OpenCode §2/§5) --------------------------------------
# One provider entity for chat (LLM) and speech-to-text, with per-model Enabled toggles and a
# per-stage picker over enabled models only. The key is stored in company_keys under the
# local-server key name (ENDPOINT_<SLUG>_KEY) so keys_for_call delivers it to devices through
# the existing allow-list; the owner principal cannot use CloudStore.set_key (it needs a
# company principal), so the write below mirrors its SQL. Formats/auth modes beyond
# chat-completions/Bearer are stored but not wired to any adapter (D-081).
CUSTOM_FORMATS = (
    "chat-completions",
    "anthropic-compatible",
    "responses-api",
    "google-generative-ai",
)
CUSTOM_AUTH_MODES = ("bearer", "api-key-header", "custom-header")
CUSTOM_KINDS = ("llm", "stt")
HEADER_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9-]{0,63}$")


def _custom_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")[:40].strip("-")
    if len(slug) < 2:
        raise CloudError("invalid", "give the provider a name of at least 2 letters")
    return f"custom-{slug}"


def _custom_key_env(provider_id: str) -> str:
    from sotto_worker.server.catalog import endpoint_key_env

    return endpoint_key_env(provider_id)


def _custom_models(models_json: str) -> list[dict[str, Any]]:
    try:
        raw = json.loads(models_json or "[]")
    except json.JSONDecodeError:
        return []
    out: list[dict[str, Any]] = []
    for m in raw if isinstance(raw, list) else []:
        if not isinstance(m, dict):
            continue
        mid = str(m.get("id", "")).strip()
        if not mid:
            continue
        out.append(
            {
                "id": mid,
                "display_name": str(m.get("display_name") or mid)[:120],
                "enabled": bool(m.get("enabled", True)),
            }
        )
    return out


def _custom_check_format_auth(
    format: str, auth_mode: str, auth_header: str | None
) -> tuple[str, str, str | None]:
    if format not in CUSTOM_FORMATS:
        raise CloudError("invalid", f"format is one of {', '.join(CUSTOM_FORMATS)}")
    if auth_mode not in CUSTOM_AUTH_MODES:
        raise CloudError("invalid", f"auth mode is one of {', '.join(CUSTOM_AUTH_MODES)}")
    header = (auth_header or "").strip() or None
    if auth_mode == "custom-header":
        if header is None or not HEADER_NAME.match(header):
            raise CloudError("invalid", "give the auth header name, e.g. x-api-key")
    elif header is not None:
        raise CloudError("invalid", "an auth header name only applies to the custom-header mode")
    return format, auth_mode, header


def _custom_clean_key(value: object) -> str:
    value = str(value or "").strip()
    if not 8 <= len(value) <= 400 or any(c.isspace() for c in value):
        raise CloudError("invalid", "that does not look like a key")
    return value


def _custom_write_key(
    db: Any, store: CloudStore, company_id: str, key_env: str, value: str
) -> None:
    blob = store._vault.encrypt(f"{company_id}:{key_env}", _custom_clean_key(value))
    db.execute(
        "INSERT INTO company_keys(company_id, key_env, ciphertext, updated_at) VALUES (?,?,?,?)"
        " ON CONFLICT(company_id, key_env) DO UPDATE SET ciphertext = excluded.ciphertext,"
        " updated_at = excluded.updated_at",
        (company_id, key_env, blob, now_ms()),
    )


def _custom_out(store: CloudStore, r: Any) -> dict[str, Any]:
    """One custom provider as the console sees it: the same shape as a built-in in
    providers_out, plus the custom fields. The key is never in the answer."""
    key_env = _custom_key_env(str(r["id"]))
    has_key = bool(
        store._q(
            "SELECT 1 FROM company_keys WHERE company_id = ? AND key_env = ?",
            (str(r["company_id"]), key_env),
        )
    )
    return {
        "id": str(r["id"]),
        "name": str(r["name"]),
        "kind": str(r["kind"]),
        "key_env": key_env,
        "key_page": "",
        "steps": "",
        "free": "",
        "models": _custom_models(str(r["models_json"])),
        "client": True,
        "key_set": has_key,
        "updated_at": int(r["updated_at"]),
        "test": None
        if r["tested_at"] is None
        else {
            "ok": bool(r["test_ok"]),
            "at": int(r["tested_at"]),
            "detail": str(r["test_detail"] or ""),
        },
        "retiring": None,
        "custom": True,
        "base_url": str(r["base_url"]),
        "format": str(r["format"]),
        "auth_mode": str(r["auth_mode"]),
        "auth_header": r["auth_header"],
        "created_at": int(r["created_at"]),
    }


def _custom_row(store: CloudStore, company_id: str, provider_id: str) -> Any:
    store.company_row(company_id)
    rows = store._q(
        "SELECT * FROM custom_providers WHERE company_id = ? AND id = ?", (company_id, provider_id)
    )
    if not rows:
        raise CloudError("not_found", "no such custom provider")
    return rows[0]


def custom_providers(store: CloudStore, company_id: str) -> list[dict[str, Any]]:
    """Rows for Catalog.with_custom_providers: the endpoint is resolved from the stored
    record (D-082), never from a request body."""
    out = []
    for r in store._q(
        "SELECT * FROM custom_providers WHERE company_id = ? ORDER BY name COLLATE NOCASE",
        (company_id,),
    ):
        key_env = _custom_key_env(str(r["id"]))
        has_key = bool(
            store._q(
                "SELECT 1 FROM company_keys WHERE company_id = ? AND key_env = ?",
                (company_id, key_env),
            )
        )
        out.append(
            {
                "id": str(r["id"]),
                "name": str(r["name"]),
                "kind": str(r["kind"]),
                "base_url": str(r["base_url"]),
                "format": str(r["format"]),
                "auth_mode": str(r["auth_mode"]),
                "auth_header": r["auth_header"],
                "models": _custom_models(str(r["models_json"])),
                "has_key": has_key,
            }
        )
    return out


def custom_providers_out(store: CloudStore, company_id: str) -> dict[str, Any]:
    store.company_row(company_id)
    rows = store._q(
        "SELECT * FROM custom_providers WHERE company_id = ? ORDER BY name COLLATE NOCASE",
        (company_id,),
    )
    return {"providers": [_custom_out(store, r) for r in rows]}


def custom_provider(store: CloudStore, company_id: str, provider_id: str) -> dict[str, Any]:
    return _custom_out(store, _custom_row(store, company_id, provider_id))


def company_catalog(store: CloudStore, seed: Seed, company_id: str) -> Catalog:
    """The seed catalogue plus this company's custom providers (D-084), with the owner's
    per-model overrides applied (D-081)."""
    rows = custom_providers(store, company_id)
    catalog = seed.catalog.with_custom_providers(rows) if rows else seed.catalog
    overrides = model_overrides(store)
    return catalog.with_model_overrides(overrides) if overrides else catalog


def model_overrides(store: CloudStore) -> dict[tuple[str, str], bool]:
    """{(provider_id, model): enabled} for seed models the owner toggled (D-081). A
    missing row means enabled."""
    return {
        (str(r["provider_id"]), str(r["model"])): bool(r["enabled"])
        for r in store._q("SELECT provider_id, model, enabled FROM platform_model_overrides")
    }


def platform_catalog(store: CloudStore, seed: Seed) -> Catalog:
    """The seed catalogue with the owner's per-model overrides applied (D-081)."""
    overrides = model_overrides(store)
    return seed.catalog.with_model_overrides(overrides) if overrides else seed.catalog


def set_model_override(
    store: CloudStore,
    seed: Seed,
    owner: Principal,
    provider_id: str,
    model: str,
    enabled: bool,
    *,
    ip: str,
) -> None:
    """A per-model Enabled toggle for a seed provider (OpenCode §5, D-081): immediate, no
    Save. Only a model the seed catalogue lists can be toggled — a custom provider keeps
    its own per-model flags in models_json, and a free-form (unlisted) model has nothing
    to toggle. Disabling never swaps a stored route: the route stays and is flagged
    unavailable until the owner re-picks."""
    _owner(owner)
    if not isinstance(enabled, bool):
        raise CloudError("invalid", "enabled must be true or false")
    provider = seed.catalog.providers.get(provider_id)
    if provider is None or provider.custom:
        raise CloudError("not_found", f"unknown provider {provider_id!r}")
    model = str(model or "").strip()
    if model not in [m.id for m in provider.models_detailed]:
        raise CloudError("invalid", f"{provider.name} does not list {model!r}")
    with store._tx() as db:
        db.execute(
            "INSERT INTO platform_model_overrides(provider_id, model, enabled, updated_at)"
            " VALUES (?,?,?,?) ON CONFLICT(provider_id, model) DO UPDATE SET"
            " enabled = excluded.enabled, updated_at = excluded.updated_at",
            (provider_id, model, int(enabled), now_ms()),
        )
        store.audit(
            db,
            "owner.model.enabled" if enabled else "owner.model.disabled",
            f"{provider_id}/{model}",
            actor=owner,
            ip=ip,
        )


def company_seed(store: CloudStore, seed: Seed, company_id: str) -> Seed:
    """The seed a company's bundle is built from: the catalogue merged with that company's
    custom providers. The bundle handler and needed_keys must use this seed, not the global
    one, or a custom route fails route_for as 'unknown provider'."""
    catalog = company_catalog(store, seed, company_id)
    return dataclasses.replace(seed, catalog=catalog) if catalog is not seed.catalog else seed


def custom_provider_key(store: CloudStore, company_id: str, provider_id: str) -> str | None:
    """The custom provider's key, server-side only (a test); None when missing/unreadable."""
    _custom_row(store, company_id, provider_id)
    key_env = _custom_key_env(provider_id)
    rows = store._q(
        "SELECT ciphertext FROM company_keys WHERE company_id = ? AND key_env = ?",
        (company_id, key_env),
    )
    if not rows:
        return None
    try:
        return store._vault.decrypt(f"{company_id}:{key_env}", rows[0]["ciphertext"])
    except VaultError:
        return None


def create_custom_provider(
    store: CloudStore,
    owner: Principal,
    company_id: str,
    *,
    name: object,
    kind: object = "llm",
    base_url: object,
    format: object = "chat-completions",
    auth_mode: object = "bearer",
    auth_header: object = None,
    credential: object = None,
    ip: str = "",
) -> dict[str, Any]:
    """OpenCode §4: Name + Base URL + Format + Auth mode (+ header name iff custom-header)
    + Credential. No model fields — a custom provider starts with 0 models (D-081)."""
    from sotto_worker.server.catalog import check_endpoint_url

    _owner(owner)
    store.company_row(company_id)
    clean_name = str(name or "").strip()
    if not 2 <= len(clean_name) <= 40:
        raise CloudError("invalid", "the provider name is 2 to 40 characters")
    if str(kind or "llm") not in CUSTOM_KINDS:
        raise CloudError("invalid", "kind is llm or stt")
    fmt, mode, header = _custom_check_format_auth(
        str(format or "chat-completions"), str(auth_mode or "bearer"),
        None if auth_header is None else str(auth_header),
    )
    credential = None if credential is None else str(credential)
    try:
        url = check_endpoint_url(str(base_url or ""), has_key=bool(credential))
    except ValueError as e:
        raise CloudError("invalid", str(e)) from None
    base = _custom_slug(clean_name)
    provider_id = base
    n = 2
    while store._q("SELECT 1 FROM custom_providers WHERE id = ?", (provider_id,)):
        if n > 10:
            raise CloudError("invalid", "a provider with that name already exists")
        provider_id = f"{base}-{n}"
        n += 1
    t = now_ms()
    with store._tx() as db:
        db.execute(
            "INSERT INTO custom_providers(id, company_id, name, kind, base_url, format,"
            " auth_mode, auth_header, models_json, created_at, updated_at)"
            " VALUES (?,?,?,?,?,?,?,?,'[]',?,?)",
            (
                provider_id,
                company_id,
                clean_name,
                str(kind or "llm"),
                url,
                fmt,
                mode,
                header,
                t,
                t,
            ),
        )
        if credential:
            _custom_write_key(db, store, company_id, _custom_key_env(provider_id), credential)
        store.audit(
            db,
            "owner.custom_provider.created",
            provider_id,
            company_id=company_id,
            actor=owner,
            ip=ip,
        )
    return custom_provider(store, company_id, provider_id)


def update_custom_provider(
    store: CloudStore,
    owner: Principal,
    company_id: str,
    provider_id: str,
    *,
    name: object = None,
    base_url: object = None,
    format: object = None,
    auth_mode: object = None,
    auth_header: object = None,
    credential: object = None,
    ip: str = "",
) -> dict[str, Any]:
    """Edit a custom provider. The id never changes (OpenCode §2). An empty credential
    keeps the saved key; a new one replaces it."""
    from sotto_worker.server.catalog import check_endpoint_url

    _owner(owner)
    r = _custom_row(store, company_id, provider_id)
    clean_name = str(name).strip() if name is not None else str(r["name"])
    if not 2 <= len(clean_name) <= 40:
        raise CloudError("invalid", "the provider name is 2 to 40 characters")
    mode = str(auth_mode) if auth_mode is not None else str(r["auth_mode"])
    header: str | None
    if mode != "custom-header":
        header = None  # leaving custom-header clears the stored header name
    elif auth_header is not None:
        header = str(auth_header)
    else:
        header = str(r["auth_header"]) if r["auth_header"] else None
    fmt, mode, header = _custom_check_format_auth(
        str(format) if format is not None else str(r["format"]),
        mode,
        header,
    )
    credential = None if credential is None else str(credential)
    has_key = custom_provider_key(store, company_id, provider_id) is not None
    try:
        url = check_endpoint_url(
            str(base_url) if base_url is not None else str(r["base_url"]),
            has_key=bool(credential) or has_key,
        )
    except ValueError as e:
        raise CloudError("invalid", str(e)) from None
    with store._tx() as db:
        db.execute(
            "UPDATE custom_providers SET name = ?, base_url = ?, format = ?, auth_mode = ?,"
            " auth_header = ?, updated_at = ? WHERE company_id = ? AND id = ?",
            (clean_name, url, fmt, mode, header, now_ms(), company_id, provider_id),
        )
        if credential:
            _custom_write_key(db, store, company_id, _custom_key_env(provider_id), credential)
        store.audit(
            db,
            "owner.custom_provider.updated",
            provider_id,
            company_id=company_id,
            actor=owner,
            ip=ip,
        )
    return custom_provider(store, company_id, provider_id)


def delete_custom_provider(
    store: CloudStore, owner: Principal, company_id: str, provider_id: str, *, ip: str = ""
) -> None:
    """Removes the provider, its key, and every stage route naming it — a deleted provider
    must not leave a stage pointing at an endpoint that no longer exists (D-081)."""
    _owner(owner)
    _custom_row(store, company_id, provider_id)
    stages = [
        str(r["stage"])
        for r in store._q(
            "SELECT stage FROM company_routes WHERE company_id = ? AND provider_id = ?",
            (company_id, provider_id),
        )
    ]
    with store._tx() as db:
        db.execute(
            "DELETE FROM company_routes WHERE company_id = ? AND provider_id = ?",
            (company_id, provider_id),
        )
        db.execute(
            "DELETE FROM company_keys WHERE company_id = ? AND key_env = ?",
            (company_id, _custom_key_env(provider_id)),
        )
        db.execute(
            "DELETE FROM custom_providers WHERE company_id = ? AND id = ?",
            (company_id, provider_id),
        )
        store.audit(
            db,
            "owner.custom_provider.deleted",
            provider_id + (f" (routes reset: {','.join(stages)})" if stages else ""),
            company_id=company_id,
            actor=owner,
            ip=ip,
        )


def add_custom_model(
    store: CloudStore,
    owner: Principal,
    company_id: str,
    provider_id: str,
    *,
    model_id: object,
    display_name: object = None,
    ip: str = "",
) -> dict[str, Any]:
    """OpenCode §5 "+ Add Model": Display name + Model ID only. A new model starts enabled."""
    _owner(owner)
    r = _custom_row(store, company_id, provider_id)
    mid = str(model_id or "").strip()
    if not mid or len(mid) > 200 or any(c.isspace() for c in mid):
        raise CloudError("invalid", "the model ID is a non-empty ID without spaces")
    display = str(display_name or mid).strip()[:120] or mid
    models = _custom_models(str(r["models_json"]))
    if any(m["id"] == mid for m in models):
        raise CloudError("invalid", "that model is already listed for this provider")
    models.append({"id": mid, "display_name": display, "enabled": True})
    with store._tx() as db:
        db.execute(
            "UPDATE custom_providers SET models_json = ?, updated_at = ?"
            " WHERE company_id = ? AND id = ?",
            (json.dumps(models), now_ms(), company_id, provider_id),
        )
        store.audit(
            db,
            "owner.custom_provider.model.added",
            f"{provider_id}/{mid}",
            company_id=company_id,
            actor=owner,
            ip=ip,
        )
    return custom_provider(store, company_id, provider_id)


def update_custom_model(
    store: CloudStore,
    owner: Principal,
    company_id: str,
    provider_id: str,
    model_id: str,
    *,
    enabled: object = None,
    display_name: object = None,
    ip: str = "",
) -> dict[str, Any]:
    """The Enabled toggle applies immediately — no Save step (OpenCode §5). The model ID
    itself never changes."""
    _owner(owner)
    r = _custom_row(store, company_id, provider_id)
    models = _custom_models(str(r["models_json"]))
    target = next((m for m in models if m["id"] == model_id), None)
    if target is None:
        raise CloudError("not_found", "no such model for this provider")
    if enabled is not None:
        if not isinstance(enabled, bool):
            raise CloudError("invalid", "enabled must be true or false")
        target["enabled"] = enabled
    if display_name is not None:
        display = str(display_name).strip()[:120]
        if not display:
            raise CloudError("invalid", "the display name cannot be empty")
        target["display_name"] = display
    with store._tx() as db:
        db.execute(
            "UPDATE custom_providers SET models_json = ?, updated_at = ?"
            " WHERE company_id = ? AND id = ?",
            (json.dumps(models), now_ms(), company_id, provider_id),
        )
        store.audit(
            db,
            "owner.custom_provider.model.updated",
            f"{provider_id}/{model_id}",
            company_id=company_id,
            actor=owner,
            ip=ip,
        )
    return custom_provider(store, company_id, provider_id)


def delete_custom_model(
    store: CloudStore,
    owner: Principal,
    company_id: str,
    provider_id: str,
    model_id: str,
    *,
    ip: str = "",
) -> dict[str, Any]:
    """Removes a model from the list. A stage already using it keeps its route until the
    owner re-picks (no silent fallback); the console flags it unavailable (D-081)."""
    _owner(owner)
    r = _custom_row(store, company_id, provider_id)
    models = _custom_models(str(r["models_json"]))
    if not any(m["id"] == model_id for m in models):
        raise CloudError("not_found", "no such model for this provider")
    models = [m for m in models if m["id"] != model_id]
    with store._tx() as db:
        db.execute(
            "UPDATE custom_providers SET models_json = ?, updated_at = ?"
            " WHERE company_id = ? AND id = ?",
            (json.dumps(models), now_ms(), company_id, provider_id),
        )
        store.audit(
            db,
            "owner.custom_provider.model.deleted",
            f"{provider_id}/{model_id}",
            company_id=company_id,
            actor=owner,
            ip=ip,
        )
    return custom_provider(store, company_id, provider_id)


def record_custom_models(
    store: CloudStore, company_id: str, provider_id: str, ids: list[str]
) -> dict[str, Any]:
    """What "Test" discovered, merged in: new IDs join the list as enabled models (the
    local server's record_endpoint_models). Nothing is ever removed by a test."""
    r = _custom_row(store, company_id, provider_id)
    models = _custom_models(str(r["models_json"]))
    known = {m["id"] for m in models}
    for mid in ids:
        mid = str(mid).strip()
        if mid and len(mid) <= 200 and not any(c.isspace() for c in mid) and mid not in known:
            models.append({"id": mid, "display_name": mid, "enabled": True})
            known.add(mid)
    with store._tx() as db:
        db.execute(
            "UPDATE custom_providers SET models_json = ?, updated_at = ?"
            " WHERE company_id = ? AND id = ?",
            (json.dumps(models), now_ms(), company_id, provider_id),
        )
    return custom_provider(store, company_id, provider_id)


def record_custom_test(
    store: CloudStore, company_id: str, provider_id: str, ok: bool, detail: str
) -> None:
    _custom_row(store, company_id, provider_id)
    with store._tx() as db:
        db.execute(
            "UPDATE custom_providers SET tested_at = ?, test_ok = ?, test_detail = ?"
            " WHERE company_id = ? AND id = ?",
            (now_ms(), int(ok), detail[:200], company_id, provider_id),
        )


# --- circuit breaking (ZC-06) --------------------------------------------------------------------
def demotions(store: CloudStore, t: int | None = None) -> dict[str, int]:
    """Vendors demoted for everyone right now: {vendor: until (epoch ms)}."""
    t = now_ms() if t is None else t
    return {
        str(r["provider_id"]): int(r["until"])
        for r in store._q("SELECT provider_id, until FROM provider_demotions WHERE until > ?", (t,))
    }


def report_failures(
    store: CloudStore, who: Principal, items: object, vendors: Iterable[str]
) -> dict[str, int]:
    """The app's primary-model failures since its last report. Returns the demotions now on."""
    if not isinstance(items, list) or len(items) > 20:
        raise CloudError("invalid", "send up to 20 failures")
    known = set(vendors)
    rows: list[tuple[str, str, str, int]] = []
    for item in items:
        if not isinstance(item, dict):
            raise CloudError("invalid", "each failure is an object")
        vendor, stage = str(item.get("provider", "")), str(item.get("stage", ""))
        reason, count = str(item.get("reason", "")), item.get("count", 1)
        if vendor not in known or stage not in (*LIVE_STAGES, "summary"):
            continue  # an unknown or custom endpoint never counts toward a platform demotion
        if reason not in FAIL_REASONS:
            raise CloudError("invalid", "reason is error or timeout")
        if not isinstance(count, int) or isinstance(count, bool) or not 1 <= count <= 50:
            raise CloudError("invalid", "count must be 1 to 50")
        rows.append((vendor, stage, reason, count))
    t = now_ms()
    with store._tx() as db:
        db.execute("DELETE FROM provider_failures WHERE at < ?", (t - 86_400_000,))
        for vendor, stage, reason, count in rows:
            db.execute(
                "INSERT INTO provider_failures(provider_id, stage, company_id, reason, count, at)"
                " VALUES (?,?,?,?,?,?)",
                (vendor, stage, who.company, reason, count, t),
            )
        for vendor in {r[0] for r in rows}:
            _maybe_demote(store, db, vendor, t)
    return demotions(store, t)


def _window(db: Any, vendor: str, t: int) -> tuple[int, int]:
    """(failures, distinct companies) for one vendor within the window. Each company counts at
    most FAIL_THRESHOLD, so one tenant's flood cannot reach the threshold by itself."""
    # Security review M: only companies that made real calls in the last 30 days and are not an
    # unapproved self-signup count, so free trial sign-ups cannot demote a vendor for everyone.
    per = db.execute(
        "SELECT company_id, SUM(count) AS n FROM provider_failures"
        " WHERE provider_id = ? AND at >= ?"
        " AND company_id IN (SELECT company_id FROM usage WHERE reported_at >= ?)"
        " AND company_id NOT IN (SELECT company_id FROM signups"
        "   WHERE approved_at IS NULL AND company_id IS NOT NULL)"
        " GROUP BY company_id",
        (vendor, t - FAIL_WINDOW_MS, t - 30 * 86_400_000),
    ).fetchall()
    return sum(min(int(r["n"]), FAIL_THRESHOLD - 1) for r in per), len(per)


def _maybe_demote(store: CloudStore, db: Any, vendor: str, t: int) -> None:
    active = db.execute(
        "SELECT until FROM provider_demotions WHERE provider_id = ? AND until > ?", (vendor, t)
    ).fetchone()
    if active is not None:
        return
    failures, companies = _window(db, vendor, t)
    if failures >= FAIL_THRESHOLD and companies >= FAIL_MIN_COMPANIES:
        reason = f"{failures} failures from {companies} companies in 10 min"
        db.execute(
            "INSERT OR REPLACE INTO provider_demotions(provider_id, since, until, reason, manual)"
            " VALUES (?,?,?,?,0)",
            (vendor, t, t + DEMOTE_MS, reason),
        )
        store.audit(db, "platform.provider.demoted", f"{vendor}: {reason}")


def demote(
    store: CloudStore,
    owner: Principal,
    vendor: str,
    minutes: object,
    known: Iterable[str],
    *,
    ip: str,
) -> None:
    _owner(owner)
    if vendor not in set(known):
        raise CloudError("not_found", "unknown vendor")
    if not isinstance(minutes, int) or isinstance(minutes, bool) or not 5 <= minutes <= 24 * 60:
        raise CloudError("invalid", "minutes must be 5 to 1440")
    t = now_ms()
    with store._tx() as db:
        db.execute(
            "INSERT OR REPLACE INTO provider_demotions(provider_id, since, until, reason, manual)"
            " VALUES (?,?,?,?,1)",
            (vendor, t, t + minutes * 60_000, "demoted by the owner"),
        )
        store.audit(db, "owner.provider.demoted", f"{vendor} for {minutes} min", actor=owner, ip=ip)


def restore(store: CloudStore, owner: Principal, vendor: str, *, ip: str) -> None:
    _owner(owner)
    with store._tx() as db:
        db.execute(
            "UPDATE provider_demotions SET until = ? WHERE provider_id = ? AND until > ?",
            (now_ms(), vendor, now_ms()),
        )
        store.audit(db, "owner.provider.restored", vendor, actor=owner, ip=ip)


def health(store: CloudStore, catalog: Catalog) -> dict[str, Any]:
    """The owner's health board: per vendor, recent failures, companies affected, demotion."""
    t = now_ms()
    out = []
    with store._lock:
        db = store._db
        for p in catalog.providers.values():
            if p.kind != "llm":
                continue
            failures, companies = _window(db, p.id, t)
            day = db.execute(
                "SELECT COALESCE(SUM(count), 0) AS n FROM provider_failures"
                " WHERE provider_id = ? AND at >= ?",
                (p.id, t - 86_400_000),
            ).fetchone()
            last = db.execute(
                "SELECT * FROM provider_demotions WHERE provider_id = ?", (p.id,)
            ).fetchone()
            raw_10m = db.execute(
                "SELECT COALESCE(SUM(count), 0) AS n FROM provider_failures"
                " WHERE provider_id = ? AND at >= ?",
                (p.id, t - FAIL_WINDOW_MS),
            ).fetchone()
            out.append(
                {
                    "id": p.id,
                    "name": p.name,
                    "failures_10m": int(raw_10m["n"]),
                    "counted_10m": failures,
                    "companies_10m": companies,
                    "failures_24h": int(day["n"]),
                    "demoted": bool(last and int(last["until"]) > t),
                    "since": int(last["since"]) if last else None,
                    "until": int(last["until"]) if last else None,
                    "reason": str(last["reason"]) if last else None,
                    "manual": bool(last["manual"]) if last else False,
                }
            )
    return {
        "providers": out,
        "rule": {
            "threshold": FAIL_THRESHOLD,
            "min_companies": FAIL_MIN_COMPANIES,
            "window_min": FAIL_WINDOW_MS // 60_000,
            "demote_min": DEMOTE_MS // 60_000,
        },
    }


# --- prompt studio (DD-2, R6) --------------------------------------------------------------------
def _version_out(r: Any) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "key": str(r["key"]),
        "scope": str(r["scope"]),
        "scope_id": str(r["scope_id"]) or None,
        "company_id": r["company_id"],
        "version": int(r["version"]),
        "body": str(r["body"]),
        "variables": json.loads(r["variables"]),
        "note": str(r["note"]),
        "status": str(r["status"]),
        "created_at": int(r["created_at"]),
        "published_at": r["published_at"],
        "test": json.loads(r["test_json"]) if r["test_json"] else None,
    }


def _slot(scope: str, scope_id: str | None, company_id: str | None) -> tuple[str, str | None]:
    """(scope_id stored, company_id stored) for a level, checked."""
    if scope not in PROMPT_SCOPES:
        raise CloudError("invalid", "level is platform, company, team or campaign")
    if scope == "platform":
        return "", None
    if not company_id:
        raise CloudError("invalid", "choose the company")
    if scope == "company":
        return company_id, company_id
    if not scope_id or not SCOPE_ID.match(scope_id):
        raise CloudError("invalid", f"give the {scope} id")
    return scope_id, company_id


def prompt_versions(
    store: CloudStore, key: str | None = None, *, company_id: str | None = None, owner: bool
) -> list[dict[str, Any]]:
    """Owner: every version. A company (BYO): its own company/team/campaign versions only."""
    sql, args = "SELECT * FROM prompt_versions WHERE 1 = 1", []
    if key is not None:
        sql += " AND key = ?"
        args.append(key)
    if not owner:
        sql += " AND company_id = ?"
        args.append(company_id or "")
    elif company_id is not None:
        sql += " AND (company_id = ? OR company_id IS NULL)"
        args.append(company_id)
    sql += " ORDER BY key, scope, scope_id, version"
    return [_version_out(r) for r in store._q(sql, tuple(args))]


def create_version(
    store: CloudStore,
    seed: Seed,
    who: Principal,
    *,
    key: str,
    body: object,
    scope: str,
    scope_id: str | None = None,
    company_id: str | None = None,
    note: object = "",
    ip: str,
) -> dict[str, Any]:
    """A new draft. Variables must be ones the seed prompt already uses: an older app cannot
    render a variable it does not know (D-037)."""
    from sotto_worker.prompts.registry import VARIABLE

    if key not in seed.prompts:
        raise CloudError("not_found", "unknown prompt")
    if not who.is_owner:
        company_id = who.company  # a company only ever writes its own levels
        if scope == "platform":
            raise CloudError("forbidden", "only AGN changes platform prompts")
    text = str(body if body is not None else "").replace("\r\n", "\n").strip()
    if not 20 <= len(text) <= PROMPT_MAX_CHARS:
        raise CloudError("invalid", f"the prompt must be 20 to {PROMPT_MAX_CHARS} characters")
    allowed = set(seed.prompts[key]["variables"])
    used = sorted(set(VARIABLE.findall(text)))
    unknown = [v for v in used if v not in allowed]
    if unknown:
        raise CloudError("invalid", f"unknown variable(s): {', '.join(unknown)}")
    if company_id is not None:
        store.company_row(company_id)
    stored_id, stored_company = _slot(scope, scope_id, company_id)
    t, vid = now_ms(), str(uuid.uuid4())
    with store._tx() as db:
        top = db.execute(
            "SELECT MAX(version) AS v FROM prompt_versions WHERE key = ? AND scope = ?"
            " AND scope_id = ? AND company_id IS ?",
            (key, scope, stored_id, stored_company),
        ).fetchone()
        version = max(int(top["v"] or 0), int(seed.prompts[key]["version"])) + 1
        db.execute(
            "INSERT INTO prompt_versions(id, key, scope, scope_id, company_id, version, body,"
            " variables, note, status, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                vid,
                key,
                scope,
                stored_id,
                stored_company,
                version,
                text + "\n",
                json.dumps(used),
                str(note or "")[:200],
                "draft",
                t,
                who.user_id,
            ),
        )
        store.audit(
            db,
            "prompt.created",
            f"{key} v{version} ({scope})",
            company_id=stored_company,
            actor=who,
            ip=ip,
        )
    return _get_version(store, who, vid)


def _get_version(store: CloudStore, who: Principal, version_id: str) -> dict[str, Any]:
    rows = store._q("SELECT * FROM prompt_versions WHERE id = ?", (version_id,))
    if not rows or (not who.is_owner and rows[0]["company_id"] != who.company):
        raise CloudError("not_found", "no such prompt version")  # never "exists elsewhere"
    return _version_out(rows[0])


def get_version(store: CloudStore, who: Principal, version_id: str) -> dict[str, Any]:
    return _get_version(store, who, version_id)


def save_test(store: CloudStore, who: Principal, version_id: str, result: dict[str, Any]) -> None:
    _get_version(store, who, version_id)
    with store._tx() as db:
        db.execute(
            "UPDATE prompt_versions SET test_json = ? WHERE id = ?",
            (json.dumps(result), version_id),
        )


def publish_version(
    store: CloudStore, who: Principal, version_id: str, *, ip: str
) -> dict[str, Any]:
    """Publishes one version of its slot; publishing an older one is the one-click rollback.
    A draft needs a passing test first (R6: tested before publishing)."""
    v = _get_version(store, who, version_id)
    if v["test"] is None and v["published_at"] is None:
        raise CloudError("untested", "test this version on the recorded calls first")
    if v["test"] is not None and not v["test"].get("passed") and v["published_at"] is None:
        raise CloudError("untested", "this version failed its test; fix it and test again")
    t = now_ms()
    with store._tx() as db:
        db.execute(
            "UPDATE prompt_versions SET status = 'retired' WHERE key = ? AND scope = ?"
            " AND scope_id = ? AND company_id IS ? AND status = 'published'",
            (v["key"], v["scope"], v["scope_id"] or "", v["company_id"]),
        )
        db.execute(
            "UPDATE prompt_versions SET status = 'published', published_at = ? WHERE id = ?",
            (t, version_id),
        )
        store.audit(
            db,
            "prompt.published",
            f"{v['key']} v{v['version']} ({v['scope']})",
            company_id=v["company_id"],
            actor=who,
            ip=ip,
        )
    return _get_version(store, who, version_id)


def unpublish_slot(
    store: CloudStore, who: Principal, version_id: str, *, ip: str
) -> dict[str, Any]:
    """Back to the level above (seed or platform) for this slot: rollback past the first version."""
    v = _get_version(store, who, version_id)
    with store._tx() as db:
        db.execute(
            "UPDATE prompt_versions SET status = 'retired' WHERE key = ? AND scope = ?"
            " AND scope_id = ? AND company_id IS ? AND status = 'published'",
            (v["key"], v["scope"], v["scope_id"] or "", v["company_id"]),
        )
        store.audit(
            db,
            "prompt.unpublished",
            f"{v['key']} ({v['scope']})",
            company_id=v["company_id"],
            actor=who,
            ip=ip,
        )
    return _get_version(store, who, version_id)


def effective_prompts(
    store: CloudStore,
    seed: Seed,
    company_id: str,
    *,
    team_id: str | None = None,
    campaign_id: str | None = None,
) -> dict[str, dict[str, Any]]:
    """The prompts a call uses: seed, then platform, company, team and campaign published
    versions, the most specific winning (R6). Company levels apply only while BYO is on, or when
    AGN wrote them (owner-only overrides, D-059)."""
    rows = store._q(
        "SELECT p.*, u.role AS author_role FROM prompt_versions p"
        " LEFT JOIN users u ON u.id = p.created_by"
        " WHERE p.status = 'published' AND (p.company_id IS NULL OR p.company_id = ?)",
        (company_id,),
    )
    byo = byo_on(store, company_id)
    wanted = {
        ("platform", ""): 0,
        ("company", company_id): 1,
        ("team", team_id or "\0"): 2,
        ("campaign", campaign_id or "\0"): 3,
    }
    best: dict[str, tuple[int, Any]] = {}
    for r in rows:
        rank = wanted.get((str(r["scope"]), str(r["scope_id"])))
        if rank is None:
            continue
        if rank > 0 and r["author_role"] != "owner" and not byo:
            continue  # a company's own version stops applying when AGN switches BYO off
        if str(r["key"]) not in seed.prompts:
            continue
        if str(r["key"]) not in best or rank > best[str(r["key"])][0]:
            best[str(r["key"])] = (rank, r)
    out = dict(seed.prompts)
    for key, (_rank, r) in best.items():
        out[key] = {
            **seed.prompts[key],
            "version": int(r["version"]),
            "variables": list(seed.prompts[key]["variables"]),
            "body": str(r["body"]),
            "scope": str(r["scope"]),
        }
    return out


# --- Zoho per-DC clients and company overrides (ZC-01, D-064) ------------------------------------
def _ends(client_id: str) -> str:
    return client_id[-4:]


def set_dc_client(
    store: CloudStore, owner: Principal, dc: str, client_id: str, client_secret: str, *, ip: str
) -> None:
    _owner(owner)
    dc = store._zoho_dc(dc)
    blob = store._vault.encrypt(
        f"zoho-dc-client:{dc}", store._zoho_client_blob(client_id, client_secret)
    )
    with store._tx() as db:
        db.execute(
            "INSERT INTO zoho_dc_clients(dc, ciphertext, updated_at) VALUES (?,?,?)"
            " ON CONFLICT(dc) DO UPDATE SET ciphertext = excluded.ciphertext,"
            " updated_at = excluded.updated_at",
            (dc, blob, now_ms()),
        )
        store.audit(db, "owner.zoho_dc_client.set", dc, actor=owner, ip=ip)


def delete_dc_client(store: CloudStore, owner: Principal, dc: str, *, ip: str) -> None:
    _owner(owner)
    with store._tx() as db:
        db.execute("DELETE FROM zoho_dc_clients WHERE dc = ?", (dc,))
        store.audit(db, "owner.zoho_dc_client.deleted", dc, actor=owner, ip=ip)


def dc_clients(store: CloudStore) -> dict[str, dict[str, str]]:
    """{dc: {client_id, client_secret}}: server-side only."""
    out: dict[str, dict[str, str]] = {}
    for r in store._q("SELECT dc, ciphertext FROM zoho_dc_clients"):
        try:
            out[str(r["dc"])] = json.loads(
                store._vault.decrypt(f"zoho-dc-client:{r['dc']}", r["ciphertext"])
            )
        except VaultError:
            continue
    return out


def zoho_status(store: CloudStore) -> dict[str, Any]:
    """The owner's Zoho clients view: write-only, so only "Client ID ends …", DC and date."""
    main = store.zoho_client_main()
    per_dc = []
    stamps = {str(r["dc"]): int(r["updated_at"]) for r in store._q("SELECT * FROM zoho_dc_clients")}
    for dc, c in sorted(dc_clients(store).items()):
        per_dc.append({"dc": dc, "client_id_ends": _ends(c["client_id"]), "updated_at": stamps[dc]})
    overrides = []
    for r in store._q(
        "SELECT z.company_id, z.dc, z.updated_at, z.ciphertext, c.name FROM company_zoho_client z"
        " JOIN companies c ON c.id = z.company_id ORDER BY c.name COLLATE NOCASE"
    ):
        try:
            cid = json.loads(
                store._vault.decrypt(f"zoho-client:{r['company_id']}", r["ciphertext"])
            )["client_id"]
        except VaultError:
            cid = "????"
        overrides.append(
            {
                "company_id": str(r["company_id"]),
                "company": str(r["name"]),
                "dc": str(r["dc"]),
                "client_id_ends": _ends(cid),
                "updated_at": int(r["updated_at"]),
            }
        )
    return {
        "platform": (
            {
                "configured": True,
                "dc": main["dc"],
                "client_id_ends": _ends(main["client_id"]),
                "updated_at": main["updated_at"],
            }
            if main
            else {"configured": False}
        ),
        "dc_clients": per_dc,
        "overrides": overrides,
    }


# --- self-signup (ZC-10, D-068) ------------------------------------------------------------------
SIGNUP_SECRET = "signup_webhook_secret_sha256"  # noqa: S105 - a settings key name, not a secret


def rotate_signup_secret(store: CloudStore, owner: Principal, *, ip: str) -> str:
    """A new shared secret, shown once; only its hash is kept."""
    _owner(owner)
    secret = secrets.token_urlsafe(32)
    with store._tx() as db:
        db.execute(
            "INSERT OR REPLACE INTO platform_settings(key, value, updated_at) VALUES (?,?,?)",
            (SIGNUP_SECRET, hashlib.sha256(secret.encode()).hexdigest(), now_ms()),
        )
        store.audit(db, "owner.signup_secret.rotated", "", actor=owner, ip=ip)
    return secret


def signup_secret_set(store: CloudStore) -> int | None:
    rows = store._q("SELECT updated_at FROM platform_settings WHERE key = ?", (SIGNUP_SECRET,))
    return int(rows[0]["updated_at"]) if rows else None


def signup_secret_ok(store: CloudStore, given: str | None) -> bool:
    rows = store._q("SELECT value FROM platform_settings WHERE key = ?", (SIGNUP_SECRET,))
    if not rows or not given or len(given) > 200:
        return False
    return hmac.compare_digest(hashlib.sha256(given.encode()).hexdigest(), str(rows[0]["value"]))


def signup(
    store: CloudStore,
    seed: Seed,
    *,
    company: str,
    name: str,
    email: str,
    phone: str,
    ip: str,
) -> tuple[str, str] | None:
    """A trial company and its first admin, once per address. Returns (company_id, user_id), or
    None when this address signed up or has an account already (nothing new is created)."""
    from sotto_worker.cloud.store import EMAIL

    email = email.strip().lower()[:254]
    if not EMAIL.match(email):
        raise CloudError("invalid", "a valid email is needed")
    if store._q("SELECT 1 FROM signups WHERE email = ?", (email,)) or store._q(
        "SELECT 1 FROM users WHERE email = ?", (email,)
    ):
        return None
    company = company.strip() or email.split("@", 1)[1]
    name = name.strip() or email.split("@", 1)[0]
    try:
        # Nobody knows this password: the admin chooses theirs from the invite link.
        company_id, user_id = store.signup(
            company=company[:120],
            name=name[:120],
            email=email,
            password=secrets.token_urlsafe(24),
            ip=ip,
            examples=seed.examples,
        )
    except CloudError as e:
        if e.code == "email_taken":
            return None
        raise
    with store._tx() as db:
        db.execute(
            "INSERT OR IGNORE INTO signups(id, email, company_id, company_name, name, phone, ip,"
            " created_at) VALUES (?,?,?,?,?,?,?,?)",
            (
                str(uuid.uuid4()),
                email,
                company_id,
                company[:120],
                name[:120],
                phone[:40],
                ip,
                now_ms(),
            ),
        )
    return company_id, user_id


def invite_token(store: CloudStore, company_id: str, user_id: str) -> str:
    """A 7-day single-use set-password token (the reset page spends it, D-053)."""
    from sotto_worker.cloud.store import _token_hash

    token = secrets.token_urlsafe(32)
    t = now_ms()
    with store._tx() as db:
        db.execute(
            "INSERT INTO password_resets(token_hash, company_id, user_id, created_at, expires_at)"
            " VALUES (?,?,?,?,?)",
            (_token_hash(token), company_id, user_id, t, t + INVITE_TTL_MS),
        )
        db.execute("UPDATE signups SET invited_at = ? WHERE company_id = ?", (t, company_id))
        store.audit(db, "signup.invited", "", company_id=company_id)
    return token


def signups(store: CloudStore) -> list[dict[str, Any]]:
    rows = store._q(
        "SELECT s.*, c.suspended, c.plan, c.trial_ends_at FROM signups s"
        " LEFT JOIN companies c ON c.id = s.company_id ORDER BY s.created_at DESC LIMIT 500"
    )
    return [
        {
            "id": str(r["id"]),
            "email": str(r["email"]),
            "name": str(r["name"]),
            "company": str(r["company_name"]),
            "company_id": r["company_id"],
            "phone": str(r["phone"]),
            "created_at": int(r["created_at"]),
            "invited_at": r["invited_at"],
            "status": "deleted"
            if r["company_id"] is None
            else "suspended"
            if r["suspended"]
            else str(r["plan"]),
            "trial_ends_at": r["trial_ends_at"],
            "approved_at": r["approved_at"],
        }
        for r in rows
    ]
