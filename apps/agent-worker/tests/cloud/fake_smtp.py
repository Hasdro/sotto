"""A tiny local SMTP server for tests (no TLS): enough of RFC 5321 for smtplib to log in and
send. It checks one username and password, so a wrong password gets the real 535 reply."""

from __future__ import annotations

import base64
import socketserver
import threading
from dataclasses import dataclass, field
from email import message_from_bytes
from email.message import Message
from typing import Any


@dataclass
class Received:
    sender: str
    recipients: list[str]
    message: Message


@dataclass
class FakeSmtp:
    username: str
    password: str
    inbox: list[Received] = field(default_factory=list)
    logins: list[str] = field(default_factory=list)
    port: int = 0
    _server: Any = None

    def start(self) -> FakeSmtp:
        fake = self

        class Handler(socketserver.StreamRequestHandler):
            def reply(self, line: str) -> None:
                self.wfile.write((line + "\r\n").encode())

            def handle(self) -> None:
                self.reply("220 fake.smtp ready")
                sender, rcpts, authed = "", [], False
                while True:
                    raw = self.rfile.readline()
                    if not raw:
                        return
                    line = raw.decode().rstrip("\r\n")
                    cmd = line.split(" ", 1)[0].upper()
                    if cmd in ("EHLO", "HELO"):
                        self.wfile.write(b"250-fake.smtp\r\n250 AUTH PLAIN LOGIN\r\n")
                    elif cmd == "AUTH":
                        parts = line.split(" ")
                        if parts[1].upper() == "PLAIN":
                            blob = parts[2] if len(parts) > 2 else ""
                            if not blob:
                                self.reply("334 ")
                                blob = self.rfile.readline().decode().strip()
                            _, user, pw = base64.b64decode(blob).decode().split("\0")
                        else:
                            self.reply("334 VXNlcm5hbWU6")
                            user = base64.b64decode(self.rfile.readline().strip()).decode()
                            self.reply("334 UGFzc3dvcmQ6")
                            pw = base64.b64decode(self.rfile.readline().strip()).decode()
                        fake.logins.append(user)
                        if user == fake.username and pw == fake.password:
                            authed = True
                            self.reply("235 2.7.0 Authentication successful")
                        else:
                            self.reply("535 5.7.8 Error: authentication failed")
                    elif cmd == "MAIL":
                        if not authed:
                            self.reply("530 5.7.0 Authentication required")
                            continue
                        sender = line.split(":", 1)[1].strip().strip("<>").split(">")[0]
                        rcpts = []
                        self.reply("250 2.1.0 Ok")
                    elif cmd == "RCPT":
                        rcpts.append(line.split(":", 1)[1].strip().strip("<>").split(">")[0])
                        self.reply("250 2.1.5 Ok")
                    elif cmd == "DATA":
                        self.reply("354 End data with <CR><LF>.<CR><LF>")
                        body = b""
                        while True:
                            chunk = self.rfile.readline()
                            if chunk in (b".\r\n", b""):
                                break
                            body += chunk[1:] if chunk.startswith(b"..") else chunk
                        fake.inbox.append(Received(sender, rcpts, message_from_bytes(body)))
                        self.reply("250 2.0.0 Ok: queued")
                    elif cmd == "QUIT":
                        self.reply("221 2.0.0 Bye")
                        return
                    else:
                        self.reply("250 Ok")

        class Server(socketserver.ThreadingTCPServer):
            allow_reuse_address = True
            daemon_threads = True

        self._server = Server(("127.0.0.1", 0), Handler)
        self.port = self._server.server_address[1]
        threading.Thread(target=self._server.serve_forever, daemon=True).start()
        return self

    def stop(self) -> None:
        self._server.shutdown()
        self._server.server_close()
