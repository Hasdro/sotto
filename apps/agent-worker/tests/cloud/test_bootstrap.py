"""ZC-04 (D-066): playbook bootstrap. Refused without the consent record (D-063); drafts land as
"needs review" and never reach a call before a manager approves them; the website read is limited
to the company's own domain over https with public addresses only (SSRF); company isolation."""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.bootstrap import fetch
from sotto_worker.cloud.bootstrap.sources import zoho_material
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import PASSWORD, SignUp

API = "/api/v1/playbook/bootstrap"
PAGE = (
    "<html><head><style>.x{}</style><script>alert(1)</script></head><body>"
    "<h1>Acme Solar</h1><p>Installation takes two days.</p><p>We cover Dubai &amp; Abu Dhabi.</p>"
    "</body></html>"
)
DRAFTS: list[dict[str, Any]] = [
    {"question": "How long does installation take?", "answer": "Two days.", "tags": ["install"]},
    {"question": "Where do you work?", "answer": "Dubai and Abu Dhabi."},
]


@pytest.fixture
def web(monkeypatch: pytest.MonkeyPatch) -> list[httpx.Request]:
    """A fake DNS and a fake website: acme.test is public, internal.acme.test is private."""
    seen: list[httpx.Request] = []
    addresses = {
        "acme.test": ["93.184.215.14"],
        "www.acme.test": ["93.184.215.14"],
        "internal.acme.test": ["10.0.0.5"],
        "meta.acme.test": ["169.254.169.254"],
        "mixed.acme.test": ["93.184.215.14", "127.0.0.1"],
        "v6.acme.test": ["::ffff:127.0.0.1"],
        "nat64.acme.test": ["64:ff9b::a9fe:a9fe"],
        "sixto4.acme.test": ["2002:a9fe:a9fe::1"],
    }

    def resolve(host: str) -> list[str]:
        if host not in addresses:
            raise OSError("no such host")
        return addresses[host]

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        host = request.headers["host"]
        if request.url.path == "/redirect-private":
            return httpx.Response(302, headers={"location": "https://internal.acme.test/"})
        if request.url.path == "/redirect-off":
            return httpx.Response(302, headers={"location": "https://evil.test/"})
        if request.url.path == "/big":
            return httpx.Response(
                200, headers={"content-type": "text/html"}, content=b"x" * (fetch.MAX_BYTES + 1)
            )
        if request.url.path == "/gzip":
            return httpx.Response(
                200, headers={"content-type": "text/html", "content-encoding": "gzip"}, content=b""
            )
        if request.url.path == "/image":
            return httpx.Response(200, headers={"content-type": "image/png"}, content=b"png")
        assert host in ("acme.test", "www.acme.test")
        return httpx.Response(200, headers={"content-type": "text/html"}, text=PAGE)

    monkeypatch.setattr(fetch, "resolve", resolve)
    monkeypatch.setattr(fetch, "transport", httpx.MockTransport(handler))
    return seen


@pytest.fixture
def sign_up(client: TestClient, sign_up: SignUp) -> SignUp:
    """Signs up a company whose admin has turned `playbook_bootstrap` on (D-076);
    `flag=False` leaves it as a new company starts: off."""

    def go(*args: Any, flag: bool = True, **kw: Any) -> dict[str, Any]:
        s = sign_up(*args, **kw)
        if flag:
            r = client.put(
                "/api/v1/company/features/playbook_bootstrap",
                json={"enabled": True},
                headers=s["auth"],
            )
            assert r.status_code == 200, r.text
        return s

    return go


def test_off_by_default_until_the_admin_turns_it_on(client: TestClient, sign_up: SignUp) -> None:
    s = sign_up(flag=False)
    _consent(client, s)
    calls = [
        ("GET", API, None),
        ("POST", f"{API}/material", {"source": "website", "url": "https://acme.test/"}),
        ("POST", f"{API}/drafts", {"source": "document", "items": DRAFTS}),
        ("POST", f"{API}/drafts/x/approve", {}),
        ("POST", f"{API}/drafts/x/reject", {}),
    ]
    for method, url, body in calls:
        r = client.request(method, url, json=body, headers=s["auth"])
        assert r.status_code == 403, (url, r.text)
        assert r.json()["code"] == "feature_unavailable"
        assert r.json()["feature"] == "playbook_bootstrap"
        assert r.json()["state"] == "off_by_org"
    on = client.put(
        "/api/v1/company/features/playbook_bootstrap", json={"enabled": True}, headers=s["auth"]
    )
    assert on.status_code == 200, on.text
    assert client.get(API, headers=s["auth"]).status_code == 200
    r = client.post(
        f"{API}/drafts", json={"source": "document", "items": DRAFTS}, headers=s["auth"]
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"added": 2}


def _consent(client: TestClient, s: dict[str, Any]) -> None:
    r = client.put(
        "/api/v1/company/defaults",
        json={"consent": {"choice": "all", "text_version": "draft-1"}},
        headers=s["auth"],
    )
    assert r.status_code == 200, r.text


def _member(client: TestClient, s: dict[str, Any], role: str) -> dict[str, str]:
    email = f"{role}@acme.test"
    r = client.post(
        "/api/v1/team", json={"email": email, "name": role, "role": role}, headers=s["auth"]
    )
    temp = r.json()["temporary_password"]
    token = client.post("/api/v1/auth/login", json={"email": email, "password": temp}).json()[
        "token"
    ]
    auth = {"authorization": f"Bearer {token}"}
    client.post(
        "/api/v1/auth/password", json={"current": temp, "new": PASSWORD + role}, headers=auth
    )
    return auth


def test_refused_without_the_consent_record(client: TestClient, sign_up: SignUp, web: Any) -> None:
    s = sign_up()
    state = client.get(API, headers=s["auth"]).json()
    assert state["consent"] is False
    r = client.post(
        f"{API}/drafts", json={"source": "document", "items": DRAFTS}, headers=s["auth"]
    )
    assert r.json()["code"] == "consent_required"
    r = client.post(
        f"{API}/material",
        json={"source": "website", "url": "https://acme.test/"},
        headers=s["auth"],
    )
    assert r.json()["code"] == "consent_required"
    assert web == []  # nothing was fetched


def test_drafts_need_review_and_never_reach_a_call_before_approval(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    s = sign_up()
    _consent(client, s)
    r = client.post(
        f"{API}/drafts", json={"source": "document", "items": DRAFTS}, headers=s["auth"]
    )
    assert r.status_code == 200
    assert r.json() == {"added": 2}
    drafts = client.get(API, headers=s["auth"]).json()["drafts"]
    assert [d["status"] for d in drafts] == ["needs_review", "needs_review"]

    def on_call() -> list[str]:
        return [
            e["question"]
            for e in client.get("/api/v1/bundle", headers=s["auth"]).json()["playbook"]
        ]

    examples = on_call()  # a new company's example answers (seed/company/examples.yaml)
    assert not {str(d["question"]) for d in DRAFTS} & set(examples)  # the bundle carries no draft
    approved = client.post(
        f"{API}/drafts/{drafts[0]['id']}/approve",
        json={"answer": "About two days on site."},
        headers=s["auth"],
    ).json()
    assert approved["status"] == "approved"
    client.post(f"{API}/drafts/{drafts[1]['id']}/reject", headers=s["auth"])
    assert sorted(on_call()) == sorted([*examples, "How long does installation take?"])
    entry = client.get("/api/v1/playbook", headers=s["auth"]).json()
    assert "About two days on site." in str(entry)
    assert client.get(API, headers=s["auth"]).json()["drafts"] == []
    # A decided draft cannot be approved twice.
    again = client.post(f"{API}/drafts/{drafts[1]['id']}/approve", json={}, headers=s["auth"])
    assert again.status_code == 404
    actions = [r["action"] for r in store._q("SELECT action FROM audit")]
    assert {
        "playbook.bootstrap.drafted",
        "playbook.bootstrap.approved",
        "playbook.bootstrap.rejected",
    } <= set(actions)


def test_agents_cannot_bootstrap_or_approve(client: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    _consent(client, s)
    agent = _member(client, s, "agent")
    assert client.get(API, headers=agent).status_code == 403
    r = client.post(f"{API}/drafts", json={"source": "document", "items": DRAFTS}, headers=agent)
    assert r.status_code == 403
    manager = _member(client, s, "manager")
    r = client.post(f"{API}/drafts", json={"source": "document", "items": DRAFTS}, headers=manager)
    assert r.status_code == 200


def test_draft_input_is_validated(client: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    _consent(client, s)
    for bad in (
        {"source": "email", "items": DRAFTS},
        {"source": "document", "items": []},
        {"source": "document", "items": [{"question": "", "answer": "x"}]},
        {"source": "document", "items": DRAFTS * 26},
    ):
        assert client.post(f"{API}/drafts", json=bad, headers=s["auth"]).status_code == 400
    long = {"question": "Q?", "answer": " ".join(["word"] * 60)}
    client.post(f"{API}/drafts", json={"source": "document", "items": [long]}, headers=s["auth"])
    draft = client.get(API, headers=s["auth"]).json()["drafts"][0]
    assert len(draft["answer"].split()) == 40  # the playbook's own limit


def test_reads_one_page_of_the_companys_own_website(
    client: TestClient, sign_up: SignUp, web: list[httpx.Request]
) -> None:
    s = sign_up()
    _consent(client, s)
    assert client.get(API, headers=s["auth"]).json()["domains"] == ["acme.test"]
    r = client.post(
        f"{API}/material",
        json={"source": "website", "url": "https://www.acme.test/about"},
        headers=s["auth"],
    )
    assert r.status_code == 200, r.text
    text = r.json()["text"]
    assert "Installation takes two days." in text
    assert "Dubai & Abu Dhabi" in text
    assert "alert(1)" not in text
    assert ".x{}" not in text
    # The connection went to the checked address with the name only in Host and SNI.
    assert web[0].url.host == "93.184.215.14"
    assert web[0].headers["host"] == "www.acme.test"
    assert web[0].extensions["sni_hostname"] == "www.acme.test"


@pytest.mark.parametrize(
    ("url", "code"),
    [
        ("http://acme.test/", "invalid"),  # https only
        ("https://acme.test:8443/", "invalid"),  # standard port only
        ("https://user:pw@acme.test/", "invalid"),
        ("https://93.184.215.14/", "invalid"),  # a name, not an address
        ("https://[::1]/", "invalid"),
        ("https://evil.test/", "off_domain"),
        ("https://acme.test.evil.test/", "off_domain"),
        ("https://internal.acme.test/", "private_address"),
        ("https://meta.acme.test/latest/meta-data", "private_address"),
        ("https://mixed.acme.test/", "private_address"),  # any private answer refuses
        ("https://v6.acme.test/", "private_address"),  # IPv4-mapped loopback
        ("https://nat64.acme.test/", "private_address"),  # NAT64 to the metadata address
        ("https://sixto4.acme.test/", "private_address"),  # 6to4 to the metadata address
        ("https://acme.test/gzip", "invalid"),  # no decompression
        ("https://acme.test/redirect-private", "private_address"),  # re-checked per hop
        ("https://acme.test/redirect-off", "off_domain"),
        ("https://acme.test/big", "too_large"),
        ("https://acme.test/image", "invalid"),
        ("https://nowhere.acme.test/", "unreachable"),
    ],
)
def test_website_ssrf_guards(
    client: TestClient, sign_up: SignUp, web: list[httpx.Request], url: str, code: str
) -> None:
    s = sign_up()
    _consent(client, s)
    r = client.post(f"{API}/material", json={"source": "website", "url": url}, headers=s["auth"])
    assert r.status_code >= 400
    assert r.json()["code"] == code, r.text
    assert all(req.url.host == "93.184.215.14" for req in web)  # never a private address


def test_free_mail_domains_are_never_the_companys_website(
    client: TestClient, sign_up: SignUp, web: Any
) -> None:
    s = sign_up("Solo", "owner@gmail.com")
    _consent(client, s)
    assert client.get(API, headers=s["auth"]).json()["domains"] == []
    r = client.post(
        f"{API}/material",
        json={"source": "website", "url": "https://gmail.com/"},
        headers=s["auth"],
    )
    assert r.json()["code"] == "off_domain"


def test_zoho_source_needs_the_zoho_lookup(client: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    _consent(client, s)
    assert client.get(API, headers=s["auth"]).json()["zoho"] is False
    r = client.post(f"{API}/material", json={"source": "zoho"}, headers=s["auth"])
    # Wired to the Zoho module's reader (T-083 hub line 5): without a connection it is refused.
    assert r.status_code == 403
    assert r.json()["code"] == "feature_unavailable"
    assert r.json()["state"] == "needs_connection"


def test_zoho_material_reads_won_deals_and_notes_only() -> None:
    import asyncio

    calls: list[tuple[str, ...]] = []

    class Reader:
        async def search_page(
            self, module: str, criteria: str, fields: str, page: int, per_page: int = 200
        ) -> tuple[list[dict[str, Any]], bool]:
            calls.append((module, criteria, fields))
            return [
                {"id": "1", "Deal_Name": "Villa", "Description": "Ten panels", "Amount": 9}
            ], False

        async def related(
            self, module: str, record_id: str, related: str, fields: str, per_page: int
        ) -> list[dict[str, Any]]:
            calls.append((module, record_id, related))
            return [{"Note_Content": "Asked about warranty: 10 years"}]

    text = asyncio.run(zoho_material(Reader()))
    assert "Ten panels" in text
    assert "warranty: 10 years" in text
    assert "9" not in text
    assert calls[0] == ("Deals", "(Stage:equals:Closed Won)", "Deal_Name,Description")


def test_companies_never_see_each_others_drafts(client: TestClient, sign_up: SignUp) -> None:
    a = sign_up("Alpha", "admin@alpha.test")
    b = sign_up("Beta", "admin@beta.test")
    for s in (a, b):
        _consent(client, s)
    client.post(f"{API}/drafts", json={"source": "document", "items": DRAFTS}, headers=a["auth"])
    a_draft = client.get(API, headers=a["auth"]).json()["drafts"][0]
    assert client.get(API, headers=b["auth"]).json()["drafts"] == []
    for action in ("approve", "reject"):
        r = client.post(f"{API}/drafts/{a_draft['id']}/{action}", json={}, headers=b["auth"])
        assert r.status_code == 404
    assert "installation" not in client.get("/api/v1/playbook", headers=b["auth"]).text
    assert len(client.get(API, headers=a["auth"]).json()["drafts"]) == 2


def test_html_text_is_linear_on_unclosed_tags() -> None:
    """Security review H1: a page of unclosed <script> tags must not stall the server."""
    import time

    start = time.monotonic()
    fetch.page_text("<script>" * 120_000)
    assert time.monotonic() - start < 2
    assert fetch.page_text("<p>a<script>x</p>b") == "a"


def test_approving_twice_makes_one_entry(client: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    _consent(client, s)
    client.post(f"{API}/drafts", json={"source": "document", "items": DRAFTS}, headers=s["auth"])
    draft = client.get(API, headers=s["auth"]).json()["drafts"][0]
    path = f"{API}/drafts/{draft['id']}/approve"
    assert client.post(path, json={}, headers=s["auth"]).status_code == 200
    assert client.post(path, json={}, headers=s["auth"]).status_code == 404
    # An invalid edit leaves the draft waiting.
    other = client.get(API, headers=s["auth"]).json()["drafts"][0]
    bad = client.post(
        f"{API}/drafts/{other['id']}/approve",
        json={"answer": " ".join(["w"] * 60)},
        headers=s["auth"],
    )
    assert bad.status_code == 400
    assert [d["id"] for d in client.get(API, headers=s["auth"]).json()["drafts"]] == [other["id"]]


def test_unaccepted_invites_do_not_add_a_domain(client: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    client.post(
        "/api/v1/team",
        json={"email": "boss@elsewhere.test", "name": "B", "role": "manager"},
        headers=s["auth"],
    )
    assert client.get(API, headers=s["auth"]).json()["domains"] == ["acme.test"]
