"""Manager emails (R2 step 4, owner 22 Oct 2026): one email per new unanswered question, to the
company's own managers, retried on failure; the mailbox password is stored encrypted."""

from __future__ import annotations

import asyncio
import smtplib
import time
from pathlib import Path
from typing import Any

import pytest
from starlette.testclient import TestClient

from sotto_worker.adapters.email.fake import FakeEmail
from sotto_worker.cloud import __main__ as cli
from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.mail import load_mailer, render_escalation, send_with_retries
from sotto_worker.cloud.store import CloudStore
from sotto_worker.outbox import EmailMessage
from tests.cloud.conftest import ORIGIN, PASSWORD


def signup(c: TestClient, company: str, email: str) -> dict[str, str]:
    r = c.post(
        "/api/v1/auth/signup",
        json={"company": company, "name": "Ada", "email": email, "password": PASSWORD},
    )
    return {"authorization": f"Bearer {r.json()['token']}"}


def wait_for(cond: Any) -> None:
    for _ in range(50):
        if cond():
            return
        time.sleep(0.02)


def test_new_question_emails_the_companys_managers_once(store: CloudStore, seed: Seed) -> None:
    mail = FakeEmail()
    config = CloudConfig(public_origin=ORIGIN, static_dir=None, mailer=mail)
    with TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN) as c:
        ha = signup(c, "Alpha", "admin@a.test")
        hb = signup(c, "Beta", "admin@b.test")
        # Round 3 (D-087): signup sends a welcome email to each admin in the
        # background; wait for both to land and drain them, so the assertions
        # below count escalation mail only.
        wait_for(lambda: len(mail.sent) >= 2)
        mail.sent.clear()
        body = {"question": "Can I pay in bitcoin?", "transcript_excerpt": "Customer: hi"}
        assert c.post("/api/v1/escalations", json=body, headers=ha).status_code == 201
        assert c.post("/api/v1/escalations", json=body, headers=ha).status_code == 201  # same
        wait_for(lambda: len(mail.sent) >= 1)
        time.sleep(0.1)
        assert [m.to for m, _ in mail.sent] == ["admin@a.test"]  # no manager yet: the admin
        msg = mail.sent[0][0]
        assert "Can I pay in bitcoin?" in msg.text
        assert f"{ORIGIN}/inbox" in msg.text
        assert msg.subject.startswith("Unanswered question")

        # An admin can name the address; Beta's questions go to Beta only.
        assert (
            c.put(
                "/api/v1/company/settings", json={"manager_email": "sales@a.test"}, headers=ha
            ).status_code
            == 200
        )
        c.post("/api/v1/escalations", json={"question": "Do you ship to Oman?"}, headers=ha)
        c.post("/api/v1/escalations", json={"question": "Any discount?"}, headers=hb)
        wait_for(lambda: len(mail.sent) >= 3)
        assert sorted(m.to for m, _ in mail.sent[1:]) == ["admin@b.test", "sales@a.test"]
        bad = c.put("/api/v1/company/settings", json={"manager_email": "nope"}, headers=ha)
        assert bad.status_code == 400


def test_without_a_mailbox_questions_still_reach_the_inbox(
    client: TestClient, sign_up: Any
) -> None:
    h = sign_up("Alpha", "admin@a.test")["auth"]
    assert client.post("/api/v1/escalations", json={"question": "Q?"}, headers=h).status_code == 201
    assert len(client.get("/api/v1/escalations", headers=h).json()["items"]) == 1


def test_retries_then_gives_up() -> None:
    class Flaky(FakeEmail):
        calls = 0

        async def send(self, message: EmailMessage, *, idempotency_key: str) -> None:
            self.calls += 1
            if self.calls < 3:
                raise OSError("mailbox down")
            await super().send(message, idempotency_key=idempotency_key)

    async def no_wait(_s: float) -> None:
        return None

    logs: list[str] = []
    flaky = Flaky()
    msg = EmailMessage(to="m@a.test", subject="s", text="t")
    assert asyncio.run(send_with_retries(flaky, msg, "k", log=logs.append, sleep=no_wait))
    assert flaky.calls == 3
    assert len(logs) == 2
    dead = FakeEmail(error=OSError("no"))
    assert not asyncio.run(send_with_retries(dead, msg, "k", log=logs.append, sleep=no_wait))
    assert logs[-1].startswith("manager email gave up")


def test_template_has_a_subject_line(seed: Seed) -> None:
    body = str(seed.prompts["escalation_email"]["body"])
    m = render_escalation(body, {"escalation.customer": "Sara", "escalation.question": "Q?"})
    assert m.subject == "Unanswered question from Sara"
    assert "Q?" in m.text


def test_email_setup_stores_the_password_encrypted_and_sends_over_ssl(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env = {"SOTTO_DATA_DIR": str(tmp_path), "SOTTO_SECRET_KEY": "k" * 40}
    answers = iter(["", "", "sotto@agncompu.test", ""])
    path = cli.email_setup(env, lambda _p: next(answers), lambda _p: "s3cret-pass")
    assert "s3cret-pass" not in path.read_text()
    assert oct(path.stat().st_mode & 0o777) == "0o600"
    mailer = load_mailer(path, cli.vault(env))
    assert mailer is not None
    assert (mailer.host, mailer.port, mailer.sender) == (
        "smtp.hostinger.com",
        465,
        "Sotto <sotto@agncompu.test>",
    )

    seen: dict[str, Any] = {}

    class FakeSSL:
        def __init__(self, host: str, port: int, **_kw: Any) -> None:
            seen["at"] = (host, port)

        def __enter__(self) -> FakeSSL:
            return self

        def __exit__(self, *_a: object) -> None:
            return None

        def login(self, user: str, password: str) -> None:
            seen["login"] = (user, password)

        def send_message(self, m: Any) -> None:
            seen["to"], seen["subject"] = m["To"], m["Subject"]

    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSSL)
    msg = EmailMessage(to="boss@a.test", subject="Hello", text="Body")
    asyncio.run(mailer.send(msg, idempotency_key="k1"))
    assert seen == {
        "at": ("smtp.hostinger.com", 465),
        "login": ("sotto@agncompu.test", "s3cret-pass"),
        "to": "boss@a.test",
        "subject": "Hello",
    }


def test_only_admins_read_company_settings(
    client: TestClient, sign_up: Any, store: CloudStore
) -> None:
    h = sign_up("Alpha", "admin@a.test")["auth"]
    client.put("/api/v1/company/settings", json={"manager_email": "boss@a.test"}, headers=h)
    got = client.get("/api/v1/company/settings", headers=h).json()["settings"]
    assert got["manager_email"] == "boss@a.test"
    other = sign_up("Beta", "admin@b.test")["auth"]
    assert (
        "manager_email"
        not in client.get("/api/v1/company/settings", headers=other).json()["settings"]
    )
