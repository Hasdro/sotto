"""Card protocol v1 (worker → app). The model is generated; see scripts/gen_card_model.py."""

from typing import Any

from pydantic import model_validator

from sotto_worker.protocol.card import CardMessage as _GeneratedCardMessage
from sotto_worker.protocol.card import Timing as CardTiming


class CardMessage(_GeneratedCardMessage):
    @model_validator(mode="before")
    @classmethod
    def _version_is_not_a_bool(cls, data: Any) -> Any:
        # pydantic's Literal[1] accepts True (bool is an int); zod's z.literal(1) does not.
        if isinstance(data, dict) and isinstance(data.get("v"), bool):
            raise ValueError("v must be the integer 1, not a boolean")
        return data

    def to_wire(self) -> str:
        """JSON for the LiveKit data channel. Unset optional fields are left out."""
        return self.model_dump_json(exclude_none=True)


__all__ = ["CardMessage", "CardTiming"]
