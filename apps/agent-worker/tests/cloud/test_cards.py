"""Tests for CardToneStore, HTTP RBAC/isolation/D-036 gates, and owner routes (C3, D-094)."""

from __future__ import annotations

import sqlite3
from typing import Any

from starlette.testclient import TestClient

from sotto_worker.cloud.cards.store import (
    DEFAULT_BANNED_AR,
    DEFAULT_BANNED_EN,
    HOW_WE_TALK_MAX,
    CardToneStore,
)
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import ORIGIN, PASSWORD, SignUp


def _store() -> CardToneStore:
    conn = sqlite3.connect(":memory:")
    return CardToneStore(conn)


def test_tone_precedence_platform_company_agent() -> None:
    s = _store()
    eff0 = s.resolve("co-a", "user-1")
    assert eff0.tone == "casual"
    assert eff0.source == "platform"
    assert "I hear you" in eff0.banned_en
    assert DEFAULT_BANNED_AR[0] in eff0.banned_ar

    s.set_company_settings(
        "co-a",
        default_tone="direct",
        allowed_presets=["direct", "warm"],
        how_we_talk="Short, confident, numbers-first.",
        banned_en=["Actually"],
        banned_ar=["بصراحة"],
    )
    eff1 = s.resolve("co-a", "user-1")
    assert eff1.tone == "direct"
    assert eff1.source == "company"
    assert eff1.how_we_talk == "Short, confident, numbers-first."
    assert "Actually" in eff1.banned_en
    assert DEFAULT_BANNED_EN[0] in eff1.banned_en
    assert "بصراحة" in eff1.banned_ar

    s.set_agent_tone("co-a", "user-1", "warm")
    eff2 = s.resolve("co-a", "user-1")
    assert eff2.tone == "warm"
    assert eff2.source == "agent"

    try:
        s.set_agent_tone("co-a", "user-1", "formal")
        raise AssertionError("expected PermissionError for disallowed preset")
    except PermissionError:
        pass

    s.set_company_settings("co-a", default_tone="direct", allowed_presets=["direct"])
    eff3 = s.resolve("co-a", "user-1")
    assert eff3.tone == "direct"
    assert eff3.source == "company"


def test_how_we_talk_length_limit() -> None:
    s = _store()
    try:
        s.set_company_settings("co-a", how_we_talk="x" * (HOW_WE_TALK_MAX + 1))
        raise AssertionError("expected ValueError for how_we_talk > 200 chars")
    except ValueError:
        pass


def test_company_isolation_a_cannot_see_or_affect_b() -> None:
    s = _store()
    s.set_company_settings(
        "co-a",
        default_tone="formal",
        allowed_presets=["formal"],
        how_we_talk="Executive boardroom style",
        banned_en=["yo"],
    )
    s.set_agent_tone("co-a", "shared-user-id", "formal")

    eff_b = s.resolve("co-b", "shared-user-id")
    assert eff_b.tone == "casual"
    assert eff_b.source == "platform"
    assert eff_b.how_we_talk == ""
    assert "yo" not in eff_b.banned_en

    # Up to 50 platform phrases still preserve company-specific banned phrases (merged cap = 100).
    plat_50 = [f"PlatformPhrase{i}" for i in range(50)]
    s.set_platform_banned(en=plat_50, ar=["أفهمك تماماً"])
    eff_a = s.resolve("co-a")
    assert "PlatformPhrase0" in eff_a.banned_en
    assert "yo" in eff_a.banned_en
    assert "yo" not in s.resolve("co-b").banned_en


def _sign_in_agent(client: TestClient, sign_up: SignUp, email: str) -> Any:
    co = sign_up(company=f"Co-{email}", email=f"admin-{email}")
    cid = str(co["company"]["id"])
    inv = client.post(
        "/api/v1/team",
        headers=co["auth"],
        json={"email": email, "name": "Agent User", "role": "agent"},
    )
    assert inv.status_code == 201, inv.text
    temp_pw = str(inv.json()["temporary_password"])
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": email,
            "password": temp_pw,
            "device": {"id": f"dev-{email}", "platform": "web", "label": "Chrome"},
        },
    )
    assert login.status_code == 200, login.text
    agent_auth = {"authorization": f"Bearer {login.json()['token']}"}
    pw = client.post(
        "/api/v1/auth/password",
        headers=agent_auth,
        json={"current": temp_pw, "new": PASSWORD + "-agent"},
    )
    assert pw.status_code == 200, pw.text
    return co, agent_auth, cid


def test_owner_banned_requires_owner_auth(client: TestClient) -> None:
    assert client.get("/api/owner/cards/banned").status_code in (401, 403)


def test_http_routes_rbac_isolation_feature_gate_and_owner(
    client: TestClient, sign_up: SignUp, owner: TestClient, store: CloudStore
) -> None:
    co_a, agent_a_auth, cid_a = _sign_in_agent(client, sign_up, "agent-a@co-a.test")
    co_b, _agent_b_auth, _cid_b = _sign_in_agent(client, sign_up, "agent-b@co-b.test")

    # Unauthenticated requests -> 401
    assert client.get("/api/v1/cards/tone").status_code == 401

    # Admin updates Co A tone settings; Agent cannot call PUT /tone/company (403).
    assert (
        client.put(
            "/api/v1/cards/tone/company",
            headers=agent_a_auth,
            json={"default_tone": "warm"},
        ).status_code
        == 403
    )
    save = client.put(
        "/api/v1/cards/tone/company",
        headers=co_a["auth"],
        json={
            "default_tone": "direct",
            "allowed_presets": ["direct", "warm"],
            "how_we_talk": "Brief and clear.",
            "banned_en": ["SecretSauce"],
            "banned_ar": ["بصراحة"],
        },
    )
    assert save.status_code == 200, save.text

    # Invalid input types rejected with 400 (not 500 or char-splitting).
    for payload in (
        {"default_tone": 123},
        {"how_we_talk": 456},
        {"default_tone": "direct", "banned_en": "not-a-list"},
        {"default_tone": "unknown-preset"},
        {"default_tone": "direct", "how_we_talk": "x" * 201},
    ):
        assert (
            client.put("/api/v1/cards/tone/company", headers=co_a["auth"], json=payload).status_code
            == 400
        )

    # Agent A: invalid preset/type -> 400, disallowed preset -> 403, valid -> 200, clear -> 200.
    assert (
        client.put("/api/v1/cards/tone/agent", headers=agent_a_auth, json={"tone": 99}).status_code
        == 400
    )
    assert (
        client.put(
            "/api/v1/cards/tone/agent", headers=agent_a_auth, json={"tone": "nope"}
        ).status_code
        == 400
    )
    assert (
        client.put(
            "/api/v1/cards/tone/agent", headers=agent_a_auth, json={"tone": "formal"}
        ).status_code
        == 403
    )
    pick = client.put("/api/v1/cards/tone/agent", headers=agent_a_auth, json={"tone": "warm"})
    assert pick.status_code == 200
    assert pick.json()["tone"] == "warm"
    cleared = client.put("/api/v1/cards/tone/agent", headers=agent_a_auth, json={"tone": ""})
    assert cleared.status_code == 200
    assert cleared.json()["tone"] == "direct"
    # Re-pick warm so agent_tone_settings cascade deletion is exercised below.
    pick2 = client.put("/api/v1/cards/tone/agent", headers=agent_a_auth, json={"tone": "warm"})
    assert pick2.status_code == 200

    b_tone = client.get("/api/v1/cards/tone", headers=co_b["auth"])
    assert b_tone.status_code == 200
    assert b_tone.json()["tone"] == "casual"
    assert "SecretSauce" not in b_tone.json()["banned_en"]

    bundle_a = client.get("/api/v1/bundle", headers=agent_a_auth).json()
    assert bundle_a["card_tone"]["tone"] == "warm"
    assert bundle_a["card_tone"]["how_we_talk"] == "Brief and clear."
    assert "call_state" in bundle_a["prompts"]

    # D-036: disabling card_style_v2 / call_state at org level blocks routes & withholds bundle.
    assert (
        client.put(
            "/api/v1/company/features/card_style_v2",
            headers=co_a["auth"],
            json={"enabled": False},
        ).status_code
        == 200
    )
    assert (
        client.put(
            "/api/v1/company/features/call_state",
            headers=co_a["auth"],
            json={"enabled": False},
        ).status_code
        == 200
    )
    assert client.get("/api/v1/cards/tone", headers=agent_a_auth).status_code == 403
    bundle_off = client.get("/api/v1/bundle", headers=agent_a_auth).json()
    assert bundle_off["card_tone"] is None
    assert "call_state" not in bundle_off["prompts"]

    # Owner updates platform banned phrases and verifies audit log + company deletion cascade.
    own_put = owner.put(
        "/api/owner/cards/banned",
        headers={"origin": ORIGIN},
        json={"en": ["I hear you", "OwnerGlobalBan"], "ar": []},
    )
    assert own_put.status_code == 200, own_put.text
    assert "OwnerGlobalBan" in owner.get("/api/owner/cards/banned").json()["en"]

    audits = store.owner_audit(cid_a)
    assert any(a["action"] == "cards.tone.company" for a in audits)

    # Store-level guards: empty company_id / non-member user rejected
    tone_store = CardToneStore(store)
    for bad_fn in (
        lambda: tone_store.get_company_settings(""),
        lambda: tone_store.set_agent_tone(cid_a, "nonexistent-user", "warm"),
    ):
        try:
            bad_fn()
            raise AssertionError("expected ValueError")
        except ValueError:
            pass

    # Deleting Co A removes its company_tone_settings and agent_tone_settings rows via FK cascade.
    assert store._q("SELECT 1 FROM company_tone_settings WHERE company_id = ?", (cid_a,)) != []
    assert store._q("SELECT 1 FROM agent_tone_settings WHERE company_id = ?", (cid_a,)) != []
    owner_del = owner.delete(
        f"/api/owner/companies/{cid_a}",
        params={"confirm": "Co-agent-a@co-a.test"},
        headers={"origin": ORIGIN},
    )
    assert owner_del.status_code == 200, owner_del.text
    assert store._q("SELECT 1 FROM company_tone_settings WHERE company_id = ?", (cid_a,)) == []
    assert store._q("SELECT 1 FROM agent_tone_settings WHERE company_id = ?", (cid_a,)) == []
