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


async def test_all_providers_down_still_shows_a_card_for_every_turn_r2() -> None:
    profile = LatencyProfile(seed=3, providers_down=True)
    report = await replay_synthetic(load_all(DEMO / "calls"), profile)
    assert report.unmet_expectations == []
    assert report.summary.p95_ms <= 1500
    assert {r.source for r in report.records} <= {"playbook", "holding"}


def test_cli_reports_stages_and_the_outage_drill(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main(["--all", "--calls-dir", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert "model first token" in out
    assert "holding rate" in out
    assert "all providers down" in out


def test_cli_does_not_claim_the_r1_gate_and_reports_the_backup_race(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """The synthetic PASS is not the R1 acceptance gate; real recorded calls are (T-031)."""
    assert main(["--all", "--calls-dir", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert "PASS (synthetic — not the R1 gate)" in out
    assert "R1 p95 ≤ 1500 ms: PASS\n" not in out
    assert "real recorded calls" in out
    assert "backup started on" in out
    assert "backup won" in out
