"""The Sotto server end to end through Starlette's test client (D-020): calls over /ws, the web
app, access-code sign-in, and the Keys & providers API (P6.7)."""

from __future__ import annotations

import dataclasses
import json
from typing import Any

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from sotto_worker.protocol.demo import DemoServerMessage
from sotto_worker.server import app as app_module
from sotto_worker.server.keytest import KeyCheck
from sotto_worker.server.store import Store
from tests.server.conftest import CODE, PUBLIC, MakeClient

JSON = {"content-type": "application/json"}
SECRET_KEY_VALUE = "fake-" + "k" * 20  # not a real key; built so scanners see no literal


def collect(ws: Any, until_done_cards: int, *, extra: str | None = None) -> list[dict[str, Any]]:
    got: list[dict[str, Any]] = []
    done = 0
    while done < until_done_cards or (extra and not any(m["type"] == extra for m in got)):
        msg = json.loads(ws.receive_text())
        DemoServerMessage.model_validate(msg)  # every message obeys the shared protocol
        got.append(msg)
        if msg["type"] == "card" and msg["card"]["done"]:
            done += 1
    return got


# --- calls ---------------------------------------------------------------------------------


def test_typed_question_gets_a_playbook_card_and_is_kept_in_history(
    make_client: MakeClient, store: Store
) -> None:
    client = make_client()
    with client.websocket_connect("/ws") as ws:
        hello = json.loads(ws.receive_text())
        assert hello["type"] == "hello"
        assert hello["mode"] == "fake"
        assert hello["stt_vendor"] is None
        assert {s["id"] for s in hello["scenarios"]} >= {"price-objection", "hard-questions"}
        ws.send_text(
            json.dumps({"type": "say", "speaker": "customer", "text": "What's the payment plan?"})
        )
        msgs = collect(ws, 1)
        ws.send_text(json.dumps({"type": "end"}))
        ended = json.loads(ws.receive_text())
    types = [m["type"] for m in msgs]
    assert types[:3] == ["call_started", "transcript", "turn_end"]
    cards = [m["card"] for m in msgs if m["type"] == "card"]
    assert cards[0]["source"] == "playbook"
    assert next(m for m in msgs if m["type"] == "turn_end")["turn_id"] == cards[0]["turn_id"]
    assert ended["type"] == "call_ended"
    calls = client.get("/api/calls").json()["calls"]
    assert calls[0]["title"] == "Typed call"
    assert calls[0]["cards"] == 1
    detail = client.get(f"/api/calls/{calls[0]['id']}").json()
    line, shown = detail["transcript"][:2]
    assert (line["kind"], line["speaker"], line["text"]) == (
        "line",
        "customer",
        "What's the payment plan?",
    )
    assert shown["kind"] == "card"
    assert shown["source"] == "playbook"
    assert shown["text"] == cards[0]["delta"] + "".join(c["delta"] for c in cards[1:])


def test_scenario_playback_never_carries_agent_cards(make_client: MakeClient) -> None:
    client = make_client()
    with client.websocket_connect("/ws") as ws:
        ws.receive_text()
        ws.send_text(json.dumps({"type": "start", "scenario_id": "price-objection"}))
        msgs = collect(ws, 4, extra="escalation")
    first = [m["card"]["source"] for m in msgs if m["type"] == "card" and m["card"]["seq"] == 0]
    assert sorted(first) == ["holding", "playbook", "playbook", "playbook"]


def test_invalid_message_gets_an_error_and_audio_without_stt_is_refused(
    make_client: MakeClient,
) -> None:
    client = make_client()
    with client.websocket_connect("/ws") as ws:
        ws.receive_text()
        ws.send_text(json.dumps({"type": "say", "speaker": "manager", "text": "hi"}))
        assert json.loads(ws.receive_text())["type"] == "error"
        ws.send_text(json.dumps({"type": "audio_start", "sample_rate": 16000}))
        assert json.loads(ws.receive_text())["type"] == "call_started"
        err = json.loads(ws.receive_text())
        assert err["type"] == "error"
        assert "speech-to-text" in err["message"]


def test_foreign_origin_socket_is_refused(make_client: MakeClient) -> None:
    client = make_client()
    with (
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect("/ws", headers={"origin": "https://evil.example"}) as ws,
    ):
        ws.receive_text()


# --- the web app ---------------------------------------------------------------------------


def test_serves_the_web_app_with_spa_fallback_and_no_traversal(make_client: MakeClient) -> None:
    client = make_client()
    assert client.get("/").text == "<!doctype html><title>Sotto</title>"
    assert client.get("/_expo/app.js").text == "console.log(1)"
    assert client.get("/call").status_code == 200  # client-side route
    assert client.get("/..%2f..%2fetc/passwd").status_code == 404
    assert client.get("/missing.js").status_code == 404
    assert client.get("/healthz").json() == {"ok": True}
    assert client.get("/").headers["x-frame-options"] == "DENY"


# --- hosted mode: access code --------------------------------------------------------------


def sign_in(client: TestClient, code: str = CODE) -> int:
    r = client.post("/api/session", json={"code": code}, headers={"origin": PUBLIC})
    return r.status_code


def test_hosted_mode_needs_the_access_code(make_client: MakeClient) -> None:
    client = make_client(hosted=True)
    assert client.get("/api/me").json() == {"auth_required": True, "signed_in": False}
    assert client.get("/api/providers").status_code == 401
    with pytest.raises(WebSocketDisconnect), client.websocket_connect("/ws") as ws:
        ws.receive_text()
    assert sign_in(client, "wrong-code") == 401
    assert sign_in(client) == 200
    cookie = client.cookies.get("sotto_session")
    assert cookie
    assert client.get("/api/me").json()["signed_in"] is True
    assert client.get("/api/providers").status_code == 200
    # the test client does not send Secure cookies over ws://, so pass it as a browser would
    headers = {"origin": PUBLIC, "cookie": f"sotto_session={cookie}"}
    with client.websocket_connect("/ws", headers=headers) as ws:
        assert json.loads(ws.receive_text())["type"] == "hello"


def test_hosted_sign_in_refuses_another_origin_and_sets_a_strict_secure_cookie(
    make_client: MakeClient,
) -> None:
    client = make_client(hosted=True)
    r = client.post("/api/session", json={"code": CODE}, headers={"origin": "https://evil.example"})
    assert r.status_code == 403
    r = client.post("/api/session", json={"code": CODE}, headers={"origin": PUBLIC})
    header = r.headers["set-cookie"].lower()
    assert "httponly" in header
    assert "secure" in header
    assert "samesite=strict" in header


def test_repeated_wrong_codes_are_rate_limited(make_client: MakeClient) -> None:
    client = make_client(hosted=True)
    statuses = [sign_in(client, f"guess-{i}") for i in range(11)]
    assert statuses[-1] == 429
    assert sign_in(client) == 429  # even the right code waits out the window


# --- keys & providers (P6.7) ---------------------------------------------------------------


def test_a_saved_key_is_never_returned_and_shows_as_set(
    make_client: MakeClient, store: Store
) -> None:
    client = make_client()
    r = client.put("/api/providers/groq/key", json={"key": SECRET_KEY_VALUE}, headers=JSON)
    assert r.status_code == 200
    assert SECRET_KEY_VALUE not in r.text
    groq = next(p for p in r.json()["providers"] if p["id"] == "groq")
    assert groq["key_set"] is True
    assert groq["key_source"] == "panel"
    assert groq["key_page"] == "https://console.groq.com/keys"
    for path in ("/api/providers", "/api/audit", "/api/calls"):
        assert SECRET_KEY_VALUE not in client.get(path).text
    assert store.env_overlay({})["GROQ_API_KEY"] == SECRET_KEY_VALUE
    r = client.delete("/api/providers/groq/key")
    assert next(p for p in r.json()["providers"] if p["id"] == "groq")["key_set"] is False
    actions = [e["action"] for e in client.get("/api/audit").json()["entries"]]
    assert actions[:2] == ["key.delete", "key.set"]


def test_server_env_keys_show_as_set_without_their_value(make_client: MakeClient) -> None:
    client = make_client(env={"DEEPGRAM_API_KEY": "dg-secret-value-123"})
    body = client.get("/api/providers")
    deepgram = next(p for p in body.json()["providers"] if p["id"] == "deepgram")
    assert deepgram["key_set"] is True
    assert deepgram["key_source"] == "server"
    assert "dg-secret-value-123" not in body.text


@pytest.mark.parametrize("bad", ["short", "has space in it", "ключ-не-ascii-123", "x" * 401])
def test_implausible_keys_are_refused(make_client: MakeClient, bad: str) -> None:
    client = make_client()
    r = client.put("/api/providers/groq/key", json={"key": bad}, headers=JSON)
    assert r.status_code == 400


def test_state_changes_need_json_and_the_right_origin(make_client: MakeClient) -> None:
    client = make_client(hosted=True)
    sign_in(client)
    r = client.put(
        "/api/providers/groq/key",
        content=b"key=abc",
        headers={"content-type": "application/x-www-form-urlencoded", "origin": PUBLIC},
    )
    assert r.status_code == 415
    r = client.put(
        "/api/providers/groq/key",
        json={"key": SECRET_KEY_VALUE},
        headers={"origin": "https://evil.example"},
    )
    assert r.status_code == 403


def test_test_button_records_the_result_and_models(
    make_client: MakeClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[str] = []

    async def fake_check(provider: Any, key: str) -> KeyCheck:
        seen.append(key)
        return KeyCheck(True, "key works; 2 models available", ("model-a", "model-b"))

    monkeypatch.setattr(app_module, "check_key", fake_check)
    client = make_client()
    assert client.post("/api/providers/groq/test", headers=JSON).status_code == 400  # no key
    client.put("/api/providers/groq/key", json={"key": SECRET_KEY_VALUE}, headers=JSON)
    r = client.post("/api/providers/groq/test", headers=JSON)
    assert r.json()["result"] == {"ok": True, "detail": "key works; 2 models available"}
    groq = next(p for p in r.json()["providers"] if p["id"] == "groq")
    assert groq["test"]["ok"] is True
    assert {"model-a", "model-b"} <= set(groq["models"])
    assert seen == [SECRET_KEY_VALUE]
    assert SECRET_KEY_VALUE not in r.text


def test_stage_choice_is_validated_saved_and_reset(make_client: MakeClient) -> None:
    client = make_client()
    stages = {s["id"]: s for s in client.get("/api/providers").json()["stages"]}
    assert stages["stt"]["provider_id"] == "assemblyai"
    assert stages["stt"]["source"] == "default"
    assert stages["suggest"]["provider_id"] == "groq"
    r = client.put(
        "/api/stages/suggest", json={"provider_id": "deepgram", "model": "nova-3"}, headers=JSON
    )
    assert r.status_code == 400  # a speech vendor cannot write cards
    r = client.put(
        "/api/stages/stt", json={"provider_id": "speechmatics", "model": "enhanced"}, headers=JSON
    )
    assert r.status_code == 200
    stt = next(s for s in r.json()["stages"] if s["id"] == "stt")
    assert (stt["provider_id"], stt["model"], stt["source"]) == (
        "speechmatics",
        "enhanced",
        "panel",
    )
    r = client.delete("/api/stages/stt", headers=JSON)
    stt = next(s for s in r.json()["stages"] if s["id"] == "stt")
    assert stt["source"] == "default"


# --- security review fixes (2026-10-21) ----------------------------------------------------


def test_oversized_sign_in_bodies_are_refused_before_they_are_read(make_client: MakeClient) -> None:
    client = make_client(hosted=True)
    big = b'{"code": "' + b"x" * 20_000 + b'"}'
    r = client.post(
        "/api/session", content=big, headers={"origin": PUBLIC, "content-type": "application/json"}
    )
    assert r.status_code == 400

    def chunks() -> Any:
        yield b'{"code": "'
        for _ in range(10):
            yield b"x" * 4096  # no Content-Length: the stream itself is capped

    r = client.post("/api/session", content=chunks(), headers={"origin": PUBLIC})
    assert r.status_code == 400


def test_every_response_carries_the_security_headers(make_client: MakeClient) -> None:
    client = make_client(hosted=True)
    for path in ("/", "/api/me", "/api/providers", "/missing.js"):
        headers = client.get(path).headers
        assert "frame-ancestors 'none'" in headers["content-security-policy"], path
        assert headers["x-content-type-options"] == "nosniff"


def test_changing_the_access_code_signs_everyone_out(store: Store) -> None:
    from sotto_worker.server.auth import AccessGate
    from tests.server.conftest import SECRET

    token = AccessGate(CODE, SECRET).issue()
    assert AccessGate(CODE, SECRET).valid(token)
    assert not AccessGate("a-new-code-99", SECRET).valid(token)


def test_sign_out_needs_the_site_origin(make_client: MakeClient) -> None:
    client = make_client(hosted=True)
    assert (
        client.delete("/api/session", headers={"origin": "https://evil.example"}).status_code == 403
    )
    assert client.delete("/api/session", headers={"origin": PUBLIC}).status_code == 200


def test_the_audit_log_names_the_client(make_client: MakeClient) -> None:
    client = make_client()
    client.put("/api/providers/groq/key", json={"key": SECRET_KEY_VALUE}, headers=JSON)
    [entry] = client.get("/api/audit").json()["entries"]
    assert entry["detail"] == "GROQ_API_KEY (from testclient)"


def test_open_call_sockets_are_capped(
    make_client: MakeClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(app_module, "MAX_LIVE_CALLS", 1)
    client = make_client()
    with client.websocket_connect("/ws") as first:
        assert json.loads(first.receive_text())["type"] == "hello"
        with pytest.raises(WebSocketDisconnect), client.websocket_connect("/ws") as second:
            second.receive_text()
    with client.websocket_connect("/ws") as again:  # the slot is free once the first closes
        assert json.loads(again.receive_text())["type"] == "hello"


# --- escalations → inbox → playbook (R2 steps 4-5) -----------------------------------------


def test_an_escalated_question_is_answered_added_and_used_by_the_next_call(
    make_client: MakeClient, store: Store, monkeypatch: pytest.MonkeyPatch
) -> None:
    from sotto_worker.playbook import PlaybookEntry, PlaybookIndex
    from tests.server.conftest import fast_runtime

    def runtime_with_added() -> Any:
        base = fast_runtime()
        added = [
            PlaybookEntry(f"inbox#{e['id']}", "faq", e["question"], e["answer"], tags=("x",))
            for e in store.playbook_added()
        ]
        return dataclasses.replace(base, playbook=PlaybookIndex([*base.playbook.entries, *added]))

    client = make_client(runtime=runtime_with_added)
    question = "Can I pay the deposit in bitcoin?"
    with client.websocket_connect("/ws") as ws:
        ws.receive_text()
        ws.send_text(json.dumps({"type": "say", "speaker": "customer", "text": question}))
        collect(ws, 1, extra="escalation")
        ws.send_text(json.dumps({"type": "end"}))
        ws.receive_text()
    [item] = client.get("/api/escalations").json()["escalations"]
    assert (item["question"], item["status"]) == (question, "open")
    url = f"/api/escalations/{item['id']}"
    too_long = " ".join(["word"] * 26)
    assert client.put(f"{url}/answer", json={"answer": too_long}, headers=JSON).json() == {
        "error": "too_long"
    }
    answer = "We take bank transfer and cards only, not crypto."
    r = client.post(f"{url}/playbook", json={"answer": answer}, headers=JSON)
    assert r.json()["escalations"][0]["status"] == "added"
    again = client.post(f"{url}/playbook", json={"answer": answer}, headers=JSON)
    assert again.json() == {"error": "already_added"}
    assert client.get("/api/playbook/added").json()["entries"][0]["answer"] == answer
    with client.websocket_connect("/ws") as ws:  # the next call answers from the playbook
        ws.receive_text()
        ws.send_text(json.dumps({"type": "say", "speaker": "customer", "text": question}))
        msgs = collect(ws, 1)
    card = next(m["card"] for m in msgs if m["type"] == "card")
    assert card["source"] == "playbook"
    assert card["delta"].startswith("We take bank transfer")


def test_company_settings_are_validated_saved_and_audited(make_client: MakeClient) -> None:
    client = make_client()
    start = client.get("/api/company/settings").json()["settings"]
    assert start == {
        "ai_answers_allowed": True,
        "backup_allowed": True,
        "agent_context": True,
        "card_language": "auto",
    }
    r = client.put("/api/company/settings", json={"ai_answers_allowed": False}, headers=JSON)
    assert r.json()["settings"]["ai_answers_allowed"] is False
    for bad in ({"card_language": "fr"}, {"ai_answers_allowed": "no"}, {"is_admin": True}):
        assert client.put("/api/company/settings", json=bad, headers=JSON).status_code == 400
    [entry] = client.get("/api/audit").json()["entries"]
    assert entry["detail"].startswith("ai_answers_allowed = false")
