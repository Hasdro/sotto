import asyncio
from pathlib import Path

import pytest

from sotto_worker.adapters.llm.fake import FakeLLM, FakeLLMError
from sotto_worker.clock import FakeClock
from sotto_worker.contracts import LLMAdapter, LLMRequest, Message
from sotto_worker.router import (
    AllProvidersFailed,
    CompanyRouting,
    ModelFailsR1,
    ModelRouter,
    RouteResult,
    RoutingConfig,
    StageRoute,
)
from tests.conftest import REPO_ROOT

REQ = LLMRequest(system="s", messages=[Message(role="user", content="q")])


def _config() -> RoutingConfig:
    return RoutingConfig(
        stages={
            "suggest": StageRoute(provider="p1", model="m1", first_token_ms=700),
            "suggest_backup": StageRoute(provider="p2", model="m2", first_token_ms=700),
            "summary": StageRoute(provider="p1", model="big"),
        }
    )


class Adapters:
    """Factory handing out pre-built fakes by (provider, model)."""

    def __init__(self, **fakes: FakeLLM) -> None:
        self.fakes = fakes
        self.built: list[tuple[str, str]] = []

    def __call__(self, route: StageRoute) -> LLMAdapter:
        self.built.append((route.provider, route.model))
        return self.fakes[route.model]


async def _run(
    router: ModelRouter, clock: FakeClock, company: CompanyRouting, advance: int = 5000
) -> tuple[str, RouteResult]:
    result = RouteResult()

    async def consume() -> str:
        return "".join(
            [
                c.text
                async for c in router.stream(
                    "suggest", REQ, company=company, t0_ms=0, result=result
                )
            ]
        )

    task = asyncio.create_task(consume())
    await clock.advance(advance)
    return await task, result


def test_loads_the_seed_file_with_every_stage() -> None:
    config = RoutingConfig.load(REPO_ROOT / "seed" / "models" / "default.yaml")
    assert config.stages["suggest"].first_token_ms == 700
    assert set(config.stages) >= {"suggest", "suggest_backup", "summary"}


def test_company_override_wins_over_platform_default() -> None:
    company = CompanyRouting(
        company_id="c1", overrides={"suggest": StageRoute(provider="p9", model="m9")}
    )
    route = ModelRouter(_config(), Adapters(), FakeClock()).resolve("suggest", company)
    assert (route.provider, route.model) == ("p9", "m9")


async def test_fast_primary_wins_and_backup_never_starts() -> None:
    clock = FakeClock()
    m1 = FakeLLM(clock=clock, text="from primary", first_token_ms=300)
    m2 = FakeLLM(clock=clock, text="from backup", first_token_ms=100)
    text, result = await _run(
        ModelRouter(_config(), Adapters(m1=m1, m2=m2), clock), clock, CompanyRouting("c1")
    )
    assert text == "from primary"
    assert (result.winner, result.fallback_reason, result.first_token_at_ms) == (
        "primary",
        None,
        300,
    )
    assert m2.requests == []


async def test_backup_races_after_deadline_measured_from_t0() -> None:
    clock = FakeClock()
    m1 = FakeLLM(clock=clock, text="slow primary", first_token_ms=1200)
    m2 = FakeLLM(clock=clock, text="from backup", first_token_ms=200)
    text, result = await _run(
        ModelRouter(_config(), Adapters(m1=m1, m2=m2), clock), clock, CompanyRouting("c1")
    )
    assert text == "from backup"
    assert (result.winner, result.fallback_reason, result.first_token_at_ms) == (
        "backup",
        "timeout",
        900,
    )


async def test_primary_can_still_win_the_race_after_the_deadline() -> None:
    clock = FakeClock()
    m1 = FakeLLM(clock=clock, text="late primary", first_token_ms=750)
    m2 = FakeLLM(clock=clock, text="cold backup", first_token_ms=400)
    text, result = await _run(
        ModelRouter(_config(), Adapters(m1=m1, m2=m2), clock), clock, CompanyRouting("c1")
    )
    assert text == "late primary"
    assert result.winner == "primary"
    assert result.fallback_reason == "timeout"


async def test_primary_error_starts_backup_immediately() -> None:
    clock = FakeClock()
    m1 = FakeLLM(clock=clock, text="x", first_token_ms=50, error=FakeLLMError("500"))
    m2 = FakeLLM(clock=clock, text="from backup", first_token_ms=200)
    text, result = await _run(
        ModelRouter(_config(), Adapters(m1=m1, m2=m2), clock), clock, CompanyRouting("c1")
    )
    assert text == "from backup"
    assert (result.fallback_reason, result.first_token_at_ms) == ("error", 250)


async def test_disabled_backup_keeps_waiting_on_primary() -> None:
    clock = FakeClock()
    m1 = FakeLLM(clock=clock, text="slow primary", first_token_ms=1200)
    m2 = FakeLLM(clock=clock, text="from backup", first_token_ms=10)
    company = CompanyRouting("c1", backup_disabled={"suggest_backup"})
    text, result = await _run(ModelRouter(_config(), Adapters(m1=m1, m2=m2), clock), clock, company)
    assert text == "slow primary"
    assert result.winner == "primary"
    assert m2.requests == []


async def test_both_failing_raises() -> None:
    clock = FakeClock()
    m1 = FakeLLM(clock=clock, text="x", first_token_ms=10, error=FakeLLMError("a"))
    m2 = FakeLLM(clock=clock, text="x", first_token_ms=10, error=FakeLLMError("b"))
    with pytest.raises(AllProvidersFailed):
        await _run(
            ModelRouter(_config(), Adapters(m1=m1, m2=m2), clock), clock, CompanyRouting("c1")
        )


async def test_circuit_opens_per_company_endpoint_after_three_failures() -> None:
    clock = FakeClock()
    m1 = FakeLLM(clock=clock, text="x", first_token_ms=10, error=FakeLLMError("down"))
    m2 = FakeLLM(clock=clock, text="b", first_token_ms=10)
    router = ModelRouter(_config(), Adapters(m1=m1, m2=m2), clock)
    for _ in range(3):
        await _run(router, clock, CompanyRouting("c1"), advance=100)
    calls_before = len(m1.requests)
    _, result = await _run(router, clock, CompanyRouting("c1"), advance=100)
    assert len(m1.requests) == calls_before, "open circuit must skip the primary"
    assert result.fallback_reason == "circuit_open"
    # Another company's circuit is unaffected.
    await _run(router, clock, CompanyRouting("c2"), advance=100)
    assert len(m1.requests) == calls_before + 1
    # After 60 s the circuit half-opens and tries the primary again.
    await clock.advance(60_000)
    await _run(router, clock, CompanyRouting("c1"), advance=100)
    assert len(m1.requests) == calls_before + 2


def test_live_stage_refuses_a_model_whose_benchmark_misses_r1() -> None:
    clock = FakeClock()
    slow = FakeLLM(clock=clock, model="m1", benchmark_p95_ms={"suggest": 900})
    router = ModelRouter(_config(), Adapters(m1=slow), clock)
    with pytest.raises(ModelFailsR1):
        router.adapter_for("suggest", CompanyRouting("c1"))


def test_non_live_stage_accepts_any_benchmark() -> None:
    clock = FakeClock()
    big = FakeLLM(clock=clock, model="big", benchmark_p95_ms={"summary": 9000})
    router = ModelRouter(_config(), Adapters(big=big), clock)
    assert router.adapter_for("summary", CompanyRouting("c1")) is big


async def test_warm_up_opens_primary_and_backup() -> None:
    clock = FakeClock()
    m1 = FakeLLM(clock=clock)
    m2 = FakeLLM(clock=clock)
    await ModelRouter(_config(), Adapters(m1=m1, m2=m2), clock).warm(
        "suggest", CompanyRouting("c1")
    )
    assert m1.warmed
    assert m2.warmed


def test_seed_config_path_exists() -> None:
    assert Path(REPO_ROOT / "seed" / "models" / "default.yaml").exists()


async def test_empty_primary_response_starts_the_backup() -> None:
    clock = FakeClock()
    m1 = FakeLLM(clock=clock, text="", first_token_ms=50, empty=True)
    m2 = FakeLLM(clock=clock, text="from backup", first_token_ms=100)
    text, result = await _run(
        ModelRouter(_config(), Adapters(m1=m1, m2=m2), clock), clock, CompanyRouting("c1")
    )
    assert text == "from backup"
    assert (result.winner, result.fallback_reason) == ("backup", "error")


async def test_backup_that_fails_r1_is_dropped_not_raised() -> None:
    clock = FakeClock()
    m1 = FakeLLM(clock=clock, text="x", first_token_ms=10, error=FakeLLMError("down"))
    m2 = FakeLLM(
        clock=clock,
        model="m2",
        text="b",
        first_token_ms=10,
        benchmark_p95_ms={"suggest_backup": 5000},
    )
    with pytest.raises(AllProvidersFailed):
        await _run(
            ModelRouter(_config(), Adapters(m1=m1, m2=m2), clock), clock, CompanyRouting("c1")
        )


async def test_cancelling_the_stream_leaves_no_tasks_behind() -> None:
    clock = FakeClock()
    m1 = FakeLLM(clock=clock, text="x", hang=True)
    m2 = FakeLLM(clock=clock, text="y", hang=True)
    router = ModelRouter(_config(), Adapters(m1=m1, m2=m2), clock)

    async def consume() -> None:
        async for _ in router.stream("suggest", REQ, company=CompanyRouting("c1"), t0_ms=0):
            pass

    task = asyncio.create_task(consume())
    await clock.advance(1000)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await clock.advance(10)
    assert asyncio.all_tasks() == {asyncio.current_task()}
