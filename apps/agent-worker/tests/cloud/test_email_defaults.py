"""INT-14a: the default email formats, one per after-call action. Each passes the same checks an
admin's own format does, links live only in the static blocks, and a rendered email keeps those
blocks verbatim around the agent's body."""

from __future__ import annotations

from sotto_worker.cloud.email.data import DEFAULTS, clean_format
from sotto_worker.cloud.email.render import render

VALUES = {
    "customer.name": "Sara",
    "agent.name": "Omar",
    "agent.email": "omar@acme.test",
    "company.name": "Acme",
}


def test_every_default_is_a_valid_format_with_a_unique_id() -> None:
    ids = [f["id"] for f in DEFAULTS["formats"]]
    assert ids == ["follow_up", "meeting_confirmation", "proposal", "booking"]
    for raw in DEFAULTS["formats"]:
        assert clean_format(raw) == raw  # unchanged by the admin-side checks


def test_links_sit_in_static_blocks_not_in_the_body() -> None:
    by_id = {f["id"]: f for f in DEFAULTS["formats"]}
    for fid, word in (("proposal", "Proposal:"), ("booking", "Book a time:")):
        fmt = by_id[fid]
        assert word in fmt["signature"]
        assert word not in fmt["body"]


def test_static_blocks_are_sent_verbatim_around_the_body() -> None:
    fmt = next(f for f in DEFAULTS["formats"] if f["id"] == "booking")
    out = render(fmt, subject=fmt["subject"], body="See you soon.", values=VALUES)
    assert out.text.startswith("Hi Sara,\n\nSee you soon.\n\nBook a time: [paste")
    assert out.text.endswith("Best regards,\nOmar\nAcme")
