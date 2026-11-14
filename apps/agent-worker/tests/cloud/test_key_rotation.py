"""ZC-12 (D-061): AGN rotates a platform key without a release. The next bundle (the apps'
10-minute config refresh) carries the new key; the old one is retiring for its window, then gone;
no answer ever contains a key."""

from __future__ import annotations

from starlette.testclient import TestClient

from sotto_worker.cloud.owner import platform
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import ORIGIN, SignUp

H = {"origin": ORIGIN}
OLD = "gsk_" + "o" * 30
NEW = "gsk_" + "n" * 30


def _bundle_key(client: TestClient, auth: dict[str, str]) -> str | None:
    keys = client.get("/api/v1/bundle", headers=auth).json()["keys"] or {}
    return keys.get("GROQ_API_KEY")


def test_rotation_switches_on_the_next_refresh_and_retires_the_old_key(
    owner: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    s = sign_up()
    assert (
        owner.put("/api/owner/keys/GROQ_API_KEY", json={"value": OLD}, headers=H).status_code == 200
    )
    assert _bundle_key(owner, s["auth"]) == OLD

    r = owner.post("/api/owner/keys/GROQ_API_KEY/rotate", json={"value": NEW}, headers=H)
    assert r.status_code == 200, r.text
    assert OLD not in r.text
    assert NEW not in r.text
    rotation = r.json()["rotation"]
    assert rotation["retire_at"] - rotation["rotated_at"] == platform.ROTATE_WINDOW_MS
    # The next config refresh (a new bundle) has the new key; no release, no app change.
    assert _bundle_key(owner, s["auth"]) == NEW

    providers = owner.get("/api/owner/providers")
    assert OLD not in providers.text
    assert NEW not in providers.text
    groq = next(p for p in providers.json()["providers"] if p["id"] == "groq")
    assert groq["key_set"] is True

    status = platform.platform_key_status(store)["GROQ_API_KEY"]
    assert status["retiring"]["retire_at"] == rotation["retire_at"]
    assert platform.retiring_key(store, "GROQ_API_KEY", t=rotation["rotated_at"] + 1) == OLD
    # After its window the retiring key stops: not usable, not listed, deleted from the store.
    after = rotation["retire_at"] + 1
    assert platform.retiring_key(store, "GROQ_API_KEY", t=after) is None
    assert platform.purge_retired(store, t=after) == ["GROQ_API_KEY"]
    assert store._q("SELECT * FROM platform_keys_retiring") == []
    assert platform.platform_key_status(store)["GROQ_API_KEY"]["retiring"] is None
    audit = [r["action"] for r in store._q("SELECT action FROM audit")]
    assert "owner.key.rotated" in audit
    assert "owner.key.retired" in audit


def test_rotation_needs_an_existing_and_different_key(owner: TestClient) -> None:
    r = owner.post("/api/owner/keys/GROQ_API_KEY/rotate", json={"value": NEW}, headers=H)
    assert r.status_code == 404
    owner.put("/api/owner/keys/GROQ_API_KEY", json={"value": OLD}, headers=H)
    r = owner.post("/api/owner/keys/GROQ_API_KEY/rotate", json={"value": OLD}, headers=H)
    assert r.status_code == 400


def test_only_the_owner_rotates(client: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    r = client.post(
        "/api/owner/keys/GROQ_API_KEY/rotate", json={"value": NEW}, headers={**H, **s["auth"]}
    )
    assert r.status_code == 401


def test_deleting_a_key_also_drops_its_retiring_copy(owner: TestClient, store: CloudStore) -> None:
    owner.put("/api/owner/keys/GROQ_API_KEY", json={"value": OLD}, headers=H)
    owner.post("/api/owner/keys/GROQ_API_KEY/rotate", json={"value": NEW}, headers=H)
    owner.delete("/api/owner/keys/GROQ_API_KEY", headers=H)
    assert store._q("SELECT * FROM platform_keys_retiring") == []
