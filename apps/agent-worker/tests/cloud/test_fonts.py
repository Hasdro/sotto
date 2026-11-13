"""Self-hosted fonts (OFL): served from our own origin with the right type; CSP keeps font-src 'self'."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.app import FONT_DIR, OWNER_CSP


@pytest.mark.parametrize("name", sorted(p.name for p in FONT_DIR.glob("*.woff")))
def test_font_is_served_with_its_type(client: TestClient, name: str) -> None:
    r = client.get(f"/assets/fonts/{name}")
    assert r.status_code == 200
    assert r.headers["content-type"] == "font/woff"
    assert r.content[:4] == b"wOFF"
    assert "immutable" in r.headers["cache-control"]


def test_font_route_rejects_other_files(client: TestClient) -> None:
    r = client.get("/assets/fonts/..%2Fapp.py")
    assert r.headers.get("content-type") != "font/woff" and b"def " not in r.content
    assert client.get("/assets/fonts/OFL-Inter.txt").status_code == 404


def test_owner_css_loads_fonts_from_our_origin(client: TestClient) -> None:
    assert "font-src 'self'" in OWNER_CSP
    css = (FONT_DIR.parent / "fonts.css").read_text()
    assert "googleapis" not in css and "font-display: swap" in css
    assert "/assets/fonts/inter-400Regular.woff" in css
