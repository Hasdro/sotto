"""Playbook suggestions (INT-15): the same "not helpful" question on several calls, or a manager's
answer to an escalation, becomes one approval card; nothing reaches the playbook without a
manager's approval (R2 step 5); a rejection is recorded and not suggested again."""

from __future__ import annotations

from typing import Any

from starlette.testclient import TestClient

from sotto_worker.cloud.coaching.store import SUGGEST_AFTER, topic_words
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import SignUp
from tests.cloud.test_coaching import client, mailer, member  # noqa: F401  (fixtures)

QUESTIONS = [
    "Do you offer a warranty on the solar panels?",
    "do you offer warranty for solar panels",
    "What warranty do you offer on the solar panels?",
]


def signal(http: TestClient, h: dict[str, str], call: str, question: str) -> dict[str, Any]:
    r = http.post(
        "/api/v1/coaching/signals",
        json={"call_id": call, "not_helpful": [{"question": question}], "objections": []},
        headers=h,
    )
    assert r.status_code == 200, r.text
    return dict(r.json())


def playbook(http: TestClient, h: dict[str, str]) -> list[str]:
    return [e["question"] for e in http.get("/api/v1/playbook", headers=h).json()["entries"]]


def setup(http: TestClient, store: CloudStore, sign_up: SignUp) -> dict[str, dict[str, str]]:
    admin = sign_up(company="Acme", email="admin@a.test")["auth"]
    store._db.execute("UPDATE companies SET seats = 10")
    return {
        "admin": admin,
        "omar": member(http, store, admin, "omar@a.test", "Omar", "agent"),
        "mona": member(http, store, admin, "mona@a.test", "Mona", "manager"),
    }


def test_topic_words_ignore_case_punctuation_and_filler() -> None:
    assert topic_words(QUESTIONS[0]) == topic_words(QUESTIONS[1]) == topic_words(QUESTIONS[2])
    assert topic_words("Is it ok?") == frozenset()
    assert "الضمان" in topic_words("هل يوجد الضمان؟")


def test_repeated_not_helpful_question_becomes_one_card(
    client: TestClient,  # noqa: F811 - the coaching app fixture
    store: CloudStore,
    sign_up: SignUp,
) -> None:
    p = setup(client, store, sign_up)
    before = playbook(client, p["admin"])
    for i, q in enumerate(QUESTIONS[: SUGGEST_AFTER - 1]):
        assert signal(client, p["omar"], f"c{i}", q)["suggestions"] == []
    assert client.get("/api/v1/playbook/suggestions", headers=p["mona"]).json()["items"] == []
    made = signal(client, p["omar"], "c9", QUESTIONS[2])["suggestions"]
    assert len(made) == 1
    signal(client, p["omar"], "c9", QUESTIONS[2])  # a retry adds nothing
    signal(client, p["omar"], "c10", QUESTIONS[0])  # a fourth call updates the same card
    s = client.get("/api/v1/playbook/suggestions", headers=p["mona"]).json()
    assert s["open"] == 1
    assert len(s["items"]) == 1
    card = s["items"][0]
    assert card["source"] == "ratings"
    assert card["calls"] == 4
    assert len(card["samples"]) == 3
    assert "4 calls" in card["reason"]
    assert "{{" not in card["reason"]
    assert playbook(client, p["admin"]) == before  # nothing changed without approval
    # Agents never see or decide suggestions.
    assert client.get("/api/v1/playbook/suggestions", headers=p["omar"]).status_code == 403
    r = client.post(
        f"/api/v1/playbook/suggestions/{card['id']}/approve",
        json={"answer": "Yes: 25 years on panels."},
        headers=p["omar"],
    )
    assert r.status_code == 403


def test_approve_adds_one_playbook_entry_and_is_audited(
    client: TestClient,  # noqa: F811 - the coaching app fixture
    store: CloudStore,
    sign_up: SignUp,
) -> None:
    p = setup(client, store, sign_up)
    for i, q in enumerate(QUESTIONS):
        signal(client, p["omar"], f"c{i}", q)
    card = client.get("/api/v1/playbook/suggestions", headers=p["mona"]).json()["items"][0]
    r = client.post(
        f"/api/v1/playbook/suggestions/{card['id']}/approve",
        json={"question": "Is there a warranty?", "answer": "Yes: 25 years on the panels."},
        headers=p["mona"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"
    assert r.json()["playbook_id"]
    assert "Is there a warranty?" in playbook(client, p["admin"])
    again = client.post(
        f"/api/v1/playbook/suggestions/{card['id']}/approve",
        json={"answer": "x"},
        headers=p["mona"],
    )
    assert again.status_code == 404
    actions = [r["action"] for r in store._q("SELECT action FROM audit")]
    assert "playbook_suggestion.approved" in actions
    assert "playbook.add" in actions
    # A decided topic is not suggested again.
    signal(client, p["omar"], "c20", QUESTIONS[0])
    s = client.get("/api/v1/playbook/suggestions", headers=p["mona"]).json()
    assert s["open"] == 0


def test_reject_is_recorded_and_changes_nothing(
    client: TestClient,  # noqa: F811 - the coaching app fixture
    store: CloudStore,
    sign_up: SignUp,
) -> None:
    p = setup(client, store, sign_up)
    for i, q in enumerate(QUESTIONS):
        signal(client, p["omar"], f"c{i}", q)
    before = playbook(client, p["admin"])
    card = client.get("/api/v1/playbook/suggestions", headers=p["admin"]).json()["items"][0]
    r = client.post(f"/api/v1/playbook/suggestions/{card['id']}/reject", headers=p["admin"])
    assert r.status_code == 200
    assert r.json()["status"] == "rejected"
    assert playbook(client, p["admin"]) == before
    assert store._q("SELECT 1 FROM audit WHERE action = 'playbook_suggestion.rejected'")
    items = client.get("/api/v1/playbook/suggestions", headers=p["admin"]).json()["items"]
    assert [i["status"] for i in items] == ["rejected"]


def test_manager_answer_to_an_escalation_becomes_a_card(
    client: TestClient,  # noqa: F811 - the coaching app fixture
    store: CloudStore,
    sign_up: SignUp,
) -> None:
    p = setup(client, store, sign_up)
    r = client.post(
        "/api/v1/escalations", json={"question": "Do you ship to Oman?"}, headers=p["omar"]
    )
    esc = r.json()["id"]
    client.post(
        f"/api/v1/escalations/{esc}/answer",
        json={"answer": "Yes, within five days.", "add_to_playbook": False},
        headers=p["mona"],
    )
    items = client.get("/api/v1/playbook/suggestions", headers=p["mona"]).json()["items"]
    assert len(items) == 1
    card = items[0]
    assert card["source"] == "escalation"
    assert card["answer"] == "Yes, within five days."
    assert "Do you ship to Oman?" not in playbook(client, p["admin"])
    client.post(f"/api/v1/playbook/suggestions/{card['id']}/approve", json={}, headers=p["mona"])
    assert "Do you ship to Oman?" in playbook(client, p["admin"])
    inbox = client.get("/api/v1/escalations", headers=p["mona"]).json()
    rows = inbox["items"] if isinstance(inbox, dict) else inbox
    assert [e["status"] for e in rows] == ["added"]


def test_company_b_never_sees_or_decides_company_a_suggestions(
    client: TestClient,  # noqa: F811 - the coaching app fixture
    store: CloudStore,
    sign_up: SignUp,
) -> None:
    p = setup(client, store, sign_up)
    for i, q in enumerate(QUESTIONS):
        signal(client, p["omar"], f"c{i}", q)
    card = client.get("/api/v1/playbook/suggestions", headers=p["admin"]).json()["items"][0]
    other = sign_up(company="Beta", email="admin@b.test")["auth"]
    assert client.get("/api/v1/playbook/suggestions", headers=other).json()["items"] == []
    for action in ("approve", "reject"):
        r = client.post(
            f"/api/v1/playbook/suggestions/{card['id']}/{action}",
            json={"answer": "hijack"},
            headers=other,
        )
        assert r.status_code == 404
    # Beta's own signals never count towards Acme's topic.
    assert client.get("/api/v1/playbook/suggestions", headers=p["admin"]).json()["open"] == 1
