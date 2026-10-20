"""Password hashing (D-022): scrypt from the standard library, a random 16-byte salt per hash,
parameters stored with the hash so they can be raised later without breaking old accounts."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets

N, R, P = 2**14, 8, 1
MIN_PASSWORD = 10
MAX_PASSWORD = 200


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=N, r=R, p=P, dklen=32)
    return f"scrypt${N}${R}${P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
        if scheme != "scrypt":
            return False
        got = hashlib.scrypt(
            password.encode(),
            salt=base64.b64decode(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=32,
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(got, base64.b64decode(digest))


# Spent on unknown emails too, so response time does not reveal which emails have accounts.
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def password_problem(password: str) -> str | None:
    if len(password) < MIN_PASSWORD:
        return f"use at least {MIN_PASSWORD} characters"
    if len(password) > MAX_PASSWORD:
        return "password too long"
    return None


def new_temporary_password() -> str:
    """Readable one-time password for resets: 4 groups of 4 letters/digits."""
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
    return "-".join("".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(4))
