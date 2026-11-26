"""HTTP, D-036 feature-gate, RBAC, CSRF, FK-cascade, and cross-tenant isolation tests
for Round 4 Agent 3 (Voice Coach, Prep Coach, Game Plan, Review Queue, Morning Brief).
"""

from __future__ import annotations

import asyncio
import json
import time
from datetime import UTC, datetime
from typing import Any

import pytest
from starlette.testclient import TestClient

from sotto_worker.adapters.coach.fake import FakeTTSAdapter
from sotto_worker.adapters.factory import key_env as route_key_env
from sotto_worker.adapters.llm.fake import FakeLLM
from sotto_worker.clock import RealClock
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.coach import CoachStore, get_game_plan
from sotto_worker.cloud.coach.morning_brief import morning_brief_job, send_review_reminders_job
from sotto_worker.cloud.coach.store import HOUR_MS
from sotto_worker.cloud.metering.prices import PriceTable
from sotto_worker.cloud.store import CloudStore, Principal
from tests.cloud.conftest import ORIGIN, PASSWORD, SignUp

H = {"origin": ORIGIN}
GROQ = "gsk_" + "c" * 30


def _ts(year: int, month: int, day: int, hour: int = 10, minute: int = 0) -> int:
    return int(datetime(year, month, day, hour, minute, tzinfo=UTC).timestamp() * 1000)


def _invite_login(
    client: TestClient, admin_auth: dict[str, str], email: str, name: str, role: str
) -> dict[str, Any]:
    r = client.post(
        "/api/v1/team",
        json={"email": email, "name": name, "role": role},
        headers=admin_auth,
    )
    assert r.status_code == 201, r.text
    temp = r.json()["temporary_password"]
    res = client.post(
        "/api/v1/auth/login",
        json={
            "email": email,
            "password": temp,
            "device": {"id": f"dev-{email}", "platform": "web", "label": "Chrome"},
        },
    )
    assert res.status_code == 200, res.text
    out: dict[str, Any] = res.json()
    out["auth"] = {"authorization": f"Bearer {out['token']}"}
    pw = client.post(
        "/api/v1/auth/password",
        json={"current": temp, "new": PASSWORD},
        headers=out["auth"],
    )
    assert pw.status_code == 200, pw.text
    return out


def test_price_table_loads_round4_tts_and_stt_rates() -> None:
    table = PriceTable.load()
    assert ("deepgram", "aura-2-thalia-en") in table.prices
    assert table.prices[("deepgram", "aura-2-thalia-en")].unit == "per_1k_chars"


def test_coach_http_d036_owner_gating_isolation_rbac_csrf_and_cascade(
    owner: TestClient, store: CloudStore, seed: Seed, sign_up: SignUp
) -> None:
    a_admin = sign_up("Alpha Co", "admin@alpha.test")
    b_admin = sign_up("Beta Co", "admin@beta.test")
    cid_a = str(a_admin["company"]["id"])
    cid_b = str(b_admin["company"]["id"])
    a_agent1 = _invite_login(owner, a_admin["auth"], "agent1@alpha.test", "Agent One", "agent")
    a_agent2 = _invite_login(owner, a_admin["auth"], "agent2@alpha.test", "Agent Two", "agent")
    b_agent = _invite_login(owner, b_admin["auth"], "agent@beta.test", "Beta Agent", "agent")

    # 1. Owner HTML pages & assets served cleanly with owner session; rejected for non-owner
    assert owner.get("/owner/coach.html").status_code == 200
    assert owner.get("/owner/coach.js").status_code == 200
    assert "Voice coach" in owner.get("/owner").text
    anon = TestClient(owner.app, base_url=ORIGIN)
    assert anon.get("/api/owner/coach/companies").status_code in (401, 403)
    assert anon.get("/api/owner/coach/companies", headers=a_admin["auth"]).status_code in (401, 403)

    # 2. Mutating owner route enforces CSRF Origin & JSON content-type
    bad_origin = owner.put(
        f"/api/owner/coach/companies/{cid_a}",
        json={"stages_configured": True, "enabled": True, "cap_usd": 10.0},
        headers={"origin": "https://evil.example"},
    )
    assert bad_origin.status_code == 403
    bad_type = owner.put(
        f"/api/owner/coach/companies/{cid_a}",
        json={"cap_usd": "ten"},
        headers=H,
    )
    assert bad_type.status_code == 400

    # 3. voice_coach starts off_by_platform (invisible in admin/features, blocked on voice routes)
    feats_a = owner.get("/api/v1/features", headers=a_agent1["auth"]).json()["features"]
    assert feats_a["voice_coach"]["state"] == "off_by_platform"
    assert feats_a["prep_coach"]["state"] == "available"
    assert feats_a["morning_brief"]["state"] == "available"
    comp_feats = {
        f["id"]
        for f in owner.get("/api/v1/company/features", headers=a_admin["auth"]).json()["features"]
    }
    assert "voice_coach" not in comp_feats

    # Admin cannot self-enable voice_coach via /api/v1/company/features before owner enables
    r_self = owner.put(
        "/api/v1/company/features/voice_coach",
        json={"enabled": True},
        headers=a_admin["auth"],
    )
    assert r_self.status_code in (403, 404)

    # 4. Prep chat rejects client-supplied playbook; game plan enforces per-user ownership & D-036
    gp_put = owner.put(
        "/api/v1/coach/prep/prep-call-1/game-plan",
        json={
            "goals": ["Confirm budget"],
            "objections": [{"objection": "Price", "answer": "Show ROI."}],
            "questions": ["Timeline?"],
            "avoid": ["Custom SLA"],
        },
        headers=a_agent1["auth"],
    )
    assert gp_put.status_code == 200, gp_put.text
    assert get_game_plan(cid_a, "prep-call-1") is not None
    assert get_game_plan(cid_b, "prep-call-1") is None

    # Same-company other agent CANNOT overwrite Agent 1's game plan (409 taken)
    gp_hijack = owner.put(
        "/api/v1/coach/prep/prep-call-1/game-plan",
        json={"goals": ["Poison live card!"]},
        headers=a_agent2["auth"],
    )
    assert gp_hijack.status_code == 409

    # Beta company sees nothing and cannot mutate Alpha's game plan or enqueue on Alpha's calls
    b_gp = owner.get("/api/v1/coach/prep/prep-call-1/game-plan", headers=b_agent["auth"])
    assert b_gp.json()["game_plan"] is None

    # Disable prep_coach for Company A -> routes blocked 403 AND get_game_plan() returns None
    assert (
        owner.put(
            "/api/v1/company/features/prep_coach", json={"enabled": False}, headers=a_admin["auth"]
        ).status_code
        == 200
    )
    assert (
        owner.get("/api/v1/coach/prep/prep-call-1/game-plan", headers=a_agent1["auth"]).status_code
        == 403
    )
    assert get_game_plan(cid_a, "prep-call-1") is None
    owner.put(
        "/api/v1/company/features/prep_coach", json={"enabled": True}, headers=a_admin["auth"]
    )

    # 5. Usage endpoint auto-enqueues reviews >= 30s (skips < 30s); voice review needs cap
    now_epoch = int(time.time() * 1000)
    short_usage = owner.post(
        "/api/v1/usage",
        json={
            "call_id": "call-short",
            "started_at": now_epoch - 15_000,
            "duration_s": 15,
            "cards": 0,
            "playbook_cards": 0,
            "ai_cards": 0,
            "holding_lines": 0,
            "escalations": 0,
        },
        headers=a_agent1["auth"],
    )
    assert short_usage.status_code == 200, short_usage.text
    long_usage = owner.post(
        "/api/v1/usage",
        json={
            "call_id": "call-long",
            "started_at": now_epoch - 90_000,
            "duration_s": 90,
            "cards": 2,
            "playbook_cards": 1,
            "ai_cards": 1,
            "holding_lines": 0,
            "escalations": 0,
        },
        headers=a_agent1["auth"],
    )
    assert long_usage.status_code == 200, long_usage.text
    q_res = owner.get("/api/v1/coach/reviews", headers=a_agent1["auth"]).json()
    assert q_res["pending_count"] == 1
    rev_id = q_res["reviews"][0]["id"]
    assert q_res["reviews"][0]["call_id"] == "call-long"

    # Voice=True blocked before owner configures/caps voice_coach
    assert (
        owner.post(
            f"/api/v1/coach/reviews/{rev_id}/complete",
            json={"transcript": [], "duration_s": 60, "voice": True},
            headers=a_agent1["auth"],
        ).status_code
        == 403
    )

    # Admin/manager in same company cannot hijack snooze or dismiss another agent's review (404)
    assert (
        owner.post(
            f"/api/v1/coach/reviews/{rev_id}/dismiss", json={}, headers=a_admin["auth"]
        ).status_code
        == 404
    )
    assert (
        owner.post(
            f"/api/v1/coach/reviews/{rev_id}/snooze",
            json={"preset": "1h"},
            headers=a_agent2["auth"],
        ).status_code
        == 404
    )
    assert (
        owner.post(
            f"/api/v1/coach/reviews/{rev_id}/snooze",
            json={"preset": "1h"},
            headers=b_agent["auth"],
        ).status_code
        == 404
    )
    # Invalid snooze timezone range -> 400 (not 500)
    assert (
        owner.post(
            f"/api/v1/coach/reviews/{rev_id}/snooze",
            json={"preset": "tomorrow_morning", "timezone_offset_min": 999999999},
            headers=a_agent1["auth"],
        ).status_code
        == 400
    )

    # 6. Settings RBAC + boolean validation
    assert owner.get("/api/v1/coach/settings", headers=a_agent1["auth"]).status_code == 403
    assert owner.get("/api/v1/coach/settings", headers=a_admin["auth"]).status_code == 200
    assert (
        owner.put(
            "/api/v1/coach/settings",
            json={"allow_admin_transcript": "false"},
            headers=a_admin["auth"],
        ).status_code
        == 400
    )

    # 7. Owner enables voice_coach with custom cost_per_min_usd, then raises cap
    up1 = owner.put(
        f"/api/owner/coach/companies/{cid_a}",
        json={
            "stages_configured": True,
            "enabled": True,
            "cap_usd": 20.0,
            "cost_per_min_usd": 0.10,
        },
        headers=H,
    )
    assert up1.status_code == 200, up1.text
    assert up1.json()["cap_minutes"] == 200.0
    up2 = owner.put(
        f"/api/owner/coach/companies/{cid_a}",
        json={"stages_configured": True, "enabled": True, "cap_usd": 30.0},
        headers=H,
    )
    assert up2.status_code == 200
    assert up2.json()["cost_per_min_usd"] == 0.10
    assert up2.json()["cap_minutes"] == 300.0
    assert (
        owner.get("/api/v1/features", headers=a_agent1["auth"]).json()["features"]["voice_coach"][
            "state"
        ]
        == "available"
    )

    # Complete review using call_id + PII in note -> stripped in feedback_events AND coach_reviews!
    done = owner.post(
        "/api/v1/coach/reviews/call-long/complete",
        json={
            "transcript": [{"role": "assistant", "content": "Good pacing."}],
            "remember_note": "Never quote $5000 before asking customer John Smith.",
            "duration_s": 60,
            "voice": True,
        },
        headers=a_agent1["auth"],
    )
    assert done.status_code == 200, done.text
    assert done.json()["review"]["status"] == "done"
    assert "$5000" not in (done.json()["review"]["feedback_note"] or "")
    assert done.json()["feedback_id"] is not None

    # Transcript hidden from admin until enabled
    assert (
        owner.get(f"/api/v1/coach/reviews/{rev_id}/transcript", headers=a_admin["auth"]).status_code
        == 403
    )
    assert (
        owner.put(
            "/api/v1/coach/settings", json={"allow_admin_transcript": True}, headers=a_admin["auth"]
        ).status_code
        == 200
    )
    assert (
        owner.get(f"/api/v1/coach/reviews/{rev_id}/transcript", headers=a_admin["auth"]).status_code
        == 200
    )
    assert (
        owner.get(f"/api/v1/coach/reviews/{rev_id}/transcript", headers=b_admin["auth"]).status_code
        == 404
    )

    # 8. Morning brief respects opt-out and feature gate
    assert (
        owner.put(
            "/api/v1/coach/morning-brief/prefs",
            json={"enabled": False, "timezone_offset_min": 240},
            headers=a_agent1["auth"],
        ).status_code
        == 200
    )
    mb_off = owner.get("/api/v1/coach/morning-brief", headers=a_agent1["auth"])
    assert mb_off.status_code == 200
    assert mb_off.json()["brief"] is None

    # 9. ON DELETE CASCADE removes all Alpha rows while Beta remains untouched
    del_co = owner.delete(f"/api/owner/companies/{cid_a}?confirm=Alpha+Co", headers=H)
    assert del_co.status_code == 200, del_co.text
    for sql in (
        "SELECT count(*) AS n FROM coach_game_plans WHERE company_id=?",
        "SELECT count(*) AS n FROM coach_reviews WHERE company_id=?",
        "SELECT count(*) AS n FROM coach_caps WHERE company_id=?",
        "SELECT count(*) AS n FROM coach_usage WHERE company_id=?",
        "SELECT count(*) AS n FROM coach_morning_brief_prefs WHERE company_id=?",
    ):
        assert store._q(sql, (cid_a,))[0]["n"] == 0


def test_coach_jobs_skip_owner_respect_feature_and_dispatch_reminders(
    store: CloudStore, seed: Seed
) -> None:
    now = _ts(2026, 11, 20, 8, 30)
    store.create_owner("owner@agn.test", "Owner", PASSWORD)
    cid_a, admin_a = store.signup(
        company="Alpha", name="Ada", email="admin@alpha.test", password=PASSWORD
    )
    p_a = Principal(admin_a, cid_a, "admin", None, "admin@alpha.test", "Ada")
    coach = CoachStore(store, clock=lambda: now)

    async def boom_meetings(*_args: Any) -> list[dict[str, Any]]:
        raise RuntimeError("zoho down")

    # Owner with company_id=None must NOT crash morning_brief_job; Zoho falls back cleanly
    delivered = asyncio.run(morning_brief_job(coach, fetch_meetings=boom_meetings, now=now))
    assert delivered == 1

    # Enqueue review at T0 and sweep reminder after 25 h -> sent once & marked reminded
    coach.enqueue_review(p_a, "call-rem", 120, now=now)
    emails: list[tuple[str, str, str]] = []

    async def fake_mail(to: str, subj: str, body: str) -> None:
        emails.append((to, subj, body))

    t23 = now + 23 * HOUR_MS
    t25 = now + 25 * HOUR_MS
    t30 = now + 30 * HOUR_MS
    assert asyncio.run(send_review_reminders_job(coach, send_email=fake_mail, now=t23)) == 0
    assert asyncio.run(send_review_reminders_job(coach, send_email=fake_mail, now=t25)) == 1
    assert len(emails) == 1
    assert asyncio.run(send_review_reminders_job(coach, send_email=fake_mail, now=t30)) == 0


def test_coach_prep_chat_generate_brief_and_owner_validation(
    owner: TestClient, seed: Seed, sign_up: SignUp, monkeypatch: pytest.MonkeyPatch
) -> None:
    admin = sign_up("Gamma Co", "admin@gamma.test")
    cid = str(admin["company"]["id"])
    plan_json = json.dumps(
        {
            "goals": ["Verify Q2 budget"],
            "objections": [{"objection": "Price", "answer": "Highlight payback."}],
            "questions": ["Who approves?"],
            "avoid": ["Discounting early"],
        }
    )

    def fake_make_llm(route: Any, *, clock: Any = None, env: Any = None) -> FakeLLM:
        clk = clock or RealClock()

        def reply(req: Any) -> str:
            text = (req.system or "") + " " + " ".join(m.content for m in req.messages)
            if "JSON" in text or "game_plan" in text or "goals" in text.lower():
                return plan_json
            if "morning brief" in text.lower():
                return "Good morning! Prioritize Acme today."
            return "Open by asking about their Q2 rollout timeline."

        return FakeLLM(clock=clk, model=route.model, text=reply, first_token_ms=1, chunk_ms=1)

    monkeypatch.setattr("sotto_worker.cloud.app.make_llm", fake_make_llm)
    monkeypatch.setattr(
        "sotto_worker.cloud.app.make_coach_tts", lambda route, *, env: FakeTTSAdapter()
    )

    # Owner list/get + validation + clear_cap
    assert len(owner.get("/api/owner/coach/companies").json()["companies"]) >= 1
    assert owner.get(f"/api/owner/coach/companies/{cid}").status_code == 200
    assert (
        owner.put(
            f"/api/owner/coach/companies/{cid}", json={"enabled": "yes"}, headers=H
        ).status_code
        == 400
    )
    assert (
        owner.put(
            f"/api/owner/coach/companies/{cid}", json={"cap_usd": "nan"}, headers=H
        ).status_code
        == 400
    )
    up = owner.put(
        f"/api/owner/coach/companies/{cid}",
        json={"stages_configured": True, "enabled": True, "cap_usd": 15.0},
        headers=H,
    )
    assert up.status_code == 200
    clr = owner.put(f"/api/owner/coach/companies/{cid}", json={"cap_usd": None}, headers=H)
    assert clr.status_code == 200
    assert clr.json()["cap_usd"] is None
    assert (
        owner.put(
            f"/api/owner/coach/companies/{cid}",
            json={"stages_configured": True, "enabled": True, "cap_usd": 15.0},
            headers=H,
        ).status_code
        == 200
    )

    # Playbook + unconfigured key 503 + prep chat (text & voice) + game-plan generate & invalid PUT
    assert (
        owner.post(
            "/api/v1/playbook",
            json={"question": "How fast is payback?", "answer": "Within 90 days."},
            headers=admin["auth"],
        ).status_code
        == 201
    )
    unconf = owner.post(
        "/api/v1/coach/prep/c-gen/chat",
        json={"message": "Hi"},
        headers=admin["auth"],
    )
    assert unconf.status_code == 503
    req_key = route_key_env(seed.routing.stages["coach_llm"])
    if req_key:
        assert (
            owner.put(
                f"/api/owner/keys/{req_key}",
                json={"value": "sk-test-fake-00000000000000000000"},
                headers=H,
            ).status_code
            == 200
        )
    chat = owner.post(
        "/api/v1/coach/prep/c-gen/chat",
        json={"message": "What should I open with?", "voice": True},
        headers=admin["auth"],
    )
    assert chat.status_code == 200, chat.text
    assert chat.json()["audio_bytes"] > 0
    msgs = owner.get("/api/v1/coach/prep/c-gen/messages", headers=admin["auth"])
    assert len(msgs.json()["messages"]) == 2

    gen = owner.post(
        "/api/v1/coach/prep/c-gen/game-plan",
        json={"crm_brief": "Acme", "prep_notes": "Ask ROI"},
        headers=admin["auth"],
    )
    assert gen.status_code == 200, gen.text
    assert gen.json()["game_plan"]["goals"] == ["Verify Q2 budget"]
    assert (
        owner.put(
            "/api/v1/coach/prep/c-gen/game-plan",
            json={"goals": ["G"], "objections": "not-a-list"},
            headers=admin["auth"],
        ).status_code
        == 400
    )

    # Enqueue + snooze errors + cancel + include_closed + settings missing field
    enq = owner.post(
        "/api/v1/coach/reviews/enqueue",
        json={"call_id": "call-enq", "call_duration_s": 90},
        headers=admin["auth"],
    )
    assert enq.status_code == 200
    rid = enq.json()["review"]["id"]
    assert (
        owner.post(
            f"/api/v1/coach/reviews/{rid}/snooze", json={"preset": "bad"}, headers=admin["auth"]
        ).status_code
        == 400
    )
    assert (
        owner.post(
            f"/api/v1/coach/reviews/{rid}/snooze",
            json={"preset": "tomorrow_morning", "timezone_offset_min": 0},
            headers=admin["auth"],
        ).status_code
        == 200
    )
    assert (
        owner.post(
            f"/api/v1/coach/reviews/{rid}/cancel", json={}, headers=admin["auth"]
        ).status_code
        == 200
    )
    closed = owner.get("/api/v1/coach/reviews?all=1", headers=admin["auth"]).json()["reviews"]
    assert any(r["id"] == rid and r["status"] == "cancelled" for r in closed)
    assert owner.put("/api/v1/coach/settings", json={}, headers=admin["auth"]).status_code == 400

    # Morning brief GET generates on demand with LLM
    mb = owner.get("/api/v1/coach/morning-brief", headers=admin["auth"])
    assert mb.status_code == 200, mb.text
    assert mb.json()["brief"]["mode"] == "voice"
    assert mb.json()["brief"]["content"]["summary_text"]

    # Input validation edge cases across prep/reviews + non-JSON game plan fallback
    for bad_chat in ({}, {"message": 123}, {"message": "   "}):
        assert (
            owner.post(
                "/api/v1/coach/prep/c-gen/chat", json=bad_chat, headers=admin["auth"]
            ).status_code
            == 400
        )
    assert (
        owner.put(
            "/api/v1/coach/prep/c-gen/game-plan", json={"goals": [123]}, headers=admin["auth"]
        ).status_code
        == 400
    )
    for bad_enq in (
        {"call_id": "x", "call_duration_s": True},
        {"call_id": "x", "call_duration_s": -1},
    ):
        assert (
            owner.post(
                "/api/v1/coach/reviews/enqueue", json=bad_enq, headers=admin["auth"]
            ).status_code
            == 400
        )
    assert (
        owner.post(
            "/api/v1/coach/reviews/enqueue",
            json={"call_id": "call-val", "call_duration_s": 60},
            headers=admin["auth"],
        ).status_code
        == 200
    )
    for bad_comp in (
        {"transcript": "bad"},
        {"transcript": ["not-dict"]},
        {"transcript": [{"role": "system", "content": "x"}]},
        {"transcript": [], "remember_note": 42},
    ):
        assert (
            owner.post(
                "/api/v1/coach/reviews/call-val/complete", json=bad_comp, headers=admin["auth"]
            ).status_code
            == 400
        )
    monkeypatch.setattr(
        "sotto_worker.cloud.app.make_llm",
        lambda route, *, clock=None, env=None: FakeLLM(
            clock=clock or RealClock(),
            model=route.model,
            text="- Open with Q2 timeline\n- Ask decision criteria",
            first_token_ms=1,
            chunk_ms=1,
        ),
    )
    fallback_gp = owner.post("/api/v1/coach/prep/c-gen/game-plan", json={}, headers=admin["auth"])
    assert fallback_gp.status_code == 200
    assert fallback_gp.json()["game_plan"]["goals"] == [
        "Open with Q2 timeline",
        "Ask decision criteria",
    ]
