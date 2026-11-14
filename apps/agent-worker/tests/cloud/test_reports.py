"""Reports data (owner, 22 Oct 2026): review numbers per call, agents see only their own calls,
companies never see each other's."""

from __future__ import annotations

import time
from typing import Any

from starlette.testclient import TestClient

from sotto_worker.cloud.store import CloudStore
from tests.cloud.byo import allow_byo
from tests.cloud.conftest import PASSWORD, SignUp

SCORES = {
    "opening": 7,
    "discovery": 6,
    "listening": 8,
    "objections": 5,
    "clarity": 9,
    "next_step": 4,
}
REVIEW: dict[str, Any] = {
    "scores": SCORES,
    "success": 65,
    "sentiment": "positive",
    "summary": "words from the call are never stored",
}


def report(client: TestClient, h: dict[str, str], call_id: str) -> None:
    body: dict[str, Any] = {
        "call_id": call_id,
        "started_at": int(time.time() * 1000) - 60_000,
        "duration_s": 60,
        "cards": 3,
        "playbook_cards": 1,
        "ai_cards": 2,
        "holding_lines": 0,
        "escalations": 0,
        "source": "zoom",
    }
    assert client.post("/api/v1/usage", json=body, headers=h).status_code == 200


def agent(
    client: TestClient, store: CloudStore, admin: dict[str, str], email: str
) -> dict[str, str]:
    r = client.post(
        "/api/v1/team", json={"email": email, "name": "Omar", "role": "agent"}, headers=admin
    )
    assert r.status_code in (200, 201)
    store._db.execute(
        "UPDATE users SET must_change_pw = 0, pw_hash = (SELECT pw_hash FROM users"
        " WHERE email = 'admin@a.test') WHERE email = ?",
        (email,),
    )
    token = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    return {"authorization": f"Bearer {token.json()['token']}"}


def test_review_numbers_reach_reports_without_words(client: TestClient, sign_up: SignUp) -> None:
    h = sign_up("Alpha", "admin@a.test")["auth"]
    report(client, h, "c1")
    r = client.post("/api/v1/calls/c1/review", json=REVIEW, headers=h)
    assert r.status_code == 200
    row = client.get("/api/v1/company/usage?days=7", headers=h).json()["calls"][0]
    assert row["review"] == {k: REVIEW[k] for k in ("scores", "success", "sentiment")}
    assert row["name"] == "Ada Admin"
    assert row["source"] == "zoom"


def test_review_is_validated(client: TestClient, sign_up: SignUp) -> None:
    h = sign_up("Alpha", "admin@a.test")["auth"]
    report(client, h, "c1")
    bad = [
        {**REVIEW, "success": 101},
        {**REVIEW, "sentiment": "angry"},
        {**REVIEW, "scores": {**SCORES, "opening": 11}},
        {**REVIEW, "scores": {"opening": 5}},
    ]
    for b in bad:
        assert client.post("/api/v1/calls/c1/review", json=b, headers=h).status_code == 400
    assert client.post("/api/v1/calls/nope/review", json=REVIEW, headers=h).status_code == 404


def test_agents_see_their_own_calls_and_companies_stay_apart(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    ha = sign_up("Alpha", "admin@a.test")["auth"]
    hb = sign_up("Beta", "admin@b.test")["auth"]
    omar = agent(client, store, ha, "omar@a.test")
    report(client, ha, "admin-call")
    report(client, omar, "omar-call")
    report(client, hb, "beta-call")

    def ids(h: dict[str, str]) -> set[str]:
        calls = client.get("/api/v1/company/usage", headers=h).json()["calls"]
        return {c["id"].split(":")[1] for c in calls}

    assert ids(ha) == {"admin-call", "omar-call"}
    assert ids(omar) == {"omar-call"}
    assert ids(hb) == {"beta-call"}
    # Beta cannot attach a review to Alpha's call, even with the same id.
    assert client.post("/api/v1/calls/omar-call/review", json=REVIEW, headers=hb).status_code == 404


def test_admins_read_their_own_company_activity_only(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    alpha = sign_up("Alpha", "admin@a.test")
    ha = alpha["auth"]
    hb = sign_up("Beta", "admin@b.test")["auth"]
    allow_byo(store, alpha)  # D-059: key writes need AGN's BYO entitlement
    client.put("/api/v1/company/keys/GROQ_API_KEY", json={"value": "gsk_" + "a" * 24}, headers=ha)
    items = client.get("/api/v1/audit", headers=ha).json()["items"]
    assert any(i["action"] == "key.set" and i["detail"] == "GROQ_API_KEY" for i in items)
    assert all("gsk_" not in i["detail"] for i in items)  # key values never appear
    assert all(
        i["action"] != "key.set" for i in client.get("/api/v1/audit", headers=hb).json()["items"]
    )
    omar = agent(client, store, ha, "omar@a.test")
    assert client.get("/api/v1/audit", headers=omar).status_code == 403
