"""Slice 2A (F-01, F-06, F-07): unified 30-day p95 stats snapshot, speed endpoint, and
server-computed Overview attention queue."""

from __future__ import annotations

from starlette.testclient import TestClient

from sotto_worker.cloud.store import now_ms
from tests.cloud.conftest import ORIGIN, SignUp

SAME = {"origin": ORIGIN}


def test_owner_stats_companies_and_speed_endpoint_agree_on_p95(
    owner: TestClient, client: TestClient, sign_up: SignUp
) -> None:
    s = sign_up("Zylker", "admin@z.test")
    t = now_ms()
    for i, (p95, excl) in enumerate(
        [(800, False), (1200, False), (4765, False), (9999, True)], start=1
    ):
        r = client.post(
            "/api/v1/usage",
            json={
                "call_id": f"c{i}",
                "started_at": t - i * 60_000,
                "duration_s": 60,
                "cards": 2,
                "playbook_cards": 1,
                "ai_cards": 1,
                "holding_lines": 0,
                "escalations": 0,
                "p95_ms": p95,
                "exclude_p95_alarm": excl,
            },
            headers=s["auth"],
        )
        assert r.status_code == 200

    stats = owner.get("/api/owner/stats").json()
    speed = owner.get("/api/owner/stats/speed").json()
    companies = owner.get("/api/owner/companies").json()["companies"]

    assert len(companies) == 1
    assert isinstance(stats["computed_at"], int)
    assert isinstance(speed["computed_at"], int)
    assert speed["window_days"] == 30
    assert speed["calls_count"] == 3
    assert stats["p95_calls_30d"] == 3
    # Overview, Companies, and /stats/speed all report the exact same 30-day p95 (excluding alarms).
    assert stats["p95_ms_30d"] == speed["p95_ms"] == companies[0]["p95_ms_30d"]
    assert stats["p95_ms_30d"] != 9999


def test_owner_attention_queue_surfaces_and_clears_guardrails(
    owner: TestClient, client: TestClient, sign_up: SignUp
) -> None:
    s = sign_up("Zylker", "admin@z.test")
    cid = s["company"]["id"]
    t = now_ms()
    # Report a slow call and a new bug report so those attention items trigger too.
    client.post(
        "/api/v1/usage",
        json={
            "call_id": "slow1",
            "started_at": t - 60_000,
            "duration_s": 120,
            "cards": 2,
            "playbook_cards": 1,
            "ai_cards": 1,
            "holding_lines": 0,
            "escalations": 1,
            "p95_ms": 3200,
        },
        headers=s["auth"],
    )
    client.post(
        "/api/v1/bug-reports",
        json={"title": "Test bug", "description": "Something broke"},
        headers=s["auth"],
    )

    # Non-owner bearer cannot read owner stats/speed or attention.
    jar = dict(client.cookies)
    client.cookies.clear()
    assert client.get("/api/owner/stats/speed", headers=s["auth"]).status_code == 401
    assert client.get("/api/owner/attention", headers=s["auth"]).status_code == 401
    for k, v in jar.items():
        client.cookies.set(k, v)

    att = owner.get("/api/owner/attention").json()
    assert isinstance(att["computed_at"], int)
    by_id = {item["id"]: item for item in att["items"]}
    assert by_id["signup_webhook_missing"]["severity"] == "red"
    assert by_id["speed_over_limit"]["severity"] == "red"
    assert by_id["live_stage_no_key"]["severity"] == "red"
    assert by_id["routing_job_off"]["severity"] == "amber"
    assert by_id["spend_cap_missing"]["severity"] == "amber"
    assert by_id["bug_reports_new"]["severity"] == "amber"
    assert by_id["unanswered_questions"]["severity"] == "amber"

    # Fixing each guardrail removes its item from the attention queue.
    assert owner.post("/api/owner/signups/secret", json={}, headers=SAME).status_code == 200
    assert (
        owner.put(
            f"/api/owner/companies/{cid}/spend-cap", json={"cap_usd": 50}, headers=SAME
        ).status_code
        == 200
    )
    assert (
        owner.put("/api/owner/routing-job", json={"monthly_cap_usd": 25}, headers=SAME).status_code
        == 200
    )

    att_after = owner.get("/api/owner/attention").json()
    after_ids = {item["id"] for item in att_after["items"]}
    assert "signup_webhook_missing" not in after_ids
    assert "spend_cap_missing" not in after_ids
    assert "routing_job_off" not in after_ids
