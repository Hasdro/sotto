"""ZC-12 (D-061, T-083 hub lines 1-4): a company at 100 % of its monthly spend cap gets no AGN
platform keys and no STT token; its own BYO keys still work; reporting usage sends the owner one
alert per level; the scheduler carries the spend, routing, key-purge and CSV jobs."""

from __future__ import annotations

import asyncio
import time
from typing import Any

from starlette.testclient import TestClient

from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from sotto_worker.outbox import EmailMessage
from tests.cloud.byo import allow_byo
from tests.cloud.conftest import ORIGIN, OWNER_EMAIL, SignUp, fake_minter

H = {"origin": ORIGIN}
GROQ = "gsk_" + "p" * 30
AAI = "aai-" + "q" * 20


def _report(client: TestClient, s: dict[str, Any], call_id: str) -> None:
    r = client.post(
        "/api/v1/usage",
        json={
            "call_id": call_id,
            "started_at": int(time.time() * 1000) - 600_000,
            "duration_s": 600,
            "cards": 4,
            "playbook_cards": 0,
            "ai_cards": 4,
            "holding_lines": 0,
            "escalations": 0,
        },
        headers=s["auth"],
    )
    assert r.status_code == 200, r.text


def _cap(owner: TestClient, s: dict[str, Any], usd: float | None) -> None:
    cid = s["company"]["id"]
    r = owner.put(f"/api/owner/companies/{cid}/spend-cap", json={"cap_usd": usd}, headers=H)
    assert r.status_code == 200, r.text


def _keys(client: TestClient, s: dict[str, Any]) -> dict[str, str]:
    return client.get("/api/v1/bundle", headers=s["auth"]).json()["keys"] or {}


def test_reaching_the_cap_withholds_platform_keys_and_stt_tokens(
    owner: TestClient, sign_up: SignUp
) -> None:
    s = sign_up()
    owner.put("/api/owner/keys/GROQ_API_KEY", json={"value": GROQ}, headers=H)
    owner.put("/api/owner/keys/ASSEMBLYAI_API_KEY", json={"value": AAI}, headers=H)
    _cap(owner, s, 1_000.0)
    assert _keys(owner, s) == {"GROQ_API_KEY": GROQ}
    assert owner.post("/api/v1/stt-token/assemblyai", headers=s["auth"]).status_code == 200

    _report(owner, s, "c1")
    _cap(owner, s, 0.000001)  # already over: 100 %
    assert _keys(owner, s) == {}
    r = owner.post("/api/v1/stt-token/assemblyai", headers=s["auth"])
    assert r.status_code == 402
    assert r.json()["code"] == "plan_blocked"

    _cap(owner, s, None)  # no cap: nothing enforced again
    assert _keys(owner, s) == {"GROQ_API_KEY": GROQ}


def test_byo_keys_keep_working_at_the_cap(
    owner: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    s = sign_up()
    allow_byo(store, s)
    owner.put("/api/owner/keys/ASSEMBLYAI_API_KEY", json={"value": AAI}, headers=H)
    own_groq = "gsk_" + "c" * 30
    own_aai = "aai-" + "c" * 20
    owner.put("/api/v1/company/keys/GROQ_API_KEY", json={"value": own_groq}, headers=s["auth"])
    _report(owner, s, "c1")
    _cap(owner, s, 0.000001)
    assert _keys(owner, s) == {"GROQ_API_KEY": own_groq}
    # No own STT key: the platform one is withheld.
    assert owner.post("/api/v1/stt-token/assemblyai", headers=s["auth"]).status_code == 402
    owner.put("/api/v1/company/keys/ASSEMBLYAI_API_KEY", json={"value": own_aai}, headers=s["auth"])
    assert owner.post("/api/v1/stt-token/assemblyai", headers=s["auth"]).status_code == 200


class FakeMailer:
    provider = "fake"

    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    async def send(self, message: EmailMessage, *, idempotency_key: str) -> None:
        self.sent.append(message)


def test_usage_sends_the_owner_one_alert_per_level(
    store: CloudStore, seed: Seed, sign_up: SignUp, owner: TestClient
) -> None:
    mailer = FakeMailer()
    config = CloudConfig(
        public_origin=ORIGIN,
        static_dir=None,
        secure_cookies=False,
        stt_minter=fake_minter,
        mailer=mailer,
    )
    mailed = TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)
    s = sign_up()
    _cap(owner, s, 0.000001)
    _report(mailed, s, "c1")
    _report(mailed, s, "c2")
    assert len(mailer.sent) == 1  # 80 % and 100 % crossed at once: one email, the 100 % one
    assert mailer.sent[0].to == OWNER_EMAIL
    assert "100 %" in mailer.sent[0].subject


def test_usage_without_a_mailbox_only_logs(owner: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    _cap(owner, s, 0.000001)
    _report(owner, s, "c1")  # no mailer configured: still 200, the alert row is kept


def test_scheduler_carries_the_wave_4_jobs(store: CloudStore, seed: Seed) -> None:
    app = create_cloud_app(CloudConfig(public_origin=ORIGIN, static_dir=None), store, seed)
    assert app.scheduler is not None
    names = set(app.scheduler.jobs)
    assert {
        "spend_cap_check",
        "routing_weekly",
        "key_rotation_purge",
        "zoho_csv_weekly",
        "coaching_weekly_digest",
        "zoho_watch_renewal",
    } <= names
    ran = asyncio.run(app.scheduler.tick())["jobs"]
    assert {"spend_cap_check", "routing_weekly", "key_rotation_purge", "zoho_csv_weekly"} <= set(
        ran
    )


def test_bootstrap_has_the_zoho_source(client: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    on = client.put(  # off by default (D-076)
        "/api/v1/company/features/playbook_bootstrap", json={"enabled": True}, headers=s["auth"]
    )
    assert on.status_code == 200, on.text
    r = client.get("/api/v1/playbook/bootstrap", headers=s["auth"])
    assert r.status_code == 200, r.text
    assert r.json()["zoho"] is False  # wired, but this person has no Zoho connection
