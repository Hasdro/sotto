"""Per-directory coverage floors (CONSTRAINTS.md)."""

from scripts.check_coverage import FLOORS, failures


def _report(files: dict[str, tuple[int, int]]) -> dict[str, object]:
    """files: path → (covered, total) counting statements and branches together."""
    return {
        "files": {
            path: {
                "summary": {
                    "covered_lines": covered,
                    "num_statements": total,
                    "covered_branches": 0,
                    "num_branches": 0,
                }
            }
            for path, (covered, total) in files.items()
        }
    }


def test_floors_cover_the_live_path() -> None:
    assert {"sotto_worker/pipeline/", "sotto_worker/router/", "sotto_worker/adapters/"} <= set(
        FLOORS
    )


def test_directory_below_its_floor_fails() -> None:
    report = _report(
        {"sotto_worker/router/select.py": (80, 100), "sotto_worker/protocol/card.py": (900, 900)}
    )
    assert failures(report) == ["sotto_worker/router/: 80.0% < 90%"]


def test_directory_at_its_floor_passes() -> None:
    report = _report({"sotto_worker/router/select.py": (90, 100)})
    assert failures(report) == []


def test_missing_directory_is_not_a_failure_yet() -> None:
    assert failures(_report({"sotto_worker/protocol/card.py": (10, 10)})) == []


def test_overall_floor_applies_to_everything() -> None:
    report = _report({"sotto_worker/protocol/card.py": (50, 100)})
    assert failures(report) == ["overall: 50.0% < 90%"]
