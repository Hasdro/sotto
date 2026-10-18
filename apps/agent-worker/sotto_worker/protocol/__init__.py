"""Card protocol v1 (worker → app). The model is generated; see scripts/gen_card_model.py."""

from sotto_worker.protocol.card import CardMessage as _GeneratedCardMessage
from sotto_worker.protocol.card import Timing as CardTiming


class CardMessage(_GeneratedCardMessage):
    def to_wire(self) -> str:
        """JSON for the LiveKit data channel. Unset optional fields are left out."""
        return self.model_dump_json(exclude_none=True)


__all__ = ["CardMessage", "CardTiming"]
