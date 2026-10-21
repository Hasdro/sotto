"""Company knowledge for the AI (owner, 22 Oct 2026): admins write it, it reaches the bundle of
their own company only, and it is size-capped."""

from __future__ import annotations

from starlette.testclient import TestClient

from tests.cloud.conftest import SignUp


def test_admin_sets_company_knowledge_and_it_reaches_only_their_bundle(
    client: TestClient, sign_up: SignUp
) -> None:
    a, b = sign_up("Alpha", "admin@a.test"), sign_up("Beta", "admin@b.test")
    text = "  We sell solar panels in Dubai. Installation takes 5 days.  "
    r = client.put("/api/v1/company/settings", json={"context": text}, headers=a["auth"])
    assert r.status_code == 200
    assert client.get("/api/v1/bundle", headers=a["auth"]).json()["company"]["context"] == (
        text.strip()
    )
    assert client.get("/api/v1/bundle", headers=b["auth"]).json()["company"]["context"] == ""


def test_company_knowledge_is_capped_and_must_be_text(client: TestClient, sign_up: SignUp) -> None:
    h = sign_up("Alpha", "admin@a.test")["auth"]
    too_long = client.put("/api/v1/company/settings", json={"context": "x" * 8001}, headers=h)
    assert too_long.status_code == 413
    assert client.put("/api/v1/company/settings", json={"context": 5}, headers=h).status_code == 400
