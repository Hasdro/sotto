"""The TypeScript engine's test fixture matches the seed and the worker (D-022)."""

from __future__ import annotations

import importlib.util
from pathlib import Path


def test_engine_fixture_is_up_to_date() -> None:
    path = Path(__file__).resolve().parents[2] / "scripts" / "gen_engine_fixture.py"
    spec = importlib.util.spec_from_file_location("gen_engine_fixture", path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.main(["--check"]) == 0, "run `pnpm gen`"
