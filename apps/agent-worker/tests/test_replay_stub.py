"""`pnpm replay` is a stub until P2.8; it must never pretend a replay ran."""

from pathlib import Path

import pytest

from replay.__main__ import main


def test_no_golden_calls_exits_zero(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--calls-dir", str(tmp_path)]) == 0
    assert "no golden calls yet" in capsys.readouterr().out


def test_golden_calls_present_fails_until_harness_exists(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "call-001.json").write_text("{}")
    assert main(["--calls-dir", str(tmp_path)]) == 1
    assert "P2.8" in capsys.readouterr().out
