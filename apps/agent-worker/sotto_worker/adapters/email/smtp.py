"""SMTP email adapter (owner, 22 Oct 2026): send through the company's own mailbox, e.g. a
Hostinger mailbox on agncompu.com (smtp.hostinger.com, port 465 with SSL, or 587 with STARTTLS).
Standard library only. SMTP has no idempotency key: the outbox's one-job-per-escalation rule
keeps it to one email; a retry after an unclear failure can, rarely, send a second copy."""

from __future__ import annotations

import asyncio
import smtplib
import ssl
from dataclasses import dataclass, field
from email.message import EmailMessage as MimeMessage
from email.utils import formataddr, make_msgid

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


# --- org-configured mail (D-032, D-039) -----------------------------------------------------------
# The agent's post-call email and the admin's "Send test email" go through the org's own mailbox
# (or the platform's). Errors come back as the server's exact words, so the admin can fix them.

SECURITY = ("ssl", "starttls")


class SmtpSendError(RuntimeError):
    """The mail server refused or could not be reached; `str()` is safe to show the admin."""


@dataclass(frozen=True)
class SmtpAccount:
    host: str
    port: int
    username: str
    password: str = field(repr=False)
    from_name: str
    from_address: str
    security: str = "ssl"  # 465 → ssl, 587 → starttls; "plain" only for a local test server
    timeout: float = 15


@dataclass(frozen=True)
class Outgoing:
    to: tuple[str, ...]
    cc: tuple[str, ...]
    subject: str
    text: str
    message_id_seed: str  # the idempotency key: a retry carries the same Message-ID
    # INT-14b: admin-curated files only (name, MIME type, bytes); never an agent upload.
    attachments: tuple[tuple[str, str, bytes], ...] = ()


def _describe(err: BaseException) -> str:
    if isinstance(err, smtplib.SMTPResponseException):
        raw = err.smtp_error
        text = raw.decode(errors="replace") if isinstance(raw, bytes) else str(raw)
        return f"{err.smtp_code} {' '.join(text.split())}"[:300]
    if isinstance(err, smtplib.SMTPRecipientsRefused):
        parts = [f"{a}: {c} {m.decode(errors='replace')}" for a, (c, m) in err.recipients.items()]
        return ("recipients refused: " + "; ".join(parts))[:300]
    return f"{type(err).__name__}: {err}"[:300]


def build_mime(account: SmtpAccount, mail: Outgoing) -> MimeMessage:
    mime = MimeMessage()
    mime["From"] = formataddr((account.from_name, account.from_address))
    mime["To"] = ", ".join(mail.to)
    if mail.cc:
        mime["Cc"] = ", ".join(mail.cc)
    mime["Subject"] = mail.subject
    domain = account.from_address.rpartition("@")[2] or "localhost"
    mime["Message-ID"] = make_msgid(idstring=mail.message_id_seed[:60], domain=domain)
    mime.set_content(mail.text)
    for name, kind, blob in mail.attachments:
        main, _, sub = kind.partition("/")
        mime.add_attachment(blob, maintype=main, subtype=sub, filename=name)
    return mime


def send_mail_now(account: SmtpAccount, mail: Outgoing) -> None:
    """Blocking send; raises SmtpSendError with the server's own reply on any failure."""
    mime = build_mime(account, mail)
    context = ssl.create_default_context()
    try:
        server: smtplib.SMTP
        if account.security == "ssl":
            server = smtplib.SMTP_SSL(
                account.host, account.port, timeout=account.timeout, context=context
            )
        else:
            server = smtplib.SMTP(account.host, account.port, timeout=account.timeout)
        with server as s:
            if account.security == "starttls":
                s.starttls(context=context)
            if account.security != "plain" or account.username:
                s.login(account.username, account.password)
            s.send_message(mime, from_addr=account.from_address, to_addrs=[*mail.to, *mail.cc])
    except (smtplib.SMTPException, OSError) as err:
        raise SmtpSendError(_describe(err)) from None


async def send_mail(account: SmtpAccount, mail: Outgoing) -> None:
    await asyncio.to_thread(send_mail_now, account, mail)
