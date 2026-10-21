"""Call recordings (owner, 22 Oct 2026): upload by the agent who made the call, play by that agent
or the company's admins and managers, never across companies; WAV only, size-capped, 30 days."""

from __future__ import annotations

import os
import struct
import time
from pathlib import Path
from typing import Any

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.recordings import KEEP_S, Recordings
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import ORIGIN, PASSWORD, SignUp


def wav(samples: int = 160) -> bytes:
    data = b"\x01\x00" * samples
    return (
        b"RIFF"
        + struct.pack("<I", 36 + len(data))
        + b"WAVEfmt "
        + struct.pack("<IHHIIHH", 16, 1, 1, 16000, 32000, 2, 16)
        + b"data"
        + struct.pack("<I", len(data))
        + data
    )


@pytest.fixture
def rec_client(store: CloudStore, seed: Seed, tmp_path: Path) -> TestClient:
    config = CloudConfig(
        public_origin=ORIGIN,
        static_dir=None,
        recordings=Recordings(tmp_path / "recordings", min_free=0),
    )
    return TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)


def call(client: TestClient, auth: dict[str, str], call_id: str) -> None:
    body: dict[str, Any] = {
        "call_id": call_id,
        "started_at": int(time.time() * 1000) - 60_000,
        "duration_s": 60,
        "cards": 0,
        "playbook_cards": 0,
        "ai_cards": 0,
        "holding_lines": 0,
        "escalations": 0,
    }
    assert client.post("/api/v1/usage", json=body, headers=auth).status_code == 200


def put(client: TestClient, auth: dict[str, str], call_id: str, data: bytes) -> int:
    headers = {**auth, "content-type": "audio/wav"}
    return client.put(f"/api/v1/recordings/{call_id}", content=data, headers=headers).status_code


def login(client: TestClient, email: str) -> dict[str, str]:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    return {"authorization": f"Bearer {r.json()['token']}"}


def test_agent_uploads_and_admin_plays_but_other_company_cannot(
    rec_client: TestClient, sign_up: SignUp
) -> None:
    client = rec_client
    a = sign_up("Alpha", "admin@a.test")
    b = sign_up("Beta", "admin@b.test")
    ha, hb = a["auth"], b["auth"]
    call(client, ha, "call-1")
    assert put(client, ha, "call-1", wav()) == 200
    got = client.get("/api/v1/recordings/call-1", headers=ha)
    assert got.status_code == 200
    assert got.content == wav()
    assert got.headers["content-type"] == "audio/wav"
    usage = client.get("/api/v1/company/usage", headers=ha).json()["calls"]
    assert usage[0]["recording_bytes"] == len(wav())

    # Company B: cannot play A's recording, nor upload over it, even with the same call id.
    assert client.get("/api/v1/recordings/call-1", headers=hb).status_code == 404
    assert put(client, hb, "call-1", wav(2)) == 404
    call(client, hb, "call-1")  # B's own call with the same id is a different call
    assert client.get("/api/v1/recordings/call-1", headers=hb).status_code == 404
    assert client.get("/api/v1/recordings/call-1", headers=ha).content == wav()


def test_only_the_calling_agent_uploads_and_other_agents_cannot_play(
    rec_client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    client = rec_client
    a = sign_up("Alpha", "admin@a.test")
    ha = a["auth"]
    for email in ("one@a.test", "two@a.test"):
        r = client.post(
            "/api/v1/team", json={"email": email, "name": "Ag", "role": "agent"}, headers=ha
        )
        assert r.status_code in (200, 201)
        store._db.execute(
            "UPDATE users SET must_change_pw = 0, pw_hash = (SELECT pw_hash FROM"
            " users WHERE email = 'admin@a.test') WHERE email = ?",
            (email,),
        )
    one, two = login(client, "one@a.test"), login(client, "two@a.test")
    call(client, one, "c1")
    assert put(client, two, "c1", wav()) == 404  # not their call
    assert put(client, ha, "c1", wav()) == 404  # admins play, they do not upload
    assert put(client, one, "c1", wav()) == 200
    assert client.get("/api/v1/recordings/c1", headers=one).status_code == 200
    assert client.get("/api/v1/recordings/c1", headers=ha).status_code == 200
    assert client.get("/api/v1/recordings/c1", headers=two).status_code == 404


def test_rejects_non_wav_unknown_calls_and_bad_ids(rec_client: TestClient, sign_up: SignUp) -> None:
    ha = sign_up("Alpha", "admin@a.test")["auth"]
    call(rec_client, ha, "c1")
    assert put(rec_client, ha, "c1", b"not a wav file at all, just text......" * 3) == 400
    assert put(rec_client, ha, "never-reported", wav()) == 404
    assert put(rec_client, ha, "a.b", wav()) == 404
    assert put(rec_client, ha, "..%2F..%2Fetc", wav()) in (404, 405)  # never reaches a file
    assert rec_client.get("/api/v1/recordings/c1", headers=ha).status_code == 404  # none yet
    assert rec_client.get("/api/v1/recordings/c1").status_code == 401


def test_server_without_recordings_says_not_found(client: TestClient, sign_up: SignUp) -> None:
    ha = sign_up("Alpha", "admin@a.test")["auth"]
    call(client, ha, "c1")
    assert put(client, ha, "c1", wav()) == 404


def test_prune_deletes_after_30_days(tmp_path: Path) -> None:
    rec = Recordings(tmp_path, min_free=0)
    old, new = tmp_path / "co" / "old.wav", tmp_path / "co" / "new.wav"
    old.parent.mkdir()
    old.write_bytes(wav())
    new.write_bytes(wav())
    past = time.time() - KEEP_S - 60
    os.utime(old, (past, past))
    assert rec.prune() == 1
    assert not old.exists()
    assert new.exists()


def test_full_disk_refuses_uploads(
    store: CloudStore, seed: Seed, tmp_path: Path, sign_up: Any
) -> None:
    config = CloudConfig(
        public_origin=ORIGIN, static_dir=None, recordings=Recordings(tmp_path, min_free=10**18)
    )
    client = TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)
    r = client.post(
        "/api/v1/auth/signup",
        json={"company": "A", "name": "A", "email": "a@a.test", "password": PASSWORD},
    )
    h = {"authorization": f"Bearer {r.json()['token']}"}
    call(client, h, "c1")
    assert put(client, h, "c1", wav()) == 507


def test_opus_webm_recordings_are_kept_and_served_as_webm(
    rec_client: TestClient, sign_up: SignUp
) -> None:
    h = sign_up("Alpha", "admin@a.test")["auth"]
    call(rec_client, h, "c1")
    webm = b"\x1a\x45\xdf\xa3" + b"\x00" * 100
    assert put(rec_client, h, "c1", webm) == 200
    got = rec_client.get("/api/v1/recordings/c1", headers=h)
    assert got.content == webm
    assert got.headers["content-type"] == "audio/webm"
    assert put(rec_client, h, "c1", wav()) == 200  # a later upload replaces it
    assert rec_client.get("/api/v1/recordings/c1", headers=h).headers["content-type"] == (
        "audio/wav"
    )
