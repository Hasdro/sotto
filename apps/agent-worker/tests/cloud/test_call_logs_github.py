"""Tests for Task 5: GitHub call logs (L3/L4), D-095 overrides, dedupe, and isolation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from sotto_worker.cloud.features import Layers, evaluate
from sotto_worker.cloud.obs import store as obs_store
from sotto_worker.cloud.obs.call_logs import (
    MAX_BODY_CHARS,
    MAX_COMMENTS,
    CallLogPayload,
    format_call_issue,
    publish_background_failure,
    publish_call_log,
    split_body_and_comments,
)
from sotto_worker.cloud.owner import logs as owner_logs
from sotto_worker.cloud.store import CloudError, CloudStore, Principal
from sotto_worker.server.vault import Vault


def _make_store(tmp_path: Path) -> tuple[CloudStore, Principal, str, str]:
    store = CloudStore(tmp_path / "cloud.db", Vault("c" * 40))
    owner = Principal(
        user_id="owner-1",
        company_id=None,
        role="owner",
        device_id=None,
        email="owner@agn.test",
        name="Owner",
    )
    c1, _ = store.signup(
        company="Alpha Corp",
        name="Ada",
        email="a@alpha.test",
        password="-".join(["correct", "horse", "battery"]),
        ip="127.0.0.1",
    )
    c2, _ = store.signup(
        company="Beta Corp",
        name="Bob",
        email="b@beta.test",
        password="-".join(["correct", "horse", "battery"]),
        ip="127.0.0.1",
    )
    return store, owner, str(c1), str(c2)


def _fake_github(requests_log: list[dict[str, Any]]) -> httpx.MockTransport:
    next_num = {"n": 100}

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8")) if request.content else {}
        requests_log.append({"method": request.method, "path": request.url.path, "body": body})
        if request.method == "POST" and request.url.path.endswith("/issues"):
            next_num["n"] += 1
            n = next_num["n"]
            return httpx.Response(
                201,
                json={"number": n, "html_url": f"https://github.com/Hasdro/logs/issues/{n}"},
            )
        if request.method == "POST" and request.url.path.endswith("/comments"):
            return httpx.Response(201, json={"id": 555})
        if request.method == "PATCH":
            return httpx.Response(200, json={"state": body.get("state", "closed")})
        return httpx.Response(404, json={"message": "not found"})

    return httpx.MockTransport(handler)


def test_per_user_owner_override_in_features_d095() -> None:
    layers_off = Layers(
        killed=frozenset(),
        not_entitled=frozenset({"call_logs_github"}),
        org_off=frozenset({"call_logs_github"}),
        connections=frozenset(),
        user_overrides={"call_logs_github": True},
    )
    assert evaluate("call_logs_github", "agent", layers_off).state == "available"

    layers_user_off = Layers(
        killed=frozenset(),
        not_entitled=frozenset(),
        org_off=frozenset(),
        connections=frozenset(),
        user_overrides={"call_logs_github": False},
    )
    assert evaluate("call_logs_github", "agent", layers_user_off).state == "off_by_platform"

    # Non-D-095 feature ignores user_overrides
    layers_other = Layers(
        killed=frozenset(),
        not_entitled=frozenset(),
        org_off=frozenset({"call_review"}),
        connections=frozenset(),
        user_overrides={"call_review": True},
    )
    assert evaluate("call_review", "agent", layers_other).state == "off_by_org"


def test_size_split_and_oldest_cut_marked() -> None:
    lines = [f"line-{i:04d}-" + ("x" * 100) for i in range(400)]
    body, comments = split_body_and_comments("Summary header", lines, max_chars=5000)
    assert len(body) <= 5000
    assert len(comments) <= MAX_COMMENTS
    assert any("oldest details omitted" in c for c in comments)
    assert "line-0399" in comments[-1]
    assert "line-0000" not in comments[0]


def test_call_issue_redaction_excludes_transcript_pii_and_keys() -> None:
    payload = CallLogPayload(
        company_id="co-1",
        user_id="u-1",
        call_id="call-red",
        platform="darwin",
        os_version="15.1",
        app_version="0.7.0",
        device="arm64",
        timings={"stt_ms": 210, "p95_ms": 640},
        connections={"stt": "ok", "models": "ok", "zoho": "ok"},
        errors=[
            {
                "stage": "llm",
                "message": "Fail for jane@acme.com +1-555-333-4444 key sk-secret1234567890",
                "stack": "at run()",
            }
        ],
        model_traces=[
            {
                "stage": "suggest",
                "provider": "openai",
                "tokens_in": 120,
                "tokens_out": 24,
                "prompt_text": "SECRET CUSTOMER TRANSCRIPT",
                "reply_text": "SECRET MODEL TEXT",
            }
        ],
    )
    title, body, comments, labels, close_now = format_call_issue(payload)
    full = title + "\n" + body + "\n" + "\n".join(comments)
    assert len(body) <= MAX_BODY_CHARS
    assert labels == ["needs-attention"]
    assert close_now is False
    for secret in (
        "jane@acme.com",
        "555-333-4444",
        "sk-secret1234567890",
        "SECRET CUSTOMER",
        "SECRET MODEL",
    ):
        assert secret not in full
    assert '"tokens_in": 120' in full


@pytest.mark.asyncio
async def test_publish_switch_off_healthy_needs_attention_dedupe_and_audit(tmp_path: Path) -> None:
    store, owner, c1, _c2 = _make_store(tmp_path)
    agent1 = Principal(
        user_id="u-1",
        company_id=c1,
        role="agent",
        device_id="d1",
        email="u1@alpha.test",
        name="Agent 1",
    )
    reqs: list[dict[str, Any]] = []
    transport = _fake_github(reqs)

    owner_logs.save_repo(
        store, owner, "Hasdro/sales-shield-logs", "ghp_testtoken1234567890", ip="127.0.0.1"
    )

    base_payload = CallLogPayload(
        company_id=c1,
        user_id="u-1",
        call_id="call-1",
        platform="darwin",
        os_version="15.1",
        app_version="0.7.0",
        device="MacBookPro",
        timings={"stt_ms": 200, "p95_ms": 800},
        connections={"stt": "ok", "models": "ok"},
    )

    # Default OFF -> nothing sent
    res_off = await publish_call_log(store, agent1, base_payload, transport=transport)
    assert res_off == {"sent": False, "reason": "disabled"}
    assert len(reqs) == 0

    # Turn ON for company -> healthy call created & closed immediately
    owner_logs.toggle_company(store, owner, c1, True, ip="127.0.0.1")
    res_ok = await publish_call_log(store, agent1, base_payload, transport=transport)
    assert res_ok["sent"] is True
    assert res_ok["labels"] == ["healthy"]
    assert res_ok["state"] == "closed"
    assert any(r["method"] == "PATCH" and r["body"].get("state") == "closed" for r in reqs)

    # Per-user override OFF -> nothing sent for u-1 even though company is ON
    owner_logs.toggle_user(store, owner, c1, "u-1", False, ip="127.0.0.1")
    res_u_off = await publish_call_log(store, agent1, base_payload, transport=transport)
    assert res_u_off == {"sent": False, "reason": "disabled"}

    # Per-user override ON while company OFF -> sends
    owner_logs.toggle_company(store, owner, c1, False, ip="127.0.0.1")
    owner_logs.toggle_user(store, owner, c1, "u-1", True, ip="127.0.0.1")

    # Background failure deduplication by fingerprint
    bg1 = await publish_background_failure(
        store,
        agent1,
        company_id=c1,
        user_id="u-1",
        job_kind="zoho_sync",
        stage="refresh",
        error_code="timeout",
        error_message="Timed out",
        transport=transport,
    )
    bg2 = await publish_background_failure(
        store,
        agent1,
        company_id=c1,
        user_id="u-1",
        job_kind="zoho_sync",
        stage="refresh",
        error_code="timeout",
        error_message="Timed out again",
        transport=transport,
    )
    assert bg1["deduplicated"] is False
    assert bg2["deduplicated"] is True
    assert bg2["issue_number"] == bg1["issue_number"]

    # Audit entries recorded for repo + company switch + user override
    audit_actions = [str(r["action"]) for r in store._q("SELECT action FROM audit")]
    assert "owner.call_logs.repo_set" in audit_actions
    assert "owner.call_logs.company_switch" in audit_actions
    assert "owner.feature_override.set" in audit_actions


def test_obs_tenant_isolation_company_a_cannot_touch_company_b(tmp_path: Path) -> None:
    store, owner, c1, c2 = _make_store(tmp_path)
    admin_a = Principal(
        user_id="a1",
        company_id=c1,
        role="admin",
        device_id="d1",
        email="a@alpha.test",
        name="Admin A",
    )
    admin_b = Principal(
        user_id="b1",
        company_id=c2,
        role="admin",
        device_id="d2",
        email="b@beta.test",
        name="Admin B",
    )

    issue_id = obs_store.record_call_issue(
        store,
        admin_b,
        company_id=c2,
        user_id="b1",
        call_id="call-b",
        fingerprint="fp-b",
        issue_number=200,
        issue_url="https://github.com/Hasdro/logs/issues/200",
        label="healthy",
        state="closed",
    )

    # Company A cannot read, insert, update, or delete Company B rows
    with pytest.raises(CloudError):
        obs_store.list_call_issues(store, admin_a, c2)
    with pytest.raises(CloudError):
        obs_store.record_call_issue(
            store,
            admin_a,
            company_id=c2,
            user_id="a1",
            call_id="x",
            fingerprint=None,
            issue_number=1,
            issue_url="https://github.com/x/y/1",
            label="healthy",
            state="closed",
        )
    with pytest.raises(CloudError):
        obs_store.increment_issue_comments(store, admin_a, c2, issue_id)
    with pytest.raises(CloudError):
        obs_store.delete_call_issue(store, admin_a, c2, issue_id)

    # Company B can read and delete its own row
    assert len(obs_store.list_call_issues(store, admin_b, c2)) == 1
    assert obs_store.delete_call_issue(store, admin_b, c2, issue_id) is True

    # Non-owner cannot flip switches or D-095 overrides
    with pytest.raises(CloudError):
        obs_store.set_company_call_logs(store, admin_a, c1, True)
    with pytest.raises(CloudError):
        obs_store.set_user_override(store, owner, c1, "a1", "call_review", True)
