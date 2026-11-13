"""The owner console and the landing page carry copies of the design-system CSS (D-041). They
must match packages/ui; run `bash scripts/sync-ui-css.sh` after changing the tokens."""

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[4]
UI = ROOT / "packages" / "ui"
COPIES = [
    ROOT / "apps" / "agent-worker" / "sotto_worker" / "cloud" / "owner",
    ROOT / "apps" / "landing",
]


@pytest.mark.parametrize("dest", COPIES, ids=lambda p: p.name)
@pytest.mark.parametrize("name", ["tokens.css", "components.css"])
def test_design_css_copy_is_current(dest: Path, name: str) -> None:
    assert (dest / name).read_text() == (UI / name).read_text(), (
        f"{dest / name} is stale: run bash scripts/sync-ui-css.sh"
    )
