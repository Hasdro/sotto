"""Access to the hosted demo (D-020): one access code → a signed, expiring, HttpOnly session
cookie. Phase 5 replaces this with Supabase Auth and roles; the cookie never carries a role."""

from __future__ import annotations

import base64
import hashlib
import hmac
import time
from collections import deque

COOKIE = "sotto_session"
SESSION_TTL_S = 12 * 3600
MAX_FAILURES = 10  # per client, per window
FAILURE_WINDOW_S = 600


def _sign(secret: bytes, payload: str) -> str:
    mac = hmac.new(secret, payload.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode().rstrip("=")


class AccessGate:
    def __init__(self, access_code: str | None, secret: str) -> None:
        self._code = access_code or None
        self._secret = hashlib.sha256(("sotto-session:" + secret).encode()).digest()
        self._failures: dict[str, deque[float]] = {}

    @property
    def required(self) -> bool:
        return self._code is not None

    def issue(self, now: float | None = None) -> str:
        expires = int((now or time.time()) + SESSION_TTL_S)
        payload = f"v1.{expires}"
        return f"{payload}.{_sign(self._secret, payload)}"

    def valid(self, token: str | None, now: float | None = None) -> bool:
        if not self.required:
            return True
        if not token or token.count(".") != 2:
            return False
        version, expires, mac = token.split(".")
        payload = f"{version}.{expires}"
        if version != "v1" or not hmac.compare_digest(mac, _sign(self._secret, payload)):
            return False
        return expires.isdigit() and int(expires) > (now or time.time())

    def blocked(self, client: str, now: float | None = None) -> bool:
        t = now or time.time()
        recent = self._failures.get(client)
        if not recent:
            return False
        while recent and recent[0] < t - FAILURE_WINDOW_S:
            recent.popleft()
        return len(recent) >= MAX_FAILURES

    def check_code(self, client: str, code: str, now: float | None = None) -> bool:
        if self._code is None:
            return True
        ok = hmac.compare_digest(code.encode(), self._code.encode())
        if not ok:
            self._failures.setdefault(client, deque()).append(now or time.time())
            if len(self._failures) > 10_000:  # bound memory under a spray of client addresses
                self._failures.clear()
        return ok
