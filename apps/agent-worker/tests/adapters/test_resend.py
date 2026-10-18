import json

import httpx
import pytest

from sotto_worker.adapters.email.resend import ResendEmail, ResendError
from sotto_worker.outbox import EmailMessage

MSG = EmailMessage(to="manager@acme.test", subject="Unanswered question", text="Pets?")


async def test_posts_with_auth_and_idempotency_key() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"id": "email_1"})

    email = ResendEmail(
        api_key="re_x",
        sender="Sotto <alerts@sotto.test>",
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    await email.send(MSG, idempotency_key="escalation:call-1:abc")
    request = seen[0]
    assert str(request.url) == "https://api.resend.com/emails"
    assert request.headers["Authorization"] == "Bearer re_x"
    assert request.headers["Idempotency-Key"] == "escalation:call-1:abc"
    assert json.loads(request.content) == {
        "from": "Sotto <alerts@sotto.test>",
        "to": ["manager@acme.test"],
        "subject": "Unanswered question",
        "text": "Pets?",
    }


async def test_errors_raise_for_the_outbox_to_retry() -> None:
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _r: httpx.Response(429, text="slow down"))
    )
    with pytest.raises(ResendError, match="429"):
        await ResendEmail(api_key="k", sender="s", client=client).send(MSG, idempotency_key="k1")


async def test_rejects_an_invalid_idempotency_key() -> None:
    with pytest.raises(ValueError, match="idempotency"):
        await ResendEmail(api_key="k", sender="s").send(MSG, idempotency_key="x" * 257)
