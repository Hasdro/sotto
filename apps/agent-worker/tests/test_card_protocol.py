"""The worker's card model must agree with the shared fixtures and the shared JSON Schema."""

import json
import subprocess
import sys
from pathlib import Path

import jsonschema
import pytest
from pydantic import ValidationError

from sotto_worker.protocol import CardMessage
from tests.conftest import REPO_ROOT

FIXTURES = REPO_ROOT / "packages" / "shared" / "fixtures" / "cards"
SCHEMA = REPO_ROOT / "packages" / "shared" / "schema" / "card.v1.schema.json"
WORKER = REPO_ROOT / "apps" / "agent-worker"


def _fixtures(kind: str) -> list[Path]:
    paths = sorted((FIXTURES / kind).glob("*.json"))
    assert paths, f"no {kind} card fixtures found in {FIXTURES / kind}"
    return paths


@pytest.mark.parametrize("path", _fixtures("valid"), ids=lambda p: p.name)
def test_accepts_valid_fixture(path: Path) -> None:
    card = CardMessage.model_validate_json(path.read_text())
    assert card.v == 1


@pytest.mark.parametrize("path", _fixtures("invalid"), ids=lambda p: p.name)
def test_rejects_invalid_fixture(path: Path) -> None:
    with pytest.raises(ValidationError):
        CardMessage.model_validate_json(path.read_text())


@pytest.mark.parametrize("path", _fixtures("invalid"), ids=lambda p: p.name)
def test_json_schema_rejects_invalid_fixture(path: Path) -> None:
    schema = json.loads(SCHEMA.read_text())
    validator = jsonschema.Draft202012Validator(schema)
    assert not validator.is_valid(json.loads(path.read_text()))


def test_serialised_card_omits_unset_optional_fields() -> None:
    raw = (FIXTURES / "valid" / "ai-labelled-final.json").read_text()
    card = CardMessage.model_validate_json(raw)
    assert json.loads(card.to_wire()) == json.loads(raw)


@pytest.mark.parametrize("module", ["card.py", "demo.py"])
def test_generated_model_is_up_to_date(tmp_path: Path, module: str) -> None:
    subprocess.run(  # noqa: S603 - fixed argv, our own script
        [sys.executable, str(WORKER / "scripts" / "gen_card_model.py"), "--out-dir", str(tmp_path)],
        check=True,
    )
    committed = (WORKER / "sotto_worker" / "protocol" / module).read_text()
    assert (tmp_path / module).read_text() == committed, "run `pnpm gen` and commit the result"
