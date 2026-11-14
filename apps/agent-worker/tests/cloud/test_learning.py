"""Card ratings and learned instructions on the server (R11, D-034, T-058…T-060)."""

from __future__ import annotations

from typing import Any

from starlette.testclient import TestClient

from tests.cloud.conftest import PASSWORD, SignUp

CALL = "11111111-1111-4111-8111-111111111111"


def _agent(
    client: TestClient, admin: dict[str, Any], email: str = "ag@acme.test"
) -> dict[str, str]:
    r = client.post(
        "/api/v1/team", json={"email": email, "name": "Agnes", "role": "agent"}, headers=admin
    )
    temp = r.json()["temporary_password"]
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": temp}).json()["token"]
    auth = {"authorization": f"Bearer {tok}"}
    client.post(
        "/api/v1/auth/password", json={"current": temp, "new": PASSWORD + "x"}, headers=auth
    )
    return auth


def _rate(client: TestClient, h: dict[str, str], n: int, call: str = CALL, **over: Any) -> None:
    for i in range(n):
        r = client.post(
            "/api/v1/ratings",
            json={
                "call_id": call,
                "card_id": f"card-{call[:4]}-{i}",
                "card_type": "answer",
                "card_source": "ai",
                "rating": "down" if i % 2 else "up",
                "reasons": ["too_long"] if i % 2 else ["good_phrasing"],
                **over,
            },
            headers=h,
        )
        assert r.status_code == 200, r.text


def test_only_ai_advice_cards_can_be_rated(client: TestClient, sign_up: SignUp) -> None:
    h = sign_up()["auth"]
    base = {"call_id": CALL, "card_id": "c1", "rating": "up", "reasons": []}
    for t, src in (("answer", "playbook"), ("holding", "holding"), ("holding", "ai")):
        r = client.post(
            "/api/v1/ratings", json={**base, "card_type": t, "card_source": src}, headers=h
        )
        assert r.status_code == 422, (t, src)
        assert r.json()["code"] == "not_rateable"
    bad = {**base, "card_type": "answer", "card_source": "ai", "reasons": ["rude"]}
    assert client.post("/api/v1/ratings", json=bad, headers=h).status_code == 400
    for t in ("answer", "question", "objection", "signal", "warning"):
        ok = {**base, "card_id": t, "card_type": t, "card_source": "backup"}
        assert client.post("/api/v1/ratings", json=ok, headers=h).status_code == 200


def test_a_rating_can_be_changed_and_cleared_and_admins_see_aggregates(
    client: TestClient, sign_up: SignUp
) -> None:
    admin = sign_up()["auth"]
    agent = _agent(client, admin)
    _rate(client, agent, 3)
    card = {"call_id": CALL, "card_id": "card-1111-0", "card_type": "answer", "card_source": "ai"}
    client.post(
        "/api/v1/ratings", json={**card, "rating": "down", "reasons": ["wrong"]}, headers=agent
    )
    client.post(
        "/api/v1/ratings", json={**card, "card_id": "card-1111-2", "rating": None}, headers=agent
    )
    assert client.get("/api/v1/ratings/summary", headers=agent).status_code == 403
    s = client.get("/api/v1/ratings/summary", headers=admin).json()
    assert (s["total"], s["up"], s["down"], s["calls"]) == (2, 0, 2, 1)
    assert s["reasons"]["wrong"] == 1
    assert s["reasons"]["too_long"] == 1
    assert s["by_type"] == {"answer": {"up": 0, "down": 2}}
    assert s["people"] == [{"name": "Agnes", "up": 0, "down": 2}]
    assert "text" not in str(s)  # no words from the call ever reach the server


def test_instructions_need_three_ratings_and_obey_the_caps(
    client: TestClient, sign_up: SignUp
) -> None:
    admin = sign_up()["auth"]
    agent = _agent(client, admin)
    _rate(client, agent, 2)
    one = {"call_id": CALL, "instructions": ["Keep answers under two sentences."]}
    r = client.post("/api/v1/learning/proposals", json=one, headers=agent)
    assert r.status_code == 409
    assert r.json()["code"] == "too_few_ratings"
    _rate(client, agent, 3)
    long = {"call_id": CALL, "instructions": [" ".join(["word"] * 26)]}
    assert client.post("/api/v1/learning/proposals", json=long, headers=agent).status_code == 400
    nine = {"call_id": CALL, "instructions": [f"Rule number {i}." for i in range(9)]}
    assert client.post("/api/v1/learning/proposals", json=nine, headers=agent).status_code == 400
    r = client.post("/api/v1/learning/proposals", json=one, headers=agent)
    assert r.status_code == 201
    assert r.json() == {"version": 1, "status": "applied"}
    # A retried upload of the same call never makes a second version.
    again = {"call_id": CALL, "instructions": ["Something else."]}
    assert (
        client.post("/api/v1/learning/proposals", json=again, headers=agent).json()["version"] == 1
    )
    bundle = client.get("/api/v1/bundle", headers=agent).json()
    assert bundle["learned"] == {
        "version": 1,
        "instructions": ["Keep answers under two sentences."],
    }
    assert client.get("/api/v1/features", headers=agent).json()["learned_version"] == 1


def test_review_before_apply_holds_a_version_until_approved(
    client: TestClient, sign_up: SignUp
) -> None:
    admin = sign_up()["auth"]
    agent = _agent(client, admin)
    assert (
        client.put(
            "/api/v1/learning/settings", json={"review_before_apply": True}, headers=agent
        ).status_code
        == 403
    )
    client.put("/api/v1/learning/settings", json={"review_before_apply": True}, headers=admin)
    _rate(client, agent, 3)
    r = client.post(
        "/api/v1/learning/proposals",
        json={"call_id": CALL, "instructions": ["Name the next step."]},
        headers=agent,
    )
    assert r.json() == {"version": 1, "status": "pending"}
    assert client.get("/api/v1/bundle", headers=agent).json()["learned"]["instructions"] == []
    o = client.get("/api/v1/learning", headers=admin).json()
    assert o["pending"] == [1]
    assert o["new"] == 1
    assert o["review_before_apply"] is True
    o = client.post("/api/v1/learning/versions/1/approve", json={}, headers=admin).json()
    assert o["active_version"] == 1
    assert o["pending"] == []
    assert client.get("/api/v1/bundle", headers=agent).json()["learned"]["instructions"] == [
        "Name the next step."
    ]
    client.post("/api/v1/learning/seen", json={}, headers=admin)
    assert client.get("/api/v1/learning", headers=admin).json()["new"] == 0
    assert (
        client.post("/api/v1/learning/versions/1/reject", json={}, headers=admin).status_code == 404
    )


def test_edit_reorder_disable_delete_and_revert(client: TestClient, sign_up: SignUp) -> None:
    admin = sign_up()["auth"]
    agent = _agent(client, admin)
    _rate(client, agent, 3)
    client.post(
        "/api/v1/learning/proposals",
        json={"call_id": CALL, "instructions": ["First rule.", "Second rule.", "Third rule."]},
        headers=agent,
    )
    items = client.get("/api/v1/learning", headers=admin).json()["items"]
    assert [i["source_call"] for i in items] == [CALL] * 3
    first, _second, third = items
    edited = [
        {**third, "text": "Third rule, edited."},
        {**first, "enabled": False},
    ]  # reordered, one disabled, the second deleted
    o = client.put("/api/v1/learning/instructions", json={"items": edited}, headers=admin).json()
    assert o["active_version"] == 2
    assert [(i["id"], i["text"], i["enabled"]) for i in o["items"]] == [
        (third["id"], "Third rule, edited.", True),
        (first["id"], "First rule.", False),
    ]
    assert client.get("/api/v1/bundle", headers=agent).json()["learned"]["instructions"] == [
        "Third rule, edited."
    ]
    o = client.post("/api/v1/learning/versions/1/revert", json={}, headers=admin).json()
    assert o["active_version"] == 3
    assert [i["text"] for i in o["items"]] == ["First rule.", "Second rule.", "Third rule."]
    assert [v["origin"] for v in o["versions"]] == ["revert", "edit", "learning"]
    assert (
        client.put(
            "/api/v1/learning/instructions", json={"items": [{"text": ""}]}, headers=admin
        ).status_code
        == 400
    )
    audit = [a["action"] for a in client.get("/api/v1/audit", headers=admin).json()["items"]]
    assert {"learning.applied", "learning.edited", "learning.reverted"} <= set(audit)


def test_a_disabled_instruction_survives_the_next_learning_run(
    client: TestClient, sign_up: SignUp
) -> None:
    admin = sign_up()["auth"]
    agent = _agent(client, admin)
    _rate(client, agent, 3)
    client.post(
        "/api/v1/learning/proposals", json={"call_id": CALL, "instructions": ["A."]}, headers=agent
    )
    a = client.get("/api/v1/learning", headers=admin).json()["items"][0]
    client.put(
        "/api/v1/learning/instructions", json={"items": [{**a, "enabled": False}]}, headers=admin
    )
    call2 = "22222222-2222-4222-8222-222222222222"
    _rate(client, agent, 3, call=call2)
    seven = [f"Rule {i}." for i in range(7)]
    r = client.post(
        "/api/v1/learning/proposals",
        json={"call_id": call2, "instructions": [*seven, "x."]},
        headers=agent,
    )
    assert r.status_code == 400  # 8 new + 1 disabled would pass the cap
    client.post(
        "/api/v1/learning/proposals", json={"call_id": call2, "instructions": seven}, headers=agent
    )
    items = client.get("/api/v1/learning", headers=admin).json()["items"]
    assert len(items) == 8
    assert items[-1] == {**a, "enabled": False}


def test_switched_off_learning_is_withheld_and_rejected(
    client: TestClient, sign_up: SignUp
) -> None:
    admin = sign_up()["auth"]
    r = client.put("/api/v1/company/features/card_ratings", json={"enabled": False}, headers=admin)
    assert r.status_code == 200, r.text
    assert client.get("/api/v1/bundle", headers=admin).json()["learned"] is None
    rate = {
        "call_id": CALL,
        "card_id": "c",
        "card_type": "answer",
        "card_source": "ai",
        "rating": "up",
    }
    r = client.post("/api/v1/ratings", json=rate, headers=admin)
    assert r.status_code == 403
    assert r.json()["error"] == "feature_unavailable"
    r = client.get("/api/v1/learning", headers=admin)
    assert r.status_code == 403
    assert r.json()["feature"] == "learned_instructions"


def test_company_b_never_sees_company_a_ratings_or_instructions(
    client: TestClient, sign_up: SignUp
) -> None:
    a = sign_up("Alpha", "admin@a.test")["auth"]
    b = sign_up("Beta", "admin@b.test")["auth"]
    _rate(client, a, 3)
    client.post(
        "/api/v1/learning/proposals", json={"call_id": CALL, "instructions": ["A only."]}, headers=a
    )
    assert client.get("/api/v1/ratings/summary", headers=b).json()["total"] == 0
    ob = client.get("/api/v1/learning", headers=b).json()
    assert ob["items"] == []
    assert ob["versions"] == []
    assert client.get("/api/v1/bundle", headers=b).json()["learned"]["instructions"] == []
    assert client.post("/api/v1/learning/versions/1/revert", json={}, headers=b).status_code == 404
    # B proposing for A's call: B has no ratings there.
    r = client.post(
        "/api/v1/learning/proposals", json={"call_id": CALL, "instructions": ["B."]}, headers=b
    )
    assert r.status_code == 409
    # B clearing A's card id only touches B's own (absent) row.
    client.post(
        "/api/v1/ratings",
        json={
            "call_id": CALL,
            "card_id": "card-1111-0",
            "card_type": "answer",
            "card_source": "ai",
            "rating": None,
        },
        headers=b,
    )
    assert client.get("/api/v1/ratings/summary", headers=a).json()["total"] == 3


def test_learned_items_name_the_call_they_came_from(client: TestClient, sign_up: SignUp) -> None:
    """UX-06c: "From the call with <name>, <date>"; the label survives an admin edit and is
    trimmed to one short line."""
    admin = sign_up()["auth"]
    agent = _agent(client, admin)
    _rate(client, agent, 3)
    r = client.post(
        "/api/v1/learning/proposals",
        json={
            "call_id": CALL,
            "instructions": ["Name the next step."],
            "source_label": "  Sara   Haddad " + "x" * 80,
        },
        headers=agent,
    )
    assert r.status_code == 201, r.text
    item = client.get("/api/v1/learning", headers=admin).json()["items"][0]
    assert item["source_label"].startswith("Sara Haddad x")
    assert len(item["source_label"]) == 60
    edited = client.put(
        "/api/v1/learning/instructions",
        json={"items": [{"id": item["id"], "text": "Name one next step.", "enabled": True}]},
        headers=admin,
    ).json()
    assert edited["items"][0]["source_label"] == item["source_label"]
