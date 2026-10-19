"""Pipeline + R2 chain + telemetry (P2.5 to P2.7) on a fake clock with fake models."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

import pytest

from sotto_worker.adapters.llm.fake import FakeLLM, FakeLLMError
from sotto_worker.clock import FakeClock
from sotto_worker.company import CompanyProfile
from sotto_worker.contracts import LLMAdapter, Speaker, TranscriptEvent
from sotto_worker.pipeline.session import CallSession, Escalation
from sotto_worker.playbook import PlaybookIndex
from sotto_worker.prompts import PromptRegistry
from sotto_worker.protocol import CardMessage
from sotto_worker.router import ModelRouter, RoutingConfig, StageRoute
from sotto_worker.telemetry import CardTimingRecord
from tests.conftest import REPO_ROOT

DEMO = REPO_ROOT / "seed" / "demo"
CALL_ID = "0b8f3c1e-7a2d-4e6f-8c9b-1d2e3f4a5b6c"


@dataclass
class Harness:
    clock: FakeClock
    session: CallSession
    primary: FakeLLM
    backup: FakeLLM
    cards: list[CardMessage] = field(default_factory=list)
    escalations: list[Escalation] = field(default_factory=list)
    timings: list[CardTimingRecord] = field(default_factory=list)

    async def say(self, speaker: Speaker, text: str, at_ms: int, *, run_ms: int = 6000) -> None:
        """Speaker finishes `text` at `at_ms` (t0); the final transcript arrives 100 ms later."""
        await self.clock.advance(max(at_ms - self.clock.now_ms(), 0) + 100)
        event = TranscriptEvent(
            speaker=speaker, text=text, final=True, start_ms=at_ms - 1500, end_ms=at_ms
        )
        await self.session.on_transcript(event, t0_ms=at_ms)
        await self.clock.advance(run_ms)

    def texts(self) -> list[tuple[str, str, str]]:
        """(card_id, source, full text) per card, in arrival order."""
        order: list[str] = []
        texts: dict[str, list[str]] = {}
        source: dict[str, str] = {}
        for c in self.cards:
            if c.card_id not in texts:
                order.append(c.card_id)
                texts[c.card_id] = []
                source[c.card_id] = c.source
            texts[c.card_id].append(c.delta)
        return [(cid, source[cid], "".join(texts[cid])) for cid in order]

    def first_delta_ms(self, card_id: str) -> int:
        return next(t.first_delta_ms for t in self.timings if t.card_id == card_id)


def make(
    primary_text: str = "ANSWER: Happy to help with that.",
    primary_ms: int = 300,
    backup_text: str = "ANSWER: From the backup.",
    backup_ms: int = 300,
    primary_error: bool = False,
    primary_error_after: int | None = None,
    backup_error: bool = False,
    hang: bool = False,
    **company_overrides: object,
) -> Harness:
    clock = FakeClock()
    primary = FakeLLM(
        clock=clock, model="m1", text=primary_text, first_token_ms=primary_ms, hang=hang,
        error=FakeLLMError("down") if primary_error or primary_error_after else None,
        error_after_chunks=primary_error_after,
    )  # fmt: skip
    backup = FakeLLM(
        clock=clock, model="m2", text=backup_text, first_token_ms=backup_ms, hang=hang,
        error=FakeLLMError("down") if backup_error else None,
    )  # fmt: skip
    fakes: dict[str, LLMAdapter] = {"m1": primary, "m2": backup}
    config = RoutingConfig(
        stages={
            "suggest": StageRoute(provider="fake", model="m1", first_token_ms=700),
            "suggest_backup": StageRoute(provider="fake", model="m2", first_token_ms=700),
        }
    )
    router = ModelRouter(config, lambda route: fakes[route.model], clock)
    company = CompanyProfile.load(DEMO / "company.yaml").with_overrides(**company_overrides)
    cards: list[CardMessage] = []
    escalations: list[Escalation] = []
    timings: list[CardTimingRecord] = []

    async def on_card(card: CardMessage) -> None:
        cards.append(card)

    async def on_escalation(e: Escalation) -> None:
        escalations.append(e)

    session = CallSession(
        call_id=CALL_ID,
        company=company,
        router=router,
        prompts=PromptRegistry.from_seed(REPO_ROOT / "seed" / "prompts"),
        playbook=PlaybookIndex.from_directory(DEMO / "playbook"),
        clock=clock,
        on_card=on_card,
        on_escalation=on_escalation,
        on_timing=timings.append,
    )
    return Harness(clock, session, primary, backup, cards, escalations, timings)


async def test_playbook_hit_streams_the_short_answer_without_a_model() -> None:
    h = make()
    await h.say("customer", "Another company quoted us 20% less.", at_ms=1000)
    [(card_id, source, text)] = h.texts()
    assert source == "playbook"
    assert text.startswith("Fair point. What does their quote include?")
    assert h.cards[0].type == "objection"
    assert h.cards[-1].done
    assert h.primary.requests == []
    assert h.first_delta_ms(card_id) <= 150


async def test_no_playbook_match_gives_a_labelled_ai_card() -> None:
    h = make(primary_text="ANSWER: Pets are welcome in most units; let me confirm yours.")
    await h.say("customer", "Do you allow pets in the building?", at_ms=1000)
    [(card_id, source, text)] = h.texts()
    assert (source, text) == ("ai", "Pets are welcome in most units; let me confirm yours.")
    assert h.cards[0].model_dump()["label"] == "Not in playbook — check before promising"
    assert h.cards[0].type == "answer"
    # final transcript at t0+100, verdict token at +300, first visible word one chunk (15 ms) later
    assert h.first_delta_ms(card_id) == 415
    timing = h.cards[0].timing
    assert timing is not None
    assert timing.first_token_ms == 400


async def test_slow_primary_is_raced_by_the_backup() -> None:
    h = make(primary_ms=1500, backup_ms=300)
    await h.say("customer", "Do you allow pets in the building?", at_ms=1000)
    [(card_id, source, text)] = h.texts()
    assert (source, text) == ("backup", "From the backup.")
    assert h.first_delta_ms(card_id) == 1015  # backup starts at t0+700, verdict +300, word +15
    assert h.timings[0].fallback_reason == "timeout"


async def test_no_safe_answer_gives_holding_line_and_one_escalation() -> None:
    h = make(primary_text="NO_SAFE_ANSWER")
    await h.say("customer", "Is there a school nearby?", at_ms=1000)
    [(_, source, text)] = h.texts()
    assert (source, text) == (
        "holding",
        "Good question. Let me confirm that and send it to you today.",
    )
    assert h.cards[0].type == "holding"
    assert [e.question for e in h.escalations] == ["Is there a school nearby?"]


async def test_holding_line_by_t0_plus_1400_then_late_answer_replaces_it() -> None:
    h = make(primary_ms=2000, backup_ms=1300)  # backup starts at 700, first token at 2000
    await h.say("customer", "Do you allow pets in the building?", at_ms=1000)
    cards = h.texts()
    assert [source for _, source, _ in cards] == ["holding", "backup"]
    assert h.first_delta_ms(cards[0][0]) == 1400
    assert h.escalations == [], "a late answer within 5 s means no escalation"


async def test_nothing_by_five_seconds_escalates_exactly_once() -> None:
    h = make(hang=True)
    await h.say("customer", "Do you allow pets in the building?", at_ms=1000)
    assert [source for _, source, _ in h.texts()] == ["holding"]
    assert len(h.escalations) == 1
    await h.say("customer", "Do you allow pets in the building?", at_ms=9000)
    assert len(h.escalations) == 1, "same question, same call: one escalation"


async def test_both_providers_failing_falls_back_to_holding() -> None:
    h = make(primary_error=True, backup_error=True)
    await h.say("customer", "Do you allow pets in the building?", at_ms=1000)
    assert [source for _, source, _ in h.texts()] == ["holding"]
    assert len(h.escalations) == 1


async def test_ai_answers_disabled_goes_straight_to_holding_and_escalation() -> None:
    h = make(ai_answers_allowed=False)
    await h.say("customer", "Do you allow pets in the building?", at_ms=1000)
    [(card_id, source, _)] = h.texts()
    assert source == "holding"
    assert h.first_delta_ms(card_id) <= 150
    assert h.primary.requests == []
    assert len(h.escalations) == 1


async def test_agent_speech_never_triggers_a_card_r4() -> None:
    h = make()
    await h.say("agent", "What's the payment plan you'd prefer?", at_ms=1000)
    await h.say("agent", "Is it too expensive for you?", at_ms=3000)
    assert h.cards == []


async def test_agent_context_reaches_the_prompt_only_when_enabled() -> None:
    h = make()
    await h.say("agent", "We also have villas in Phase Two.", at_ms=1000)
    await h.say("customer", "Do you allow pets in the building?", at_ms=3000)
    assert "Agent: We also have villas in Phase Two." in h.primary.requests[0].messages[0].content

    h = make(agent_context=False)
    await h.say("agent", "We also have villas in Phase Two.", at_ms=1000)
    await h.say("customer", "Do you allow pets in the building?", at_ms=3000)
    assert "villas" not in h.primary.requests[0].messages[0].content


async def test_arabic_turn_gets_arabic_holding_line() -> None:
    h = make(primary_text="NO_SAFE_ANSWER")
    await h.say("customer", "هل توجد مدرسة قريبة؟", at_ms=1000)
    [(_, _, text)] = h.texts()
    assert text == "سؤال ممتاز. خلّيني أتأكد وأرسل لك الجواب اليوم."


async def test_statements_do_not_trigger() -> None:
    h = make()
    await h.say("customer", "My name is Sara.", at_ms=1000)
    assert h.cards == []


async def test_every_card_has_one_telemetry_record_and_valid_sequence() -> None:
    h = make()
    await h.say("customer", "What's the payment plan?", at_ms=1000)
    await h.say("customer", "Do you allow pets in the building?", at_ms=9000)
    ids = [cid for cid, _, _ in h.texts()]
    assert sorted(t.card_id for t in h.timings) == sorted(ids)
    for cid in ids:
        seqs = [c.seq for c in h.cards if c.card_id == cid]
        assert seqs == list(range(len(seqs)))
        assert [c.done for c in h.cards if c.card_id == cid][-1]
    assert all(t.company_id == "demo" and t.total_ms >= t.first_delta_ms for t in h.timings)


@pytest.mark.parametrize("text", ["What's the payment plan?", "Do you allow pets in the building?"])
async def test_cards_serialise_to_the_shared_protocol(text: str) -> None:
    h = make()
    await h.say("customer", text, at_ms=1000)
    for card in h.cards:
        assert CardMessage.model_validate_json(card.to_wire()) == card


async def test_session_close_cancels_pending_work() -> None:
    h = make(hang=True)
    await h.clock.advance(100)
    event = TranscriptEvent(
        speaker="customer", text="Do you allow pets?", final=True, start_ms=0, end_ms=0
    )
    await h.session.on_transcript(event, t0_ms=0)
    await h.session.close()
    await h.clock.advance(10_000)
    assert h.escalations == []
    assert not asyncio.all_tasks() - {asyncio.current_task()}


async def test_mid_stream_failure_closes_the_card_and_escalates() -> None:
    h = make(
        primary_text="ANSWER: Sure we can arrange that today",
        primary_error_after=3,
        backup_error=True,
    )
    await h.say("customer", "Do you allow pets in the building?", at_ms=1000)
    [(card_id, source, text)] = h.texts()
    assert (source, text) == ("ai", "Sure we")
    assert h.cards[-1].done, "a card the agent is reading must be closed, never left open"
    assert any(t.card_id == card_id for t in h.timings)
    assert len(h.escalations) == 1


async def test_any_pipeline_error_still_gives_the_holding_line() -> None:
    h = make()
    h.session.prompts_key = "missing-prompt"  # render fails before any model call
    await h.say("customer", "Do you allow pets in the building?", at_ms=1000)
    [(card_id, source, _)] = h.texts()
    assert source == "holding"
    assert h.first_delta_ms(card_id) <= 1400
    assert len(h.escalations) == 1


async def test_t0_after_the_final_transcript_does_not_break_timing() -> None:
    h = make()
    await h.clock.advance(100)
    event = TranscriptEvent(
        speaker="customer", text="What's the payment plan?", final=True, start_ms=0, end_ms=0
    )
    await h.session.on_transcript(event, t0_ms=500)  # clock skew: t0 later than now
    await h.clock.advance(6000)
    assert h.cards[0].timing is not None
    assert h.cards[0].timing.stt_final_ms == 0


async def test_a_streaming_answer_is_closed_by_its_hard_deadline() -> None:
    h = make(primary_text="ANSWER: " + " ".join(["word"] * 2000), primary_ms=300)
    await h.say("customer", "Do you allow pets in the building?", at_ms=1000, run_ms=20_000)
    assert h.cards[-1].done
    [timing] = h.timings
    assert timing.total_ms <= 8000


async def test_prompt_is_split_into_a_cacheable_company_prefix_and_the_turn() -> None:
    h = make()
    await h.say("customer", "Can I keep my cat in the building?", at_ms=1000)
    await h.say("customer", "Is there a school nearby?", at_ms=9000)
    first, second = h.primary.requests[0], h.primary.requests[1]
    assert first.system == second.system == first.cacheable_prefix
    assert "Palm Grove Realty (demo)" in first.system
    assert "cat" not in first.system.split()
    assert "cat" in first.messages[0].content
    assert "school" in second.messages[0].content


async def test_echo_of_the_agent_on_the_customer_track_never_triggers_f18() -> None:
    h = make()
    await h.clock.advance(1000)
    h.session.on_agent_voice(start_ms=1000, end_ms=3000, text="what is the payment plan you prefer")
    echo = TranscriptEvent(
        speaker="customer",
        text="What is the payment plan you prefer?",
        final=True,
        start_ms=1200,
        end_ms=3100,
    )
    await h.session.on_transcript(echo, t0_ms=3100)
    await h.clock.advance(6000)
    assert h.cards == []


async def test_cards_carry_their_turn_id_so_a_late_answer_replaces_only_its_own_holding_line() -> (
    None
):
    h = make(primary_ms=2000, backup_ms=1300)
    await h.say("customer", "Do you allow pets in the building?", at_ms=1000)
    await h.say("customer", "What's the payment plan?", at_ms=9000)
    turns = [c.turn_id for c in h.cards if c.seq == 0]
    assert turns[0] == turns[1], "holding line and its late answer share the turn"
    assert turns[2] != turns[0], "the next turn gets a new id"
    assert all(t is not None for t in turns)
