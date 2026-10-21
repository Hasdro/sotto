"""SMTP email adapter (owner, 22 Oct 2026): send through the company's own mailbox, e.g. a
Hostinger mailbox on agncompu.com (smtp.hostinger.com, port 465 with SSL, or 587 with STARTTLS).
Standard library only. SMTP has no idempotency key: the outbox's one-job-per-escalation rule
keeps it to one email; a retry after an unclear failure can, rarely, send a second copy."""

from __future__ import annotations

import asyncio
import smtplib
import ssl
from email.message import EmailMessage as MimeMessage
from email.utils import make_msgid

from sotto_worker.outbox import EmailMessage


class SmtpEmail:
    provider = "smtp"

    def __init__(
        self, *, host: str, port: int, user: str, password: str, sender: str, timeout: float = 15
    ) -> None:
        self.host, self.port, self.user = host, port, user
        self._password = password
        self.sender = sender
        self.timeout = timeout

    def _send_now(self, message: EmailMessage, idempotency_key: str) -> None:
        mime = MimeMessage()
        mime["From"] = self.sender
        mime["To"] = message.to
        mime["Subject"] = message.subject
        # The same Message-ID on a retry lets mail programs fold a duplicate away.
        mime["Message-ID"] = make_msgid(idstring=idempotency_key[:60], domain="sotto.app")
        mime.set_content(message.text)
        context = ssl.create_default_context()
        if self.port == 465:
            with smtplib.SMTP_SSL(self.host, self.port, timeout=self.timeout, context=context) as s:
                s.login(self.user, self._password)
                s.send_message(mime)
        else:
            with smtplib.SMTP(self.host, self.port, timeout=self.timeout) as s:
                s.starttls(context=context)
                s.login(self.user, self._password)
                s.send_message(mime)

    async def send(self, message: EmailMessage, *, idempotency_key: str) -> None:
        await asyncio.to_thread(self._send_now, message, idempotency_key)
