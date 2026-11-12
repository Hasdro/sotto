"""Persistent login for the apps (D-029): a short access token plus a rotating refresh token.

- Each sign-in on a device is one session row (`sessions`). The row holds the hash of the current
  access token (its key), the hash of the current refresh token and both expiry times.
- Using the refresh token gives a new pair and spends the old refresh token. Spent hashes are
  kept for the 90-day window: presenting one again means someone copied it, so the whole device
  session is revoked (theft signal).
- The refresh window slides: each rotation sets it to 90 days from now, so an active person is
  never asked to sign in again and a device unused for 90 days is signed out.
- Sessions made by 0.2.0 apps (one 30-day token, `sid` empty) keep working until they expire, and
  `/auth/migrate` turns one into a pair in place, so 0.3.0 starts without a new login.
- The owner console keeps its own 12-hour cookie session (kind "owner"); none of this applies."""

from __future__ import annotations

import secrets

ACCESS_TTL_MS = 60 * 60 * 1000  # one hour: a stolen access token is short-lived
REFRESH_TTL_MS = 90 * 86_400_000  # 90 days, sliding
ACCESS_PREFIX = "sa_"
REFRESH_PREFIX = "sr_"
# Spent refresh hashes older than the window can never match a live session again.
SPENT_KEEP_MS = REFRESH_TTL_MS


def new_access() -> str:
    return ACCESS_PREFIX + secrets.token_urlsafe(32)


def new_refresh() -> str:
    return REFRESH_PREFIX + secrets.token_urlsafe(48)


def new_sid() -> str:
    return secrets.token_hex(16)
