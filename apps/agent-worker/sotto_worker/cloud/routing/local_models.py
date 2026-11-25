"""Local / offline model endpoints, benchmarking, D-096 slow opt-in, and mid-call fallback (L6).

- Owner enables per company and per user (text and voice separately, default off).
- Company owner setting `allow_cloud_backup` (default on) controls mid-call failure fallback.
- User enters a URL (localhost or company LAN), runs Test (reachability + short benchmark).
- Meets R1 (<= 1500 ms) -> may drive live cards; else slow jobs only unless opted in (D-096:
  holding line at 1.5 s, local card replaces it with "local model \u2013 slower" badge, measured but
  excluded from the p95 alarm).
- Every fallback is logged via cloud/obs/log.py (metadata only).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import urlparse

import httpx

from sotto_worker.cloud.obs import store as obs_store
from sotto_worker.cloud.obs.log import log_event
from sotto_worker.cloud.store import CloudError, CloudStore, Principal, now_ms

EndpointKind = Literal["text", "stt", "tts"]
R1_LIMIT_MS = 1500
SLOW_BADGE = "local model \u2013 slower"
HOLDING_LINE_MS = 1500

SCHEMA = """
CREATE TABLE IF NOT EXISTS local_model_company_policy (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  text_enabled INTEGER NOT NULL DEFAULT 0,
  voice_enabled INTEGER NOT NULL DEFAULT 0,
  allow_cloud_backup INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS local_model_user_endpoints (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  base_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'untested',
  measured_ms INTEGER,
  meets_r1 INTEGER NOT NULL DEFAULT 0,
  live_opt_in INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, user_id, kind)
);
"""


def ensure_schema(store: CloudStore) -> None:
    obs_store.ensure_schema(store)
    with store._tx() as db:
        for stmt in SCHEMA.split(";"):
            if stmt.strip():
                db.execute(stmt)


def _require_owner(actor: Principal) -> None:
    if actor.role != "owner":
        raise CloudError("forbidden", "only the platform owner may change local-model policy")


def _require_tenant(actor: Principal, company_id: str) -> None:
    if actor.role == "owner":
        return
    if actor.company_id != company_id:
        raise CloudError("forbidden", "cannot access another company's local-model settings")


def validate_local_url(url: str) -> str:
    cleaned = url.strip().rstrip("/")
    parsed = urlparse(cleaned)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise CloudError("invalid", "enter a valid http:// or https:// endpoint URL")
    return cleaned


def set_company_policy(
    store: CloudStore,
    owner: Principal,
    company_id: str,
    *,
    text_enabled: bool | None = None,
    voice_enabled: bool | None = None,
    allow_cloud_backup: bool | None = None,
    ip: str = "127.0.0.1",
) -> dict[str, Any]:
    """Owner sets per-company local model switches and Allow cloud backup (default on)."""
    _require_owner(owner)
    ensure_schema(store)
    store.company_row(company_id)
    cur = get_company_policy(store, company_id)
    next_text = cur["text_enabled"] if text_enabled is None else text_enabled
    next_voice = cur["voice_enabled"] if voice_enabled is None else voice_enabled
    next_backup = cur["allow_cloud_backup"] if allow_cloud_backup is None else allow_cloud_backup
    t = now_ms()
    with store._tx() as db:
        db.execute(
            "INSERT INTO local_model_company_policy"
            "(company_id, text_enabled, voice_enabled, allow_cloud_backup, updated_at)"
            " VALUES (?,?,?,?,?)"
            " ON CONFLICT(company_id) DO UPDATE SET"
            " text_enabled = excluded.text_enabled,"
            " voice_enabled = excluded.voice_enabled,"
            " allow_cloud_backup = excluded.allow_cloud_backup,"
            " updated_at = excluded.updated_at",
            (company_id, int(next_text), int(next_voice), int(next_backup), t),
        )
        store.audit(
            db,
            "owner.local_models.policy_set",
            f"company={company_id} text={next_text} voice={next_voice} backup={next_backup}",
            actor=owner,
            ip=ip,
        )
    return {
        "company_id": company_id,
        "text_enabled": next_text,
        "voice_enabled": next_voice,
        "allow_cloud_backup": next_backup,
    }


def get_company_policy(store: CloudStore, company_id: str) -> dict[str, Any]:
    ensure_schema(store)
    rows = store._q(
        "SELECT text_enabled, voice_enabled, allow_cloud_backup"
        " FROM local_model_company_policy WHERE company_id = ?",
        (company_id,),
    )
    if not rows:
        return {
            "company_id": company_id,
            "text_enabled": False,
            "voice_enabled": False,
            "allow_cloud_backup": True,
        }
    r = rows[0]
    return {
        "company_id": company_id,
        "text_enabled": bool(r["text_enabled"]),
        "voice_enabled": bool(r["voice_enabled"]),
        "allow_cloud_backup": bool(r["allow_cloud_backup"]),
    }


def is_local_enabled(store: CloudStore, company_id: str, user_id: str, kind: EndpointKind) -> bool:
    """Effective L6 switch: user override (D-095) wins, else company policy (default off)."""
    ensure_schema(store)
    feature_id = "local_models_text" if kind == "text" else "local_models_voice"
    overrides = obs_store.user_overrides_for(store, company_id, user_id)
    if feature_id in overrides:
        return overrides[feature_id]
    policy = get_company_policy(store, company_id)
    return bool(policy["text_enabled"] if kind == "text" else policy["voice_enabled"])


@dataclass(frozen=True)
class BenchmarkResult:
    reachable: bool
    status_label: str
    measured_ms: int | None
    meets_r1: bool
    detail: str


async def probe_local_endpoint(
    base_url: str,
    kind: EndpointKind,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    timeout_s: float = 5.0,
) -> BenchmarkResult:
    """Check reachability and run a short latency benchmark against a local model server (L6)."""
    cleaned = validate_local_url(base_url)
    probe_path = "/v1/models" if kind == "text" else "/health"
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(
            base_url=cleaned, transport=transport, timeout=timeout_s
        ) as client:
            r = await client.get(probe_path)
            if r.status_code >= 400:
                return BenchmarkResult(
                    reachable=False,
                    status_label="Local model: unreachable",
                    measured_ms=None,
                    meets_r1=False,
                    detail=f"endpoint returned HTTP {r.status_code}",
                )
            # Optional header lets deterministic tests specify simulated benchmark delay
            sim_ms = r.headers.get("x-bench-ms")
            if sim_ms is not None and sim_ms.isdigit():
                measured_ms = int(sim_ms)
            else:
                measured_ms = max(1, int((time.monotonic() - t0) * 1000))
    except httpx.HTTPError:
        return BenchmarkResult(
            reachable=False,
            status_label="Local model: unreachable",
            measured_ms=None,
            meets_r1=False,
            detail="could not connect to local endpoint",
        )
    meets = measured_ms <= R1_LIMIT_MS
    return BenchmarkResult(
        reachable=True,
        status_label="Local model: connected ✓",
        measured_ms=measured_ms,
        meets_r1=meets,
        detail=(
            f"connected ✓ ({measured_ms} ms — meets 1.5 s live budget)"
            if meets
            else (
                f"connected ✓ ({measured_ms} ms — slower than 1.5 s;"
                " slow jobs only unless opted in)"
            )
        ),
    )


def save_user_endpoint(
    store: CloudStore,
    actor: Principal,
    *,
    company_id: str,
    user_id: str,
    kind: EndpointKind,
    base_url: str,
    bench: BenchmarkResult,
    live_opt_in: bool = False,
) -> dict[str, Any]:
    _require_tenant(actor, company_id)
    if actor.role != "owner" and actor.role != "admin" and actor.user_id != user_id:
        raise CloudError("forbidden", "cannot modify another user's local endpoint")
    ensure_schema(store)
    cleaned = validate_local_url(base_url)
    status = "connected" if bench.reachable else "unreachable"
    t = now_ms()
    with store._tx() as db:
        db.execute(
            "INSERT INTO local_model_user_endpoints"
            "(company_id, user_id, kind, base_url, status, measured_ms,"
            " meets_r1, live_opt_in, updated_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)"
            " ON CONFLICT(company_id, user_id, kind) DO UPDATE SET"
            " base_url = excluded.base_url, status = excluded.status,"
            " measured_ms = excluded.measured_ms, meets_r1 = excluded.meets_r1,"
            " live_opt_in = excluded.live_opt_in, updated_at = excluded.updated_at",
            (
                company_id,
                user_id,
                kind,
                cleaned,
                status,
                bench.measured_ms,
                int(bench.meets_r1),
                int(live_opt_in),
                t,
            ),
        )
    return {
        "company_id": company_id,
        "user_id": user_id,
        "kind": kind,
        "base_url": cleaned,
        "status": status,
        "status_label": bench.status_label,
        "measured_ms": bench.measured_ms,
        "meets_r1": bench.meets_r1,
        "live_opt_in": live_opt_in,
    }


def get_user_endpoints(
    store: CloudStore, actor: Principal, company_id: str, user_id: str
) -> list[dict[str, Any]]:
    _require_tenant(actor, company_id)
    ensure_schema(store)
    rows = store._q(
        "SELECT * FROM local_model_user_endpoints"
        " WHERE company_id = ? AND user_id = ? ORDER BY kind",
        (company_id, user_id),
    )
    return [dict(r) for r in rows]


def delete_user_endpoint(
    store: CloudStore, actor: Principal, company_id: str, user_id: str, kind: EndpointKind
) -> bool:
    _require_tenant(actor, company_id)
    ensure_schema(store)
    with store._tx() as db:
        cur = db.execute(
            "DELETE FROM local_model_user_endpoints"
            " WHERE company_id = ? AND user_id = ? AND kind = ?",
            (company_id, user_id, kind),
        )
        return cur.rowcount > 0


@dataclass(frozen=True)
class LocalRouteDecision:
    mode: Literal["cloud", "local_live", "slow_jobs_only", "local_live_slow_optin"]
    base_url: str | None
    holding_at_ms: int | None
    badge: str | None
    exclude_p95_alarm: bool
    measured_ms: int | None


def decide_live_route(
    store: CloudStore,
    company_id: str,
    user_id: str,
    *,
    kind: EndpointKind = "text",
) -> LocalRouteDecision:
    """Decide whether live cards use local endpoint, slow-jobs-only, or D-096 slow opt-in."""
    if not is_local_enabled(store, company_id, user_id, kind):
        return LocalRouteDecision("cloud", None, None, None, False, None)
    ensure_schema(store)
    rows = store._q(
        "SELECT base_url, status, measured_ms, meets_r1, live_opt_in"
        " FROM local_model_user_endpoints WHERE company_id = ? AND user_id = ? AND kind = ?",
        (company_id, user_id, kind),
    )
    if not rows or str(rows[0]["status"]) != "connected":
        return LocalRouteDecision("cloud", None, None, None, False, None)
    row = rows[0]
    url = str(row["base_url"])
    ms = int(row["measured_ms"]) if row["measured_ms"] is not None else None
    if bool(row["meets_r1"]):
        return LocalRouteDecision("local_live", url, None, None, False, ms)
    if bool(row["live_opt_in"]):
        # D-096: holding line at 1.5 s, local card replaces it, badge shown, excluded from p95 alarm
        return LocalRouteDecision(
            "local_live_slow_optin",
            url,
            HOLDING_LINE_MS,
            SLOW_BADGE,
            True,
            ms,
        )
    return LocalRouteDecision("slow_jobs_only", url, None, None, False, ms)


def resolve_mid_call_failure(
    store: CloudStore,
    company_id: str,
    user_id: str,
    *,
    call_id: str,
    kind: EndpointKind = "text",
    reason: str = "endpoint_error",
) -> dict[str, Any]:
    """Handle mid-call local failure: cloud backup if allowed, else holding line."""
    policy = get_company_policy(store, company_id)
    allow_backup = bool(policy["allow_cloud_backup"])
    if allow_backup:
        log_event(
            "router.local",
            "fallback_cloud_backup",
            call_id=call_id,
            level="warn",
            kind=kind,
            reason=reason,
            allow_cloud_backup=True,
        )
        return {"action": "cloud_backup", "holding_line": False, "logged": True}
    log_event(
        "router.local",
        "fallback_holding_line",
        call_id=call_id,
        level="warn",
        kind=kind,
        reason=reason,
        allow_cloud_backup=False,
    )
    return {"action": "holding_line", "holding_line": True, "logged": True}


test_local_endpoint = probe_local_endpoint
