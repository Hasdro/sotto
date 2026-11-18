"""Org email (D-032, D-039, R12): write-only SMTP per org with a platform fallback, the test
email, formats with static blocks, preview == sent, explicit confirm, audit and idempotency.

Mail goes to a local fake SMTP server (tests/cloud/fake_smtp.py): the adapter's real smtplib
code runs, only TLS is off. No real mailbox or credentials are used anywhere."""

from __future__ import annotations

import dataclasses
from collections.abc import Iterator
from typing import Any

import pytest
from starlette.testclient import TestClient

from sotto_worker.adapters.email.smtp import Outgoing, SmtpAccount, send_mail
from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import ORIGIN, OWNER_EMAIL, OWNER_PASSWORD, PASSWORD
from tests.cloud.fake_smtp import FakeSmtp

ORG_USER, ORG_PASS = "mailbox-login-acme", "org-mailbox-pass-7f3a"
PLAT_USER, PLAT_PASS = "platform-login-agn", "platform-mailbox-pass-91c2"
JSON_ORIGIN = {"origin": ORIGIN, "content-type": "application/json"}


@pytest.fixture
def smtp() -> Iterator[FakeSmtp]:
    fakes: dict[str, FakeSmtp] = {}
    fake = FakeSmtp(ORG_USER, ORG_PASS).start()
    fakes["org"] = fake
    yield fake
    fake.stop()


@pytest.fixture
def sent_via() -> list[SmtpAccount]:
    return []


@pytest.fixture
def mclient(
    store: CloudStore, seed: Seed, smtp: FakeSmtp, sent_via: list[SmtpAccount]
) -> TestClient:
    async def to_fake(account: SmtpAccount, mail: Outgoing) -> None:
        sent_via.append(account)
        # The saved host and port are the real ones; the bytes go to the local fake instead.
        smtp.username, smtp.password = (
            account.username,
            (ORG_PASS if account.username == ORG_USER else PLAT_PASS),
        )
        if account.host == "wrong-pass.test":
            smtp.password = "-".join(["not", "the", "saved", "one"])
        local = dataclasses.replace(account, host="127.0.0.1", port=smtp.port, security="plain")
        await send_mail(local, mail)

    config = CloudConfig(public_origin=ORIGIN, static_dir=None, smtp_sender=to_fake)
    return TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)


def signup(c: TestClient, company: str, email: str) -> dict[str, str]:
    r = c.post(
        "/api/v1/auth/signup",
        json={
            "company": company,
            "name": "Ada Admin",
            "email": email,
            "password": PASSWORD,
            "device": {"id": f"dev-{company}", "platform": "web", "label": "Chrome"},
        },
    )
    assert r.status_code == 201, r.text
    return {"authorization": f"Bearer {r.json()['token']}"}


def agent(c: TestClient, admin: dict[str, str], email: str = "ag@acme.test") -> dict[str, str]:
    pw = c.post(
        "/api/v1/team", json={"email": email, "name": "Sam Agent", "role": "agent"}, headers=admin
    ).json()["temporary_password"]
    token = c.post("/api/v1/auth/login", json={"email": email, "password": pw}).json()["token"]
    h = {"authorization": f"Bearer {token}"}
    assert c.post(
        "/api/v1/auth/password", json={"current": pw, "new": PASSWORD}, headers=h
    ).is_success
    return h


def owner_login(c: TestClient, store: CloudStore) -> None:
    store.create_owner(OWNER_EMAIL, "Owner", OWNER_PASSWORD)
    assert c.post(
        "/api/owner/login",
        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
        headers={"origin": ORIGIN},
    ).is_success
    assert c.post(
        "/api/owner/password",
        json={"current": OWNER_PASSWORD, "new": OWNER_PASSWORD + "-2"},
        headers={"origin": ORIGIN},
    ).is_success


ORG_SMTP = {
    "host": "smtp.hostinger.example",
    "port": 465,
    "username": ORG_USER,
    "password": ORG_PASS,
    "from_name": "Acme Sales",
    "from_address": "sales@acme.test",
}


def cid_of(c: TestClient, h: dict[str, str]) -> str:
    return str(c.get("/api/v1/me", headers=h).json()["company"]["id"])


def set_org_smtp(c: TestClient, h: dict[str, str], **over: Any) -> Any:
    """Round 2 (D-078): the vendor sets the org mailbox from the company profile. The caller
    must have logged the owner in first (owner_login); the admin header only names the company."""
    cid = cid_of(c, h)
    return c.put(f"/api/owner/companies/{cid}/smtp", json={**ORG_SMTP, **over}, headers=JSON_ORIGIN)


def org_smtp_test(c: TestClient, h: dict[str, str]) -> Any:
    cid = cid_of(c, h)
    return c.post(f"/api/owner/companies/{cid}/smtp/test", json={}, headers=JSON_ORIGIN)


def draft(**over: Any) -> dict[str, Any]:
    return {
        "sender": "org",
        "format": "follow_up",
        "to": ["jane@customer.test"],
        "cc": ["boss@customer.test"],
        "subject": "Following up, {{customer.name}}",
        "body": "Here is the pricing we discussed: {{agent.name}} stays literal in the body.",
        "customer_name": "Jane",
        **over,
    }


# --- SMTP settings -------------------------------------------------------------------------------
def test_org_smtp_is_write_only_and_encrypted(mclient: TestClient, store: CloudStore) -> None:
    owner_login(mclient, store)
    h = signup(mclient, "Acme", "admin@acme.test")
    assert mclient.get("/api/v1/company/smtp", headers=h).json()["active"] is None
    r = set_org_smtp(mclient, h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["org"] == {
        "configured": True,
        "host": "smtp.hostinger.example",
        "port": 465,
        "from_name": "Acme Sales",
        "from_address": "sales@acme.test",
        "updated_at": body["org"]["updated_at"],
    }
    assert body["active"] == "org"
    for text in (r.text, mclient.get("/api/v1/company/smtp", headers=h).text):
        assert ORG_PASS not in text
        assert ORG_USER not in text
    raw = store._q("SELECT * FROM smtp_accounts")
    assert ORG_PASS.encode() not in bytes(raw[0]["ciphertext"])
    assert any(a["action"] == "smtp.set" for a in store._q("SELECT action FROM audit"))
    # Editing without the password keeps the saved one.
    r = set_org_smtp(mclient, h, username="", password="", from_name="Acme Team")
    assert r.json()["org"]["from_name"] == "Acme Team"
    assert org_smtp_test(mclient, h).json() == {"ok": True, "to": OWNER_EMAIL}


def test_bad_smtp_values_are_refused(mclient: TestClient, store: CloudStore) -> None:
    owner_login(mclient, store)
    h = signup(mclient, "Acme", "admin@acme.test")
    for over in (
        {"port": 25},
        {"host": "not a host"},
        {"from_address": "nope"},
        {"from_name": "x\r\nBcc: evil@x.test"},
        {"password": ""},  # the first save needs a login
        {"username": ""},
    ):
        r = set_org_smtp(mclient, h, **over)
        assert r.status_code == 400, over


def test_only_the_owner_configures_smtp(mclient: TestClient, store: CloudStore) -> None:
    """Round 2 (D-078): the client no longer configures mail at all — not even an admin. The
    org mailbox is read-only status in the client; the vendor sets it on the company profile."""
    h = signup(mclient, "Acme", "admin@acme.test")
    ag = agent(mclient, h)
    # Before the owner signs in, the owner endpoints refuse everyone.
    assert set_org_smtp(mclient, ag).status_code == 401
    assert org_smtp_test(mclient, ag).status_code == 401
    assert mclient.get("/api/v1/company/smtp", headers=ag).status_code == 403
    # The client routes are gone entirely. PUT/DELETE/POST on a removed path answer 405
    # (the GET-only SPA fallback at /{path:path} matches the path); a removed GET path
    # answers 200 from that same fallback — either way the endpoint is gone.
    assert mclient.put("/api/v1/company/smtp", json=ORG_SMTP, headers=h).status_code == 405
    assert mclient.delete("/api/v1/company/smtp", headers=h).status_code == 405
    assert mclient.post("/api/v1/company/smtp/test", headers=h).status_code == 405
    assert mclient.get("/api/v1/company/smtp/preset", headers=h).status_code == 200
    # Once the owner signs in, the same vendor call works.
    owner_login(mclient, store)
    assert set_org_smtp(mclient, h).status_code == 200


def test_test_email_goes_to_the_owner_and_shows_the_exact_error(
    mclient: TestClient, smtp: FakeSmtp, store: CloudStore
) -> None:
    """Round 2 (D-078): the vendor tests a company's mailbox, so the test email goes to the
    vendor, not the company's admin."""
    owner_login(mclient, store)
    h = signup(mclient, "Acme", "admin@acme.test")
    assert org_smtp_test(mclient, h).status_code == 400  # none saved
    set_org_smtp(mclient, h)
    r = org_smtp_test(mclient, h)
    assert r.json() == {"ok": True, "to": OWNER_EMAIL}
    assert smtp.inbox[-1].recipients == [OWNER_EMAIL]
    set_org_smtp(mclient, h, host="wrong-pass.test")
    r = org_smtp_test(mclient, h)
    assert r.json() == {
        "ok": False,
        "to": OWNER_EMAIL,
        "error": "535 5.7.8 Error: authentication failed",
    }


def test_unreachable_server_error_is_shown() -> None:
    import asyncio

    from sotto_worker.adapters.email.smtp import SmtpSendError

    acct = SmtpAccount("127.0.0.1", 1, "u", "p", "N", "n@x.test", security="plain", timeout=2)
    mail = Outgoing(("a@x.test",), (), "s", "t", "k")
    with pytest.raises(SmtpSendError, match="ConnectionRefusedError"):
        asyncio.run(send_mail(acct, mail))


def test_platform_smtp_is_the_fallback_and_org_wins(
    mclient: TestClient, store: CloudStore, sent_via: list[SmtpAccount]
) -> None:
    owner_login(mclient, store)
    plat = {**ORG_SMTP, "username": PLAT_USER, "password": PLAT_PASS, "host": "smtp.agn.test"}
    plat.update(from_name="AGN Sales Shield", from_address="noreply@agn.test")
    r = mclient.put("/api/owner/smtp", json=plat, headers=JSON_ORIGIN)
    assert r.status_code == 200, r.text
    assert PLAT_PASS not in r.text
    assert PLAT_USER not in r.text
    assert mclient.post("/api/owner/smtp/test", json={}, headers=JSON_ORIGIN).json()["ok"] is True
    h = signup(mclient, "Acme", "admin@acme.test")
    assert mclient.get("/api/v1/company/smtp", headers=h).json()["active"] == "platform"
    senders = mclient.get("/api/v1/email/senders", headers=h).json()["senders"]
    assert senders == [
        {"id": "platform", "from_name": "AGN Sales Shield", "from_address": "noreply@agn.test"}
    ]
    set_org_smtp(mclient, h)
    senders = mclient.get("/api/v1/email/senders", headers=h).json()["senders"]
    assert [s["id"] for s in senders] == ["org"]
    mclient.post(
        "/api/v1/email/send",
        json={**draft(), "confirm": True, "idempotency_key": "k-0000001"},
        headers=h,
    )
    assert sent_via[-1].host == "smtp.hostinger.example"


def test_owner_smtp_route_needs_the_owner(mclient: TestClient) -> None:
    assert mclient.get("/api/owner/smtp").status_code == 401
    h = signup(mclient, "Acme", "admin@acme.test")
    assert mclient.get("/api/owner/smtp", headers=h).status_code == 401


# --- sending -----------------------------------------------------------------------------------
def test_needs_a_sender_before_sending(mclient: TestClient) -> None:
    h = signup(mclient, "Acme", "admin@acme.test")
    r = mclient.post("/api/v1/email/preview", json=draft(), headers=h)
    assert r.status_code == 403
    assert r.json() == {
        "error": "feature_unavailable",
        "code": "feature_unavailable",
        "feature": "email_send",
        "state": "needs_connection",
        "cause": "email_sender",
    }


def test_preview_merges_static_blocks_verbatim_and_send_matches(
    mclient: TestClient, smtp: FakeSmtp, store: CloudStore
) -> None:
    owner_login(mclient, store)
    h = signup(mclient, "Acme", "admin@acme.test")
    set_org_smtp(mclient, h)
    ag = agent(mclient, h)
    p = mclient.post("/api/v1/email/preview", json=draft(), headers=ag)
    assert p.status_code == 200, p.text
    preview = p.json()
    assert preview["subject"] == "Following up, Jane"
    assert preview["from"] == {"name": "Acme Sales", "address": "sales@acme.test"}
    assert preview["text"] == (
        "Hi Jane,\n\n"
        "Here is the pricing we discussed: {{agent.name}} stays literal in the body.\n\n"
        "Best regards,\nSam Agent\nAcme"
    )
    assert preview["html"] == ""  # no Markdown in the format: one plain-text part, as before
    assert not smtp.inbox  # a preview sends nothing
    r = mclient.post("/api/v1/email/send", json=draft(), headers=ag)
    assert r.status_code == 400
    assert r.json()["code"] == "confirm"
    assert not smtp.inbox
    r = mclient.post(
        "/api/v1/email/send",
        json={**draft(), "confirm": True, "idempotency_key": "call-1-email"},
        headers=ag,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "sent"
    assert r.json()["duplicate"] is False
    got = smtp.inbox[-1]
    assert got.recipients == ["jane@customer.test", "boss@customer.test"]
    assert got.message["Subject"] == preview["subject"]
    assert got.message["Cc"] == "boss@customer.test"
    assert "Acme Sales" in got.message["From"]
    assert "call-1-email" in got.message["Message-ID"]
    assert got.message.get_content().replace("\r\n", "\n").strip() == preview["text"]
    audit = store._q("SELECT action, detail, actor_id FROM audit WHERE action = 'email.sent'")
    assert len(audit) == 1
    assert "jane@customer.test" in audit[0]["detail"]


def test_a_retried_send_never_duplicates(
    mclient: TestClient, store: CloudStore, smtp: FakeSmtp
) -> None:
    owner_login(mclient, store)
    h = signup(mclient, "Acme", "admin@acme.test")
    set_org_smtp(mclient, h)
    req = {**draft(), "confirm": True, "idempotency_key": "call-2-email"}
    assert mclient.post("/api/v1/email/send", json=req, headers=h).json()["duplicate"] is False
    again = mclient.post("/api/v1/email/send", json=req, headers=h)
    assert again.status_code == 200
    assert again.json() == {"status": "sent", "duplicate": True}
    assert len(smtp.inbox) == 1


def test_failed_send_can_be_retried_and_is_audited(
    mclient: TestClient, smtp: FakeSmtp, store: CloudStore
) -> None:
    owner_login(mclient, store)
    h = signup(mclient, "Acme", "admin@acme.test")
    set_org_smtp(mclient, h, host="wrong-pass.test")
    req = {**draft(), "confirm": True, "idempotency_key": "call-3-email"}
    r = mclient.post("/api/v1/email/send", json=req, headers=h)
    assert r.status_code == 502
    assert "535" in r.json()["error"]
    assert store._q("SELECT 1 FROM audit WHERE action = 'email.failed'")
    set_org_smtp(mclient, h, host="smtp.hostinger.example")
    assert mclient.post("/api/v1/email/send", json=req, headers=h).json()["duplicate"] is False
    assert len(smtp.inbox) == 1


def test_recipients_and_fields_are_validated(mclient: TestClient, store: CloudStore) -> None:
    owner_login(mclient, store)
    h = signup(mclient, "Acme", "admin@acme.test")
    set_org_smtp(mclient, h)
    overs: tuple[dict[str, Any], ...] = (
        {"to": []},
        {"to": ["not-an-email"]},
        {"to": ["a@x.test\r\nBcc: evil@x.test"]},
        {"cc": ["evil@x.test, other@x.test"]},
        {"to": [f"a{i}@x.test" for i in range(11)]},
        {"subject": "two\nlines"},
        {"body": "   "},
        {"sender": "platform"},  # not an approved sender of this org
        {"format": "nope"},
    )
    for over in overs:
        r = mclient.post("/api/v1/email/preview", json=draft(**over), headers=h)
        assert r.status_code == 400, (over, r.text)


def test_formats_are_editable_with_known_placeholders_only(
    mclient: TestClient, store: CloudStore
) -> None:
    owner_login(mclient, store)
    h = signup(mclient, "Acme", "admin@acme.test")
    fmts = mclient.get("/api/v1/email/formats", headers=h).json()["formats"]
    assert [f["id"] for f in fmts] == ["follow_up", "meeting_confirmation", "proposal", "booking"]
    fmts[0]["signature"] = "Cheers,\n{{agent.name}} · {{agent.email}}"
    r = mclient.put("/api/v1/company/email/formats", json={"formats": fmts}, headers=h)
    assert r.status_code == 200, r.text
    bad = [{**fmts[0], "signature": "{{agent.password}}"}]
    assert (
        mclient.put("/api/v1/company/email/formats", json={"formats": bad}, headers=h).status_code
        == 400
    )
    ag = agent(mclient, h)
    assert (
        mclient.put("/api/v1/company/email/formats", json={"formats": fmts}, headers=ag).status_code
        == 403
    )
    set_org_smtp(mclient, h)
    text = mclient.post("/api/v1/email/preview", json=draft(), headers=ag).json()["text"]
    assert text.endswith("Cheers,\nSam Agent · ag@acme.test")


def test_org_toggle_stops_sending(mclient: TestClient, store: CloudStore, smtp: FakeSmtp) -> None:
    owner_login(mclient, store)
    h = signup(mclient, "Acme", "admin@acme.test")
    set_org_smtp(mclient, h)
    assert mclient.put(
        "/api/v1/company/features/follow_up", json={"enabled": False}, headers=h
    ).is_success
    r = mclient.post(
        "/api/v1/email/send",
        json={**draft(), "confirm": True, "idempotency_key": "k-00000009"},
        headers=h,
    )
    assert r.status_code == 403
    assert r.json()["cause"] == "follow_up"
    assert not smtp.inbox


def test_org_isolation(mclient: TestClient, store: CloudStore, smtp: FakeSmtp) -> None:
    owner_login(mclient, store)
    a = signup(mclient, "Alpha", "admin@a.test")
    b = signup(mclient, "Beta", "admin@b.test")
    set_org_smtp(mclient, a)
    fmts = mclient.get("/api/v1/email/formats", headers=a).json()["formats"]
    fmts[0]["signature"] = "Alpha only"
    mclient.put("/api/v1/company/email/formats", json={"formats": fmts}, headers=a)
    assert mclient.get("/api/v1/company/smtp", headers=b).json()["active"] is None
    assert "Alpha only" not in mclient.get("/api/v1/email/formats", headers=b).text
    # B cannot use A's mailbox, and cannot delete it — not even through the owner endpoints.
    assert mclient.post("/api/v1/email/preview", json=draft(), headers=b).status_code == 403
    assert org_smtp_test(mclient, b).status_code == 400
    mclient.cookies.clear()
    assert (
        mclient.delete(f"/api/owner/companies/{cid_of(mclient, a)}/smtp", headers=b).status_code
        == 401
    )
    assert mclient.get("/api/v1/company/smtp", headers=a).json()["active"] == "org"
    # The owner signs back in (the password was changed by owner_login).
    assert mclient.post(
        "/api/owner/login",
        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD + "-2"},
        headers={"origin": ORIGIN},
    ).is_success
    # The same idempotency key in two orgs are two different emails.
    set_org_smtp(mclient, b)
    req = {**draft(), "confirm": True, "idempotency_key": "same-key-01"}
    assert mclient.post("/api/v1/email/send", json=req, headers=a).json()["duplicate"] is False
    assert mclient.post("/api/v1/email/send", json=req, headers=b).json()["duplicate"] is False
    assert len(smtp.inbox) == 2


# --- round 2 (D-078/D-080): per-user mailboxes and rich-text formats ------------------------
USER_SMTP = {
    "host": "smtp.user.test",
    "port": 587,
    "username": "user-login-acme",
    "password": PLAT_PASS,
    "from_name": "Sam Agent",
    "from_address": "ag@acme.test",
}


def test_user_smtp_wins_over_org_and_platform(
    mclient: TestClient, store: CloudStore, sent_via: list[SmtpAccount]
) -> None:
    owner_login(mclient, store)
    plat = {**ORG_SMTP, "username": PLAT_USER, "password": PLAT_PASS, "host": "smtp.agn.test"}
    plat.update(from_name="AGN Sales Shield", from_address="noreply@agn.test")
    assert mclient.put("/api/owner/smtp", json=plat, headers=JSON_ORIGIN).is_success
    h = signup(mclient, "Acme", "admin@acme.test")
    set_org_smtp(mclient, h)
    ag = agent(mclient, h)
    cid = cid_of(mclient, h)
    uid = next(
        u["id"]
        for u in mclient.get("/api/v1/team", headers=h).json()["users"]
        if u["email"] == "ag@acme.test"
    )
    assert mclient.get("/api/v1/email/senders", headers=ag).json()["senders"] == [
        {"id": "org", "from_name": "Acme Sales", "from_address": "sales@acme.test"}
    ]
    # The vendor sets the agent's own mailbox on the company profile.
    r = mclient.put(
        f"/api/owner/companies/{cid}/users/{uid}/smtp", json=USER_SMTP, headers=JSON_ORIGIN
    )
    assert r.status_code == 200, r.text
    assert r.json()["configured"] is True
    assert PLAT_PASS not in r.text
    senders = mclient.get("/api/v1/email/senders", headers=ag).json()["senders"]
    assert senders == [{"id": "user", "from_name": "Sam Agent", "from_address": "ag@acme.test"}]
    mclient.post(
        "/api/v1/email/send",
        json={**draft(sender="user"), "confirm": True, "idempotency_key": "k-user-01"},
        headers=ag,
    )
    assert sent_via[-1].host == "smtp.user.test"
    # The admin cannot set a user's mailbox; the vendor can remove it.
    mclient.cookies.clear()
    assert (
        mclient.put(
            f"/api/owner/companies/{cid}/users/{uid}/smtp", json=USER_SMTP, headers=h
        ).status_code
        == 401
    )
    assert mclient.post(
        "/api/owner/login",
        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD + "-2"},
        headers={"origin": ORIGIN},
    ).is_success
    assert mclient.delete(
        f"/api/owner/companies/{cid}/users/{uid}/smtp", headers=JSON_ORIGIN
    ).is_success
    assert [
        s["id"] for s in mclient.get("/api/v1/email/senders", headers=ag).json()["senders"]
    ] == ["org"]


def test_rich_format_sends_markdown_as_html(
    mclient: TestClient, store: CloudStore, smtp: FakeSmtp
) -> None:
    owner_login(mclient, store)
    h = signup(mclient, "Acme", "admin@acme.test")
    set_org_smtp(mclient, h)
    fmts = mclient.get("/api/v1/email/formats", headers=h).json()["formats"]
    fmts[0]["signature"] = "**Best regards,**\n{{agent.name}} · [our site](https://acme.test)"
    assert mclient.put(
        "/api/v1/company/email/formats", json={"formats": fmts}, headers=h
    ).is_success
    ag = agent(mclient, h)
    preview = mclient.post("/api/v1/email/preview", json=draft(), headers=ag).json()
    assert preview["text"].endswith("Best regards,\nSam Agent · our site")
    assert "**" not in preview["text"]
    assert "[our site]" not in preview["text"]
    assert "<strong>Best regards,</strong>" in preview["html"]
    assert '<a href="https://acme.test">our site</a>' in preview["html"]
    r = mclient.post(
        "/api/v1/email/send",
        json={**draft(), "confirm": True, "idempotency_key": "k-rich-01"},
        headers=ag,
    )
    assert r.status_code == 200, r.text
    got = smtp.inbox[-1].message
    assert got.get_content_type() == "multipart/alternative"
    plain, html = got.get_body(("plain",)), got.get_body(("html",))
    assert plain is not None
    assert html is not None
    assert plain.get_content().replace("\r\n", "\n").strip() == preview["text"]
    assert "<strong>Best regards,</strong>" in html.get_content()
