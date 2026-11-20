"""Round 3 server (D-085/D-086/D-087/D-088/D-089/D-090): the CRM's new-company API, OTP
sign-in, the welcome email, the GitHub repo+token settings and issue sender, screenshot
attachments, the bug-report review queue, and the client billing read model.

Mail is captured by a fake SMTP sender (no real mailbox); GitHub is a mocked transport (no
real GitHub). No secrets, tokens or codes are ever asserted on by value — only by shape."""

from __future__ import annotations

import re
import time
from typing import Any

import httpx
import httpx2
import pytest
from starlette.testclient import TestClient

from sotto_worker.adapters.email.smtp import Outgoing, SmtpAccount
from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import (
    PLANS,
    CloudError,
    CloudStore,
    now_ms,
)
from tests.cloud.conftest import ORIGIN, OWNER_EMAIL, OWNER_PASSWORD, PASSWORD

JSON_ORIGIN = {"origin": ORIGIN, "content-type": "application/json"}
CRM_SECRET_HEADER = "x-agn-signup-secret"  # noqa: S105  # a header name, not a secret
CODE_RE = re.compile(r"\b(\d{6})\b")
PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c6360000000020001e221bc330000000049454e44ae426082"
)


@pytest.fixture
def gh_calls() -> list[httpx.Request]:
    return []


@pytest.fixture
def gh_transport(gh_calls: list[httpx.Request]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        gh_calls.append(request)
        if request.method == "GET" and request.url.path.startswith("/repos/"):
            return httpx.Response(200, json={"full_name": request.url.path[7:]})
        if request.method == "POST" and request.url.path.endswith("/issues"):
            return httpx.Response(
                201,
                json={
                    "html_url": "https://github.com/agn-it/test-reports/issues/7",
                    "number": 7,
                },
            )
        return httpx.Response(404, json={"message": "not found"})

    return httpx.MockTransport(handler)


@pytest.fixture
def sent() -> list[tuple[SmtpAccount, Outgoing]]:
    return []


class MailClient(TestClient):
    """A TestClient that records sent mail on .sent (attached by mclient)."""

    sent: list[tuple[SmtpAccount, Outgoing]]


@pytest.fixture
def mclient(
    store: CloudStore,
    seed: Seed,
    sent: list[tuple[SmtpAccount, Outgoing]],
    gh_transport: httpx.MockTransport,
) -> MailClient:
    async def to_fake(account: SmtpAccount, mail: Outgoing) -> None:
        sent.append((account, mail))

    config = CloudConfig(
        public_origin=ORIGIN,
        static_dir=None,
        smtp_sender=to_fake,
        github_transport=gh_transport,
    )
    client = MailClient(create_cloud_app(config, store, seed), base_url=ORIGIN)
    client.sent = sent
    return client


@pytest.fixture
def owner_client(mclient: TestClient, store: CloudStore) -> TestClient:
    """The owner, signed in on the mail-capturing client (mirrors conftest's owner fixture)."""
    store.create_owner(OWNER_EMAIL, "Owner", OWNER_PASSWORD)
    r = mclient.post(
        "/api/owner/login",
        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
        headers={"origin": ORIGIN},
    )
    assert r.status_code == 200, r.text
    r = mclient.post(
        "/api/owner/password",
        json={"current": OWNER_PASSWORD, "new": OWNER_PASSWORD + "-2"},
        headers={"origin": ORIGIN},
    )
    assert r.status_code == 200, r.text
    return mclient


@pytest.fixture
def crm_secret(owner_client: TestClient) -> str:
    r = owner_client.post("/api/owner/crm-secret", json={}, headers=JSON_ORIGIN)
    assert r.status_code == 200, r.text
    return str(r.json()["secret"])


def save_platform_mailbox(owner: TestClient) -> None:
    r = owner.put(
        "/api/owner/smtp",
        json={
            "host": "smtp.example.test",
            "port": 465,
            "username": "platform-login",
            "password": "platform-pass",
            "from_name": "AGN Sales Shield",
            "from_address": "sales-shield@agncompu.com",
        },
        headers=JSON_ORIGIN,
    )
    assert r.status_code == 200, r.text


def wait_for_mail(
    sent: list[tuple[SmtpAccount, Outgoing]], count: int, timeout_s: float = 5.0
) -> None:
    deadline = time.monotonic() + timeout_s
    while len(sent) < count and time.monotonic() < deadline:
        time.sleep(0.05)
    assert len(sent) >= count, f"only {len(sent)} mails arrived, wanted {count}"


def drain_mail(sent: list[tuple[SmtpAccount, Outgoing]], quiet_s: float = 0.4) -> None:
    """Waits until no new mail arrives for `quiet_s`: background sends from earlier steps
    (welcome, OTP) have landed, so the next mail counted is the one this step sends."""
    last_len = len(sent)
    quiet_until = time.monotonic() + quiet_s
    while time.monotonic() < quiet_until:
        time.sleep(0.05)
        if len(sent) != last_len:
            last_len = len(sent)
            quiet_until = time.monotonic() + quiet_s


def crm_body(**over: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "company_name": "Acme Real Estate",
        "admin_name": "Ada Admin",
        "admin_email": "admin@acme.test",
        "zoho_plan_code": "SHIELD-GROWTH",
        "trial": False,
    }
    body.update(over)
    return body


def crm_create(c: TestClient, secret: str, **over: Any) -> httpx2.Response:
    return c.post(
        "/api/v1/companies",
        json=crm_body(**over),
        headers={CRM_SECRET_HEADER: secret},
    )


# --- plans (D-088) --------------------------------------------------------------------------------


def test_plans_match_the_zoho_ladder() -> None:
    assert PLANS["starter"]["seats"] == 3  # Zoho Starter sells 3 agents, not 5
    assert PLANS["growth"] == {"seats": 10, "minutes": 5_000}
    assert PLANS["scale"] == {"seats": 100, "minutes": 20_000}


# --- the CRM's new-company API (D-087) ------------------------------------------------------------


def test_crm_requires_its_secret(mclient: TestClient, crm_secret: str) -> None:
    assert mclient.post("/api/v1/companies", json=crm_body()).status_code == 401
    r = mclient.post("/api/v1/companies", json=crm_body(), headers={CRM_SECRET_HEADER: "wrong"})
    assert r.status_code == 401


def test_crm_creates_company_admin_and_mails(
    mclient: MailClient, store: CloudStore, crm_secret: str, owner_client: TestClient
) -> None:
    save_platform_mailbox(owner_client)
    sent = mclient.sent
    r = crm_create(mclient, crm_secret)
    assert r.status_code == 201, r.text
    assert r.json()["company_id"]
    assert r.json()["admin_email"] == "admin@acme.test"
    assert r.json()["otp_sent"] is True
    company = store.company_row(r.json()["company_id"])
    assert company["plan"] == "growth"  # SHIELD-GROWTH
    assert company["seats"] == 10
    assert company["minutes_month"] == 5_000
    assert company["billing_plan_code"] == "SHIELD-GROWTH"
    assert company["paid_until"]
    assert company["paid_until"] > now_ms()
    user = store._q("SELECT * FROM users WHERE email = ?", ("admin@acme.test",))[0]
    assert user["role"] == "admin"
    assert user["must_change_pw"] == 1
    wait_for_mail(sent, 2)
    subjects = [m.subject for _a, m in sent]
    assert "Welcome to AGN Sales Shield" in subjects
    assert "Your AGN Sales Shield sign-in code" in subjects
    otp_mail = next(m for _a, m in sent if "sign-in code" in m.subject)
    assert CODE_RE.search(otp_mail.text)
    assert all(a.from_address == "sales-shield@agncompu.com" for a, _m in sent)


def test_crm_trial_stays_a_trial(mclient: TestClient, store: CloudStore, crm_secret: str) -> None:
    r = crm_create(mclient, crm_secret, trial=True, zoho_plan_code="SHIELD-STARTER")
    assert r.status_code == 201, r.text
    company = store.company_row(r.json()["company_id"])
    assert company["plan"] == "trial"
    assert company["trial_ends_at"]
    assert company["paid_until"] is None
    assert company["billing_plan_code"] == "SHIELD-STARTER"


def test_crm_duplicate_email_is_a_noop(
    mclient: TestClient, store: CloudStore, crm_secret: str
) -> None:
    assert crm_create(mclient, crm_secret).status_code == 201
    before = len(store._q("SELECT id FROM companies"))
    r = crm_create(mclient, crm_secret)
    assert r.status_code == 200, r.text
    assert r.json()["duplicate"] is True
    assert r.json()["otp_sent"] is False
    assert len(store._q("SELECT id FROM companies")) == before


def test_crm_rejects_unknown_plan_code(mclient: MailClient, crm_secret: str) -> None:
    r = crm_create(mclient, crm_secret, zoho_plan_code="SHIELD-NOPE")
    assert r.status_code == 400, r.text


# --- OTP (D-087) ----------------------------------------------------------------------------------


def signup_user(mclient: TestClient, email: str = "admin@acme.test") -> dict[str, str]:
    r = mclient.post(
        "/api/v1/auth/signup",
        json={
            "company": "Acme",
            "name": "Ada Admin",
            "email": email,
            "password": PASSWORD,
            "device": {"id": "dev-1", "platform": "web", "label": "Chrome"},
        },
    )
    assert r.status_code == 201, r.text
    return {"authorization": f"Bearer {r.json()['token']}"}


def request_code(mclient: MailClient, email: str, purpose: str = "login") -> str:
    sent = mclient.sent
    drain_mail(sent)
    before = len(sent)
    r = mclient.post("/api/v1/auth/otp/request", json={"email": email, "purpose": purpose})
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "message": "If that address has an account, we sent a code."}
    wait_for_mail(sent, before + 1)
    mail = sent[-1][1]
    match = CODE_RE.search(mail.text)
    assert match, mail.text
    return match.group(1)


def test_otp_request_answers_the_same_for_unknown_addresses(
    mclient: MailClient, owner_client: TestClient
) -> None:
    save_platform_mailbox(owner_client)
    sent = mclient.sent
    r = mclient.post(
        "/api/v1/auth/otp/request", json={"email": "nobody@example.test", "purpose": "login"}
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    time.sleep(0.3)
    assert sent == []


def test_otp_verify_signs_in_and_forces_a_password_change(
    mclient: MailClient, store: CloudStore, crm_secret: str, owner_client: TestClient
) -> None:
    save_platform_mailbox(owner_client)
    assert crm_create(mclient, crm_secret).status_code == 201
    code = request_code(mclient, "admin@acme.test", purpose="signup")
    r = mclient.post(
        "/api/v1/auth/otp/verify",
        json={"email": "admin@acme.test", "code": code, "purpose": "signup"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["token"]
    assert r.json()["must_change"] is True
    # Single use: the same code is dead now.
    r = mclient.post(
        "/api/v1/auth/otp/verify",
        json={"email": "admin@acme.test", "code": code, "purpose": "signup"},
    )
    assert r.status_code == 400
    assert r.json()["code"] == "otp_invalid"


def test_otp_wrong_code_and_expired_code(
    mclient: MailClient, store: CloudStore, owner_client: TestClient
) -> None:
    save_platform_mailbox(owner_client)
    signup_user(mclient)
    code = request_code(mclient, "admin@acme.test")
    r = mclient.post(
        "/api/v1/auth/otp/verify",
        json={"email": "admin@acme.test", "code": "000000", "purpose": "login"},
    )
    assert r.status_code == 400
    assert r.json()["code"] == "otp_invalid"
    store._db.execute(
        "UPDATE otp_codes SET expires_at = ? WHERE email = ?",
        (now_ms() - 1000, "admin@acme.test"),
    )
    r = mclient.post(
        "/api/v1/auth/otp/verify",
        json={"email": "admin@acme.test", "code": code, "purpose": "login"},
    )
    assert r.status_code == 400
    assert r.json()["code"] == "otp_expired"


def test_otp_attempt_limit_is_enforced_by_the_store(
    mclient: MailClient, store: CloudStore, owner_client: TestClient
) -> None:
    save_platform_mailbox(owner_client)
    signup_user(mclient)
    code = request_code(mclient, "admin@acme.test")
    for _ in range(5):
        with pytest.raises(CloudError) as exc:
            store.verify_otp("admin@acme.test", "000000", "login")
        assert exc.value.code == "otp_invalid"
    # Five wrong guesses spent the code: even the right one is dead now.
    with pytest.raises(CloudError) as exc:
        store.verify_otp("admin@acme.test", code, "login")
    assert exc.value.code == "otp_invalid"


# --- GitHub settings + issues (D-085) -------------------------------------------------------------


def test_github_settings_round_trip(owner_client: TestClient) -> None:
    r = owner_client.get("/api/owner/github")
    assert r.json() == {"configured": False, "repo": None, "updated_at": None}
    r = owner_client.put("/api/owner/github", json={"repo": "bad repo"}, headers=JSON_ORIGIN)
    assert r.status_code == 400
    r = owner_client.put(
        "/api/owner/github", json={"repo": "agn-it/test-reports"}, headers=JSON_ORIGIN
    )
    assert r.status_code == 400  # a token is required
    token = "ghp_test-token-value"  # noqa: S105  # test fixture: a fake token, never a real credential
    r = owner_client.put(
        "/api/owner/github",
        json={"repo": "agn-it/test-reports", "token": token},
        headers=JSON_ORIGIN,
    )
    assert r.status_code == 200, r.text
    assert r.json()["configured"] is True
    assert r.json()["repo"] == "agn-it/test-reports"
    assert token not in r.text  # the token is never sent back
    r = owner_client.get("/api/owner/github")
    assert r.json()["repo"] == "agn-it/test-reports"
    assert token not in r.text
    # An empty token keeps the saved one: the test endpoint still passes.
    r = owner_client.put(
        "/api/owner/github", json={"repo": "agn-it/test-reports", "token": ""}, headers=JSON_ORIGIN
    )
    assert r.status_code == 200, r.text
    r = owner_client.post("/api/owner/github/test", json={}, headers=JSON_ORIGIN)
    assert r.status_code == 200
    assert r.json()["ok"] is True
    r = owner_client.delete("/api/owner/github", headers=JSON_ORIGIN)
    assert r.status_code == 200
    assert owner_client.get("/api/owner/github").json()["configured"] is False


def test_github_test_without_config(owner_client: TestClient) -> None:
    r = owner_client.post("/api/owner/github/test", json={}, headers=JSON_ORIGIN)
    assert r.status_code == 200
    assert r.json() == {
        "ok": False,
        "detail": "no GitHub repo is connected yet",
    }


def test_github_issue_needs_config(owner_client: TestClient) -> None:
    r = owner_client.post(
        "/api/owner/github/issues",
        json={"title": "x", "body": "y", "page_url": "/owner"},
        headers=JSON_ORIGIN,
    )
    assert r.status_code == 409
    assert r.json()["code"] == "github_not_configured"


def test_github_issue_is_created_server_side(
    owner_client: TestClient, gh_calls: list[httpx.Request]
) -> None:
    owner_client.put(
        "/api/owner/github",
        json={"repo": "agn-it/test-reports", "token": "ghp_test-token-value"},
        headers=JSON_ORIGIN,
    )
    r = owner_client.post(
        "/api/owner/github/issues",
        json={
            "title": "Picklist opens over the field name",
            "body": "The templates dropdown is hard to use.",
            "page_url": "https://owner.example.com/owner/company.html?id=abc",
            "screenshot_url": "https://cloud.example.com/api/v1/issue-attachments/aa11",
        },
        headers=JSON_ORIGIN,
    )
    assert r.status_code == 201, r.text
    assert r.json() == {
        "issue_url": "https://github.com/agn-it/test-reports/issues/7",
        "issue_number": 7,
    }
    assert len(gh_calls) == 1
    call = gh_calls[0]
    assert call.url.path == "/repos/agn-it/test-reports/issues"
    assert call.headers["authorization"].startswith("Bearer ")
    assert "ghp_test-token-value" not in call.content.decode()  # never in the body
    payload = call.content.decode()
    assert "Picklist opens over the field name" in payload
    assert "https://owner.example.com/owner/company.html?id=abc" in payload
    assert "![screenshot](https://cloud.example.com/api/v1/issue-attachments/aa11)" in payload


def test_github_issue_rejected_without_owner_sign_in(mclient: TestClient) -> None:
    r = mclient.post(
        "/api/owner/github/issues",
        json={"title": "x", "body": "y", "page_url": "/owner"},
        headers=JSON_ORIGIN,
    )
    assert r.status_code == 401


# --- screenshot attachments (D-085) ---


def test_attachment_upload_and_public_get(mclient: TestClient) -> None:
    auth = signup_user(mclient)
    r = mclient.post(
        "/api/v1/issue-attachments",
        content=PNG_1PX,
        headers={**auth, "content-type": "image/png"},
    )
    assert r.status_code == 201, r.text
    url = r.json()["url"]
    assert url.startswith("https://cloud.example.com/api/v1/issue-attachments/")
    token = url.rsplit("/", 1)[1]
    assert len(token) == 32
    got = mclient.get(f"/api/v1/issue-attachments/{token}")
    assert got.status_code == 200
    assert got.content == PNG_1PX
    assert got.headers["content-type"] == "image/png"


def test_attachment_rejects_anonymous_wrong_type_and_oversize(mclient: TestClient) -> None:
    assert (
        mclient.post(
            "/api/v1/issue-attachments", content=PNG_1PX, headers={"content-type": "image/png"}
        ).status_code
        == 401
    )
    auth = signup_user(mclient)
    r = mclient.post(
        "/api/v1/issue-attachments",
        content=b"not an image",
        headers={**auth, "content-type": "text/plain"},
    )
    assert r.status_code == 400
    r = mclient.post(
        "/api/v1/issue-attachments",
        content=b"x" * (5 * 1024 * 1024 + 1),
        headers={**auth, "content-type": "image/png"},
    )
    assert r.status_code == 413
    assert mclient.get("/api/v1/issue-attachments/" + "0" * 32).status_code == 404
    assert mclient.get("/api/v1/issue-attachments/not-a-token").status_code == 404


# --- bug reports (D-086) --------------------------------------------------------------------------


def report_bug(mclient: TestClient, auth: dict[str, str], **over: Any) -> httpx2.Response:
    body: dict[str, Any] = {
        "title": "The model picker is empty",
        "description": "No models show for OpenAI on the company page.",
        "page_url": "/admin/company",
    }
    body.update(over)
    return mclient.post("/api/v1/bug-reports", json=body, headers=auth)


def test_bug_report_lifecycle(
    mclient: TestClient, owner_client: TestClient, gh_calls: list[httpx.Request]
) -> None:
    auth = signup_user(mclient)
    assert (
        mclient.post("/api/v1/bug-reports", json={"title": "x", "description": "y"}).status_code
        == 401
    )
    r = report_bug(mclient, auth)
    assert r.status_code == 201, r.text
    report_id = r.json()["id"]
    r = owner_client.get("/api/owner/bug-reports")
    assert r.status_code == 200, r.text
    mine = [x for x in r.json()["reports"] if x["id"] == report_id]
    assert len(mine) == 1
    assert mine[0]["status"] == "new"
    assert mine[0]["company_name"] == "Acme"
    assert mine[0]["user_email"] == "admin@acme.test"
    # Review: edit + mark reviewed.
    r = owner_client.patch(
        f"/api/owner/bug-reports/{report_id}",
        json={"title": "The model picker is empty (OpenAI)", "status": "reviewed"},
        headers=JSON_ORIGIN,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "reviewed"
    assert r.json()["title"] == "The model picker is empty (OpenAI)"
    r = owner_client.patch(
        f"/api/owner/bug-reports/{report_id}",
        json={"status": "bogus"},
        headers=JSON_ORIGIN,
    )
    assert r.status_code == 400
    # Submit needs GitHub connected.
    r = owner_client.post(
        f"/api/owner/bug-reports/{report_id}/submit", json={}, headers=JSON_ORIGIN
    )
    assert r.status_code == 409
    assert r.json()["code"] == "github_not_configured"
    owner_client.put(
        "/api/owner/github",
        json={"repo": "agn-it/test-reports", "token": "ghp_test-token-value"},
        headers=JSON_ORIGIN,
    )
    r = owner_client.post(
        f"/api/owner/bug-reports/{report_id}/submit", json={}, headers=JSON_ORIGIN
    )
    assert r.status_code == 200, r.text
    assert r.json()["issue_url"] == "https://github.com/agn-it/test-reports/issues/7"
    assert len(gh_calls) == 1
    payload = gh_calls[0].content.decode()
    assert "The model picker is empty (OpenAI)" in payload
    assert "No models show for OpenAI" in payload
    assert "Reported by admin@acme.test (Acme)" in payload
    r = owner_client.get("/api/owner/bug-reports?status=submitted")
    mine = [x for x in r.json()["reports"] if x["id"] == report_id]
    assert len(mine) == 1
    assert mine[0]["github_issue_url"].endswith("/issues/7")


def test_bug_report_validation(mclient: TestClient) -> None:
    auth = signup_user(mclient)
    r = mclient.post("/api/v1/bug-reports", json={"title": "", "description": "y"}, headers=auth)
    assert r.status_code == 400
    r = mclient.post(
        "/api/v1/bug-reports",
        json={"title": "x", "description": "y", "screenshot_url": "https://evil.example/x.png"},
        headers=auth,
    )
    assert r.status_code == 400


def test_bug_report_with_uploaded_screenshot(
    mclient: TestClient, owner_client: TestClient, gh_calls: list[httpx.Request]
) -> None:
    """The real client flow: the upload answers with an absolute URL, the report accepts
    it, and the submitted GitHub issue carries the absolute screenshot link."""
    auth = signup_user(mclient)
    up = mclient.post(
        "/api/v1/issue-attachments",
        content=PNG_1PX,
        headers={**auth, "content-type": "image/png"},
    )
    assert up.status_code == 201, up.text
    url = up.json()["url"]
    assert url.startswith("https://cloud.example.com/api/v1/issue-attachments/")
    r = report_bug(mclient, auth, screenshot_url=url)
    assert r.status_code == 201, r.text
    report_id = r.json()["id"]
    owner_client.put(
        "/api/owner/github",
        json={"repo": "agn-it/test-reports", "token": "<redacted>"},
        headers=JSON_ORIGIN,
    )
    r = owner_client.post(
        f"/api/owner/bug-reports/{report_id}/submit", json={}, headers=JSON_ORIGIN
    )
    assert r.status_code == 200, r.text
    payload = gh_calls[-1].content.decode()
    assert f"![screenshot]({url})" in payload


# --- client billing (D-090) -----------------------------------------------------------------------


def test_billing_trial_and_growth(
    mclient: MailClient, crm_secret: str, owner_client: TestClient
) -> None:
    save_platform_mailbox(owner_client)
    auth = signup_user(mclient, email="trial@acme.test")
    r = mclient.get("/api/v1/billing", headers=auth)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["plan"] == "trial"
    assert body["plan_name"] == "Trial"
    assert body["price_aed"] == 0
    assert body["currency"] == "AED"
    assert body["billing_period"] == "monthly"
    assert body["upgrade_url"] == "https://billing.zohosecure.com/subscribe/395005657ac33fead73baa455ab040b3b9de07abf9a0975fad482bf477cf719e/SHIELD-STARTER"
    assert mclient.get("/api/v1/billing").status_code == 401

    assert crm_create(mclient, crm_secret, admin_email="growth@acme.test").status_code == 201
    code = request_code(mclient, "growth@acme.test", purpose="signup")
    r = mclient.post(
        "/api/v1/auth/otp/verify",
        json={"email": "growth@acme.test", "code": code, "purpose": "signup"},
    )
    assert r.status_code == 200, r.text
    auth2 = {"authorization": f"Bearer {r.json()['token']}"}
    # The OTP session forces a password first: the first password needs no current
    # one (the CRM admin's password is random and unknown), then billing opens.
    r = mclient.post(
        "/api/v1/auth/password",
        json={"current": "", "new": PASSWORD},
        headers=auth2,
    )
    assert r.status_code == 200, r.text
    r = mclient.get("/api/v1/billing", headers=auth2)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["plan"] == "growth"
    assert body["plan_name"] == "Growth"
    assert body["price_aed"] == 2490
    assert body["seats"] == 10
    assert body["zoho_plan_code"] == "SHIELD-GROWTH"
    assert body["paid_until"]
    assert body["paid_until"] > now_ms()
    assert body["upgrade_url"] == "https://billing.zohosecure.com/subscribe/395005657ac33fead73baa455ab040b3b9de07abf9a0975fad482bf477cf719e/SHIELD-SCALE"


# --- platform sender read model (D-089) -----------------------------------------------------------


def test_sender_read_model_and_test_tracking(owner_client: TestClient) -> None:
    r = owner_client.get("/api/owner/sender")
    assert r.status_code == 200, r.text
    assert r.json() == {"configured": False}
    save_platform_mailbox(owner_client)
    r = owner_client.get("/api/owner/sender")
    assert r.json()["configured"] is True
    assert r.json()["from_address"] == "sales-shield@agncompu.com"
    assert r.json()["host"] == "smtp.example.test"
    assert r.json()["tested_at"] is None
    assert r.json()["test_ok"] is None
    r = owner_client.post("/api/owner/smtp/test", json={}, headers=JSON_ORIGIN)
    assert r.status_code == 200
    assert r.json()["ok"] is True
    r = owner_client.get("/api/owner/sender")
    assert r.json()["test_ok"] is True
    assert r.json()["tested_at"] is not None
