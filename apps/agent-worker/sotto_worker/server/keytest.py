""" "Test connection" for a provider key (P6.7). LLM vendors: list models from the vendor's own
models endpoint. STT vendors: open a real-time session, stream half a second of silence, close.
The key is only sent to that vendor's host (D-016) and never appears in the result."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx

from sotto_worker.adapters.factory import STT_VENDORS, check_key_host, make_stt
from sotto_worker.adapters.stt.base import STTError
from sotto_worker.contracts import STTOptions
from sotto_worker.router import StageRoute
from sotto_worker.server.catalog import Provider

TIMEOUT_S = 12.0
ANTHROPIC_VERSION = "2023-06-01"


@dataclass(frozen=True)
class KeyCheck:
    ok: bool
    detail: str
    models: tuple[str, ...] = ()


def _redact(text: str, key: str) -> str:
    return text.replace(key, "***") if key else text


async def check_key(
    provider: Provider, key: str, *, client: httpx.AsyncClient | None = None
) -> KeyCheck:
    try:
        if provider.kind == "stt":
            return await asyncio.wait_for(_check_stt(provider, key), TIMEOUT_S)
        return await _check_llm(provider, key, client)
    except TimeoutError:
        return KeyCheck(False, "no answer from the vendor in time")
    except Exception as e:  # any failure is a failed test with a safe message
        return KeyCheck(False, _redact(f"{type(e).__name__}: {e}", key)[:300])


async def _check_llm(provider: Provider, key: str, client: httpx.AsyncClient | None) -> KeyCheck:
    url = provider.models_url()
    if url is None:
        return KeyCheck(False, "this vendor has no models endpoint to test")
    if provider.route.get("provider") == "openai_compatible":
        check_key_host(provider.key_env, str(provider.route.get("base_url")))
    elif urlsplit(url).scheme != "https":
        return KeyCheck(False, "test URL must be https")
    if provider.route.get("provider") == "anthropic":
        headers = {"x-api-key": key, "anthropic-version": ANTHROPIC_VERSION}
    else:
        headers = {"Authorization": f"Bearer {key}"}
    owned = client is None
    http = client or httpx.AsyncClient(timeout=TIMEOUT_S)
    try:
        response = await http.get(url, headers=headers)
    finally:
        if owned:
            await http.aclose()
    if response.status_code in (401, 403):
        return KeyCheck(False, f"the vendor rejected the key (HTTP {response.status_code})")
    if response.status_code != 200:
        return KeyCheck(False, f"unexpected answer from the vendor (HTTP {response.status_code})")
    data = response.json().get("data") or response.json().get("models") or []
    ids = sorted(
        {
            str(m.get("id") or m.get("name") or "").removeprefix("models/")
            for m in data
            if isinstance(m, dict)
        }
        - {""}
    )
    return KeyCheck(True, f"key works; {len(ids)} models available", tuple(ids))


async def _silence(ms: int = 500, sample_rate: int = 16000) -> AsyncIterator[bytes]:
    frame = b"\x00\x00" * (sample_rate // 50)  # 20 ms
    for _ in range(ms // 20):
        await asyncio.sleep(0.02)
        yield frame


async def _check_stt(provider: Provider, key: str) -> KeyCheck:
    if provider.id not in STT_VENDORS:
        return KeyCheck(False, "unknown speech vendor")
    model = provider.models[0] if provider.models else ""
    route = StageRoute(provider=provider.id, model=model)
    adapter = make_stt(route, env={provider.key_env: key})
    try:
        async for _ in adapter.transcribe(_silence(), STTOptions(speaker="customer")):
            pass
    except STTError as e:
        return KeyCheck(False, _redact(str(e), key)[:300])
    return KeyCheck(True, "key works; a real-time session opened and closed")
