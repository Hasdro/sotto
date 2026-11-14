"""INT-02t: the next-step Task, agent-confirmed, one per call, audited."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudError, CloudStore
from sotto_worker.cloud.zoho import actions
from tests.cloud.test_zoho_actions import CONTACT_ID, DEAL_ID
from tests.cloud.test_zoho_scopes import (
    ME_ID,
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


DUE = (date.today() + timedelta(days=3)).isoformat()


def task(c4: TestClient, a4: dict[str, str], **fields: Any) -> Any:
    body = {
        "call_id": "call-abc",
        "subject": "Send the proposal",
        "due_date": DUE,
        "owner_id": ME_ID,
        "deal_id": DEAL_ID,
        "contact_id": CONTACT_ID,
        **fields,
    }
    return c4.post(
        "/api/v1/zoho/actions/task",
        json={"approved": True, "fields": {k: v for k, v in body.items() if v is not None}},
        headers=a4,
    )


@pytest.mark.parametrize("missing", ["due_date", "owner_id", "subject"])
def test_due_date_and_owner_are_required(missing: str) -> None:
    raw = {"call_id": "c1", "subject": "s", "due_date": DUE, "owner_id": ME_ID}
    raw.pop(missing)
    with pytest.raises(CloudError):
        actions.plan("task", raw)


def test_past_or_bad_dates_and_extra_fields_are_refused() -> None:
    base = {"call_id": "c1", "subject": "s", "owner_id": ME_ID}
    for bad in ("2020-01-01", "tomorrow", "2026-02-30"):
        with pytest.raises(CloudError):
            actions.plan("task", {**base, "due_date": bad})
    with pytest.raises(CloudError):
        actions.plan("task", {**base, "due_date": DUE, "Stage": "Closed Won"})
    with pytest.raises(CloudError):
        actions.plan("task", {**base, "due_date": DUE, "owner_id": "me"})


def test_one_task_per_call_on_retry_with_audit(
    c4: TestClient, a4: dict[str, str], z4: FakeZohoW4, store: CloudStore
) -> None:
    r = task(c4, a4)
    assert r.status_code == 200, r.text
    again = task(c4, a4)
    assert again.status_code == 200
    assert again.json()["id"] == r.json()["id"]
    sent = [w for w in z4.writes if w[1] == "Tasks"]
    assert len(sent) == 1
    record = sent[0][2]["data"][0]
    assert record["Subject"] == "Send the proposal"
    assert record["Due_Date"] == DUE
    assert record["Owner"] == {"id": ME_ID}
    assert record["What_Id"] == {"id": DEAL_ID}
    assert record["$se_module"] == "Deals"
    assert record["Who_Id"] == {"id": CONTACT_ID}
    audit = [r["action"] for r in store._q("SELECT action FROM audit")]
    assert "zoho.write.task" in " ".join(audit)


def test_task_needs_the_tasks_scope(
    c4: TestClient, a4: dict[str, str], z4: FakeZohoW4, store: CloudStore
) -> None:
    old_scopes(store)
    r = task(c4, a4)
    assert r.status_code == 409
    assert r.json()["code"] == "zoho_reconnect"
    assert not [w for w in z4.writes if w[1] == "Tasks"]
