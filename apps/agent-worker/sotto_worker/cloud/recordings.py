"""Call recordings on the server (owner, 22 Oct 2026): the desktop app uploads each call's WAV
when idle; the agent who made the call and the company's admins and managers can play it. Files
live on disk, one folder per company, and are deleted 30 days after upload. Only calls the server
already knows (a usage row of the same company) can be uploaded."""

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


class Recordings:
    def __init__(self, root: Path, min_free: int = MIN_FREE_BYTES) -> None:
        self.root = root
        self.min_free = min_free
        root.mkdir(parents=True, exist_ok=True)

    def path(self, company: str, call_id: str) -> Path:
        if not _ID.match(company) or not _ID.match(call_id):
            raise CloudError("not_found", "no such recording")
        return self.root / company / f"{call_id}.wav"

    async def save(self, company: str, call_id: str, chunks: AsyncIterator[bytes]) -> int:
        target = self.path(company, call_id)
        if shutil.disk_usage(self.root).free < self.min_free + MAX_BYTES:
            raise CloudError("storage_full", "the server is out of space for recordings")
        target.parent.mkdir(exist_ok=True)
        part = target.with_suffix(".part")
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
            if size < 44 or head[:4] != b"RIFF" or head[8:12] != b"WAVE":
                raise CloudError("invalid", "send a WAV file")
            part.chmod(0o640)  # customer audio: the server's own user only
            part.replace(target)
        finally:
            part.unlink(missing_ok=True)
        return size

    def prune(self, now: float | None = None) -> int:
        """Deletes recordings older than 30 days; returns how many."""
        t = now if now is not None else time.time()
        gone = 0
        for f in self.root.glob("*/*.wav"):
            if t - f.stat().st_mtime > KEEP_S:
                f.unlink(missing_ok=True)
                gone += 1
        return gone
