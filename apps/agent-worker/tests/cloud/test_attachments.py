"""Admin-curated email attachments (INT-14b): allow-listed types and size only, agents cannot
upload, company isolation, and the follow-up email carries the chosen file (preview lists it)."""

from __future__ import annotations

from typing import Any

from starlette.testclient import TestClient

from sotto_worker.cloud.store import CloudStore
from tests.cloud.fake_smtp import FakeSmtp
from tests.cloud.test_email import (  # noqa: F401 (fixtures)
    agent,
    draft,
    mclient,
    owner_login,
    sent_via,
    set_org_smtp,
    signup,
    smtp,
)

PDF = b"%PDF-1.7\n" + b"0" * 2000
URL = "/api/v1/company/email/attachments"


def upload(
    c: TestClient, h: dict[str, str], name: str, blob: bytes, kind: str = "application/pdf"
) -> Any:
    return c.put(f"{URL}?name={name}", content=blob, headers={**h, "content-type": kind})


def test_only_allow_listed_types_and_sizes(mclient: TestClient) -> None:  # noqa: F811 - the email app fixtures
    h = signup(mclient, "Acme", "admin@acme.test")
    r = upload(mclient, h, "Brochure 2026.pdf", PDF)
    assert r.status_code == 201, r.text
    assert [a["name"] for a in r.json()["attachments"]] == ["Brochure 2026.pdf"]
    assert (
        upload(mclient, h, "run.exe", b"MZ" + b"0" * 10, "application/octet-stream").status_code
        == 400
    )
    assert upload(mclient, h, "fake.pdf", b"MZ not a pdf").status_code == 400  # bytes lie
    assert upload(mclient, h, "photo.png", PDF, "image/png").status_code == 400
    assert upload(mclient, h, "page.html", b"<html>", "text/html").status_code == 400
    assert upload(mclient, h, "big.pdf", b"%PDF-" + b"0" * (5 * 1024 * 1024)).status_code == 413
    assert upload(mclient, h, "empty.pdf", b"").status_code == 400
    deck = b"PK\x03\x04" + b"0" * 100
    pptx = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    assert upload(mclient, h, "Deck.pptx", deck, pptx).status_code == 201


def test_agents_cannot_upload_or_delete(mclient: TestClient, store: CloudStore) -> None:  # noqa: F811 - the email app fixtures
    h = signup(mclient, "Acme", "admin@acme.test")
    owner_login(mclient, store)
    set_org_smtp(mclient, h)
    ag = agent(mclient, h)
    assert upload(mclient, ag, "mine.pdf", PDF).status_code == 403
    fid = upload(mclient, h, "Price list.pdf", PDF).json()["attachments"][0]["id"]
    assert mclient.delete(f"{URL}/{fid}", headers=ag).status_code == 403
    assert mclient.get(URL, headers=ag).status_code == 403
    picked = mclient.get("/api/v1/email/attachments", headers=ag).json()["attachments"]
    assert picked == [
        {"id": fid, "name": "Price list.pdf", "mime": "application/pdf", "size": len(PDF)}
    ]


def test_company_isolation(mclient: TestClient, store: CloudStore, smtp: FakeSmtp) -> None:  # noqa: F811 - the email app fixtures
    a = signup(mclient, "Acme", "admin@acme.test")
    b = signup(mclient, "Beta", "admin@beta.test")
    owner_login(mclient, store)
    set_org_smtp(mclient, b)
    fid = upload(mclient, a, "Acme secret.pdf", PDF).json()["attachments"][0]["id"]
    assert mclient.get(URL, headers=b).json()["attachments"] == []
    assert mclient.get("/api/v1/email/attachments", headers=b).json()["attachments"] == []
    assert mclient.delete(f"{URL}/{fid}", headers=b).status_code == 404
    r = mclient.post(
        "/api/v1/email/send",
        json={**draft(), "attachments": [fid], "confirm": True, "idempotency_key": "beta-steal-1"},
        headers=b,
    )
    assert r.status_code == 400
    assert not smtp.inbox
    assert len(store._q("SELECT id FROM email_attachments WHERE company_id IS NOT NULL")) == 1


def test_the_email_carries_the_chosen_attachment(
    mclient: TestClient,  # noqa: F811 - the email app fixtures
    smtp: FakeSmtp,  # noqa: F811
    store: CloudStore,
) -> None:
    h = signup(mclient, "Acme", "admin@acme.test")
    owner_login(mclient, store)
    set_org_smtp(mclient, h)
    fid = upload(mclient, h, "Proposal.pdf", PDF).json()["attachments"][0]["id"]
    ag = agent(mclient, h)
    p = mclient.post("/api/v1/email/preview", json={**draft(), "attachments": [fid]}, headers=ag)
    assert p.status_code == 200, p.text
    assert p.json()["attachments"] == [{"name": "Proposal.pdf", "size": len(PDF)}]
    r = mclient.post(
        "/api/v1/email/send",
        json={**draft(), "attachments": [fid], "confirm": True, "idempotency_key": "call-9-email"},
        headers=ag,
    )
    assert r.status_code == 200, r.text
    got = smtp.inbox[-1].message
    files = [(part.get_filename(), part.get_content()) for part in got.iter_attachments()]
    assert files == [("Proposal.pdf", PDF)]
    audit = store._q("SELECT detail FROM audit WHERE action = 'email.sent'")
    assert "1 attached" in audit[-1]["detail"]
    # The admin can turn attachments off for the org: then a send with one is refused.
    mclient.put("/api/v1/company/features/email_attachments", json={"enabled": False}, headers=h)
    r = mclient.post("/api/v1/email/preview", json={**draft(), "attachments": [fid]}, headers=ag)
    assert r.status_code == 403
