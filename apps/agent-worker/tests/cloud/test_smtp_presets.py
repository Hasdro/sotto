"""SMTP presets (UX-32, D-052): the admin's domain picks Google, Microsoft 365, Hostinger or
Zoho Mail from a known-domain map or its MX records; anything else is "Other". DNS is faked:
no test leaves the machine."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.email import presets
from tests.cloud.test_email import ORG_PASS, ORG_USER, agent, set_org_smtp, signup

MX = {
    "acme-google.test": ["aspmx.l.google.com.", "alt1.aspmx.l.google.com."],
    "acme-m365.test": ["acme-m365-test.mail.protection.outlook.com."],
    "acme-hostinger.test": ["mx1.hostinger.com.", "mx2.hostinger.com."],
    "acme-zoho.test": ["mx.zoho.eu.", "mx2.zoho.eu."],
}


@pytest.fixture(autouse=True)
def fake_dns(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    asked: list[str] = []

    async def resolve(domain: str) -> list[str]:
        asked.append(domain)
        return MX.get(domain, [])

    monkeypatch.setattr(presets, "resolve_mx", resolve)
    return asked


@pytest.mark.parametrize(
    ("email", "preset", "host", "port", "found_by"),
    [
        ("ada@gmail.com", "google", "smtp.gmail.com", 465, "known"),
        ("ada@outlook.com", "microsoft", "smtp.office365.com", 587, "known"),
        ("ada@acme-google.test", "google", "smtp.gmail.com", 465, "mx"),
        ("ada@acme-m365.test", "microsoft", "smtp.office365.com", 587, "mx"),
        ("ada@acme-hostinger.test", "hostinger", "smtp.hostinger.com", 465, "mx"),
        ("ada@acme-zoho.test", "zoho", "smtp.zoho.eu", 465, "mx"),
        ("ada@unknown-mail.test", "other", "", 465, "none"),
        ("not an email", "other", "", 465, "none"),
    ],
)
async def test_preset_for(email: str, preset: str, host: str, port: int, found_by: str) -> None:
    got, how, _domain = await presets.preset_for(email)
    assert (got.id, got.host, got.port, how) == (preset, host, port, found_by)


async def test_known_domain_skips_dns(fake_dns: list[str]) -> None:
    await presets.preset_for("ada@gmail.com")
    assert fake_dns == []


def test_route_uses_the_admins_own_domain(client: TestClient) -> None:
    h = signup(client, "Acme", "admin@acme-google.test")
    r = client.get("/api/v1/company/smtp/preset", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["preset"] == {
        "id": "google",
        "label": "Google Workspace",
        "host": "smtp.gmail.com",
        "port": 465,
    }
    # Only the password is left to type: login and sender come from the admin and the company.
    assert body["username"] == "admin@acme-google.test"
    assert body["from_address"] == "admin@acme-google.test"
    assert body["from_name"] == "Acme"
    assert r.headers["cache-control"] == "no-store"


def test_route_unknown_domain_is_other_with_nothing_filled(client: TestClient) -> None:
    h = signup(client, "Acme", "admin@unknown-mail.test")
    body = client.get("/api/v1/company/smtp/preset", headers=h).json()
    assert body["preset"]["id"] == "other"
    assert body["username"] == ""


def test_route_takes_another_address(client: TestClient) -> None:
    h = signup(client, "Acme", "admin@acme-google.test")
    body = client.get(
        "/api/v1/company/smtp/preset", params={"email": "sales@acme-m365.test"}, headers=h
    ).json()
    assert body["preset"]["id"] == "microsoft"
    assert body["username"] == "sales@acme-m365.test"
    assert body["from_address"] == ""  # not the admin's domain: the admin fills the sender


def test_route_is_admin_only(client: TestClient) -> None:
    h = signup(client, "Acme", "admin@acme.test")
    assert client.get("/api/v1/company/smtp/preset", headers=agent(client, h)).status_code == 403


def test_no_api_returns_the_password(client: TestClient) -> None:
    h = signup(client, "Acme", "admin@acme-hostinger.test")
    assert set_org_smtp(client, h).status_code == 200
    for path in ("/api/v1/company/smtp", "/api/v1/company/smtp/preset", "/api/v1/email/senders"):
        text = client.get(path, headers=h).text
        assert ORG_PASS not in text, path
        assert ORG_USER not in text, path
