"""Slice 2A Commit 3 (F-04, F-14 / R-05): optional spend cap on company creation,
at-cap behaviour metadata, and shared in-app ConfirmDialog replacing native dialogs."""

from __future__ import annotations

from starlette.testclient import TestClient

from tests.cloud.conftest import ORIGIN

SAME = {"origin": ORIGIN}


def test_company_create_with_optional_spend_cap_and_policy_copy(owner: TestClient) -> None:
    r = owner.post(
        "/api/owner/companies",
        json={
            "name": "Capped Co",
            "admin_name": "Admin",
            "admin_email": "admin@capped.test",
            "plan": "trial",
            "monthly_spend_cap_usd": 75,
        },
        headers=SAME,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["monthly_spend_cap_usd"] == 75.0

    spend = owner.get("/api/owner/spend").json()
    assert "80%" in spend["at_cap_behaviour"]
    assert "100%" in spend["at_cap_behaviour"]
    row = next(c for c in spend["companies"] if c["id"] == body["id"])
    assert row["cap_usd"] == 75.0
    assert row["status"] == "ok"

    # Invalid cap rejected cleanly.
    bad = owner.post(
        "/api/owner/companies",
        json={
            "name": "Bad Cap",
            "admin_name": "Admin",
            "admin_email": "bad@capped.test",
            "plan": "trial",
            "monthly_spend_cap_usd": -10,
        },
        headers=SAME,
    )
    assert bad.status_code == 400


def test_owner_console_uses_in_app_confirm_dialog_without_native_prompt_or_confirm(
    owner: TestClient,
) -> None:
    for html_path in ("/owner", "/owner/company.html"):
        html = owner.get(html_path).text
        assert 'id="confirmDialog"' in html
        assert 'id="confirmCancel"' in html
        assert 'id="confirmOk"' in html

    for js_path in ("/owner/owner.js", "/owner/platform.js", "/owner/company.js"):
        src = owner.get(js_path).text
        assert "window.prompt" not in src, js_path
        assert "prompt(" not in src, js_path
        assert "window.confirm" not in src, js_path
        assert "!confirm(" not in src, js_path
        assert "confirmAction(" in src, js_path
