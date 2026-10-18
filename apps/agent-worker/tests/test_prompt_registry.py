import pytest

from sotto_worker.prompts import (
    PromptContext,
    PromptNotFound,
    PromptRegistry,
    PromptRenderError,
    PromptVersion,
    render,
)
from tests.conftest import REPO_ROOT


def _v(
    scope: str, scope_id: str | None, version: int, body: str, variables: tuple[str, ...] = ()
) -> PromptVersion:
    return PromptVersion(
        key="suggest", version=version, scope=scope, scope_id=scope_id, stage="suggest",
        variables=variables, body=body,
    )  # fmt: skip


CTX = PromptContext(company_id="acme", team_id="north", campaign_id="spring")


def test_render_substitutes_dotted_variables() -> None:
    assert (
        render(
            "Hi {{company.name}}, {{ card.language }}!",
            {"company.name": "Acme", "card.language": "en"},
        )
        == "Hi Acme, en!"
    )


def test_render_refuses_a_missing_variable() -> None:
    with pytest.raises(PromptRenderError, match=r"company\.tone"):
        render("{{company.tone}}", {})


def test_most_specific_published_scope_wins() -> None:
    reg = PromptRegistry()
    reg.add(_v("platform", None, 1, "platform"), publish=True)
    reg.add(_v("company", "acme", 1, "company"), publish=True)
    reg.add(_v("team", "north", 1, "team"), publish=True)
    assert reg.get("suggest", CTX).body == "team"
    assert reg.get("suggest", PromptContext(company_id="acme")).body == "company"
    assert reg.get("suggest", PromptContext(company_id="other")).body == "platform"


def test_draft_versions_are_never_served() -> None:
    reg = PromptRegistry()
    reg.add(_v("platform", None, 1, "v1"), publish=True)
    reg.add(_v("platform", None, 2, "v2 draft"))
    assert reg.get("suggest", CTX).body == "v1"


def test_publish_then_roll_back_to_an_older_version() -> None:
    reg = PromptRegistry()
    reg.add(_v("company", "acme", 1, "v1"), publish=True)
    reg.add(_v("company", "acme", 2, "v2"))
    reg.publish("suggest", "company", "acme", 2)
    assert reg.get("suggest", CTX).body == "v2"
    reg.publish("suggest", "company", "acme", 1)
    assert reg.get("suggest", CTX).body == "v1"
    assert [v.version for v in reg.history("suggest", "company", "acme")] == [1, 2]


def test_unknown_key_raises() -> None:
    with pytest.raises(PromptNotFound):
        PromptRegistry().get("nope", CTX)


def test_render_falls_back_to_platform_when_a_specific_version_breaks() -> None:
    reg = PromptRegistry()
    reg.add(_v("platform", None, 1, "ok {{a}}", ("a",)), publish=True)
    reg.add(_v("company", "acme", 1, "broken {{missing}}", ("missing",)), publish=True)
    rendered = reg.render("suggest", CTX, {"a": "1"})
    assert rendered.text == "ok 1"
    assert rendered.fell_back


def test_seed_prompts_load_as_published_platform_versions() -> None:
    reg = PromptRegistry.from_seed(REPO_ROOT / "seed" / "prompts")
    prompt = reg.get("suggest", CTX)
    assert prompt.scope == "platform"
    assert "{{playbook.match}}" in prompt.body
    assert set(prompt.variables) >= {"playbook.match", "transcript.last_60s"}
