"""Room policy (P4.4): R4 track selection and echo gating. Pure logic; the LiveKit wiring
(Phase 4, needs the account) only feeds participants and VAD/transcript events into it."""

from __future__ import annotations

import enum
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field


class TrackRole(enum.Enum):
    CUSTOMER = "customer"  # transcribed; the only track that can trigger cards (R4)
    AGENT_CONTEXT = "agent_context"  # transcribed as speaker=agent, context only
    AGENT_VAD_ONLY = "agent_vad_only"  # voice activity only, for echo gating (F-18)


@dataclass(frozen=True)
class Participant:
    identity: str
    kind: str  # LiveKit participant kind: "sip", "standard", "agent", ...
    attributes: Mapping[str, str | None] = field(default_factory=dict)


def select_tracks(
    participants: Sequence[Participant], *, agent_context: bool
) -> dict[str, TrackRole]:
    plan: dict[str, TrackRole] = {}
    for p in participants:
        if p.kind == "sip" and p.attributes.get("sotto.role") == "customer":
            plan[p.identity] = TrackRole.CUSTOMER  # set server-side by the token function
        elif p.kind == "standard" and p.identity.startswith("rep_"):
            plan[p.identity] = (
                TrackRole.AGENT_CONTEXT if agent_context else TrackRole.AGENT_VAD_ONLY
            )
    return plan


WORD = re.compile(r"\w+", re.UNICODE)


def _words(text: str) -> set[str]:
    return set(WORD.findall(text.lower()))


class EchoGate:
    """Holds back 'customer' segments that are the agent's own voice coming back on the SIP leg
    (speakerphone, car kits). ARCHITECTURE §2 R4, failure mode F-18."""

    def __init__(
        self, *, max_delay_ms: int = 400, overlap_ratio: float = 0.6, text_match: float = 0.7
    ) -> None:
        self._delay = max_delay_ms
        self._overlap_ratio = overlap_ratio
        self._text_match = text_match
        self._agent: list[tuple[int, int, str]] = []

    def agent_voice(self, start_ms: int, end_ms: int, text: str = "") -> None:
        self._agent.append((start_ms, end_ms, text))
        del self._agent[:-50]

    def is_echo(self, *, start_ms: int, end_ms: int, text: str) -> bool:
        length = max(end_ms - start_ms, 1)
        words = _words(text)
        for a_start, a_end, a_text in self._agent:
            overlap = min(end_ms, a_end + self._delay) - max(start_ms, a_start)
            if overlap <= 0:
                continue
            if overlap / length >= self._overlap_ratio:
                return True
            if a_text and words:
                shared = len(words & _words(a_text)) / len(words)
                if shared >= self._text_match:
                    return True
        return False
