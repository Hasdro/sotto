"""R4 in the room (P4.4, ARCHITECTURE §2): which tracks the worker listens to, and echo gating
(F-18). Pure logic; the LiveKit SDK wiring in Phase 4 only feeds these."""

from sotto_worker.room import EchoGate, Participant, TrackRole, select_tracks


def _p(identity: str, kind: str, role: str | None = None) -> Participant:
    return Participant(
        identity=identity, kind=kind, attributes={"sotto.role": role} if role else {}
    )


def test_only_the_sip_customer_is_transcribed_as_customer() -> None:
    plan = select_tracks(
        [
            _p("rep_u1", "standard"),
            _p("customer_c1", "sip", "customer"),
            _p("agent-worker", "agent"),
        ],
        agent_context=False,
    )
    assert plan == {"customer_c1": TrackRole.CUSTOMER, "rep_u1": TrackRole.AGENT_VAD_ONLY}


def test_agent_context_adds_agent_transcription_but_never_as_customer() -> None:
    plan = select_tracks(
        [_p("rep_u1", "standard"), _p("customer_c1", "sip", "customer")], agent_context=True
    )
    assert plan["rep_u1"] is TrackRole.AGENT_CONTEXT
    assert plan["customer_c1"] is TrackRole.CUSTOMER


def test_a_participant_claiming_customer_without_being_sip_is_ignored() -> None:
    # A rep cannot set its own attributes (canUpdateOwnMetadata is denied); be strict anyway.
    plan = select_tracks([_p("rep_u1", "standard", "customer")], agent_context=False)
    assert plan == {"rep_u1": TrackRole.AGENT_VAD_ONLY}


def test_a_sip_participant_without_the_server_set_role_is_not_trusted() -> None:
    assert select_tracks([_p("customer_x", "sip")], agent_context=False) == {}


def test_echo_gate_drops_customer_speech_that_overlaps_the_agent() -> None:
    gate = EchoGate(max_delay_ms=400)
    gate.agent_voice(1000, 3000)
    assert gate.is_echo(start_ms=1200, end_ms=2900, text="that is a good price")
    assert not gate.is_echo(start_ms=3600, end_ms=5000, text="what about parking?")


def test_echo_gate_uses_agent_text_when_context_is_on() -> None:
    gate = EchoGate(max_delay_ms=400)
    gate.agent_voice(1000, 3000, text="the payment plan is ten fifty forty")
    # Overlaps only partly (customer barged in), but the words are the agent's: echo.
    assert gate.is_echo(start_ms=2600, end_ms=4200, text="the payment plan is ten fifty forty")
    # Real barge-in with different words is kept.
    assert not gate.is_echo(start_ms=2600, end_ms=4200, text="sorry, can I ask about parking?")
