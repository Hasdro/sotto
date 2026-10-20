"""`python -m sotto_worker.cloud` commands: create-owner, backup, and serve's safety check."""

from __future__ import annotations

from pathlib import Path

import pytest

from sotto_worker.cloud import __main__ as cli


@pytest.fixture
def env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("SOTTO_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("SOTTO_SECRET_KEY", "k" * 40)
    monkeypatch.delenv("SOTTO_PUBLIC_ORIGIN", raising=False)
    return tmp_path


def test_create_owner_writes_a_private_password_file_once(env: Path) -> None:
    target = env / "owner.txt"
    assert cli.main(["create-owner", "--email", "o@x.test", "--password-file", str(target)]) == 0
    assert target.stat().st_mode & 0o777 == 0o600
    assert "o@x.test" in target.read_text()
    again = cli.main(["create-owner", "--email", "p@x.test", "--password-file", str(env / "b.txt")])
    assert again == 1


def test_backup_keeps_the_newest_copies(env: Path) -> None:
    folder = env / "data" / "backups"
    folder.mkdir(parents=True)
    for i in range(cli.KEEP_BACKUPS + 3):
        (folder / f"cloud-20200101-0000{i:02d}.db").write_bytes(b"")
    assert cli.main(["backup"]) == 0
    kept = sorted(folder.glob("cloud-*.db"))
    assert len(kept) == cli.KEEP_BACKUPS
    assert kept[-1].stat().st_size > 0  # the new one is a real database copy


def test_serve_refuses_a_public_host_without_https_origin(env: Path) -> None:
    assert cli.main(["serve", "--host", "203.0.113.5"]) == 2


def test_local_secret_is_created_when_no_key_is_set(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("SOTTO_SECRET_KEY", raising=False)
    data = tmp_path / "d"
    data.mkdir()
    first = cli.secret({}, data)
    assert len(first) >= 32
    assert cli.secret({}, data) == first
