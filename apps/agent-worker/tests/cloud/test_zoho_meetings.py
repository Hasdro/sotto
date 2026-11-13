"""Upcoming meetings as the main way to get call context (owner request, 14 Nov 2026): only the
connected Zoho user's own meetings, soonest first, paged; a view-only detail; picking one builds
the brief from its Contact/Lead, Deal and Account."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from sotto_worker.cloud.zoho import lookup
from tests.cloud.conftest import ORIGIN
from tests.cloud.test_zoho import FakeZoho, connect, set_org_client, signup

NOW = datetime.now(UTC).replace(microsecond=0)
ME = "4150868000000100001"
SOMEONE_ELSE = "4150868000000100002"
CONTACT_ID = "4150868000000224005"
DEAL_ID = "4150868000000400001"
ACCOUNT_ID = "4150868000000224001"


def event(i: int, start: datetime, owner: str = ME, **extra: Any) -> dict[str, Any]:
    return {
        "id": f"41508680000003{i:05d}",
        "Event_Title": f"Meeting {i}",
        "Start_DateTime": start.isoformat(),
        "End_DateTime": (start + timedelta(minutes=30)).isoformat(),
        "Owner": {"id": owner, "name": "Ada" if owner == ME else "Bob"},
        **extra,
    }


class FakeZohoMeetings(FakeZoho):
    def __init__(self) -> None:
        super().__init__()
        self.events: list[dict[str, Any]] = []
        self.criteria: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = request.url
        path = url.path.removeprefix("/crm/v8/")
        if url.host != "www.zohoapis.com":
            return super().handler(request)
        if path == "users":
            self.requests.append(request)
            assert url.params["type"] == "CurrentUser"
            return httpx.Response(200, json={"users": [{"id": ME, "email": "ada@acme.test"}]})
        if path == "Events/search":
            self.requests.append(request)
            self.criteria.append(url.params["criteria"])
            page, per = int(url.params["page"]), int(url.params["per_page"])
            chunk = self.events[(page - 1) * per : page * per]
            more = page * per < len(self.events)
            return httpx.Response(200, json={"data": chunk, "info": {"more_records": more}})
        if path.startswith("Events/"):
            self.requests.append(request)
            found = [e for e in self.events if e["id"] == path.split("/")[1]]
            return httpx.Response(200, json={"data": found}) if found else httpx.Response(204)
        if path == f"Deals/{DEAL_ID}":
            self.requests.append(request)
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "Deal_Name": "Acme renewal",
                            "Stage": "Proposal",
                            "Amount": 9000,
                            "Currency": "AED",
                            "Closing_Date": "2026-12-20",
                            "Account_Name": {"name": "Acme Corp", "id": ACCOUNT_ID},
                        }
                    ]
                },
            )
        return super().handler(request)


@pytest.fixture
def zm() -> FakeZohoMeetings:
    return FakeZohoMeetings()


@pytest.fixture
def zc(store: CloudStore, seed: Seed, zm: FakeZohoMeetings) -> TestClient:
    config = CloudConfig(
        public_origin=ORIGIN, static_dir=None, zoho_transport=httpx.MockTransport(zm.handler)
    )
    return TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)


@pytest.fixture
def auth(zc: TestClient) -> dict[str, str]:
    a = signup(zc, "Acme", "admin@acme.test")
    set_org_client(zc, a)
    r, _ = connect(zc, a)
    assert r.status_code == 200
    return a


def test_only_my_upcoming_meetings_soonest_first(
    zc: TestClient, auth: dict[str, str], zm: FakeZohoMeetings
) -> None:
    zm.events = [
        event(1, NOW + timedelta(days=3)),
        event(2, NOW + timedelta(hours=2), owner=SOMEONE_ELSE),  # another user's: never shown
        event(3, NOW + timedelta(hours=1)),
        event(4, NOW - timedelta(hours=2)),  # already over
        event(5, NOW - timedelta(minutes=10)),  # in progress: still shown
    ]
    r = zc.get("/api/v1/zoho/meetings", headers=auth)
    assert r.status_code == 200, r.text
    body = r.json()
    assert [m["title"] for m in body["meetings"]] == ["Meeting 5", "Meeting 3", "Meeting 1"]
    assert body["more"] is False
    assert f"Owner:equals:{ME}" in zm.criteria[0]
    assert all("Bob" not in str(m) for m in body["meetings"])


def test_meetings_are_paged(zc: TestClient, auth: dict[str, str], zm: FakeZohoMeetings) -> None:
    zm.events = [event(i, NOW + timedelta(hours=i + 1)) for i in range(250)]  # two Zoho pages
    first = zc.get("/api/v1/zoho/meetings", headers=auth).json()
    assert len(first["meetings"]) == lookup.UPCOMING_PAGE
    assert first["more"] is True
    assert first["meetings"][0]["title"] == "Meeting 0"
    second = zc.get("/api/v1/zoho/meetings?page=2", headers=auth).json()
    assert second["meetings"][0]["title"] == f"Meeting {lookup.UPCOMING_PAGE}"


def test_detail_is_view_only_and_never_shows_someone_elses_meeting(
    zc: TestClient, auth: dict[str, str], zm: FakeZohoMeetings
) -> None:
    mine = event(
        1,
        NOW + timedelta(hours=1),
        Description="Pricing review https://meet.zoho.com/abc-123",
        Venue="Room 4",
        What_Id={"id": DEAL_ID, "name": "Acme renewal"},
        **{"$se_module": "Deals"},
        Participants=[{"name": "Jane Doe", "Email": "jane@acme.test", "type": "contact"}],
    )
    theirs = event(2, NOW + timedelta(hours=2), owner=SOMEONE_ELSE)
    zm.events = [mine, theirs]
    r = zc.get(f"/api/v1/zoho/meetings/{mine['id']}/detail", headers=auth)
    assert r.status_code == 200, r.text
    d = r.json()["meeting"]
    assert d["related"] == {"module": "Deals", "id": DEAL_ID, "name": "Acme renewal"}
    assert d["link"] == "https://meet.zoho.com/abc-123"
    assert d["venue"] == "Room 4"
    assert d["participants"] == [{"name": "Jane Doe", "email": "jane@acme.test", "type": "contact"}]
    assert zc.get(f"/api/v1/zoho/meetings/{theirs['id']}/detail", headers=auth).status_code == 404
    assert zc.get(f"/api/v1/zoho/meetings/{theirs['id']}", headers=auth).status_code == 404
    writes = [q for q in zm.requests if q.method != "GET" and q.url.host == "www.zohoapis.com"]
    assert writes == []  # view only


def test_picking_a_meeting_brings_its_contact_deal_and_account(
    zc: TestClient, auth: dict[str, str], zm: FakeZohoMeetings
) -> None:
    zm.events = [
        event(
            1,
            NOW + timedelta(hours=1),
            Who_Id={"id": CONTACT_ID, "name": "Jane Doe"},
            What_Id={"id": DEAL_ID, "name": "Acme renewal"},
            **{"$se_module": "Deals"},
        )
    ]
    r = zc.get(f"/api/v1/zoho/meetings/{zm.events[0]['id']}", headers=auth)
    assert r.status_code == 200, r.text
    brief = r.json()["brief"]
    assert brief["person"]["name"] == "Jane Doe"
    assert brief["deals"][0] == {
        "id": DEAL_ID,
        "name": "Acme renewal",
        "stage": "Proposal",
        "amount": "9000",
        "currency": "AED",
        "close_date": "2026-12-20",
        "owner": "",
    }
    assert brief["account"]["name"] == "Acme Corp"
    assert len(brief["notes"]) == 5
    assert brief["text"].startswith("Meeting: Meeting 1")
    assert "Related deal: Acme renewal" in brief["text"]


def test_a_meeting_with_only_a_lead_participant_briefs_the_lead(
    zc: TestClient, auth: dict[str, str], zm: FakeZohoMeetings
) -> None:
    zm.events = [
        event(
            1,
            NOW + timedelta(hours=1),
            Participants=[{"name": "Lee", "type": "lead", "participant": "4150868000000500001"}],
        )
    ]
    r = zc.get(f"/api/v1/zoho/meetings/{zm.events[0]['id']}", headers=auth)
    assert r.status_code == 200
    # FakeZoho has no such lead: the brief keeps the meeting without a person.
    assert r.json()["brief"]["meeting"]["participants"] == ["Lee"]


def test_without_the_users_scope_the_list_asks_to_reconnect(
    zc: TestClient, auth: dict[str, str], store: CloudStore, zm: FakeZohoMeetings
) -> None:
    store._db.execute(
        "UPDATE zoho_connections SET scopes = replace(scopes, ',ZohoCRM.users.READ', '')"
    )
    zm.events = [event(1, NOW + timedelta(hours=1), owner=SOMEONE_ELSE)]
    r = zc.get("/api/v1/zoho/meetings", headers=auth)
    assert r.status_code == 409
    assert r.json()["code"] == "zoho_reconnect"
    assert zm.criteria == []  # nothing listed without knowing who "me" is
    assert zc.get("/api/v1/zoho/status", headers=auth).json()["needs_reconnect"] is True


def test_company_isolation(zc: TestClient, auth: dict[str, str], zm: FakeZohoMeetings) -> None:
    zm.events = [event(1, NOW + timedelta(hours=1))]
    b = signup(zc, "Beta", "admin@beta.test")
    for path in ("/api/v1/zoho/meetings", f"/api/v1/zoho/meetings/{zm.events[0]['id']}/detail"):
        r = zc.get(path, headers=b)
        assert r.status_code == 403, path  # B has no Zoho connection of its own
