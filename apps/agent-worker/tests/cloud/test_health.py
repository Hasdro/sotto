"""ZC-14 (D-057): one config health per org in the session config, next to the feature map."""

from __future__ import annotations

from typing import Any

from starlette.testclient import TestClient

from sotto_worker.cloud.email import data as email_data
from sotto_worker.cloud.store import DAY_MS, CloudStore, now_ms
from tests.cloud.conftest import SignUp
from tests.cloud.test_zoho import REFRESH


def health(client: TestClient, auth: dict[str, str]) -> dict[str, Any]:
    r = client.get("/api/v1/features", headers=auth)
    assert r.status_code == 200, r.text
    assert "features" in r.json()
    out: dict[str, Any] = r.json()["health"]
    return out


def codes(h: dict[str, Any]) -> list[str]:
    return [r["code"] for r in h["reasons"]]


def company_of(store: CloudStore, email: str) -> str:
    return str(store._q("SELECT company_id FROM users WHERE email = ?", (email,))[0]["company_id"])


def set_company(store: CloudStore, company: str, **cols: Any) -> None:
    sql = {
        "trial_ends_at": "UPDATE companies SET trial_ends_at = ? WHERE id = ?",
        "minutes_month": "UPDATE companies SET minutes_month = ? WHERE id = ?",
    }
    for k, v in cols.items():
        store._db.execute(sql[k], (v, company))


def fresh_trial(store: CloudStore, company: str) -> None:
    set_company(store, company, trial_ends_at=now_ms() + 10 * DAY_MS)


def test_ok_when_nothing_needs_attention(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    s = sign_up()
    fresh_trial(store, company_of(store, "admin@acme.test"))
    h = health(client, s["auth"])
    assert h == {"status": "ok", "reasons": []}


def test_trial_ending(client: TestClient, sign_up: SignUp, store: CloudStore) -> None:
    s = sign_up()
    set_company(store, company_of(store, "admin@acme.test"), trial_ends_at=now_ms() + 2 * DAY_MS)
    h = health(client, s["auth"])
    assert h["status"] == "needs_attention"
    assert h["reasons"] == [{"code": "trial_ending", "fix": "/account#plan"}]


def test_minutes_low(client: TestClient, sign_up: SignUp, store: CloudStore) -> None:
    s = sign_up()
    company = company_of(store, "admin@acme.test")
    fresh_trial(store, company)
    set_company(store, company, minutes_month=100)
    user = store._q("SELECT id FROM users")[0]["id"]
    store._db.execute(
        "INSERT INTO usage(id, company_id, user_id, started_at, duration_s, cards,"
        " playbook_cards, ai_cards, holding_lines, escalations, platform, reported_at)"
        " VALUES ('u1', ?, ?, ?, ?, 0, 0, 0, 0, 0, 'mac', ?)",
        (company, user, now_ms(), 85 * 60, now_ms()),
    )
    assert codes(health(client, s["auth"])) == ["minutes_low"]


def test_smtp_failing_then_recovered(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    s = sign_up()
    company = company_of(store, "admin@acme.test")
    fresh_trial(store, company)
    email_data.ensure(store)
    user = store._q("SELECT id FROM users")[0]["id"]
    t = now_ms()
    store._db.execute(
        "INSERT INTO email_sends VALUES (?, 'a', ?, 'failed', ?)", (company, user, t - 1000)
    )
    assert codes(health(client, s["auth"])) == ["smtp_failing"]
    store._db.execute("INSERT INTO email_sends VALUES (?, 'b', ?, 'sent', ?)", (company, user, t))
    assert codes(health(client, s["auth"])) == []


def test_zoho_token_expired(client: TestClient, sign_up: SignUp, store: CloudStore) -> None:
    s = sign_up()
    company = company_of(store, "admin@acme.test")
    fresh_trial(store, company)
    user = store._q("SELECT id FROM users")[0]["id"]
    store.zoho_save_connection(
        company,
        user,
        refresh_token=REFRESH,
        accounts_server="https://accounts.zoho.com",
        api_domain="https://www.zohoapis.com",
        client_scope="org",
    )
    assert codes(health(client, s["auth"])) == []
    store._db.execute("UPDATE zoho_connections SET failed_at = ?", (now_ms(),))
    h = health(client, s["auth"])
    assert h["reasons"] == [{"code": "zoho_token_expired", "fix": "/settings#zoho"}]
    assert REFRESH not in str(h)


def test_company_a_never_sees_b_health(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    a = sign_up("Acme", "admin@acme.test")
    b = sign_up("Beta", "admin@beta.test", id="dev-2")
    fresh_trial(store, company_of(store, "admin@acme.test"))
    set_company(store, company_of(store, "admin@beta.test"), trial_ends_at=now_ms() + DAY_MS)
    assert codes(health(client, a["auth"])) == []
    assert codes(health(client, b["auth"])) == ["trial_ending"]
