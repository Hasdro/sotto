"""INT-12 (D-072): the weekly CSV for Zoho Analytics. Documented columns, no call words, only
the caller's company, admins only; the weekly job keeps the file for the scheduler (T-081)."""

from __future__ import annotations

import csv
import io
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.export.routes import weekly_export_job
from sotto_worker.cloud.export.weekly import COLUMNS, week_range
from sotto_worker.cloud.store import CloudError, CloudStore
from tests.cloud.test_coaching import member
from tests.cloud.test_reports import REVIEW, report

CALL_WORDS = "the customer said our price is too high and asked about volume"


def last_week_ms() -> int:
    _label, start, _ = week_range(None)
    return start + 2 * 86_400_000


def call(client: TestClient, store: CloudStore, h: dict[str, str], call_id: str) -> None:
    report(client, h, call_id)
    store._db.execute(
        "UPDATE usage SET started_at = ? WHERE id LIKE ?", (last_week_ms(), f"%:{call_id}")
    )
    r = client.post(f"/api/v1/calls/{call_id}/review", json=REVIEW, headers=h)
    assert r.is_success, r.text
    r = client.post(
        "/api/v1/coaching/signals",
        json={
            "call_id": call_id,
            "objections": ["price", "timing"],
            "not_helpful": [],
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    r = client.put(
        f"/api/v1/calls/{call_id}/brief",
        json={
            "brief": {
                "need": CALL_WORDS,
                "crm": {
                    "text": CALL_WORDS,
                    "meeting_id": "4150868000000300001",
                    "deal_id": "4150868000000400001",
                    "person": {"module": "Contacts", "id": "4150868000000224005"},
                },
            }
        },
        headers=h,
    )
    assert r.status_code == 200, r.text


@pytest.fixture
def two(client: TestClient, store: CloudStore, sign_up: Any) -> dict[str, dict[str, str]]:
    a = sign_up(company="Acme", email="admin@a.test")["auth"]
    b = sign_up(company="Beta", email="admin@b.test")["auth"]
    store._db.execute("UPDATE companies SET seats = 10")
    call(client, store, a, "acme-1")
    call(client, store, b, "beta-1")
    return {"a": a, "b": b, "agent": member(client, store, a, "omar@a.test", "Omar", "agent")}


def rows(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text)))


def test_columns_and_no_call_words(client: TestClient, two: dict[str, dict[str, str]]) -> None:
    label = week_range(None)[0]
    r = client.get(f"/api/v1/export/weekly.csv?week={label}", headers=two["a"])
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv")
    assert f"agn-calls-{label}.csv" in r.headers["content-disposition"]
    assert r.text.splitlines()[0] == ",".join(COLUMNS)
    got = rows(r.text)
    assert [g["call_id"] for g in got] == ["acme-1"]
    row = got[0]
    assert row["iso_week"] == label
    assert row["agent_email"] == "admin@a.test"
    assert row["call_score"].isdigit()
    assert row["sentiment"] in ("positive", "neutral", "negative")
    assert row["objection_categories"] == "price;timing"
    assert row["zoho_person_module"] == "Contacts"
    assert row["zoho_person_id"] == "4150868000000224005"
    assert row["zoho_deal_id"] == "4150868000000400001"
    assert row["zoho_meeting_id"] == "4150868000000300001"
    for word in ("customer", "price is too high", "volume"):
        assert word not in r.text


def test_only_the_callers_company(client: TestClient, two: dict[str, dict[str, str]]) -> None:
    label = week_range(None)[0]
    a = client.get(f"/api/v1/export/weekly.csv?week={label}", headers=two["a"]).text
    b = client.get(f"/api/v1/export/weekly.csv?week={label}", headers=two["b"]).text
    assert "beta-1" not in a
    assert "admin@b.test" not in a
    assert "acme-1" not in b
    assert "admin@a.test" not in b


def test_admins_only_and_bad_weeks(client: TestClient, two: dict[str, dict[str, str]]) -> None:
    assert client.get("/api/v1/export/weekly.csv", headers=two["agent"]).status_code == 403
    assert client.get("/api/v1/export/weekly.csv").status_code == 401
    for bad in ("2026-46", "2026-W99", "x"):
        r = client.get(f"/api/v1/export/weekly.csv?week={bad}", headers=two["a"])
        assert r.status_code == 400, bad


def test_week_range_is_the_last_full_iso_week() -> None:
    label, start, end = week_range(None, datetime(2026, 11, 14, 12, tzinfo=UTC))  # Saturday
    assert label == "2026-W45"
    assert datetime.fromtimestamp(start / 1000, UTC) == datetime(2026, 11, 2, tzinfo=UTC)
    assert end - start == 7 * 86_400_000
    with pytest.raises(CloudError):
        week_range("2026-W54")


def test_weekly_job_keeps_one_file_per_company_and_week(
    client: TestClient, store: CloudStore, two: dict[str, dict[str, str]]
) -> None:
    assert weekly_export_job(store) == 2
    assert weekly_export_job(store) == 0  # safe to call again
    kept = store._q("SELECT company_id, week, rows FROM export_weeks ORDER BY company_id")
    assert len(kept) == 2
    assert all(k["rows"] == 1 for k in kept)
    label = week_range(None)[0]
    r = client.get(f"/api/v1/export/weekly.csv?week={label}", headers=two["a"])
    assert "beta-1" not in r.text
    assert "acme-1" in r.text
    later = datetime.now(UTC) + timedelta(days=7)
    assert weekly_export_job(store, now=later) == 0  # no calls that week
