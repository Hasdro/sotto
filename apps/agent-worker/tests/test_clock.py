import asyncio

from sotto_worker.clock import FakeClock


async def test_sleepers_wake_in_time_order_at_their_exact_time() -> None:
    clock = FakeClock()
    woke: list[tuple[str, int]] = []

    async def sleeper(name: str, ms: int) -> None:
        await clock.sleep(ms)
        woke.append((name, clock.now_ms()))

    tasks = [asyncio.create_task(sleeper("b", 700)), asyncio.create_task(sleeper("a", 300))]
    await clock.advance(299)
    assert woke == []
    await clock.advance(1000)
    assert woke == [("a", 300), ("b", 700)]
    assert clock.now_ms() == 1299
    await asyncio.gather(*tasks)


async def test_sleep_scheduled_during_advance_still_fires_within_the_window() -> None:
    clock = FakeClock()
    woke: list[int] = []

    async def chain() -> None:
        await clock.sleep(100)
        await clock.sleep(100)
        woke.append(clock.now_ms())

    task = asyncio.create_task(chain())
    await clock.advance(250)
    assert woke == [200]
    await task
