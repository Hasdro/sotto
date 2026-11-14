"""Invite the team from Zoho (ZC-13): the admin's own connection reads the org's active users,
the preview lists the ones in sales roles (role agent by default), nothing is created until the
admin confirms, seats are respected, every invite is audited, and company A cannot invite into
company B. Zoho is an httpx.MockTransport."""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from sotto_worker.cloud.zoho.lookup import team_candidates
from tests.cloud.conftest import ORIGIN
from tests.cloud.test_zoho import FakeZoho, connect, set_org_client, signup


def user(i: int, role: str, profile: str = "Standard", **extra: Any) -> dict[str, Any]:
    return {
        "id": f"41508680000001{i:05d}",
        "email": f"person{i}@acme.test",
        "full_name": f"Person {i}",
        "role": {"name": role, "id": f"r{i}"},
        "profile": {"name": profile, "id": f"p{i}"},
        "status": "active",
        "confirm": True,
        **extra,
    }


class FakeZohoUsers(FakeZoho):
    def __init__(self) -> None:
        super().__init__()
        self.users = [
            user(1, "Sales Rep"),
            user(2, "Sales Executive"),
            user(3, "CEO", "Administrator"),
            user(4, "Support"),
        ]
        self.user_reads: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = request.url
        if url.host == "www.zohoapis.com" and url.path == "/crm/v8/users":
            self.user_reads.append(url.params["type"])
            return httpx.Response(200, json={"users": self.users, "info": {"more_records": False}})
        return super().handler(request)


@pytest.fixture
def zu() -> FakeZohoUsers:
    return FakeZohoUsers()


@pytest.fixture
def zc(store: CloudStore, seed: Seed, zu: FakeZohoUsers) -> TestClient:
    config = CloudConfig(
        public_origin=ORIGIN, static_dir=None, zoho_transport=httpx.MockTransport(zu.handler)
    )
    return TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)


@pytest.fixture
def admin(zc: TestClient) -> dict[str, str]:
    a = signup(zc, "Acme", "admin@acme.test")
    set_org_client(zc, a)
    r, _ = connect(zc, a)
    assert r.status_code == 200
    return a


def users_in(store: CloudStore, company_name: str) -> list[str]:
    rows = store._q(
        "SELECT u.email FROM users u JOIN companies c ON c.id = u.company_id WHERE c.name = ?",
        (company_name,),
    )
    return sorted(r["email"] for r in rows)


def test_sales_roles_only_with_a_fallback() -> None:
    people, fallback = team_candidates([user(1, "Sales Rep"), user(2, "Manager")])
    assert ([p["email"] for p in people], fallback) == (["person1@acme.test"], False)
    people, fallback = team_candidates([user(1, "CEO", "Administrator"), user(2, "Manager")])
    assert ([p["email"] for p in people], fallback) == (["person2@acme.test"], True)
    inactive = user(5, "Sales Rep", status="inactive")
    assert team_candidates([inactive]) == ([], True)


def test_preview_lists_sales_people_and_creates_nothing(
    zc: TestClient, admin: dict[str, str], store: CloudStore, zu: FakeZohoUsers
) -> None:
    before = users_in(store, "Acme")
    r = zc.get("/api/v1/zoho/team", headers=admin)
    assert r.status_code == 200, r.text
    body = r.json()
    assert [p["email"] for p in body["people"]] == ["person1@acme.test", "person2@acme.test"]
    assert {p["role"] for p in body["people"]} == {"agent"}
    assert body["seats_left"] == 2  # trial: 3 seats, the admin uses one
    assert body["fallback"] is False
    assert zu.user_reads == ["ActiveConfirmedUsers"]
    assert users_in(store, "Acme") == before
    # Without confirm nothing is created either.
    r = zc.post(
        "/api/v1/zoho/team/invite",
        json={"invites": [{"zoho_id": body["people"][0]["zoho_id"]}]},
        headers=admin,
    )
    assert r.json()["code"] == "confirm"
    assert users_in(store, "Acme") == before


def test_confirmed_invite_respects_seats_and_audits(
    zc: TestClient, admin: dict[str, str], store: CloudStore, zu: FakeZohoUsers
) -> None:
    zu.users.append(user(6, "Sales Rep"))
    people = zc.get("/api/v1/zoho/team", headers=admin).json()["people"]
    assert len(people) == 3
    every = [{"zoho_id": p["zoho_id"], "role": "agent"} for p in people]
    r = zc.post("/api/v1/zoho/team/invite", json={"invites": every, "confirm": True}, headers=admin)
    assert r.status_code == 409
    assert r.json()["code"] == "no_seats"
    assert users_in(store, "Acme") == ["admin@acme.test"]  # all or nothing

    two = [every[0], {**every[1], "role": "manager"}]
    r = zc.post("/api/v1/zoho/team/invite", json={"invites": two, "confirm": True}, headers=admin)
    assert r.status_code == 200, r.text
    invited = r.json()["invited"]
    assert [(i["email"], i["role"]) for i in invited] == [
        ("person1@acme.test", "agent"),
        ("person2@acme.test", "manager"),
    ]
    assert all(i["temporary_password"] for i in invited)
    assert users_in(store, "Acme") == ["admin@acme.test", "person1@acme.test", "person2@acme.test"]
    audit = [
        r["detail"] for r in store._q("SELECT detail FROM audit WHERE action = 'user.invited'")
    ]
    assert audit == ["person1@acme.test as agent", "person2@acme.test as manager"]
    assert store._q("SELECT 1 FROM audit WHERE action = 'zoho.team.invited'")
    # Already on the team: shown as members, not invited twice.
    again = zc.get("/api/v1/zoho/team", headers=admin).json()["people"]
    assert [p["member"] for p in again] == [True, True, False]


def test_admin_role_and_unknown_ids_are_refused(zc: TestClient, admin: dict[str, str]) -> None:
    pid = zc.get("/api/v1/zoho/team", headers=admin).json()["people"][0]["zoho_id"]
    r = zc.post(
        "/api/v1/zoho/team/invite",
        json={"invites": [{"zoho_id": pid, "role": "admin"}], "confirm": True},
        headers=admin,
    )
    assert r.status_code == 400
    r = zc.post(
        "/api/v1/zoho/team/invite",
        json={"invites": [{"zoho_id": "41508680000009999"}], "confirm": True},
        headers=admin,
    )
    assert r.status_code == 400  # not a Zoho user of this org: never from the browser's word


def test_company_a_cannot_invite_into_company_b(
    zc: TestClient, admin: dict[str, str], store: CloudStore
) -> None:
    pid = zc.get("/api/v1/zoho/team", headers=admin).json()["people"][0]["zoho_id"]
    b = signup(zc, "Beta", "admin@beta.test")
    assert zc.get("/api/v1/zoho/team", headers=b).status_code == 403  # B has no Zoho connection
    r = zc.post(
        "/api/v1/zoho/team/invite",
        json={"invites": [{"zoho_id": pid}], "confirm": True},
        headers=b,
    )
    assert r.status_code == 403
    # A's invite lands in A only.
    zc.post(
        "/api/v1/zoho/team/invite",
        json={"invites": [{"zoho_id": pid}], "confirm": True},
        headers=admin,
    )
    assert users_in(store, "Beta") == ["admin@beta.test"]
    assert "person1@acme.test" in users_in(store, "Acme")
