"""Injectable clock. Live code uses RealClock; tests use FakeClock so deadlines (700 ms backup
race, t0+1400 holding line) are tested exactly and without sleeping."""

from __future__ import annotations

import asyncio
import heapq
import itertools
import time
from typing import Protocol


class Clock(Protocol):
    def now_ms(self) -> int: ...

    async def sleep(self, ms: float) -> None: ...


class RealClock:
    def now_ms(self) -> int:
        return int(time.monotonic() * 1000)

    async def sleep(self, ms: float) -> None:
        await asyncio.sleep(max(ms, 0) / 1000)


class FakeClock:
    """Time moves only when a test calls `advance`; sleepers wake at their exact due time."""

    def __init__(self, start_ms: int = 0) -> None:
        self._now = start_ms
        self._order = itertools.count()
        self._sleepers: list[tuple[int, int, asyncio.Future[None]]] = []

    def now_ms(self) -> int:
        return self._now

    async def sleep(self, ms: float) -> None:
        if ms <= 0:
            await asyncio.sleep(0)
            return
        future: asyncio.Future[None] = asyncio.get_running_loop().create_future()
        heapq.heappush(self._sleepers, (self._now + int(ms), next(self._order), future))
        await future

    async def advance(self, ms: int) -> None:
        target = self._now + ms
        await _settle()
        while self._sleepers and self._sleepers[0][0] <= target:
            due, _, future = heapq.heappop(self._sleepers)
            self._now = due
            if not future.done():
                future.set_result(None)
            await _settle()
        self._now = target
        await _settle()


async def _settle(rounds: int = 20) -> None:
    """Let ready tasks run until they block again (on the clock or on I/O)."""
    for _ in range(rounds):
        await asyncio.sleep(0)
