"""DD-2 (R6): the prompt studio. Create v2, test it on the recorded calls (quality + latency),
publish, roll back to v1; the next session config carries the published version; the most
specific level wins; company A can never read or change company B's prompts."""

from __future__ import annotations

from typing import Any

from starlette.testclient import TestClient

from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from tests.cloud.byo import allow_byo
from tests.cloud.conftest import ORIGIN, SignUp

H = {"origin": ORIGIN}


def _v2_body(seed: Seed, marker: str) -> str:
    return str(seed.prompts["suggest"]["body"]).rstrip() + f"\n\n{marker}\n"


def _new(c: TestClient, body: str, **extra: Any) -> dict[str, Any]:
    r = c.post("/api/owner/prompts", json={"key": "suggest", "body": body, **extra}, headers=H)
    assert r.status_code == 201, r.text
    out: dict[str, Any] = r.json()
    return out


def test_create_test_publish_and_roll_back(owner: TestClient, seed: Seed, sign_up: SignUp) -> None:
    s = sign_up()
    seed_version = int(seed.prompts["suggest"]["version"])
    v2 = _new(owner, _v2_body(seed, "Keep it under twenty words. V2-MARKER"))
    assert v2["version"] == seed_version + 1
    assert v2["status"] == "draft"
    r = owner.post(f"/api/owner/prompts/{v2['id']}/publish", json={}, headers=H)
    assert r.status_code == 409
    assert r.json()["code"] == "untested"
    tested = owner.post(f"/api/owner/prompts/{v2['id']}/test", json={}, headers=H).json()
    t = tested["test"]
    assert t["synthetic"] is True
    assert t["passed"] is True
    assert 0 < t["quality"] <= 1
    assert t["p95_ms"] <= 1500
    assert t["agent_triggered"] == 0
    assert t["p50_ms"] > 0
    assert (
        owner.post(f"/api/owner/prompts/{v2['id']}/publish", json={}, headers=H).json()["status"]
        == "published"
    )
    b = owner.get("/api/v1/bundle", headers=s["auth"]).json()
    assert "V2-MARKER" in b["prompts"]["suggest"]["body"]
    assert b["prompts"]["suggest"]["version"] == seed_version + 1
    v3 = _new(owner, _v2_body(seed, "V3-MARKER"))
    owner.post(f"/api/owner/prompts/{v3['id']}/test", json={}, headers=H)
    owner.post(f"/api/owner/prompts/{v3['id']}/publish", json={}, headers=H)
    # One-click rollback: publish v2 again (it was tested and published before).
    owner.post(f"/api/owner/prompts/{v2['id']}/publish", json={}, headers=H)
    assert (
        "V2-MARKER"
        in owner.get("/api/v1/bundle", headers=s["auth"]).json()["prompts"]["suggest"]["body"]
    )
    # And back to the seed version (v1) for this level.
    owner.post(f"/api/owner/prompts/{v2['id']}/unpublish", json={}, headers=H)
    p = owner.get("/api/v1/bundle", headers=s["auth"]).json()["prompts"]["suggest"]
    assert p["version"] == seed_version
    assert "V2-MARKER" not in p["body"]
    listed = owner.get("/api/owner/prompts").json()["prompts"]
    suggest = next(x for x in listed if x["key"] == "suggest")
    assert [v["version"] for v in suggest["versions"]] == [seed_version + 1, seed_version + 2]


def test_unknown_variables_and_failing_versions_are_refused(owner: TestClient, seed: Seed) -> None:
    r = owner.post(
        "/api/owner/prompts",
        json={"key": "suggest", "body": "Answer {{crm.secret_field}} now please, briefly."},
        headers=H,
    )
    assert r.status_code == 400
    assert "crm.secret_field" in r.json()["error"]
    assert (
        owner.post(
            "/api/owner/prompts", json={"key": "nope", "body": "x" * 40}, headers=H
        ).status_code
        == 404
    )


def test_the_most_specific_level_wins_and_company_overrides_are_owner_written(
    owner: TestClient, seed: Seed, sign_up: SignUp
) -> None:
    a, b = sign_up("A", "a@a.test"), sign_up("B", "b@b.test")
    plat = _new(owner, _v2_body(seed, "PLATFORM-MARKER"))
    mine = _new(
        owner,
        _v2_body(seed, "A-ONLY-MARKER"),
        scope="company",
        company_id=a["company"]["id"],
    )
    for v in (plat, mine):
        owner.post(f"/api/owner/prompts/{v['id']}/test", json={}, headers=H)
        owner.post(f"/api/owner/prompts/{v['id']}/publish", json={}, headers=H)
    pa = owner.get("/api/v1/bundle", headers=a["auth"]).json()["prompts"]["suggest"]
    pb = owner.get("/api/v1/bundle", headers=b["auth"]).json()["prompts"]["suggest"]
    assert "A-ONLY-MARKER" in pa["body"]
    assert pa["scope"] == "company"
    assert "PLATFORM-MARKER" in pb["body"]
    assert "A-ONLY" not in pb["body"]


def test_company_a_cannot_read_or_change_company_b_prompts(
    client: TestClient, store: CloudStore, seed: Seed, sign_up: SignUp
) -> None:
    a, b = sign_up("A", "a@a.test"), sign_up("B", "b@b.test")
    allow_byo(store, a)
    allow_byo(store, b)
    r = client.post(
        "/api/v1/company/prompts",
        json={"key": "suggest", "body": _v2_body(seed, "B-SECRET-MARKER")},
        headers=b["auth"],
    )
    assert r.status_code == 201, r.text
    vb = r.json()
    assert vb["scope"] == "company"
    assert vb["company_id"] == b["company"]["id"]
    # A company cannot write the platform level or another company's level.
    r = client.post(
        "/api/v1/company/prompts",
        json={"key": "suggest", "body": _v2_body(seed, "X"), "scope": "platform"},
        headers=a["auth"],
    )
    assert r.status_code == 403
    r = client.post(
        "/api/v1/company/prompts",
        json={"key": "suggest", "body": _v2_body(seed, "X"), "company_id": b["company"]["id"]},
        headers=a["auth"],
    )
    assert r.status_code == 201
    assert r.json()["company_id"] == a["company"]["id"]
    listed = client.get("/api/v1/company/prompts", headers=a["auth"]).text
    assert "B-SECRET-MARKER" not in listed
    for action in ("test", "publish", "unpublish"):
        r = client.post(f"/api/v1/company/prompts/{vb['id']}/{action}", json={}, headers=a["auth"])
        assert r.status_code == 404, action
    # B's own version applies to B only, after its test, while BYO is on.
    client.post(f"/api/v1/company/prompts/{vb['id']}/test", json={}, headers=b["auth"])
    r = client.post(f"/api/v1/company/prompts/{vb['id']}/publish", json={}, headers=b["auth"])
    assert r.status_code == 200
    assert (
        "B-SECRET-MARKER"
        in client.get("/api/v1/bundle", headers=b["auth"]).json()["prompts"]["suggest"]["body"]
    )
    assert "B-SECRET-MARKER" not in client.get("/api/v1/bundle", headers=a["auth"]).text
    with store._tx() as db:  # AGN switches B's BYO off: its own version stops applying
        db.execute("DELETE FROM company_byo WHERE company_id = ?", (b["company"]["id"],))
    assert "B-SECRET-MARKER" not in client.get("/api/v1/bundle", headers=b["auth"]).text


def test_agents_cannot_use_company_prompt_routes(
    client: TestClient, store: CloudStore, sign_up: SignUp
) -> None:
    from tests.cloud.test_security import _login

    a = sign_up()
    allow_byo(store, a)
    temp = client.post(
        "/api/v1/team",
        json={"email": "ag@a.test", "name": "Ag", "role": "agent"},
        headers=a["auth"],
    ).json()["temporary_password"]
    tok = _login(client, "ag@a.test", temp).json()["token"]
    agent = {"authorization": f"Bearer {tok}"}
    client.post(
        "/api/v1/auth/password",
        json={"current": temp, "new": "x" * 6 + "-Long-pass-1"},
        headers=agent,
    )
    assert client.get("/api/v1/company/prompts", headers=agent).status_code == 403


def test_team_versions_of_two_companies_never_touch_each_other(
    client: TestClient, store: CloudStore, seed: Seed, sign_up: SignUp
) -> None:
    """Tenancy review: the same free-text team id in two companies is two separate slots."""
    a, b = sign_up("A", "a@a.test"), sign_up("B", "b@b.test")
    allow_byo(store, a)
    allow_byo(store, b)

    def team_version(s: dict[str, Any], marker: str) -> dict[str, Any]:
        r = client.post(
            "/api/v1/company/prompts",
            json={
                "key": "suggest",
                "body": _v2_body(seed, marker),
                "scope": "team",
                "scope_id": "sales",
            },
            headers=s["auth"],
        )
        assert r.status_code == 201, r.text
        v: dict[str, Any] = r.json()
        client.post(f"/api/v1/company/prompts/{v['id']}/test", json={}, headers=s["auth"])
        assert (
            client.post(
                f"/api/v1/company/prompts/{v['id']}/publish", json={}, headers=s["auth"]
            ).status_code
            == 200
        )
        return v

    vb = team_version(b, "B-TEAM")
    va = team_version(a, "A-TEAM")
    assert va["version"] == vb["version"]  # numbering is per company: no count leaks across
    team_version(a, "A-TEAM-2")
    client.post(f"/api/v1/company/prompts/{va['id']}/unpublish", json={}, headers=a["auth"])
    rows = store._q("SELECT status FROM prompt_versions WHERE id = ?", (vb["id"],))
    assert rows[0]["status"] == "published"


def test_deleting_a_company_removes_its_platform_rows(
    owner: TestClient, store: CloudStore, seed: Seed, sign_up: SignUp
) -> None:
    s = sign_up()
    cid = s["company"]["id"]
    allow_byo(store, s)
    owner.post(
        "/api/v1/company/prompts",
        json={"key": "suggest", "body": _v2_body(seed, "GONE")},
        headers=s["auth"],
    )
    owner.post(
        "/api/v1/provider-health",
        json={"failures": [{"provider": "groq", "stage": "suggest", "reason": "error"}]},
        headers=s["auth"],
    )
    assert owner.delete(f"/api/owner/companies/{cid}?confirm=Acme", headers=H).status_code == 200
    for table in ("prompt_versions", "company_byo", "provider_failures"):
        assert store._q(f"SELECT * FROM {table} WHERE company_id = ?", (cid,)) == [], table  # noqa: S608
