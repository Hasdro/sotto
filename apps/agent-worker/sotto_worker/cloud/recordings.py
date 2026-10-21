"""Call recordings on the server (owner, 22 Oct 2026): the desktop app uploads each call's WAV
when idle; the agent who made the call and the company's admins and managers can play it. Files
live on disk, one folder per company, and are deleted 30 days after upload. Only calls the server
already knows (a usage row of the same company) can be uploaded. Files are WAV or, from apps that
can encode it, Opus in WebM (about ten times smaller; owner, 22 Oct 2026)."""

from __future__ import annotations

import re
import shutil
import time
from collections.abc import AsyncIterator
from pathlib import Path

from sotto_worker.cloud.store import CloudError

KEEP_S = 30 * 24 * 3600
MAX_BYTES = 120 * 1024 * 1024  # about an hour at 16 kHz mono
MIN_FREE_BYTES = 1024**3  # keep 1 GB of disk free for the database and the system
_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
KINDS = {".wav": "audio/wav", ".webm": "audio/webm"}


def kind_of(head: bytes) -> str | None:
    """The file kind from its first bytes: a RIFF/WAVE header or a WebM (EBML) header."""
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return ".wav"
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return ".webm"
    return None


class Recordings:
    def __init__(self, root: Path, min_free: int = MIN_FREE_BYTES) -> None:
        self.root = root
        self.min_free = min_free
        root.mkdir(parents=True, exist_ok=True)

    def _base(self, company: str, call_id: str) -> Path:
        if not _ID.match(company) or not _ID.match(call_id):
            raise CloudError("not_found", "no such recording")
        return self.root / company / call_id

    def path(self, company: str, call_id: str) -> Path:
        """The recording's file (either kind); a missing .wav path when there is none."""
        base = self._base(company, call_id)
        for ext in KINDS:
            if base.with_suffix(ext).exists():
                return base.with_suffix(ext)
        return base.with_suffix(".wav")

    async def save(self, company: str, call_id: str, chunks: AsyncIterator[bytes]) -> int:
        base = self._base(company, call_id)
        if shutil.disk_usage(self.root).free < self.min_free + MAX_BYTES:
            raise CloudError("storage_full", "the server is out of space for recordings")
        base.parent.mkdir(exist_ok=True)
        part = base.with_suffix(".part")
        size = 0
        head = b""
        try:
            with part.open("wb") as f:
                async for chunk in chunks:
                    if len(head) < 12:
                        head += chunk[: 12 - len(head)]
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise CloudError("too_large", "recording is too long")
                    f.write(chunk)
            ext = kind_of(head)
            if size < 44 or ext is None:
                raise CloudError("invalid", "send a WAV or WebM (Opus) file")
            part.chmod(0o640)  # customer audio: the server's own user only
            for old in KINDS:  # one file per call, whichever kind came last
                base.with_suffix(old).unlink(missing_ok=True)
            part.replace(base.with_suffix(ext))
        finally:
            part.unlink(missing_ok=True)
        return size

    def prune(self, now: float | None = None) -> int:
        """Deletes recordings older than 30 days; returns how many."""
        t = now if now is not None else time.time()
        gone = 0
        for f in [p for ext in KINDS for p in self.root.glob(f"*/*{ext}")]:
            if t - f.stat().st_mtime > KEEP_S:
                f.unlink(missing_ok=True)
                gone += 1
        return gone
