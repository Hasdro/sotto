"""Zoho material for the playbook bootstrap (ZC-04): won deals and their recent notes, read-only
through the CRM reader (allow-listed modules only). Capped text; no ids, no amounts, no people."""

from __future__ import annotations

from typing import Any, Protocol

MAX_DEALS = 20
NOTES_PER_DEAL = 3
MAX_CHARS = 20_000
WON = "(Stage:equals:Closed Won)"


class Reader(Protocol):
    async def search_page(
        self, module: str, criteria: str, fields: str, page: int, per_page: int = 200
    ) -> tuple[list[dict[str, Any]], bool]: ...

    async def related(
        self, module: str, record_id: str, related: str, fields: str, per_page: int
    ) -> list[dict[str, Any]]: ...


def _s(value: object) -> str:
    return " ".join(str(value).split()) if isinstance(value, str | int | float) else ""


async def zoho_material(reader: Reader) -> str:
    deals, _more = await reader.search_page(
        "Deals", WON, "Deal_Name,Description", 1, per_page=MAX_DEALS
    )
    parts: list[str] = []
    for deal in deals[:MAX_DEALS]:
        lines = [f"Won deal: {_s(deal.get('Deal_Name'))}"]
        if _s(deal.get("Description")):
            lines.append(_s(deal.get("Description")))
        if deal.get("id"):
            notes = await reader.related(
                "Deals", str(deal["id"]), "Notes", "Note_Title,Note_Content", NOTES_PER_DEAL
            )
            lines += [_s(n.get("Note_Content")) for n in notes if _s(n.get("Note_Content"))]
        parts.append("\n".join(lines))
        if sum(len(p) for p in parts) > MAX_CHARS:
            break
    return "\n\n".join(parts)[:MAX_CHARS]
