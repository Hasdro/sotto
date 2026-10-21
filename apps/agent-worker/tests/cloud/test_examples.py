"""Every new company starts with two example playbook answers it can edit (owner, 21 Oct)."""

from __future__ import annotations

from pathlib import Path

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud import __main__ as cli
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import PASSWORD, SignUp


def test_seed_has_two_example_answers(seed: Seed) -> None:
    assert len(seed.examples) == 2
    assert all("example" in e["tags"] for e in seed.examples)


def test_a_new_company_starts_with_the_examples(
    client: TestClient, sign_up: SignUp, seed: Seed
) -> None:
    body = sign_up()
    r = client.get("/api/v1/playbook", headers=body["auth"])
    questions = {e["question"] for e in r.json()["entries"]}
    assert questions == {e["question"] for e in seed.examples}


def test_examples_are_added_to_an_existing_company_once(store: CloudStore, seed: Seed) -> None:
    company_id, _ = store.signup(
        company="Zylker", name="Z", email="z@zylker.test", password=PASSWORD
    )
    for e in store.playbook(company_id):
        store._q("DELETE FROM playbook WHERE id = ?", (e["id"],))
    assert store.add_examples(company_id, seed.examples) == 2
    assert store.add_examples(company_id, seed.examples) == 0
    assert len(store.playbook(company_id)) == 2


@pytest.fixture
def env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("SOTTO_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("SOTTO_SECRET_KEY", "k" * 40)
    return tmp_path


def test_cli_adds_examples_by_company_name(env: Path, capsys: pytest.CaptureFixture[str]) -> None:
    store = cli.open_store(__import__("os").environ)
    store.signup(company="Zylker", name="Z", email="z@zylker.test", password=PASSWORD)
    assert cli.main(["add-examples", "--company", "zylker"]) == 0
    assert "2 example" in capsys.readouterr().out  # a company made before examples existed
    assert cli.main(["add-examples", "--company", "Zylker"]) == 0
    assert "0 example" in capsys.readouterr().out
    assert cli.main(["add-examples", "--company", "Nobody"]) == 1
