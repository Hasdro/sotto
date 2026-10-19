"""Provider keys at rest (P6.7, D-020): AES-256-GCM, one random nonce per value, the key name as
associated data so a ciphertext cannot be moved to another vendor's slot. The master secret comes
from SOTTO_SECRET_KEY on the server and never touches the database or git."""

from __future__ import annotations

import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

NONCE_BYTES = 12
MIN_SECRET_CHARS = 32


class VaultError(RuntimeError):
    """A value could not be decrypted (wrong SOTTO_SECRET_KEY, or the row was tampered with)."""


class Vault:
    def __init__(self, master_secret: str) -> None:
        if len(master_secret) < MIN_SECRET_CHARS:
            raise ValueError(f"SOTTO_SECRET_KEY must be at least {MIN_SECRET_CHARS} characters")
        key = HKDF(
            algorithm=hashes.SHA256(), length=32, salt=b"sotto-vault-v1", info=b"provider-keys"
        ).derive(master_secret.encode())
        self._aead = AESGCM(key)

    def encrypt(self, name: str, plaintext: str) -> bytes:
        nonce = os.urandom(NONCE_BYTES)
        return nonce + self._aead.encrypt(nonce, plaintext.encode(), name.encode())

    def decrypt(self, name: str, blob: bytes) -> str:
        nonce, body = blob[:NONCE_BYTES], blob[NONCE_BYTES:]
        try:
            return self._aead.decrypt(nonce, body, name.encode()).decode()
        except InvalidTag:
            raise VaultError(f"{name}: cannot decrypt (SOTTO_SECRET_KEY changed?)") from None
