"""Manager emails from the management server (R2 step 4, owner 22 Oct 2026): when an agent's
question has no safe answer, the company's manager gets one email within a minute, with the
question, the last moments of the call and a link to answer it in Sotto's Inbox.

The mailbox settings live encrypted in SOTTO_DATA_DIR/email.json (written by `email-setup`,
which asks for the password without showing it); nothing about them is in git or the env file."""

from __future__ import annotations

import asyncio
import base64
import json
import re
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from sotto_worker.adapters.email.smtp import SmtpEmail
from sotto_worker.outbox import RETRY_SCHEDULE_MS, EmailMessage, EmailSender
from sotto_worker.server.vault import Vault

VAULT_NAME = "platform:email"
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def save_mail_config(path: Path, vault: Vault, config: dict[str, Any]) -> None:
    blob = base64.b64encode(vault.encrypt(VAULT_NAME, json.dumps(config))).decode()
    path.write_text(json.dumps({"v": 1, "blob": blob}))
    path.chmod(0o600)


def load_mailer(path: Path, vault: Vault) -> SmtpEmail | None:
    if not path.exists():
        return None
    raw = json.loads(path.read_text())
    c = json.loads(vault.decrypt(VAULT_NAME, base64.b64decode(raw["blob"])))
    return SmtpEmail(
        host=c["host"],
        port=int(c["port"]),
        user=c["user"],
        password=c["password"],
        sender=c["from"],
    )


def render_escalation(template: str, values: dict[str, str]) -> EmailMessage:
    """The seed's escalation_email prompt is a plain template: a Subject line, then the body."""
    text = re.sub(r"\{\{\s*([\w.]+)\s*\}\}", lambda m: values.get(m.group(1), ""), template)
    first, _, rest = text.strip().partition("\n")
    if first.lower().startswith("subject:"):
        return EmailMessage(to="", subject=first[8:].strip()[:200], text=rest.strip())
    return EmailMessage(to="", subject="Unanswered question", text=text.strip())


async def send_with_retries(
    mailer: EmailSender,
    message: EmailMessage,
    key: str,
    *,
    log: Callable[[str], None],
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> bool:
    """Sends now, then retries on the outbox schedule (10 s, 30 s, 1, 5, 15 min)."""
    waits = [0, *RETRY_SCHEDULE_MS]
    for i, wait in enumerate(waits):
        if wait:
            await sleep(wait / 1000)
        try:
            await mailer.send(message, idempotency_key=key)
            return True
        except Exception as err:
            log(f"manager email attempt {i + 1} failed: {type(err).__name__}")
    log(f"manager email gave up after {len(waits)} attempts")
    return False
