"""Follow-up plans over HTTP (INT-08, INT-09; R12, D-033, D-055, D-070): the agent sets the plan
once, the scheduler makes steps due, and a step is only ever sent by the agent's own tap through
the usual email / WhatsApp route with the step's idempotency key. Meeting reminders: org flag
default off, UTILITY allow-listed templates only, one tap each. Company isolation."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest
from starlette.testclient import TestClient

from sotto_worker.adapters.email.smtp import Outgoing, SmtpAccount
from sotto_worker.cloud.app import CloudConfig, Headers, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.scheduler.runner import DAY_MS, HOUR_MS
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import ORIGIN
from tests.cloud.test_email import JSON_ORIGIN, agent, owner_login, set_org_smtp, signup
from tests.cloud.test_gallabox import TEMPLATES, FakeGallabox, cid_of, setup_org

T0 = 1_800_000_000_000


class Clock:
    def __init__(self) -> None:
        self.t = T0

    def __call__(self) -> int:
        return self.t


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def mails() -> list[Outgoing]:
    return []


@pytest.fixture
def gb() -> FakeGallabox:
    return FakeGallabox()


@pytest.fixture
def app(
    store: CloudStore, seed: Seed, clock: Clock, mails: list[Outgoing], gb: FakeGallabox
) -> Headers:
    async def spy(_account: SmtpAccount, mail: Outgoing) -> None:
        mails.append(mail)

    config = CloudConfig(
        public_origin=ORIGIN,
        static_dir=None,
        smtp_sender=spy,
        gallabox_transport=httpx.MockTransport(gb.handler),
        clock=clock,
    )
    return create_cloud_app(config, store, seed)


@pytest.fixture
def c(app: Headers) -> TestClient:
    return TestClient(app, base_url=ORIGIN)


def tick(app: Headers, now: int) -> dict[str, Any]:
    assert app.scheduler is not None
    return asyncio.run(app.scheduler.tick(now))


def setup(
    c: TestClient, store: CloudStore, *, utility_only: bool = True
) -> tuple[dict[str, str], dict[str, str]]:
    h = signup(c, "Acme", "admin@acme.test")
    owner_login(c, store)  # D-078: the vendor configures SMTP and Gallabox in the owner console
    assert set_org_smtp(c, h).status_code == 200
    setup_org(c, h)
    return h, agent(c, h)


EMAIL = {
    "sender": "org",
    "format": "follow_up",
    "to": ["jane@customer.test"],
    "subject": "Following up",
    "body": "Here is the pricing.",
    "customer_name": "Jane",
}
WA: dict[str, Any] = {
    "template": "meeting_followup",
    "language": "en",
    "recipient": {"name": "Jane Doe", "phone": "+971 50 123 4567"},
    "values": {"name": "Jane", "date": "12 Dec"},
}


def the_plan(**over: Any) -> dict[str, Any]:
    return {
        "call_id": "call-77",
        "customer_name": "Jane Doe",
        "steps": [
            {"kind": "email", "due_at": T0, "prepared": EMAIL},
            {"kind": "whatsapp", "due_at": T0 + 2 * DAY_MS, "prepared": WA},
            {"kind": "reminder", "due_at": T0 + 5 * DAY_MS, "prepared": {"note": "Call Jane"}},
        ],
        **over,
    }


def test_the_plan_reminds_the_agent_and_the_scheduler_never_sends(
    c: TestClient, app: Headers, mails: list[Outgoing], gb: FakeGallabox, store: CloudStore
) -> None:
    _h, ag = setup(c, store)
    r = c.post("/api/v1/followup/plans", json=the_plan(), headers=ag)
    assert r.status_code == 201, r.text
    plan = r.json()
    assert [s["kind"] for s in plan["steps"]] == ["email", "whatsapp", "reminder"]
    assert all(s["state"] == "pending" for s in plan["steps"])
    assert "prepared" not in r.text  # the list never carries drafts or recipients

    before = len(gb.requests)
    for t in (T0, T0 + 2 * DAY_MS, T0 + 5 * DAY_MS, T0 + 30 * DAY_MS):
        tick(app, t)
    # R12, D-033: every step is due, nothing reached SMTP or Gallabox.
    assert mails == []
    assert len(gb.requests) == before
    due = c.get("/api/v1/followup/due", headers=ag).json()["steps"]
    assert [d["kind"] for d in due] == ["email", "whatsapp", "reminder"]
    assert due[0]["customer_name"] == "Jane Doe"
    assert "prepared" not in str(due)
    audit = {r["action"] for r in store._q("SELECT action FROM audit")}
    assert not {"email.sent", "whatsapp.sent"} & audit


def test_a_step_is_sent_only_by_the_agents_tap_and_never_twice(
    c: TestClient, app: Headers, mails: list[Outgoing], gb: FakeGallabox, store: CloudStore
) -> None:
    _h, ag = setup(c, store)
    plan = c.post("/api/v1/followup/plans", json=the_plan(), headers=ag).json()
    email_step, wa_step, reminder = plan["steps"]
    tick(app, T0 + 2 * DAY_MS)

    # The notification opens the step: its draft is there for the usual preview.
    opened = c.get(f"/api/v1/followup/steps/{email_step['id']}", headers=ag).json()
    assert opened["prepared"]["to"] == ["jane@customer.test"]
    key = opened["idempotency_key"]
    assert key == f"fu-{email_step['id']}"

    # "Done" without a send is refused: a step cannot be ticked off as sent.
    r = c.post(f"/api/v1/followup/steps/{email_step['id']}/done", headers=ag)
    assert r.status_code == 409
    assert r.json()["code"] == "not_sent"

    send = {**opened["prepared"], "confirm": True, "idempotency_key": key}
    assert c.post("/api/v1/email/send", json=send, headers=ag).json()["duplicate"] is False
    assert c.post("/api/v1/email/send", json=send, headers=ag).json()["duplicate"] is True
    assert len(mails) == 1
    assert c.post(f"/api/v1/followup/steps/{email_step['id']}/done", headers=ag).json() == {
        "status": "done",
        "duplicate": False,
    }
    again = c.post(f"/api/v1/followup/steps/{email_step['id']}/done", headers=ag).json()
    assert again["duplicate"] is True
    gone = c.get(f"/api/v1/followup/steps/{email_step['id']}", headers=ag).json()
    assert gone["state"] == "done"
    assert "prepared" not in gone

    wa = c.get(f"/api/v1/followup/steps/{wa_step['id']}", headers=ag).json()
    msg = {**wa["prepared"], "confirm": True, "idempotency_key": wa["idempotency_key"]}
    assert c.post("/api/v1/whatsapp/send", json=msg, headers=ag).status_code == 200
    assert len(gb.sends()) == 1
    assert c.post(f"/api/v1/followup/steps/{wa_step['id']}/done", headers=ag).status_code == 200

    # A plain reminder (call the customer) is done by the tap itself; no send exists for it.
    assert c.post(f"/api/v1/followup/steps/{reminder['id']}/done", headers=ag).status_code == 200
    assert c.get("/api/v1/followup/plans", headers=ag).json()["plans"] == []  # plan finished
    done = [r["detail"] for r in store._q("SELECT detail FROM audit WHERE action='followup.done'")]
    assert len(done) == 3


def test_a_colleague_cannot_use_my_step_key_or_change_my_plan(
    c: TestClient, app: Headers, mails: list[Outgoing], store: CloudStore
) -> None:
    h, ag = setup(c, store)
    plan = c.post("/api/v1/followup/plans", json=the_plan(), headers=ag).json()
    step, pid = plan["steps"][0], plan["id"]
    other = agent(c, h, "ag2@acme.test")
    send = {**EMAIL, "confirm": True, "idempotency_key": f"fu-{step['id']}"}
    # Tenancy review: the step's key is the owner's; a colleague cannot burn it first.
    assert c.post("/api/v1/email/send", json=send, headers=other).status_code == 403
    assert c.post("/api/v1/email/send", json=send, headers=h).status_code == 403  # admin too
    assert mails == []
    for path in ("pause", "resume", "cancel"):
        assert c.post(f"/api/v1/followup/plans/{pid}/{path}", headers=other).status_code == 404
    for path in ("skip", "done"):
        assert (
            c.post(f"/api/v1/followup/steps/{step['id']}/{path}", headers=other).status_code == 404
        )
    assert c.get(f"/api/v1/followup/steps/{step['id']}", headers=other).status_code == 404
    assert c.get("/api/v1/followup/plans", headers=other).json()["plans"] == []
    # The owner still sends and completes it.
    assert c.post("/api/v1/email/send", json=send, headers=ag).status_code == 200
    assert c.post(f"/api/v1/followup/steps/{step['id']}/done", headers=ag).status_code == 200


def test_only_what_a_step_needs_is_kept(c: TestClient, store: CloudStore) -> None:
    _h, ag = setup(c, store)
    extra: dict[str, Any] = {
        **WA,
        "free_text": "Hello Jane, any message",
        "recipient": {**WA["recipient"], "x": 1},
    }
    plan = the_plan(steps=[{"kind": "whatsapp", "due_at": T0, "prepared": extra}])
    assert c.post("/api/v1/followup/plans", json=plan, headers=ag).status_code == 201
    kept = store._q("SELECT prepared FROM followup_steps")[0]["prepared"]
    assert "free_text" not in kept
    assert '"x"' not in kept


def test_the_agent_can_pause_resume_and_cancel(
    c: TestClient, app: Headers, store: CloudStore
) -> None:
    _h, ag = setup(c, store)
    plan = c.post("/api/v1/followup/plans", json=the_plan(), headers=ag).json()
    pid = plan["id"]
    assert c.post(f"/api/v1/followup/plans/{pid}/pause", headers=ag).json()["status"] == "paused"
    tick(app, T0 + 10 * DAY_MS)
    assert c.get("/api/v1/followup/due", headers=ag).json()["steps"] == []
    assert c.post(f"/api/v1/followup/plans/{pid}/resume", headers=ag).json()["status"] == "active"
    tick(app, T0 + 10 * DAY_MS + 1)
    assert len(c.get("/api/v1/followup/due", headers=ag).json()["steps"]) == 3
    r = c.post(f"/api/v1/followup/plans/{pid}/cancel", headers=ag)
    assert {s["state"] for s in r.json()["steps"]} == {"cancelled"}
    assert c.get("/api/v1/followup/due", headers=ag).json()["steps"] == []
    assert c.post(f"/api/v1/followup/plans/{pid}/resume", headers=ag).status_code == 400


def test_steps_are_validated(c: TestClient, store: CloudStore) -> None:
    _h, ag = setup(c, store)
    bad_template = the_plan(
        steps=[{"kind": "whatsapp", "due_at": T0, "prepared": {**WA, "template": "promo_offer"}}]
    )
    r = c.post("/api/v1/followup/plans", json=bad_template, headers=ag)
    assert r.status_code == 400
    assert "list" in r.json()["error"]
    far = the_plan(steps=[{"kind": "reminder", "due_at": T0 + 90 * DAY_MS}])
    assert c.post("/api/v1/followup/plans", json=far, headers=ag).status_code == 400
    many = the_plan(steps=[{"kind": "reminder", "due_at": T0}] * 6)
    assert c.post("/api/v1/followup/plans", json=many, headers=ag).status_code == 400
    bad_to = the_plan(steps=[{"kind": "email", "due_at": T0, "prepared": {**EMAIL, "to": ["x"]}}])
    assert c.post("/api/v1/followup/plans", json=bad_to, headers=ag).status_code == 400


def test_plans_are_isolated_between_companies(
    c: TestClient, app: Headers, store: CloudStore
) -> None:
    _h, ag = setup(c, store)
    plan = c.post("/api/v1/followup/plans", json=the_plan(), headers=ag).json()
    tick(app, T0 + 30 * DAY_MS)
    beta = signup(c, "Beta", "admin@beta.test")
    sid, pid = plan["steps"][0]["id"], plan["id"]
    assert c.get("/api/v1/followup/due", headers=beta).json()["steps"] == []
    assert c.get("/api/v1/followup/plans", headers=beta).json()["plans"] == []
    assert c.get(f"/api/v1/followup/steps/{sid}", headers=beta).status_code == 404
    assert c.post(f"/api/v1/followup/steps/{sid}/skip", headers=beta).status_code == 404
    assert c.post(f"/api/v1/followup/steps/{sid}/done", headers=beta).status_code == 404
    assert c.post(f"/api/v1/followup/plans/{pid}/cancel", headers=beta).status_code == 404
    assert len(c.get("/api/v1/followup/due", headers=ag).json()["steps"]) == 3


# --- INT-09 meeting reminders (D-070) ------------------------------------------------------------
def reminder_plan(template: str = "meeting_followup") -> dict[str, Any]:
    meeting = T0 + 3 * DAY_MS
    return the_plan(
        steps=[
            {
                "kind": "meeting_reminder",
                "due_at": meeting - DAY_MS,
                "prepared": {**WA, "template": template, "meeting_at": meeting},
            },
            {
                "kind": "meeting_reminder",
                "due_at": meeting - HOUR_MS,
                "prepared": {**WA, "template": template, "meeting_at": meeting},
            },
        ]
    )


def test_meeting_reminders_are_off_by_default(c: TestClient, store: CloudStore) -> None:
    _h, ag = setup(c, store)
    r = c.post("/api/v1/followup/plans", json=reminder_plan(), headers=ag)
    assert r.status_code == 403
    assert r.json()["feature"] == "meeting_reminders"
    assert r.json()["state"] == "off_by_org"


def test_meeting_reminders_wait_for_one_tap_each(
    c: TestClient, app: Headers, gb: FakeGallabox, store: CloudStore
) -> None:
    h, ag = setup(c, store)
    on = c.put("/api/v1/company/features/meeting_reminders", json={"enabled": True}, headers=h)
    assert on.status_code == 200
    plan = c.post("/api/v1/followup/plans", json=reminder_plan(), headers=ag)
    assert plan.status_code == 201, plan.text
    first, second = plan.json()["steps"]
    tick(app, T0 + 3 * DAY_MS)  # both reminders are due; none is sent
    assert gb.sends() == []
    one = c.get(f"/api/v1/followup/steps/{first['id']}", headers=ag).json()
    msg = {**one["prepared"], "confirm": True, "idempotency_key": one["idempotency_key"]}
    assert c.post("/api/v1/whatsapp/send", json=msg, headers=ag).status_code == 200
    assert c.post(f"/api/v1/followup/steps/{first['id']}/done", headers=ag).status_code == 200
    # The first tap does not approve the second reminder (no standing approval).
    assert len(gb.sends()) == 1
    assert c.post(f"/api/v1/followup/steps/{second['id']}/done", headers=ag).status_code == 409


def test_meeting_reminders_use_utility_templates_before_the_meeting(
    c: TestClient, gb: FakeGallabox, store: CloudStore
) -> None:
    h, ag = setup(c, store)
    c.put("/api/v1/company/features/meeting_reminders", json={"enabled": True}, headers=h)
    # Allow-list a MARKETING template too: it still cannot be a reminder.
    TEMPLATES.append(
        {
            "name": "promo_offer_en",
            "language": "en",
            "category": "MARKETING",
            "status": "APPROVED",
            "body": "Offer for {{name}} on {{date}}",
            "variables": [{"name": "name"}, {"name": "date"}],
        }
    )
    try:
        r = c.put(
            f"/api/owner/companies/{cid_of(c, h)}/gallabox/templates",
            json={
                "selected": [
                    {"name": "meeting_followup", "language": "en"},
                    {"name": "promo_offer_en", "language": "en"},
                ]
            },
            headers=JSON_ORIGIN,
        )
        assert r.status_code == 200, r.text
        bad = c.post("/api/v1/followup/plans", json=reminder_plan("promo_offer_en"), headers=ag)
        assert bad.status_code == 400
        assert "UTILITY" in bad.json()["error"]
    finally:
        TEMPLATES.pop()
    late = reminder_plan()
    late["steps"][0]["due_at"] = late["steps"][0]["prepared"]["meeting_at"] + 1
    assert c.post("/api/v1/followup/plans", json=late, headers=ag).status_code == 400
