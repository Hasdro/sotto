"""The web app is served from static_dir: SPA fallback, cache rules, and traversal refusal."""

from __future__ import annotations

from pathlib import Path

from starlette.testclient import TestClient

from sotto_worker.cloud.app import APP_CSP, CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import ORIGIN, fake_minter


def _client(root: Path, store: CloudStore, seed: Seed) -> TestClient:
    config = CloudConfig(
        public_origin=ORIGIN, static_dir=root, secure_cookies=False, stt_minter=fake_minter
    )
    return TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)


def test_static_files_spa_fallback_and_cache_rules(
    tmp_path: Path, store: CloudStore, seed: Seed
) -> None:
    (tmp_path / "index.html").write_text("<html>app</html>")
    (tmp_path / "_expo" / "static").mkdir(parents=True)
    (tmp_path / "_expo" / "static" / "a.js").write_text("1")
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "index.html").write_text("<html>sub</html>")
    c = _client(tmp_path, store, seed)

    page = c.get("/history")  # client-side route: falls back to index.html, never cached
    assert page.text == "<html>app</html>"
    assert page.headers["cache-control"] == "no-store"
    assert page.headers["content-security-policy"] == APP_CSP
    assert c.get("/sub").text == "<html>sub</html>"

    asset = c.get("/_expo/static/a.js")
    assert asset.status_code == 200
    assert "immutable" in asset.headers["cache-control"]
    assert c.get("/missing.js").status_code == 404
    assert c.get("/%2e%2e/secret").status_code == 404


def test_without_a_web_build_a_plain_notice_is_served(
    tmp_path: Path, store: CloudStore, seed: Seed
) -> None:
    r = _client(tmp_path, store, seed).get("/")
    assert "web app is not installed" in r.text
