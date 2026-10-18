"""Replay harness (P2.8). Real golden calls need audio + STT; until they exist the synthetic
replay over seed/demo/calls exercises the whole pipeline on a fake clock."""

from pathlib import Path

import pytest

from replay.__main__ import main
from replay.synthetic import LatencyProfile, replay_synthetic
from sotto_worker.runtime import DEMO
from sotto_worker.scenarios import load_all


async def test_synthetic_replay_meets_r1_and_r4_on_the_demo_calls() -> None:
    report = await replay_synthetic(load_all(DEMO / "calls"), LatencyProfile(seed=7))
    assert report.cards >= 10
    assert report.agent_triggered == 0
    assert report.unmet_expectations == []
    assert report.summary.p95_ms <= 1500


async def test_a_slow_model_profile_fails_r1() -> None:
    slow = LatencyProfile(seed=1, primary_p50_ms=1600, backup_p50_ms=1600)
    report = await replay_synthetic(load_all(DEMO / "calls"), slow, holding_line=False)
    assert report.summary.p95_ms > 1500
    assert not report.passed


def test_cli_runs_synthetic_when_no_golden_calls(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main(["--all", "--calls-dir", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert "no golden calls yet" in out
    assert "SYNTHETIC" in out
    assert "p95" in out


def test_cli_fails_when_golden_calls_exist_but_audio_replay_is_not_built(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "call-001.json").write_text("{}")
    assert main(["--all", "--calls-dir", str(tmp_path)]) == 1
    assert "audio replay" in capsys.readouterr().out
