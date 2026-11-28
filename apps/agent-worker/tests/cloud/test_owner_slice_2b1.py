"""Slice 2B Commit 1 (F-08, F-09/D-01, F-10): audit log search/filter/pagination/noise-hide,
human feature registry + per-company entitlements picker, and bug-report status/body polish."""

from __future__ import annotations

from starlette.testclient import TestClient

from sotto_worker.cloud import bugreports
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import ORIGIN, SignUp

SAME = {"origin": ORIGIN}


def test_owner_audit_search_filters_pagination_and_hide_noise(
    owner: TestClient, client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    s = sign_up("Noise Co", "admin@noise.test")
    cid = s["company"]["id"]
    with store._tx() as db:
        store.audit(db, "keys.delivered", "GROQ_API_KEY", company_id=cid)
        store.audit(db, "zoho.read", "meetings", company_id=cid)
        store.audit(db, "settings", '{"card_language":"en"}', company_id=cid)

    full = owner.get("/api/owner/audit?limit=50&offset=0").json()
    assert full["total"] >= 3
    assert any(a["action"] == "keys.delivered" for a in full["items"])

    clean = owner.get("/api/owner/audit?hide_noise=1&limit=50&offset=0").json()
    assert not any(a["action"] in ("keys.delivered", "zoho.read") for a in clean["items"])
    assert any(a["action"] == "settings" for a in clean["items"])

    by_action = owner.get("/api/owner/audit?action=settings").json()
    assert all(a["action"].startswith("settings") for a in by_action["items"])

    paged = owner.get("/api/owner/audit?limit=1&offset=0").json()
    assert len(paged["items"]) == 1
    assert paged["has_more"] is True


def test_bug_report_issue_body_does_not_duplicate_reported_from() -> None:
    body = bugreports.issue_body(
        {
            "title": "Broken",
            "description": "Button fails",
            "page_url": "https://app.test/home",
            "user_email": "a@b.test",
            "company_name": "Acme",
        }
    )
    assert "Reported from:" not in body
    assert "Reported by a@b.test (Acme)" in body
