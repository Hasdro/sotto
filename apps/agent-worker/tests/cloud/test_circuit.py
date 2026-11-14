"""ZC-06: primary failures across tenants demote a vendor for everyone on the next config
refresh; it comes back after the demotion ends; one tenant alone cannot demote a vendor."""

from __future__ import annotations

from typing import Any

from starlette.testclient import TestClient

from sotto_worker.cloud.owner import platform
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import ORIGIN, SignUp

H = {"origin": ORIGIN}


def _report(client: TestClient, s: dict[str, Any], n: int, vendor: str = "groq") -> Any:
    return client.post(
        "/api/v1/provider-health",
        json={
            "failures": [{"provider": vendor, "stage": "suggest", "reason": "error", "count": n}]
        },
        headers=s["auth"],
    )


def test_failures_from_two_tenants_demote_the_primary_for_everyone(
    owner: TestClient, store: CloudStore, sign_up: SignUp
) -> None:
    a, b = sign_up("A", "a@a.test"), sign_up("B", "b@b.test")
    c = sign_up("C", "c@c.test")  # never reported anything
    assert _report(owner, a, 50).json()["demoted"] == {}  # one tenant's flood is not enough
    r = _report(owner, b, 3)
    assert r.status_code == 200
    assert "groq" in r.json()["demoted"]
    # The next 10-minute refresh carries it, and the bundle marks the stage for the router.
    f = owner.get("/api/v1/features", headers=c["auth"]).json()
    assert "groq" in f["demoted"]
    stages = owner.get("/api/v1/bundle", headers=c["auth"]).json()["stages"]
    assert stages["suggest"]["vendor"] == "groq"
    assert stages["suggest"]["demoted_until"] == f["demoted"]["groq"]
    assert "demoted_until" not in stages["suggest_backup"]  # the backup (Gemini) is not
    board = {p["id"]: p for p in owner.get("/api/owner/health").json()["providers"]}
    assert board["groq"]["demoted"] is True
    assert board["groq"]["companies_10m"] == 2
    assert board["groq"]["until"] > board["groq"]["since"]
    assert "platform.provider.demoted" in [x["action"] for x in store.owner_audit()]


def test_the_vendor_returns_after_the_demotion_ends(
    client: TestClient, store: CloudStore, sign_up: SignUp
) -> None:
    a, b = sign_up("A", "a@a.test"), sign_up("B", "b@b.test")
    _report(client, a, 5)
    _report(client, b, 5)
    until = platform.demotions(store)["groq"]
    assert platform.demotions(store, until + 1) == {}
    with store._tx() as db:  # time passes
        db.execute("UPDATE provider_demotions SET until = ?", (1,))
    assert client.get("/api/v1/features", headers=a["auth"]).json()["demoted"] == {}
    assert (
        "demoted_until"
        not in client.get("/api/v1/bundle", headers=a["auth"]).json()["stages"]["suggest"]
    )


def test_owner_can_demote_and_restore_by_hand(owner: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    r = owner.post("/api/owner/health/gemini/demote", json={"minutes": 30}, headers=H)
    assert next(p for p in r.json()["providers"] if p["id"] == "gemini")["manual"] is True
    assert "gemini" in owner.get("/api/v1/features", headers=s["auth"]).json()["demoted"]
    owner.delete("/api/owner/health/gemini/demote", headers=H)
    assert owner.get("/api/v1/features", headers=s["auth"]).json()["demoted"] == {}
    assert owner.post("/api/owner/health/nope/demote", json={}, headers=H).status_code == 404


def test_reports_are_validated_and_unknown_vendors_ignored(
    client: TestClient, sign_up: SignUp
) -> None:
    s = sign_up()
    assert _report(client, s, 1, vendor="my-ollama").json() == {"ok": True, "demoted": {}}
    bad = client.post(
        "/api/v1/provider-health",
        json={"failures": [{"provider": "groq", "stage": "suggest", "reason": "x"}]},
        headers=s["auth"],
    )
    assert bad.status_code == 400
    assert (
        client.post(
            "/api/v1/provider-health", json={"failures": [{}] * 21}, headers=s["auth"]
        ).status_code
        == 400
    )
    assert client.post("/api/v1/provider-health", json={"failures": []}).status_code == 401
