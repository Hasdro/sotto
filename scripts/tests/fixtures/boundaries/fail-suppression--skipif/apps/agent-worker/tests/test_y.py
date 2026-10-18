import pytest


@pytest.mark.skipif(True, reason="x")
def test_y() -> None: ...
