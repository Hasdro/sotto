"""SMTP presets (UX-32, D-052): the admin's domain picks Google, Microsoft 365, Hostinger or
Zoho Mail from a known-domain map or its MX records; anything else is "Other". DNS is faked:
no test leaves the machine."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.email import presets
from sotto_worker.cloud.store import CloudStore
from tests.cloud.test_email import ORG_PASS, ORG_USER, owner_login, set_org_smtp, signup

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


def test_no_api_returns_the_password(client: TestClient, store: CloudStore) -> None:
    """D-078 removed the client preset route with the client SMTP form; the preset logic stays
    (tested above) for the owner console. The remaining read routes never return the secret."""
    h = signup(client, "Acme", "admin@acme-hostinger.test")
    owner_login(client, store)
    assert set_org_smtp(client, h).status_code == 200
    for path in ("/api/v1/company/smtp", "/api/v1/email/senders"):
        text = client.get(path, headers=h).text
        assert ORG_PASS not in text, path
        assert ORG_USER not in text, path
