"""The worker's demo-bridge models agree with the shared fixtures (D-013)."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from sotto_worker.protocol.demo import DemoClientMessage, DemoServerMessage
from tests.conftest import REPO_ROOT

FIXTURES = REPO_ROOT / "packages" / "shared" / "fixtures" / "demo"


def _model(path: Path) -> type[DemoClientMessage] | type[DemoServerMessage]:
    return DemoClientMessage if path.name.startswith("client-") else DemoServerMessage


@pytest.mark.parametrize("path", sorted((FIXTURES / "valid").glob("*.json")), ids=lambda p: p.name)
def test_accepts_valid(path: Path) -> None:
    _model(path).model_validate_json(path.read_text())


@pytest.mark.parametrize(
    "path", sorted((FIXTURES / "invalid").glob("*.json")), ids=lambda p: p.name
)
def test_rejects_invalid(path: Path) -> None:
    with pytest.raises(ValidationError):
        _model(path).model_validate_json(path.read_text())
