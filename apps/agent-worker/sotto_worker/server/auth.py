"""Access to the hosted demo (D-020): one access code → a signed, expiring, HttpOnly session
cookie. Phase 5 replaces this with Supabase Auth and roles; the cookie never carries a role.

The session key is derived from SOTTO_SECRET_KEY *and* the access code, so changing the code
signs everyone out without touching the key vault. Sign-in attempts are counted before the
request body is read (parallel guesses all count) per client and in total."""

from __future__ import annotations

import base64
import hashlib
import hmac
import time
from collections import OrderedDict, deque

COOKIE = "sotto_session"
SESSION_TTL_S = 12 * 3600
MAX_FAILURES = 10  # per client, per window
MAX_FAILURES_ALL = 100  # all clients together, per window (address spraying)
FAILURE_WINDOW_S = 600
MAX_TRACKED_CLIENTS = 10_000


def _sign(secret: bytes, payload: str) -> str:
    mac = hmac.new(secret, payload.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode().rstrip("=")


class AccessGate:
    def __init__(self, access_code: str | None, secret: str) -> None:
        self._code = access_code or None
        material = b"sotto-session:" + secret.encode() + b"\0" + (access_code or "").encode()
        self._secret = hashlib.sha256(material).digest()
        self._attempts: OrderedDict[str, deque[float]] = OrderedDict()
        self._all: deque[float] = deque()

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

    def _prune(self, q: deque[float], t: float) -> None:
        while q and q[0] < t - FAILURE_WINDOW_S:
            q.popleft()

    def begin_attempt(self, client: str, now: float | None = None) -> bool:
        """Counts a sign-in attempt as a failure up front; False when the client (or everyone
        together) is over the limit. `succeeded` takes the count back for a right code."""
        if self._code is None:
            return True
        t = now or time.time()
        self._prune(self._all, t)
        recent = self._attempts.get(client)
        if recent is not None:
            self._prune(recent, t)
        if len(self._all) >= MAX_FAILURES_ALL or (recent and len(recent) >= MAX_FAILURES):
            return False
        if recent is None:
            recent = self._attempts[client] = deque()
            while len(self._attempts) > MAX_TRACKED_CLIENTS:
                self._attempts.popitem(last=False)  # forget the oldest client, not everyone
        self._attempts.move_to_end(client)
        recent.append(t)
        self._all.append(t)
        return True

    def succeeded(self, client: str) -> None:
        recent = self._attempts.get(client)
        if recent:
            recent.pop()
        if self._all:
            self._all.pop()

    def check_code(self, code: str) -> bool:
        if self._code is None:
            return True
        return hmac.compare_digest(code.encode(), self._code.encode())
