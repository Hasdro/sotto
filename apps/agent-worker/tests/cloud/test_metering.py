"""ZC-12 (D-061): per-company metering from the calls the apps report, the owner's spend cap (no
default: "Cap not set" and nothing enforced), one 80 % alert and the 100 % cap behaviour."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.metering.prices import PriceTable, call_cost
from sotto_worker.cloud.metering.store import Metering
from sotto_worker.cloud.store import CloudStore
from tests.cloud.byo import allow_byo
from tests.cloud.conftest import ORIGIN, SignUp

H = {"origin": ORIGIN}


def _report(client: TestClient, s: dict[str, Any], call_id: str, minutes: int, ai: int) -> None:
    r = client.post(
        "/api/v1/usage",
        json={
            "call_id": call_id,
            "started_at": int(time.time() * 1000) - minutes * 60_000,
            "duration_s": minutes * 60,
            "cards": ai,
            "playbook_cards": 0,
            "ai_cards": ai,
            "holding_lines": 0,
            "escalations": 0,
        },
        headers=s["auth"],
    )
    assert r.status_code == 200, r.text


def _per_call(seed: Seed, minutes: int, ai: int) -> float:
    return call_cost(
        PriceTable.load(), seed.catalog, seed.routing, duration_s=minutes * 60, ai_cards=ai
    )


def test_usage_is_metered_per_company(
    client: TestClient, sign_up: SignUp, store: CloudStore, seed: Seed
) -> None:
    a = sign_up("Alpha", "admin@alpha.test")
    b = sign_up("Beta", "admin@beta.test")
    _report(client, a, "a1", 10, 4)
    _report(client, a, "a2", 10, 4)
    _report(client, b, "b1", 5, 1)
    m = Metering(store, seed)
    assert m.spend(a["company"]["id"]) == pytest.approx(2 * _per_call(seed, 10, 4))
    assert m.spend(b["company"]["id"]) == pytest.approx(_per_call(seed, 5, 1))
    assert m.spend(a["company"]["id"]) > 0


def test_no_cap_means_nothing_enforced_and_cap_not_set(
    owner: TestClient, sign_up: SignUp, store: CloudStore, seed: Seed
) -> None:
    s = sign_up()
    for i in range(5):
        _report(owner, s, f"c{i}", 60, 50)
    m = Metering(store, seed)
    cid = s["company"]["id"]
    assert m.cap_reached(cid) is False
    assert asyncio.run(m.check(cid, None)) == []
    row = next(c for c in owner.get("/api/owner/spend").json()["companies"] if c["id"] == cid)
    assert row["status"] == "cap_not_set"
    assert row["cap_usd"] is None
    assert row["spend_usd"] > 0
    assert row["estimate"] is True


def test_cap_alerts_once_at_80_and_caps_at_100(
    owner: TestClient, sign_up: SignUp, store: CloudStore, seed: Seed
) -> None:
    s = sign_up()
    cid = s["company"]["id"]
    one = _per_call(seed, 10, 4)
    r = owner.put(f"/api/owner/companies/{cid}/spend-cap", json={"cap_usd": one * 10}, headers=H)
    assert r.status_code == 200, r.text
    m = Metering(store, seed)
    sent: list[tuple[str, str]] = []

    async def send(subject: str, text: str) -> None:
        sent.append((subject, text))

    for i in range(8):  # 80 %
        _report(owner, s, f"x{i}", 10, 4)
    assert asyncio.run(m.check(cid, send)) == [80]
    assert asyncio.run(m.check(cid, send)) == []  # one alert, not one per check
    assert len(sent) == 1
    assert "80 %" in sent[0][0]
    assert m.cap_reached(cid) is False
    assert m.state(cid)["status"] == "alert"

    for i in range(8, 10):  # 100 %
        _report(owner, s, f"x{i}", 10, 4)
    assert asyncio.run(m.check_all(send)) == {cid: [100]}
    assert m.cap_reached(cid) is True
    assert m.state(cid)["status"] == "capped"
    assert m.state(cid)["alerts"] == [80, 100]
    assert "withheld" in sent[-1][1]

    # Clearing the cap returns to "Cap not set": nothing enforced.
    owner.put(f"/api/owner/companies/{cid}/spend-cap", json={"cap_usd": None}, headers=H)
    assert m.cap_reached(cid) is False
    assert m.state(cid)["status"] == "cap_not_set"


def test_byo_companies_are_metered_only_on_agns_routes(
    client: TestClient, sign_up: SignUp, store: CloudStore, seed: Seed
) -> None:
    s = sign_up()
    allow_byo(store, s)
    _report(client, s, "own", 30, 10)
    m = Metering(store, seed)
    cid = s["company"]["id"]
    assert m.spend(cid) == pytest.approx(_per_call(seed, 30, 10))  # BYO on, no own routes yet
    with store._tx() as db:
        for stage in ("stt", "suggest", "summary"):
            route = seed.routing.stages[stage]
            db.execute(
                "INSERT INTO company_routes(company_id, stage, provider_id, model, updated_at)"
                " VALUES (?,?,?,?,1)",
                (cid, stage, "groq" if stage != "stt" else "assemblyai", route.model),
            )
    assert m.spend(cid) == 0  # every metered stage runs on the company's own keys


def test_practice_calls_and_other_companies_are_not_counted(
    client: TestClient, sign_up: SignUp, store: CloudStore, seed: Seed
) -> None:
    a = sign_up("Alpha", "admin@alpha.test")
    b = sign_up("Beta", "admin@beta.test")
    with store._tx() as db:
        db.execute("UPDATE usage SET source = 'practice'")  # nothing yet: a no-op guard
    _report(client, b, "b1", 10, 4)
    assert Metering(store, seed).spend(a["company"]["id"]) == 0


def test_spend_cap_is_owner_only_and_validated(owner: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    cid = s["company"]["id"]
    for bad in (0, -1, "10", True):
        r = owner.put(f"/api/owner/companies/{cid}/spend-cap", json={"cap_usd": bad}, headers=H)
        assert r.status_code == 400, bad
    assert (
        owner.put("/api/owner/companies/nope/spend-cap", json={"cap_usd": 5}, headers=H).status_code
        == 404
    )
    r = owner.put(
        f"/api/owner/companies/{cid}/spend-cap",
        json={"cap_usd": 5},
        headers={**H, **s["auth"], "cookie": ""},
    )
    assert r.status_code == 401
