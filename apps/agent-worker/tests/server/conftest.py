"""Fixtures for the Sotto server (D-020): a fast fake runtime and an app factory."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from sotto_worker.adapters.llm.fake import FakeLLM
from sotto_worker.clock import RealClock
from sotto_worker.router import ModelRouter, RoutingConfig, StageRoute
from sotto_worker.runtime import SEED, Runtime, build_demo_runtime
from sotto_worker.server.app import ServerConfig, create_app
from sotto_worker.server.auth import AccessGate
from sotto_worker.server.catalog import Catalog
from sotto_worker.server.store import Store
from sotto_worker.server.vault import Vault

SECRET = "s" * 40
CODE = "open-sesame-42"
PUBLIC = "https://sotto.example.com"


def fast_runtime() -> Runtime:
    clock = RealClock()
    base = build_demo_runtime(clock, {}, force_fake=True)
    config = RoutingConfig(
        stages={"suggest": StageRoute(provider="fake", model="f", first_token_ms=700)}
    )
    llm = FakeLLM(clock=clock, text="NO_SAFE_ANSWER", first_token_ms=5, chunk_ms=1)
    return Runtime(
        company=base.company, playbook=base.playbook, prompts=base.prompts,
        router=ModelRouter(config, lambda _route: llm, clock), mode="fake",
    )  # fmt: skip


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    root = tmp_path / "dist"
    root.mkdir()
    (root / "index.html").write_text("<!doctype html><title>Sotto</title>")
    (root / "_expo").mkdir()
    (root / "_expo" / "app.js").write_text("console.log(1)")
    return root


@pytest.fixture
def store(tmp_path: Path) -> Iterator[Store]:
    s = Store(tmp_path / "sotto.db", Vault(SECRET))
    yield s
    s.close()


MakeClient = Callable[..., TestClient]


@pytest.fixture
def make_client(static_dir: Path, store: Store) -> Iterator[MakeClient]:
    clients: list[TestClient] = []

    def make(
        *,
        hosted: bool = False,
        env: dict[str, str] | None = None,
        runtime: Callable[[], Runtime] = fast_runtime,
    ) -> TestClient:
        config = ServerConfig(
            static_dir=static_dir,
            access_code=CODE if hosted else None,
            public_origin=PUBLIC if hosted else None,
            speed=0.0,
        )
        app = create_app(
            config,
            gate=AccessGate(config.access_code, SECRET),
            store=store,
            catalog=Catalog.load(SEED / "models" / "providers.yaml"),
            seed=RoutingConfig.load(SEED / "models" / "default.yaml"),
            env=env or {},
            runtime_factory=runtime,
        )
        base = PUBLIC if hosted else "http://127.0.0.1:8787"
        client = TestClient(app, base_url=base)
        clients.append(client)
        return client

    yield make
    for c in clients:
        c.close()
