"""`python -m sotto_worker.demo` stays local-only (D-013, D-020)."""

from __future__ import annotations

import runpy
import sys

import pytest

import sotto_worker.server.__main__ as server_main


def _run(monkeypatch: pytest.MonkeyPatch, argv: list[str]) -> int:
    calls: list[list[str]] = []

    def fake_main(args: list[str]) -> int:
        calls.append(args)
        return 0

    monkeypatch.setattr(server_main, "main", fake_main)
    monkeypatch.setattr(sys, "argv", ["sotto_worker.demo", *argv])
    with pytest.raises(SystemExit) as exit_info:
        runpy.run_module("sotto_worker.demo", run_name="__main__")
    assert calls == ([argv] if exit_info.value.code == 0 else [])
    return int(exit_info.value.code or 0)


def test_demo_starts_the_local_server(monkeypatch: pytest.MonkeyPatch) -> None:
    assert _run(monkeypatch, ["--fake"]) == 0


def test_demo_refuses_a_public_host(monkeypatch: pytest.MonkeyPatch) -> None:
    assert _run(monkeypatch, ["--host", "0.0.0.0"]) == 2  # noqa: S104 - the case under test
