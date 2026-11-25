"""Tests for Round 4 Agent 2: style memory, feedback, PII redaction, merge job, wizard state,
isolation, audit logs, and owner read-only view (A1-A4, R3, R11)."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

import yaml
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.testclient import TestClient

from sotto_worker.cloud import features as features_mod
from sotto_worker.cloud.learning.store import LearningStore
from sotto_worker.cloud.memory import api as memory_api
from sotto_worker.cloud.memory import routes as memory_routes
from sotto_worker.cloud.memory.merge import (
    build_feedback_packet,
    parse_merged_rules,
    render_merge_prompt,
    run_memory_merge,
)
from sotto_worker.cloud.memory.redact import strip_personal_data
from sotto_worker.cloud.memory.store import (
    MAX_RULES,
    MAX_WORDS,
    RAW_FEEDBACK_RETENTION_MS,
    WIZARD_DRAFT_TTL_MS,
    WIZARD_FEEDBACK_TTL_MS,
    MemoryStore,
)
from sotto_worker.cloud.obs.log import clear_events, recent_events
from sotto_worker.cloud.owner import memory as owner_memory
from sotto_worker.cloud.store import CloudError, CloudStore, Principal
from sotto_worker.server.vault import Vault

SECRET = "m" * 40
DAY_MS = 86_400_000
TEST_PW = "correct-horse-" + "battery"


def _make_store(tmp_path: Path) -> CloudStore:
    return CloudStore(tmp_path / "memory_test.db", Vault(SECRET))


def _create_company_and_users(store: CloudStore, name: str, domain: str) -> dict[str, Any]:
    cid, admin_id = store.signup(
        company=name, name=f"{name} Admin", email=f"admin@{domain}", password=TEST_PW
    )
    admin = Principal(
        user_id=admin_id,
        company_id=cid,
        role="admin",
        email=f"admin@{domain}",
        name=f"{name} Admin",
        device_id="dev-a",
    )
    agent_id, _temp = store.invite(admin, f"agent@{domain}", f"{name} Agent", "agent")
    agent = Principal(
        user_id=agent_id,
        company_id=cid,
        role="agent",
        email=f"agent@{domain}",
        name=f"{name} Agent",
        device_id="dev-u",
    )
    return {"company_id": cid, "admin": admin, "agent": agent}


def _make_http_client(
    store: CloudStore,
    memory: MemoryStore,
    principals: dict[str, Principal],
    *,
    merge_runner: Callable[[str, str], Awaitable[str]] | None = None,
    clock: Callable[[], int] | None = None,
) -> TestClient:
    def app_route(
        fn: Callable[[Request, Principal], Awaitable[Response]],
    ) -> Callable[[Request], Awaitable[Response]]:
        async def wrapper(request: Request) -> Response:
            token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
            who = principals.get(token)
            if who is None:
                return JSONResponse({"code": "unauthorized"}, status_code=401)
            try:
                return await fn(request, who)
            except CloudError as err:
                status = {"not_found": 404, "forbidden": 403, "invalid": 400}.get(err.code, 400)
                return JSONResponse({"code": err.code, "message": str(err)}, status_code=status)

        return wrapper

    def owner_route(
        fn: Callable[[Request, Principal], Awaitable[Response]],
    ) -> Callable[[Request], Awaitable[Response]]:
        async def wrapper(request: Request) -> Response:
            if request.headers.get("x-owner") != "ok":
                return JSONResponse({"code": "unauthorized"}, status_code=401)
            who = Principal(
                user_id="owner-1",
                company_id=None,
                role="owner",
                email="owner@example.com",
                name="Owner",
                device_id=None,
            )
            return await fn(request, who)

        return wrapper

    async def body(request: Request) -> dict[str, Any]:
        raw = await request.body()
        return json.loads(raw.decode("utf-8")) if raw else {}

    routes = [
        *memory_routes.make_routes(
            memory=memory,
            app_route=app_route,
            body=body,
            ip_of=lambda _r: "127.0.0.1",
            merge_runner=merge_runner,
            clock=clock,
        ),
        *owner_memory.make_routes(memory=memory, owner_route=owner_route),
    ]
    return TestClient(Starlette(routes=routes))


def test_pii_stripping_removes_names_emails_phones_prices_and_urls(tmp_path: Path) -> None:
    raw = (
        "Customer John Doe (john.doe@acme.com, +971 50 123 4567) asked about AED 12,500 "
        "and $4,999 on https://acme.example.com/quote — keep it shorter next time."
    )
    cleaned = strip_personal_data(raw, known_names=("John Doe",))
    assert cleaned is not None
    assert "john.doe@acme.com" not in cleaned
    assert "123 4567" not in cleaned
    assert "12,500" not in cleaned
    assert "4,999" not in cleaned
    assert "https://acme.example.com" not in cleaned
    assert "John Doe" not in cleaned
    assert "keep it shorter next time" in cleaned


def test_contract_api_and_company_priority_over_agent_rules(tmp_path: Path) -> None:
    store = _make_store(tmp_path)
    try:
        mem = MemoryStore(store)
        memory_api.configure(mem)
        org = _create_company_and_users(store, "Acme", "acme.test")
        cid, admin, agent = org["company_id"], org["admin"], org["agent"]

        # Exact §3.4 signature
        fid = memory_api.add_feedback(
            company_id=cid,
            user_id=agent.user_id,
            call_id="call-1",
            source="card",
            rating="down",
            reasons=["too_long", "not_our_style"],  # legacy not_our_style maps to too_formal
            note="Skip filler for Mr. Ali at +971 55 999 8888",
            card_id="card-1",
        )
        assert isinstance(fid, str)
        assert len(fid) > 10
        pending = mem.pending_feedback(cid, agent.user_id)
        assert len(pending) == 1
        assert pending[0]["reasons"] == ["too_formal", "too_long"]
        assert "Ali" not in (pending[0]["note"] or "")
        assert "999 8888" not in (pending[0]["note"] or "")

        # Add 3 company rules and 11 agent rules -> company rules come first and total <= 12
        mem.edit_rules(
            admin,
            "company",
            None,
            [{"text": f"Company rule {i}"} for i in range(1, 4)],
        )
        mem.save_merged_rules(cid, agent.user_id, [f"Agent rule {i}" for i in range(1, 12)])
        effective = memory_api.get_style_memory(cid, agent.user_id)
        assert len(effective) == MAX_RULES
        assert effective[:3] == ["Company rule 1", "Company rule 2", "Company rule 3"]
        assert effective[3:] == [f"Agent rule {i}" for i in range(1, 10)]
    finally:
        memory_api.configure(None)
        store.close()


def test_merge_caps_no_transcript_and_retry_keeps_raw_on_failure(tmp_path: Path) -> None:
    store = _make_store(tmp_path)
    clear_events()
    try:
        mem = MemoryStore(store)
        org = _create_company_and_users(store, "Acme", "acme.test")
        cid, agent = org["company_id"], org["agent"]

        mem.add_feedback(
            cid,
            agent.user_id,
            "call-9",
            "call_note",
            None,
            ["too_formal"],
            "Sound casual when customer Sara asks about $8,000 pricing.",
        )

        # Verify merge packet contains no transcript and no personal data
        rows = mem.pending_feedback(cid, agent.user_id, call_id="call-9")
        packet = build_feedback_packet(rows)
        assert "Sara" not in packet
        assert "8,000" not in packet
        assert "transcript" not in packet.lower()
        rendered = render_merge_prompt(company_name="Acme", current_rules=[], feedback_rows=rows)
        assert "Sara" not in rendered
        assert "8,000" not in rendered

        # Failing runner: retries 3x and keeps raw feedback unmerged
        attempts = 0

        async def failing_runner(_stage: str, _prompt: str) -> str:
            nonlocal attempts
            attempts += 1
            raise RuntimeError("model timeout")

        res = asyncio.run(
            run_memory_merge(
                mem,
                company_id=cid,
                company_name="Acme",
                user_id=agent.user_id,
                runner=failing_runner,
                call_id="call-9",
            )
        )
        assert res is None
        assert attempts == 3
        still_pending = mem.pending_feedback(cid, agent.user_id, call_id="call-9")
        assert len(still_pending) == 1
        assert still_pending[0]["retry_count"] == 1

        # Succeeding runner returning 15 long rules -> capped to 12 rules of <= 25 words
        async def verbose_runner(stage: str, _prompt: str) -> str:
            assert stage == "memory_merge"
            long_rule = " ".join([f"w{i}" for i in range(32)])
            lines = [f"- {long_rule}"] + [f"- Keep pitch short number {i}." for i in range(2, 16)]
            return "\n".join(lines)

        res2 = asyncio.run(
            run_memory_merge(
                mem,
                company_id=cid,
                company_name="Acme",
                user_id=agent.user_id,
                runner=verbose_runner,
                call_id="call-9",
            )
        )
        assert res2 is not None
        assert res2["status"] == "applied"
        assert len(res2["rules"]) == MAX_RULES
        assert all(len(r.split()) <= MAX_WORDS for r in res2["rules"])
        assert mem.pending_feedback(cid, agent.user_id, call_id="call-9") == []
        assert any(e.event == "merge_succeeded" for e in recent_events())
    finally:
        store.close()


def test_parse_merged_rules_handles_none_and_empty() -> None:
    assert parse_merged_rules("NONE") == []
    assert parse_merged_rules("none.") == []
    assert parse_merged_rules("random non-bullet prose") is None


def test_ninety_day_feedback_deletion(tmp_path: Path) -> None:
    store = _make_store(tmp_path)
    try:
        mem = MemoryStore(store)
        org = _create_company_and_users(store, "Acme", "acme.test")
        cid, agent = org["company_id"], org["agent"]
        t0 = 1_700_000_000_000
        mem.add_feedback(cid, agent.user_id, "old-call", "card", "down", ["wrong"], "old", now=t0)
        mem.add_feedback(
            cid,
            agent.user_id,
            "new-call",
            "card",
            "up",
            ["good_phrasing"],
            "fresh",
            now=t0 + 10 * DAY_MS,
        )
        deleted = mem.purge_expired_feedback(now=t0 + RAW_FEEDBACK_RETENTION_MS + 1)
        assert deleted == 1
        rem = mem.pending_feedback(cid, agent.user_id)
        assert [r["call_id"] for r in rem] == ["new-call"]
    finally:
        store.close()


def test_review_before_apply_revert_promote_and_audit_log(tmp_path: Path) -> None:
    store = _make_store(tmp_path)
    try:
        mem = MemoryStore(store)
        org = _create_company_and_users(store, "Acme", "acme.test")
        cid, admin, agent = org["company_id"], org["admin"], org["agent"]

        # Enable review before apply
        mem.set_review_before_apply(admin, True)
        res = mem.save_merged_rules(
            cid,
            agent.user_id,
            ["Ask one qualifying question first."],
            source_call="c1",
        )
        assert res["status"] == "pending"
        # Not active yet until approved!
        assert mem.get_style_memory(cid, agent.user_id) == []

        # Approve version 1
        mem.decide_version(admin, "agent", agent.user_id, res["version"], approve=True)
        assert mem.get_style_memory(cid, agent.user_id) == ["Ask one qualifying question first."]

        # Admin edits agent rules -> v2, then reverts to v1 -> v3
        ov = mem.edit_rules(admin, "agent", agent.user_id, [{"text": "Edited rule."}])
        assert mem.get_style_memory(cid, agent.user_id) == ["Edited rule."]
        mem.revert_version(admin, "agent", agent.user_id, 1)
        assert mem.get_style_memory(cid, agent.user_id) == ["Ask one qualifying question first."]

        # Promote agent rule to company-wide
        agent_entry = next(a for a in ov["agents"] if a["user_id"] == agent.user_id)
        # Re-read after revert to get current rule id
        ov2 = mem.admin_overview(admin)
        agent_entry = next(a for a in ov2["agents"] if a["user_id"] == agent.user_id)
        rule_id = agent_entry["items"][0]["id"]
        ov3 = mem.promote_rule(admin, agent.user_id, rule_id)
        assert [i["text"] for i in ov3["company"]["items"]] == [
            "Ask one qualifying question first."
        ]

        # Verify audit log has all admin actions (R3)
        audit_rows = store._q("SELECT action FROM audit WHERE company_id=?", (cid,))
        actions = {r["action"] for r in audit_rows}
        assert {
            "memory.review_switch",
            "memory.approved",
            "memory.edited",
            "memory.reverted",
            "memory.promoted",
        } <= actions
    finally:
        store.close()


def test_migration_from_legacy_learning_store(tmp_path: Path) -> None:
    store = _make_store(tmp_path)
    try:
        learning = LearningStore(store)
        org = _create_company_and_users(store, "LegacyCo", "legacy.test")
        cid, admin, agent = org["company_id"], org["admin"], org["agent"]
        learning.save(admin, {"items": [{"text": "Never promise same-day delivery."}]})

        mem = MemoryStore(store)
        rules = mem.get_style_memory(cid, agent.user_id)
        assert rules == ["Never promise same-day delivery."]
    finally:
        store.close()


def test_wizard_finish_later_resumes_24h_and_expires_drafts_keeping_feedback_7d(
    tmp_path: Path,
) -> None:
    store = _make_store(tmp_path)
    try:
        mem = MemoryStore(store)
        org = _create_company_and_users(store, "Acme", "acme.test")
        agent = org["agent"]
        t0 = 1_700_000_000_000

        saved = mem.save_wizard_state(
            agent,
            "call-42",
            {
                "current_step": 3,
                "drafts": {"email": {"subject": "Follow up"}},
                "completed_steps": [1, 2],
            },
            now=t0,
        )
        assert saved["current_step"] == 3
        assert saved["drafts_active"] is True
        assert saved["drafts"]["email"]["subject"] == "Follow up"

        # Within 24h: resumes at step 3 with drafts intact
        resumed = mem.get_wizard_state(agent, "call-42", now=t0 + 12 * 3600 * 1000)
        assert resumed is not None
        assert resumed["current_step"] == 3
        assert resumed["drafts"]["email"]["subject"] == "Follow up"

        # After 24h: unsent drafts deleted, step moves to 5 (feedback stays in queue for 7 days)
        after_24h = mem.get_wizard_state(agent, "call-42", now=t0 + WIZARD_DRAFT_TTL_MS + 1)
        assert after_24h is not None
        assert after_24h["status"] == "drafts_expired"
        assert after_24h["drafts"] == {}
        assert after_24h["current_step"] == 5
        assert after_24h["drafts_active"] is False
        assert len(mem.list_wizard_queue(agent, now=t0 + WIZARD_DRAFT_TTL_MS + 1)) == 1

        # After 7 days: removed from queue
        after_7d = mem.get_wizard_state(agent, "call-42", now=t0 + WIZARD_FEEDBACK_TTL_MS + 1)
        assert after_7d is None
        assert mem.list_wizard_queue(agent, now=t0 + WIZARD_FEEDBACK_TTL_MS + 1) == []
    finally:
        store.close()


def test_multi_tenant_isolation_across_every_table_and_route(tmp_path: Path) -> None:
    store = _make_store(tmp_path)
    try:
        mem = MemoryStore(store)
        org_a = _create_company_and_users(store, "Alpha", "alpha.test")
        org_b = _create_company_and_users(store, "Beta", "beta.test")

        # Populate Alpha data across all 5 tables
        mem.add_feedback(
            org_a["company_id"],
            org_a["agent"].user_id,
            "c-a",
            "card",
            "down",
            ["wrong"],
            "alpha note",
        )
        mem.edit_rules(org_a["admin"], "company", None, [{"text": "Alpha secret company rule."}])
        mem.edit_rules(
            org_a["admin"],
            "agent",
            org_a["agent"].user_id,
            [{"text": "Alpha secret agent rule."}],
        )
        mem.set_review_before_apply(org_a["admin"], True)
        mem.save_wizard_state(org_a["agent"], "c-a", {"current_step": 2, "drafts": {"wa": "hi"}})

        principals = {
            "a-admin": org_a["admin"],
            "a-agent": org_a["agent"],
            "b-admin": org_b["admin"],
            "b-agent": org_b["agent"],
        }
        client = _make_http_client(store, mem, principals)
        hb_admin = {"authorization": "Bearer b-admin"}
        hb_agent = {"authorization": "Bearer b-agent"}

        # Beta cannot read Alpha's rules, overview, or wizard state
        assert client.get("/api/v1/memory/me", headers=hb_agent).json()["effective"] == []
        ov_b = client.get("/api/v1/memory/admin", headers=hb_admin).json()
        assert ov_b["company"]["items"] == []
        assert all("Alpha" not in str(a) for a in ov_b["agents"])
        assert client.get("/api/v1/postcall/wizard/c-a", headers=hb_agent).status_code == 404
        assert client.get("/api/v1/postcall/wizard", headers=hb_agent).json()["items"] == []

        # Beta admin cannot edit, revert, approve, or promote Alpha's user
        assert (
            client.put(
                "/api/v1/memory/rules",
                json={
                    "scope": "agent",
                    "user_id": org_a["agent"].user_id,
                    "items": [{"text": "Hacked"}],
                },
                headers=hb_admin,
            ).status_code
            == 404
        )
        assert (
            client.post(
                "/api/v1/memory/versions/1/revert",
                json={"scope": "agent", "user_id": org_a["agent"].user_id},
                headers=hb_admin,
            ).status_code
            == 404
        )
        assert (
            client.post(
                "/api/v1/memory/promote",
                json={"user_id": org_a["agent"].user_id, "rule_id": "any"},
                headers=hb_admin,
            ).status_code
            == 404
        )
        # Beta cannot delete Alpha's wizard state
        client.delete("/api/v1/postcall/wizard/c-a", headers=hb_agent)
        ha_agent = {"authorization": "Bearer a-agent"}
        assert client.get("/api/v1/postcall/wizard/c-a", headers=ha_agent).status_code == 200

        # Owner console sees both companies read-only and rejects writes
        r_owner = client.get("/api/owner/memory", headers={"x-owner": "ok"})
        assert r_owner.status_code == 200
        body = r_owner.json()
        assert body["read_only"] is True
        names = {c["name"] for c in body["companies"]}
        assert names == {"Alpha", "Beta"}
        assert client.post("/api/owner/memory", headers={"x-owner": "ok"}).status_code == 405
        assert client.get("/owner/memory").status_code == 200
        assert client.get("/owner/memory.js").status_code == 200
    finally:
        store.close()


def test_seed_catalog_and_model_stage_configured() -> None:
    cat = features_mod.load_catalog()
    assert "postcall_wizard" in cat
    assert cat["postcall_wizard"].default_on is True
    assert "style_memory" in cat
    assert cat["style_memory"].default_on is True

    root = Path(__file__).resolve().parents[4]
    models = yaml.safe_load((root / "seed" / "models" / "default.yaml").read_text(encoding="utf-8"))
    assert "memory_merge" in models["stages"]
    prompt_file = root / "seed" / "prompts" / "memory_merge.md"
    assert prompt_file.exists()
    prompt_txt = prompt_file.read_text(encoding="utf-8")
    assert "stage: memory_merge" in prompt_txt
    assert "{{memory.feedback}}" in prompt_txt


def test_redaction_preserves_verbs_dates_uuids_and_scrubs_secrets() -> None:
    txt = (
        "When the client asks about onboarding on 2026-11-25 "
        "(ref 550e8400-e29b-41d4-a716-446655440000), skip sk-"
        + "test_1234567890abcdef and Customer Ali Hassan."
    )
    cleaned = strip_personal_data(txt)
    assert cleaned is not None
    assert "client asks about onboarding" in cleaned
    assert "2026-11-25" in cleaned
    assert "550e8400-e29b-41d4-a716-446655440000" in cleaned
    assert "sk-test_1234567890abcdef" not in cleaned
    assert "[redacted-key]" in cleaned
    assert "Ali Hassan" not in cleaned


def test_active_version_preserved_after_many_pending_and_feature_off_returns_empty(
    tmp_path: Path,
) -> None:
    store = _make_store(tmp_path)
    try:
        mem = MemoryStore(store)
        org = _create_company_and_users(store, "PruneCo", "prune.test")
        cid, admin, agent = org["company_id"], org["admin"], org["agent"]
        mem.edit_rules(admin, "agent", agent.user_id, [{"text": "Keep cards under 15 words."}])
        mem.set_review_before_apply(admin, True)
        for i in range(55):
            mem.save_merged_rules(cid, agent.user_id, [f"Pending rule {i}"])
        # Active version must not be pruned by 55 subsequent pending versions
        assert mem.get_style_memory(cid, agent.user_id) == ["Keep cards under 15 words."]
        # Turning off style_memory feature hides rules per D-036
        store.set_company_feature(admin, "style_memory", False)
        assert mem.get_style_memory(cid, agent.user_id) == []
    finally:
        store.close()


def test_cloud_app_wiring_bundle_validation_and_owner_csp(tmp_path: Path) -> None:
    from sotto_worker.cloud.app import CloudConfig, create_cloud_app
    from sotto_worker.cloud.bundle import Seed

    store = _make_store(tmp_path)

    async def fake_merge(stage: str, _prompt: str) -> str:
        assert stage == "memory_merge"
        return "- Use concise bullet questions."

    app = create_cloud_app(
        CloudConfig(
            public_origin="https://app.example.test",
            owner_origin="https://owner.example.test",
            static_dir=None,
            merge_runner=fake_merge,
        ),
        store,
        Seed.load(),
    )
    client = TestClient(app)
    try:
        r_admin = client.post(
            "/api/v1/auth/signup",
            json={
                "company": "AppWireCo",
                "name": "Wire Admin",
                "email": "admin@wire.test",
                "password": TEST_PW,
            },
        )
        assert r_admin.status_code == 201
        h_admin = {"authorization": f"Bearer {r_admin.json()['token']}"}
        r_inv = client.post(
            "/api/v1/team",
            json={"email": "agent@wire.test", "name": "Wire Agent", "role": "agent"},
            headers=h_admin,
        )
        temp_pw = r_inv.json()["temporary_password"]
        tok = client.post(
            "/api/v1/auth/login",
            json={"email": "agent@wire.test", "password": temp_pw},
        ).json()["token"]
        h_agent = {"authorization": f"Bearer {tok}"}
        client.post(
            "/api/v1/auth/password",
            json={"current": temp_pw, "new": TEST_PW + "2"},
            headers=h_agent,
        )

        # Invalid feedback / wizard payloads return 400 (never 500)
        assert (
            client.post(
                "/api/v1/memory/feedback",
                json={"note": 123, "reasons": []},
                headers=h_agent,
            ).status_code
            == 400
        )
        assert (
            client.put(
                "/api/v1/postcall/wizard/call-1",
                json={"current_step": True},
                headers=h_agent,
            ).status_code
            == 400
        )

        # Submit feedback + trigger merge -> bundle carries style_memory on next call
        r_fb = client.post(
            "/api/v1/memory/feedback",
            json={
                "call_id": "call-1",
                "source": "call_note",
                "rating": None,
                "reasons": ["too_long"],
                "note": "Keep cards short",
            },
            headers=h_agent,
        )
        assert r_fb.status_code == 201
        r_merge = client.post(
            "/api/v1/memory/merge",
            json={"call_id": "call-1"},
            headers=h_agent,
        )
        assert r_merge.status_code == 200
        assert r_merge.json()["learned_count"] == 1

        r_bundle = client.get("/api/v1/bundle", headers=h_agent)
        assert r_bundle.status_code == 200
        assert r_bundle.json()["style_memory"] == ["Use concise bullet questions."]

        # Owner HTML & JS enforce owner host check and OWNER_CSP
        assert client.get("/owner/memory", headers={"host": "app.example.test"}).status_code == 404
        owner_client = TestClient(app, base_url="https://owner.example.test")
        ok_page = owner_client.get("/owner/memory")
        assert ok_page.status_code == 200
        assert "content-security-policy" in ok_page.headers
        ok_js = owner_client.get("/owner/memory.js")
        assert ok_js.status_code == 200
        assert "content-security-policy" in ok_js.headers

        # Exercise admin routes (/settings, /approve, /reject, /promote, /versions/non-digit)
        assert (
            client.put(
                "/api/v1/memory/settings",
                json={"review_before_apply": True},
                headers=h_admin,
            ).status_code
            == 200
        )
        assert (
            client.post(
                "/api/v1/memory/feedback",
                json={"call_id": "c-2", "source": "card", "rating": "down", "reasons": ["wrong"]},
                headers=h_agent,
            ).status_code
            == 201
        )
        r_m2 = client.post("/api/v1/memory/merge", json={"call_id": "c-2"}, headers=h_agent)
        assert r_m2.status_code == 200
        v2 = r_m2.json()["version"]
        assert (
            client.post("/api/v1/memory/versions/abc/approve", headers=h_admin).status_code == 404
        )
        agent_id = client.get("/api/v1/memory/me", headers=h_agent).json()["user_id"]
        assert (
            client.post(
                f"/api/v1/memory/versions/{v2}/reject",
                json={"scope": "agent", "user_id": agent_id},
                headers=h_admin,
            ).status_code
            == 200
        )
        # Re-merge & approve + promote
        client.post(
            "/api/v1/memory/feedback",
            json={"call_id": "c-3", "source": "coach_review", "reasons": ["too_long"]},
            headers=h_agent,
        )
        v3 = client.post("/api/v1/memory/merge", json={"call_id": "c-3"}, headers=h_agent).json()[
            "version"
        ]
        ov_app = client.post(
            f"/api/v1/memory/versions/{v3}/approve",
            json={"scope": "agent", "user_id": agent_id},
            headers=h_admin,
        )
        assert ov_app.status_code == 200
        first_rule_id = next(a for a in ov_app.json()["agents"] if a["user_id"] == agent_id)[
            "items"
        ][0]["id"]
        assert (
            client.post(
                "/api/v1/memory/promote",
                json={"user_id": agent_id, "rule_id": first_rule_id},
                headers=h_admin,
            ).status_code
            == 200
        )
        # Feedback / wizard routes validation & lifecycle
        for bad_fb in [
            {"call_id": 123, "reasons": []},
            {"card_id": 999, "reasons": []},
            {"reasons": "not-a-list"},
        ]:
            assert (
                client.post("/api/v1/memory/feedback", json=bad_fb, headers=h_agent).status_code
                == 400
            )
        assert (
            client.put(
                "/api/v1/postcall/wizard/cw-1",
                json={"current_step": 2, "drafts": {"whatsapp": "Hi"}, "completed_steps": [1]},
                headers=h_agent,
            ).status_code
            == 200
        )
        assert client.get("/api/v1/postcall/wizard", headers=h_agent).json()["items"]
        assert client.delete("/api/v1/postcall/wizard/cw-1", headers=h_agent).status_code == 200
    finally:
        memory_api.configure(None)
        store.close()


def test_memory_edge_cases_and_python_call_session_injection(tmp_path: Path) -> None:
    import pytest

    from sotto_worker.adapters.llm.fake import FakeLLM
    from sotto_worker.clock import FakeClock
    from sotto_worker.company import CompanyProfile
    from sotto_worker.contracts import TranscriptEvent
    from sotto_worker.pipeline.session import CallSession
    from sotto_worker.playbook import PlaybookIndex
    from sotto_worker.prompts import PromptRegistry
    from sotto_worker.router import ModelRouter, RoutingConfig, StageRoute
    from sotto_worker.runtime import SEED

    assert strip_personal_data(None) is None
    assert strip_personal_data("   \t ") is None

    store = _make_store(tmp_path)
    try:
        mem = MemoryStore(store)
        memory_api.configure(mem)
        org = _create_company_and_users(store, "EdgeCo", "edge.test")
        cid, admin, agent = org["company_id"], org["admin"], org["agent"]
        store.save_call_brief(
            agent,
            "call-brief-1",
            {"person": {"name": "Fatima Mansoor"}},
        )
        fid = memory_api.add_feedback(
            cid,
            agent.user_id,
            "call-brief-1",
            "coach_review",
            None,
            ["too_formal"],
            "Fatima Mansoor asked us to be direct.",
        )
        pending = mem.pending_feedback(cid, agent.user_id, call_id="call-brief-1")
        assert pending[0]["id"] == fid
        assert "Fatima" not in (pending[0]["note"] or "")

        t0 = 1_700_000_000_000
        mem.save_wizard_state(agent, "w-exp", {"current_step": 2, "drafts": {"x": 1}}, now=t0)
        expired_drafts = mem.expire_wizard_states(now=t0 + WIZARD_DRAFT_TTL_MS + 1)
        assert expired_drafts["drafts_expired"] >= 1
        purged = mem.expire_wizard_states(now=t0 + WIZARD_FEEDBACK_TTL_MS + 1)
        assert purged["feedback_expired"] >= 1

        with pytest.raises(CloudError):
            mem.save_wizard_state(
                agent, "w-bad", {"current_step": 2, "feedback_done": "yes"}, now=t0
            )
        with pytest.raises(CloudError):
            mem.edit_rules(admin, "company", None, [{"text": "   "}])

        # Verify style_memory injects into Python CallSession suggest prompt
        clock = FakeClock()
        fake_llm = FakeLLM(clock=clock, text=lambda _req: "ANSWER: Ready.", chunk_ms=10)

        async def _no_op(_item: Any) -> None:
            return None

        async def _run_session() -> None:
            router = ModelRouter(
                RoutingConfig(stages={"suggest": StageRoute(provider="fake", model="m")}),
                lambda _r: fake_llm,
                clock,
            )
            session = CallSession(
                call_id="c-py",
                company=CompanyProfile.load(SEED / "company" / "default.yaml"),
                router=router,
                prompts=PromptRegistry.from_seed(SEED / "prompts"),
                playbook=PlaybookIndex([]),
                clock=clock,
                on_card=_no_op,
                on_escalation=_no_op,
                on_timing=lambda _t: None,
                style_memory=["Keep answers under 15 words."],
            )
            await session.on_transcript(
                TranscriptEvent(
                    speaker="customer",
                    text="How does billing work?",
                    final=True,
                    start_ms=0,
                    end_ms=500,
                ),
                t0_ms=0,
            )
            await clock.advance(500)
            await session.drain()

        asyncio.run(_run_session())
        assert fake_llm.requests
        assert "Keep answers under 15 words." in fake_llm.requests[0].system
    finally:
        memory_api.configure(None)
        store.close()
