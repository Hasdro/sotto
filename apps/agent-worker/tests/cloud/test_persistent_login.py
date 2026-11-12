"""Persistent login (R9, D-029): short access token + rotating refresh token, 90-day sliding window,
reuse revokes the device session, 0.2.0 tokens migrate without a new sign-in."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud import auth
from sotto_worker.cloud import store as store_module
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import ORIGIN, PASSWORD, SignUp

DAY = 86_400_000
DEVICE = {"id": "mac-1", "platform": "mac", "label": "Mac app", "app_version": "0.3.0"}


def bearer(token: str) -> dict[str, str]:
    return {"authorization": f"Bearer {token}"}


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> Callable[[int], None]:
    """Moves the store's clock forward by `ms` from now."""
    offset = [0]
    monkeypatch.setattr(store_module, "now_ms", lambda: int(time.time() * 1000) + offset[0])

    def forward(ms: int) -> None:
        offset[0] += ms

    return forward


def login_pair(client: TestClient, email: str = "admin@acme.test") -> dict[str, Any]:
    r = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD, "device": DEVICE, "session": "pair"},
    )
    assert r.status_code == 200, r.text
    body: dict[str, Any] = r.json()
    return body


def refresh(client: TestClient, token: str) -> Any:
    return client.post("/api/v1/auth/refresh", json={"refresh_token": token})


def test_sign_in_gives_a_short_access_token_and_a_refresh_token(
    client: TestClient, sign_up: SignUp
) -> None:
    sign_up()
    s = login_pair(client)
    assert s["token"].startswith(auth.ACCESS_PREFIX)
    assert s["refresh_token"].startswith(auth.REFRESH_PREFIX)
    now = int(time.time() * 1000)
    assert abs(s["access_expires_at"] - (now + auth.ACCESS_TTL_MS)) < 5000
    assert abs(s["refresh_expires_at"] - (now + 90 * DAY)) < 5000
    assert s["user"]["email"] == "admin@acme.test"
    assert "features" in s
    assert client.get("/api/v1/me", headers=bearer(s["token"])).status_code == 200


def test_rotation_gives_a_new_pair_and_retires_the_old_one(
    client: TestClient, sign_up: SignUp
) -> None:
    sign_up()
    s = login_pair(client)
    r = refresh(client, s["refresh_token"])
    assert r.status_code == 200, r.text
    n = r.json()
    assert n["token"] != s["token"]
    assert n["refresh_token"] != s["refresh_token"]
    assert r.headers["cache-control"] == "no-store"
    assert client.get("/api/v1/me", headers=bearer(n["token"])).status_code == 200
    assert client.get("/api/v1/me", headers=bearer(s["token"])).status_code == 401
    # Rotating again keeps working: an active person is never asked to sign in.
    assert refresh(client, n["refresh_token"]).status_code == 200


def test_a_reused_refresh_token_revokes_the_device_session(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    sign_up()
    s = login_pair(client)
    other = login_pair(client)  # a second device session of the same person stays signed in
    n = refresh(client, s["refresh_token"]).json()
    stolen = refresh(client, s["refresh_token"])
    assert stolen.status_code == 401
    assert client.get("/api/v1/me", headers=bearer(n["token"])).status_code == 401
    assert refresh(client, n["refresh_token"]).status_code == 401
    assert client.get("/api/v1/me", headers=bearer(other["token"])).status_code == 200
    company = s["company"]["id"]
    assert any(i["action"] == "session.refresh_reused" for i in store.owner_audit(company))


def test_access_token_expires_in_an_hour_and_refresh_renews_it(
    client: TestClient, sign_up: SignUp, clock: Callable[[int], None]
) -> None:
    sign_up()
    s = login_pair(client)
    clock(auth.ACCESS_TTL_MS + 1000)
    assert client.get("/api/v1/me", headers=bearer(s["token"])).status_code == 401
    n = refresh(client, s["refresh_token"])
    assert n.status_code == 200
    assert client.get("/api/v1/me", headers=bearer(n.json()["token"])).status_code == 200


def test_ninety_days_unused_signs_out_but_the_window_slides(
    client: TestClient, sign_up: SignUp, clock: Callable[[int], None]
) -> None:
    sign_up()
    s = login_pair(client)
    # Used every 80 days: still signed in after 240 days.
    token = s["refresh_token"]
    for _ in range(3):
        clock(80 * DAY)
        r = refresh(client, token)
        assert r.status_code == 200, r.text
        token = r.json()["refresh_token"]
    clock(91 * DAY)
    assert refresh(client, token).status_code == 401


@pytest.mark.parametrize("how", ["logout", "password", "device", "deactivate"])
def test_signed_out_only_by_logout_password_revoke_or_deactivation(
    owner: TestClient, sign_up: SignUp, how: str
) -> None:
    sign_up()
    s = login_pair(owner)
    keep = login_pair(owner)
    h = bearer(keep["token"])
    if how == "logout":
        assert owner.post("/api/v1/auth/logout", headers=bearer(s["token"])).status_code == 200
    elif how == "password":
        r = owner.post(
            "/api/v1/auth/password", json={"current": PASSWORD, "new": PASSWORD + "-x"}, headers=h
        )
        assert r.status_code == 200
    elif how == "device":
        device = next(
            d for d in owner.get("/api/v1/devices", headers=h).json()["devices"] if d["this_device"]
        )
        assert owner.delete(f"/api/v1/devices/{device['id']}", headers=h).status_code == 200
    else:
        cid = s["company"]["id"]
        user = s["user"]["id"]
        # The owner cannot switch off a company's only admin through the app, so via the console.
        r = owner.post(
            f"/api/owner/users/{user}/active", json={"active": False}, headers={"origin": ORIGIN}
        )
        assert r.status_code == 200, (cid, r.text)
    assert refresh(owner, s["refresh_token"]).status_code == 401
    assert owner.get("/api/v1/me", headers=bearer(s["token"])).status_code == 401


def test_a_0_2_0_sign_in_still_gets_one_long_token(client: TestClient, sign_up: SignUp) -> None:
    """0.2.0 apps send no `session` field; they keep their 30-day token until they update."""
    sign_up()
    r = client.post(
        "/api/v1/auth/login", json={"email": "admin@acme.test", "password": PASSWORD}
    ).json()
    assert "refresh_token" not in r
    assert not r["token"].startswith(auth.ACCESS_PREFIX)
    assert client.get("/api/v1/me", headers=bearer(r["token"])).status_code == 200


def test_migration_from_a_0_2_0_token_needs_no_new_sign_in(
    client: TestClient, sign_up: SignUp, store: CloudStore, clock: Callable[[int], None]
) -> None:
    old = sign_up(id="mac-1", platform="mac")  # signup without `session`: a 0.2.0 token
    assert "refresh_token" not in old
    clock(20 * DAY)  # 0.2.0 has been in use for a while
    r = client.post("/api/v1/auth/migrate", headers=old["auth"])
    assert r.status_code == 200, r.text
    pair = r.json()
    assert pair["refresh_token"].startswith(auth.REFRESH_PREFIX)
    assert client.get("/api/v1/me", headers=old["auth"]).status_code == 401  # old token retired
    h = bearer(pair["token"])
    assert client.get("/api/v1/me", headers=h).status_code == 200
    devices = client.get("/api/v1/devices", headers=h).json()["devices"]
    assert len(devices) == 1
    assert devices[0]["this_device"]
    # The new session has the full 90-day window, not the old token's remaining 10 days.
    clock(60 * DAY)
    assert refresh(client, pair["refresh_token"]).status_code == 200
    # A pair cannot be migrated again.
    again = login_pair(client)
    assert client.post("/api/v1/auth/migrate", headers=bearer(again["token"])).status_code == 400
    assert any(i["action"] == "session.migrated" for i in store.owner_audit(old["company"]["id"]))


def test_refresh_rejects_junk_and_is_rate_limited(client: TestClient, sign_up: SignUp) -> None:
    sign_up()
    assert refresh(client, "").status_code == 401
    assert refresh(client, "sr_" + "x" * 300).status_code == 401
    assert client.post("/api/v1/auth/refresh", content=b"[]").status_code == 400
    codes = {refresh(client, f"sr_unknown{i}").status_code for i in range(40)}
    assert 429 in codes
    # The owner's cookie session is untouched by any of this.


def test_owner_console_keeps_its_own_cookie_session(owner: TestClient, sign_up: SignUp) -> None:
    sign_up()
    assert owner.get("/api/owner/stats").status_code == 200
    cookie = owner.cookies.get("sotto_owner")
    assert cookie
    assert not cookie.startswith(auth.ACCESS_PREFIX)
    # An owner cookie is not an app token and cannot be refreshed into one.
    assert owner.get("/api/v1/me", headers=bearer(cookie)).status_code == 401
    assert refresh(owner, cookie).status_code == 401
