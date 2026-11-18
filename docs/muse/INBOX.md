# Muse inbox — owner requests queue

Mac-Claude appends the owner's feature requests and bug reports here (newest at the bottom of "Open"), then pushes. Muse reads this at the start of every round and moves finished items to "Done" with the commit and version.

Format: `- [ ] <id> · <type: feature|bug|change> · <date> · <priority: now|next|later> — <what the owner wants, in their words>. Acceptance: <how we know it works>.`

## Open
- [ ] M-002 · change · 2026-11-18 · now — Move Zoho AGN fields, SMTP, Gallabox + delivery webhook, and model configuration out of the client app into the vendor panel per organisation; client shows Gallabox status only and templates become a multi-select; Admin › People add-new-user on top; email formats become usable rich-text fields; vendor company profile opens in a new tab. Acceptance: one push, Mac gate green, owner console company page verified in a new tab.

## Done
- [x] M-001 · change · 2026-11-17 · now — Carry over the open items in `docs/muse/HANDOFF.md` §2 (Arabic "Practice" label, `PageHeader` migration, fonts/CSP) and review `docs/TRACKER.md` for the next ladder step after 0.6.1. Acceptance: tracker updated, one push, Mac checklist given. Done in commit `0a48cf56` (round 1, 17 Nov 2026).
