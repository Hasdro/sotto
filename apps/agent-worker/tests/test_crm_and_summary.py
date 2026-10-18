import asyncio

from sotto_worker.adapters.crm.fake import FakeCRM
from sotto_worker.adapters.llm.fake import FakeLLM, FakeLLMError
from sotto_worker.clock import FakeClock
from sotto_worker.company import CompanyProfile
from sotto_worker.contracts import TranscriptEvent
from sotto_worker.crm import CallLog, CRMContact
from sotto_worker.pipeline.summary import summarise_call, transcript_text
from sotto_worker.prompts import PromptRegistry
from sotto_worker.router import ModelRouter, RoutingConfig, StageRoute
from tests.conftest import REPO_ROOT

EVENTS = [
    TranscriptEvent(
        speaker="agent", text="Hi, Omar from Palm Grove.", final=True, start_ms=0, end_ms=1000
    ),
    TranscriptEvent(
        speaker="customer", text="What's the payment plan?", final=True, start_ms=1000, end_ms=2000
    ),
]


def _router(clock: FakeClock, llm: FakeLLM) -> ModelRouter:
    config = RoutingConfig(stages={"summary": StageRoute(provider="fake", model="s")})
    return ModelRouter(config, lambda _r: llm, clock)


async def _summarise(llm: FakeLLM, clock: FakeClock) -> str:
    task = asyncio.create_task(
        summarise_call(
            company=CompanyProfile.load(REPO_ROOT / "seed" / "demo" / "company.yaml"),
            events=EVENTS,
            escalations=["Do you allow pets?"],
            router=_router(clock, llm),
            prompts=PromptRegistry.from_seed(REPO_ROOT / "seed" / "prompts"),
            t0_ms=0,
        )
    )
    await clock.advance(5000)
    return await task


async def test_summary_uses_the_summary_prompt_with_transcript_and_escalations() -> None:
    clock = FakeClock()
    llm = FakeLLM(
        clock=clock,
        text="Wants a 1-bed to invest. Next step: viewing Saturday.",
        first_token_ms=100,
    )
    assert await _summarise(llm, clock) == "Wants a 1-bed to invest. Next step: viewing Saturday."
    prompt = llm.requests[0].messages[0].content
    assert "Customer: What's the payment plan?" in prompt
    assert "Do you allow pets?" in prompt


async def test_summary_falls_back_to_an_extract_when_models_fail() -> None:
    clock = FakeClock()
    llm = FakeLLM(clock=clock, text="x", first_token_ms=10, error=FakeLLMError("down"))
    text = await _summarise(llm, clock)
    assert "What's the payment plan?" in text
    assert "Do you allow pets?" in text


def test_transcript_text_labels_speakers() -> None:
    assert (
        transcript_text(EVENTS)
        == "Agent: Hi, Omar from Palm Grove.\nCustomer: What's the payment plan?"
    )


async def test_fake_crm_is_idempotent_per_key() -> None:
    crm = FakeCRM([CRMContact(ref="z-1", name="Sara", phone="+971500000000")])
    assert (await crm.get_contact("z-1")) is not None
    assert await crm.get_contact("missing") is None
    await crm.log_call(
        CallLog(contact_ref="z-1", call_id="c1", summary="first"), idempotency_key="call:c1"
    )
    await crm.log_call(
        CallLog(contact_ref="z-1", call_id="c1", summary="second"), idempotency_key="call:c1"
    )
    assert [log.summary for log in crm.logs.values()] == ["first"]
