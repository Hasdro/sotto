"""INT-16c: the campaign that brought the person, read from Zoho Campaigns, in the brief."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from sotto_worker.cloud.zoho import lookup
from tests.cloud.test_zoho_actions import CONTACT_ID
from tests.cloud.test_zoho_scopes import (
    CAMPAIGN_ID,
    FakeZohoW4,
    connected_admin,
    make_client,
    old_scopes,
)


@pytest.fixture
def z4() -> FakeZohoW4:
    return FakeZohoW4()


@pytest.fixture
def c4(store: CloudStore, seed: Seed, z4: FakeZohoW4) -> TestClient:
    return make_client(store, seed, z4)


@pytest.fixture
def a4(c4: TestClient) -> dict[str, str]:
    return connected_admin(c4)


def with_campaign(z4: FakeZohoW4) -> None:
    z4.contacts[0]["Campaign_Source"] = {"name": "Expo", "id": CAMPAIGN_ID}
    z4.contacts[0]["Lead_Source"] = "Trade Show"


def test_brief_has_campaign_name_type_and_status(
    c4: TestClient, a4: dict[str, str], z4: FakeZohoW4
) -> None:
    with_campaign(z4)
    b = c4.get(f"/api/v1/zoho/records/Contacts/{CONTACT_ID}", headers=a4).json()["brief"]
    assert b["person"]["campaign_info"] == {
        "name": "Dubai Expo 2026",
        "type": "Trade Show",
        "status": "Active",
    }
    assert "Campaign: Dubai Expo 2026 (Trade Show, Active)" in b["text"]
    assert "campaign Expo" not in b["text"]  # one campaign line, not two
    assert len(b["text"]) <= lookup.BRIEF_CHARS


def test_old_scopes_keep_the_lookup_name_and_do_not_read_campaigns(
    c4: TestClient, a4: dict[str, str], z4: FakeZohoW4, store: CloudStore
) -> None:
    with_campaign(z4)
    old_scopes(store)
    b = c4.get(f"/api/v1/zoho/records/Contacts/{CONTACT_ID}", headers=a4).json()["brief"]
    assert "campaign_info" not in b["person"]
    assert "campaign Expo" in b["text"]
    assert not [q for q in z4.requests if "Campaigns" in q.url.path]


def test_campaign_line_uses_the_seed_label() -> None:
    assert lookup.campaign_line({"name": "Q4", "type": "", "status": ""}) == "Campaign: Q4"
    assert lookup.campaign_line({"name": "Q4", "type": "Email", "status": ""}) == (
        "Campaign: Q4 (Email)"
    )
