"""T-088: the owner console has the blue shield favicon (D-041), not the old ink-teal one."""

from __future__ import annotations

from starlette.testclient import TestClient

from sotto_worker.cloud.app import FONT_DIR

OWNER_DIR = FONT_DIR.parent


def test_owner_favicon_is_served_as_svg(client: TestClient) -> None:
    r = client.get("/owner/favicon.svg")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/svg+xml")
    assert b"#005bbf" in r.content
    assert b"#0b5f63" not in r.content


def test_owner_page_links_the_favicon() -> None:
    page = (OWNER_DIR / "index.html").read_text()
    assert '<link rel="icon" href="/owner/favicon.svg" type="image/svg+xml">' in page
