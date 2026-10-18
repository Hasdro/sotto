from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(scope="session")
def repo_root() -> Path:
    return REPO_ROOT


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    """Runtime backstop for CONSTRAINTS.md: a skipped or xfailed test fails the run."""
    reporter = session.config.pluginmanager.get_plugin("terminalreporter")
    if reporter is None:
        return
    hidden = len(reporter.stats.get("skipped", [])) + len(reporter.stats.get("xfailed", []))
    if hidden and exitstatus == 0:
        reporter.write_line(
            f"{hidden} skipped/xfailed test(s): not allowed (CONSTRAINTS.md)", red=True
        )
        session.exitstatus = pytest.ExitCode.TESTS_FAILED
