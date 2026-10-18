"""Playbook entries and the lookup index (R2 step 1: playbook answer on a confident match).

Lookup is lexical TF-IDF cosine over question + tags, in-memory per company. P2.4/P6 can swap
in embeddings (stage `embed`) behind the same `lookup` call; ARCHITECTURE §4 budgets 100 ms.
"""

from sotto_worker.playbook.index import PlaybookEntry, PlaybookHit, PlaybookIndex, parse_playbook

__all__ = ["PlaybookEntry", "PlaybookHit", "PlaybookIndex", "parse_playbook"]
