"""The router resolves a stage for a company and streams from it.

For a stage with a backup (suggest → suggest_backup), `stream` races them (R2, ARCHITECTURE §2):
the backup starts when the primary errors, when its circuit is open, or when the absolute
deadline t0 + first_token_ms passes without a first chunk; the first chunk from either wins and
the loser is cancelled.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections import deque
from collections.abc import AsyncGenerator, Callable
from dataclasses import dataclass
from typing import Any, Literal

from sotto_worker.clock import Clock
from sotto_worker.contracts import LIVE_STAGES, LLMAdapter, LLMChunk, LLMRequest, Stage
from sotto_worker.router.config import BACKUP_STAGE, CompanyRouting, RoutingConfig, StageRoute

# First-token budget per live stage (ARCHITECTURE §4). A model whose last golden-set benchmark
# is slower may not serve the stage (R6).
FIRST_TOKEN_BUDGET_MS: dict[str, int] = {"trigger": 150, "suggest": 450, "suggest_backup": 450}
CIRCUIT_FAILURES = 3
CIRCUIT_WINDOW_MS = 30_000
CIRCUIT_OPEN_MS = 60_000

AdapterFactory = Callable[[StageRoute], LLMAdapter]
Source = Literal["primary", "backup"]


class AllProvidersFailed(RuntimeError):
    pass


class ModelFailsR1(ValueError):
    pass


@dataclass
class RouteResult:
    """Filled in while streaming; the pipeline copies it into card_timings (P2.7)."""

    winner: Source | None = None
    provider: str | None = None
    model: str | None = None
    first_token_at_ms: int | None = None
    fallback_reason: Literal["timeout", "error", "circuit_open"] | None = None


class _Circuit:
    def __init__(self, clock: Clock) -> None:
        self._clock = clock
        self._failures: deque[int] = deque()
        self._open_until = -1

    def is_open(self) -> bool:
        return self._clock.now_ms() < self._open_until

    def record_failure(self) -> None:
        now = self._clock.now_ms()
        self._failures.append(now)
        while self._failures and now - self._failures[0] > CIRCUIT_WINDOW_MS:
            self._failures.popleft()
        if len(self._failures) >= CIRCUIT_FAILURES:
            self._open_until = now + CIRCUIT_OPEN_MS
            self._failures.clear()

    def record_success(self) -> None:
        self._failures.clear()


class ModelRouter:
    def __init__(self, config: RoutingConfig, factory: AdapterFactory, clock: Clock) -> None:
        self._config = config
        self._factory = factory
        self._clock = clock
        self._adapters: dict[tuple[str, str, str | None, str | None], LLMAdapter] = {}
        self._circuits: dict[tuple[str, str, str, str | None, str | None], _Circuit] = {}

    def resolve(self, stage: Stage, company: CompanyRouting) -> StageRoute:
        route = company.overrides.get(stage) or self._config.stages.get(stage)
        if route is None:
            raise KeyError(f"no route for stage {stage!r}")
        return route

    def adapter_for(self, stage: Stage, company: CompanyRouting) -> LLMAdapter:
        route = self.resolve(stage, company)
        # api_key_env is part of the identity: same endpoint, different key = different adapter.
        key = (route.provider, route.model, route.base_url, route.api_key_env)
        adapter = self._adapters.get(key)
        if adapter is None:
            adapter = self._adapters[key] = self._factory(route)
        benchmark = adapter.capabilities.benchmark_p95_ms.get(stage)
        budget = FIRST_TOKEN_BUDGET_MS.get(stage)
        if (
            stage in LIVE_STAGES
            and benchmark is not None
            and budget is not None
            and benchmark > budget
        ):
            name = f"{route.provider}/{route.model}"
            raise ModelFailsR1(f"{name}: benchmark p95 {benchmark} ms > {budget} ms for {stage}")
        return adapter

    def _backup_stage(self, stage: Stage, company: CompanyRouting) -> Stage | None:
        backup = BACKUP_STAGE.get(stage)
        if backup is None or backup in company.backup_disabled:
            return None
        if backup not in company.overrides and backup not in self._config.stages:
            return None
        return backup

    def _circuit(self, company: CompanyRouting, route: StageRoute) -> _Circuit:
        key = (company.company_id, route.provider, route.model, route.base_url, route.api_key_env)
        circuit = self._circuits.get(key)
        if circuit is None:
            circuit = self._circuits[key] = _Circuit(self._clock)
        return circuit

    async def warm(self, stage: Stage, company: CompanyRouting) -> None:
        """Open connections and prime caches for the stage and its backup at call start."""
        stages = [stage]
        backup = self._backup_stage(stage, company)
        if backup is not None:
            stages.append(backup)
        await asyncio.gather(*(self.adapter_for(s, company).warm() for s in stages))

    async def stream(
        self,
        stage: Stage,
        req: LLMRequest,
        *,
        company: CompanyRouting,
        t0_ms: int,
        result: RouteResult | None = None,
    ) -> AsyncGenerator[LLMChunk, None]:
        result = result if result is not None else RouteResult()
        primary_route = self.resolve(stage, company)
        backup_stage = self._backup_stage(stage, company)
        primary_circuit = self._circuit(company, primary_route)
        queue: asyncio.Queue[tuple[Source, LLMChunk | BaseException | None]] = asyncio.Queue()
        tasks: dict[Source, asyncio.Task[None]] = {}
        failed: set[Source] = set()

        async def pump(source: Source, adapter: LLMAdapter) -> None:
            try:
                async for chunk in adapter.stream(req):
                    await queue.put((source, chunk))
                await queue.put((source, None))
            except asyncio.CancelledError:
                raise
            except Exception as err:  # reported through the queue; the race decides what to do
                await queue.put((source, err))

        def start(source: Source, which: Stage) -> None:
            tasks[source] = asyncio.create_task(pump(source, self.adapter_for(which, company)))

        def start_backup(reason: Literal["timeout", "error", "circuit_open"]) -> None:
            if backup_stage is None or "backup" in tasks:
                return
            try:
                adapter = self.adapter_for(backup_stage, company)
            except ModelFailsR1:
                return  # a backup that cannot meet R1 is no backup (R6); race on without it
            result.fallback_reason = result.fallback_reason or reason
            tasks["backup"] = asyncio.create_task(pump("backup", adapter))

        if primary_circuit.is_open() and backup_stage is not None:
            start_backup("circuit_open")
        else:
            start("primary", stage)

        deadline_task: asyncio.Task[None] | None = None
        if primary_route.first_token_ms is not None and "primary" in tasks:
            wait = t0_ms + primary_route.first_token_ms - self._clock.now_ms()
            deadline_task = asyncio.create_task(self._clock.sleep(wait))

        winner: Source | None = None
        getter: asyncio.Task[tuple[Source, LLMChunk | BaseException | None]] | None = None
        try:
            while True:
                getter = asyncio.create_task(queue.get())
                waiting: set[asyncio.Future[Any]] = {getter}
                if winner is None and deadline_task is not None and not deadline_task.done():
                    waiting.add(deadline_task)
                done, _ = await asyncio.wait(waiting, return_when=asyncio.FIRST_COMPLETED)
                if getter not in done:
                    getter.cancel()
                    start_backup("timeout")
                    continue
                source, item = getter.result()
                if winner is not None and source != winner:
                    continue
                if isinstance(item, BaseException):
                    failed.add(source)
                    if source == "primary":
                        primary_circuit.record_failure()
                    if winner is not None:
                        raise item
                    start_backup("error")
                    if failed >= set(tasks):
                        raise AllProvidersFailed(f"{stage}: every provider failed") from item
                    continue
                if item is None:
                    if winner is None:  # finished without a single chunk: treat as a failure
                        failed.add(source)
                        if source == "primary":
                            primary_circuit.record_failure()
                            start_backup("error")
                        if failed >= set(tasks):
                            raise AllProvidersFailed(f"{stage}: empty response")
                        continue
                    return
                if winner is None:
                    winner = source
                    route = (
                        primary_route
                        if source == "primary"
                        else self.resolve(backup_stage or stage, company)
                    )
                    result.winner, result.provider, result.model = (
                        source,
                        route.provider,
                        route.model,
                    )
                    result.first_token_at_ms = self._clock.now_ms()
                    if source == "primary":
                        primary_circuit.record_success()
                    loser: Source = "backup" if source == "primary" else "primary"
                    if loser in tasks:
                        tasks[loser].cancel()
                yield item
        finally:
            if getter is not None:
                getter.cancel()
            for task in [*tasks.values(), *([deadline_task] if deadline_task else [])]:
                task.cancel()
            for task in tasks.values():
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task
