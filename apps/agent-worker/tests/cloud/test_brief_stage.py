"""INT-03 and INT-16 (draft D-048 (backlog)): the brief carries a stage guidance line from seed
data and where
the lead came from, inside the unchanged 1200-character budget."""

from __future__ import annotations

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

CONTACT = "4150868000000224005"


def brief(stage: str, **person: str) -> dict[str, Any]:
    return {
        "person": {"module": "Contacts", "name": "Jane Doe", "title": "CFO", **person},
        "account": {"name": "Acme Corp", "industry": ""},
        "deals": [{"name": "Renewal", "stage": stage, "amount": "", "close_date": ""}],
        "notes": [{"date": "2026-11-01", "title": "", "text": "x" * 270}] * 5,
    }


@pytest.mark.parametrize(
    ("stage", "words"),
    [
        ("Qualification", "budget"),
        ("Needs Analysis", "problem"),
        ("Proposal/Price Quote", "proposal"),
        ("Negotiation/Review", "concession"),
        ("Closed Won", "onboarding"),
        ("Closed-Lost to Competition", "learn why"),
    ],
)
def test_known_stage_adds_one_guidance_line(stage: str, words: str) -> None:
    text = lookup.brief_text(brief(stage))
    lines = [ln for ln in text.splitlines() if ln.startswith("Stage guidance")]
    assert len(lines) == 1
    assert f"stage as of prep: {stage}" in lines[0]
    assert words in lines[0]
    assert len(text) <= lookup.BRIEF_CHARS  # notes give way, the budget holds


def test_unknown_stage_adds_nothing() -> None:
    assert "Stage guidance" not in lookup.brief_text(brief("Our custom stage"))
    assert "Stage guidance" not in lookup.brief_text(brief(""))
    assert lookup.stage_guidance("Pending") is None


def test_every_guidance_line_is_short() -> None:
    _, table = lookup._stage_seed()
    assert {"qualification", "needs analysis", "proposal", "negotiation", "closed won"} <= set(
        table
    )
    for stage in table:
        line = lookup.stage_guidance(stage.title()) or ""
        assert len(line) / 4 <= 150  # ~4 characters per token: well under 150 tokens


def test_lead_source_and_campaign_go_into_the_brief() -> None:
    text = lookup.brief_text(brief("Qualification", source="Trade show", campaign="Dubai expo"))
    assert "Came from: source Trade show, campaign Dubai expo" in text
    assert "Came from" not in lookup.brief_text(brief("Qualification"))


class SourcedZoho(FakeZoho):
    def __init__(self) -> None:
        super().__init__()
        self.contacts[0]["Lead_Source"] = "Trade show"
        self.contacts[0]["Campaign_Source"] = {"name": "Dubai expo", "id": "4150868000000600001"}


def test_record_route_renders_stage_guidance_and_source(store: CloudStore, seed: Seed) -> None:
    zoho = SourcedZoho()
    config = CloudConfig(
        public_origin=ORIGIN, static_dir=None, zoho_transport=httpx.MockTransport(zoho.handler)
    )
    zc = TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)
    auth = signup(zc, "Acme", "admin@acme.test")
    set_org_client(zc, auth)
    r, _ = connect(zc, auth)
    assert r.status_code == 200
    r = zc.get(f"/api/v1/zoho/records/Contacts/{CONTACT}", headers=auth)
    assert r.status_code == 200, r.text
    out = r.json()["brief"]
    assert out["person"]["source"] == "Trade show"
    assert out["person"]["campaign"] == "Dubai expo"
    assert "Stage guidance (stage as of prep: Negotiation)" in out["text"]
    assert "Came from: source Trade show, campaign Dubai expo" in out["text"]
    assert len(out["text"]) <= lookup.BRIEF_CHARS
    asked = [q for q in zoho.requests if q.url.path.endswith(f"Contacts/{CONTACT}")]
    assert "Lead_Source" in asked[0].url.params["fields"]


def test_seed_prompt_still_loads_and_has_no_new_variables(seed: Seed) -> None:
    p = seed.prompts["crm_brief"]
    assert p["variables"] == ["crm.brief"]
    assert "stage_guidance" not in p["body"]
