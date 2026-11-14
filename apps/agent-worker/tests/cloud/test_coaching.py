"""Manager coaching (INT-05): an agent sees only themselves, a manager their team, an admin the
company; nobody is ranked; companies never see each other's coaching data; the weekly email is
opt-in, has a preview and a named hook for the scheduler."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any, cast

import pytest
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.testclient import TestClient

from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.coaching import routes as coaching_routes
from sotto_worker.cloud.coaching.store import CoachingStore
from sotto_worker.cloud.learning.store import LearningStore
from sotto_worker.cloud.store import CloudError, CloudStore, Principal
from sotto_worker.outbox import EmailMessage
from tests.cloud.conftest import ORIGIN, PASSWORD, SignUp, fake_minter
from tests.cloud.test_reports import REVIEW, report

Handler = Callable[[Request, Principal], Awaitable[Response]]


class FakeMailer:
    provider = "fake"

    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    async def send(self, message: EmailMessage, *, idempotency_key: str) -> None:
        self.sent.append(message)


@pytest.fixture
def mailer() -> FakeMailer:
    return FakeMailer()


@pytest.fixture
def client(store: CloudStore, seed: Seed, mailer: FakeMailer) -> TestClient:
    """The cloud app with the coaching routes mounted the way cloud/app.py mounts learning."""
    config = CloudConfig(
        public_origin=ORIGIN, static_dir=None, secure_cookies=False, stt_minter=fake_minter
    )
    app = create_cloud_app(config, store, seed)
    inner = cast(Any, app).app  # the Starlette app inside the security-headers wrapper

    def app_route(fn: Handler) -> Callable[[Request], Awaitable[Response]]:
        async def wrapped(request: Request) -> Response:
            header = request.headers.get("authorization", "")
            who = store.principal(header[7:].strip(), kind="app") if header else None
            if who is None:
                return JSONResponse({"code": "signed_out"}, status_code=401)
            try:
                return await fn(request, who)
            except CloudError as e:
                status = {"forbidden": 403, "not_found": 404}.get(e.code, 400)
                return JSONResponse({"code": e.code, "error": str(e)}, status_code=status)

        return wrapped

    async def body(request: Request) -> dict[str, Any]:
        data = await request.json()
        return data if isinstance(data, dict) else {}

    routes = coaching_routes.make_routes(
        coaching=CoachingStore(store),
        learning=LearningStore(store),
        prompts=seed.prompts,
        app_route=app_route,
        body=body,
        ip_of=lambda _r: "test",
        origin=ORIGIN,
        mailer=mailer,
    )
    for i, r in enumerate(routes):
        inner.router.routes.insert(i, r)
    return TestClient(app, base_url=ORIGIN)


def member(
    client: TestClient, store: CloudStore, admin: dict[str, str], email: str, name: str, role: str
) -> dict[str, str]:
    r = client.post(
        "/api/v1/team", json={"email": email, "name": name, "role": role}, headers=admin
    )
    assert r.status_code in (200, 201), r.text
    store._db.execute(
        "UPDATE users SET must_change_pw = 0, pw_hash = (SELECT pw_hash FROM users"
        " WHERE role = 'admin' LIMIT 1) WHERE email = ?",
        (email,),
    )
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    return {"authorization": f"Bearer {tok.json()['token']}"}


def uid(store: CloudStore, email: str) -> str:
    return str(store._q("SELECT id FROM users WHERE email = ?", (email,))[0]["id"])


def rate_down(client: TestClient, h: dict[str, str], call: str, n: int) -> None:
    for i in range(n):
        r = client.post(
            "/api/v1/ratings",
            json={
                "call_id": call,
                "card_id": f"{call}-{i}",
                "card_type": "objection",
                "card_source": "ai",
                "rating": "down",
                "reasons": ["wrong"],
            },
            headers=h,
        )
        assert r.status_code == 200, r.text


def low(skill: str) -> dict[str, Any]:
    return {**REVIEW, "scores": {**REVIEW["scores"], skill: 1}}


@pytest.fixture
def team(client: TestClient, store: CloudStore, sign_up: SignUp) -> dict[str, dict[str, str]]:
    admin = sign_up(company="Acme", email="admin@a.test")["auth"]
    store._db.execute("UPDATE companies SET seats = 10")
    people = {
        "admin": admin,
        "omar": member(client, store, admin, "omar@a.test", "Omar", "agent"),
        "zara": member(client, store, admin, "zara@a.test", "Zara", "agent"),
        "mona": member(client, store, admin, "mona@a.test", "Mona", "manager"),
    }
    for name, skill in (("omar", "discovery"), ("zara", "next_step")):
        h = people[name]
        report(client, h, f"{name}-1")
        assert client.post(f"/api/v1/calls/{name}-1/review", json=low(skill), headers=h).is_success
        rate_down(client, h, f"{name}-1", 2)
        r = client.post(
            "/api/v1/coaching/signals",
            json={"call_id": f"{name}-1", "objections": ["price"], "not_helpful": []},
            headers=h,
        )
        assert r.status_code == 200, r.text
    return people


def names(view: dict[str, Any]) -> list[str]:
    return [p["name"] for p in view["people"]]


def test_an_agent_sees_only_themselves(client: TestClient, team: dict[str, dict[str, str]]) -> None:
    v = client.get("/api/v1/coaching", headers=team["omar"]).json()
    assert v["scope"] == "self"
    assert names(v) == ["Omar"]
    me = v["people"][0]
    assert me["me"] is True
    assert me["weakest"] == "discovery"
    assert me["not_helpful"] == 2
    assert me["rejected"] == {"objection": 2}
    assert me["objections"] == {"price": 1}
    assert v["learned"] == []  # the org's instructions are for managers and admins


def test_a_manager_sees_their_team_and_an_admin_the_company(
    client: TestClient, store: CloudStore, team: dict[str, dict[str, str]]
) -> None:
    v = client.get("/api/v1/coaching", headers=team["mona"]).json()
    assert v["scope"] == "team"
    assert names(v) == ["Mona", "Omar", "Zara"]  # themselves first, then by name
    assert "Ada Admin" not in names(v)
    assert v["objections"] == {"price": 2}
    a = client.get("/api/v1/coaching", headers=team["admin"]).json()
    assert a["scope"] == "company"
    assert set(names(a)) == {"Ada Admin", "Omar", "Zara", "Mona"}
    # An admin narrows a manager's team; the manager then sees only those agents.
    mona = uid(store, "mona@a.test")
    r = client.put(
        f"/api/v1/coaching/team/{mona}",
        json={"agents": [uid(store, "zara@a.test")]},
        headers=team["admin"],
    )
    assert r.status_code == 200, r.text
    assert names(client.get("/api/v1/coaching", headers=team["mona"]).json()) == ["Mona", "Zara"]
    assert (
        client.put(f"/api/v1/coaching/team/{mona}", json={"agents": []}, headers=team["mona"])
    ).status_code == 403
    audit = store._q("SELECT action FROM audit WHERE action = 'coaching.team'")
    assert len(audit) == 1


def test_no_ranking_by_default(client: TestClient, team: dict[str, dict[str, str]]) -> None:
    v = client.get("/api/v1/coaching", headers=team["admin"]).json()
    assert v["ranking"] is False
    others = [p["name"] for p in v["people"] if not p["me"]]
    assert others == sorted(others, key=str.lower)  # alphabetical, never by score


def test_company_b_cannot_read_company_a_coaching(
    client: TestClient, store: CloudStore, sign_up: SignUp, team: dict[str, dict[str, str]]
) -> None:
    other = sign_up(company="Beta", email="admin@b.test")["auth"]
    v = client.get("/api/v1/coaching", headers=other).json()
    assert names(v) == ["Ada Admin"]
    assert v["objections"] == {}
    assert v["people"][0]["rated"] == 0
    mona = uid(store, "mona@a.test")
    r = client.put(f"/api/v1/coaching/team/{mona}", json={"agents": []}, headers=other)
    assert r.status_code == 404  # another company's manager does not exist for Beta
    # Signals land in the sender's own company only.
    client.post(
        "/api/v1/coaching/signals",
        json={"call_id": "b-1", "objections": ["trust"], "not_helpful": []},
        headers=other,
    )
    assert client.get("/api/v1/coaching", headers=team["admin"]).json()["objections"] == {
        "price": 2
    }


def test_signals_are_validated_and_idempotent(
    client: TestClient, team: dict[str, dict[str, str]]
) -> None:
    h = team["omar"]
    bad = [
        {"objections": ["price"]},
        {"call_id": "x", "objections": ["weather"]},
        {"call_id": "x", "not_helpful": "nope"},
    ]
    for b in bad:
        assert client.post("/api/v1/coaching/signals", json=b, headers=h).status_code == 400
    again = {"call_id": "omar-1", "objections": ["price"], "not_helpful": []}
    assert client.post("/api/v1/coaching/signals", json=again, headers=h).status_code == 200
    me = client.get("/api/v1/coaching", headers=h).json()["people"][0]
    assert me["objections"] == {"price": 1}


def test_weekly_email_is_opt_in_with_a_preview(
    client: TestClient, team: dict[str, dict[str, str]], mailer: FakeMailer
) -> None:
    h = team["mona"]
    assert client.get("/api/v1/coaching/digest", headers=h).json()["weekly"] is False
    assert client.get("/api/v1/coaching/digest", headers=team["omar"]).status_code == 403
    r = client.post("/api/v1/coaching/digest/preview", headers=h)
    assert r.status_code == 200
    assert r.json()["sent"] is True
    msg = mailer.sent[-1]
    assert msg.to == "mona@a.test"
    assert "Acme coaching" in msg.subject
    assert "Omar: discovery" in msg.text
    assert "Zara: next step" in msg.text
    assert "price: 2" in msg.text
    assert "{{" not in msg.text
    r = client.put("/api/v1/coaching/digest", json={"weekly": True}, headers=h)
    assert r.json()["weekly"] is True
    assert (
        client.put("/api/v1/coaching/digest", json={"weekly": "yes"}, headers=h).status_code == 400
    )


def test_weekly_digest_job_sends_once_a_week(
    client: TestClient, store: CloudStore, seed: Seed, team: dict[str, dict[str, str]]
) -> None:
    client.put("/api/v1/coaching/digest", json={"weekly": True}, headers=team["mona"])
    mail = FakeMailer()
    coaching, learning = CoachingStore(store), LearningStore(store)

    def run(now: int | None = None) -> int:
        return asyncio.run(
            coaching_routes.weekly_digest_job(
                coaching, learning, prompts=seed.prompts, origin=ORIGIN, mailer=mail, now=now
            )
        )

    assert run() == 1
    assert run() == 0  # not again within the week
    assert [m.to for m in mail.sent] == ["mona@a.test"]
    later = store._q("SELECT last_sent_at FROM coaching_digest")[0]["last_sent_at"]
    assert run(later + 7 * 86_400_000) == 1
