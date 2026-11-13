# Child: learning + admin model config (0.5.0) — branch `phase9/learning-admin`

Follow `docs/prompts/common.md`. Read REQUIREMENTS R6, R11, D-019, D-034, D-036, D-038.

Tasks:
1. **Ratings (T-058):** rating controls only on AI advice cards, with reason chips; admin aggregates.
2. **Learned instructions (T-059):** after a call with ≥ 3 ratings, a minimised packet (no full transcript; test) produces at most 8 instructions of ≤ 25 words; injected through a prompt-registry variable on the **next call only**; playbook wins on conflict. Keep 0.3.x clients working (see D-037: use a separate prompt rather than a new variable in `suggest` if needed). Run `pnpm replay --all`, report p50/p95.
3. **Instruction editor (T-060):** edit, reorder, disable, delete, versions, revert, "review before apply" switch, badge.
4. **Model config moves to the admin panel (D-038):** models, providers, keys, prompt studio and router settings are managed only in the web admin panel (company admin on the server's web app, owner in the owner console). The desktop client no longer shows these screens; it only fetches the effective config. Hide the routes/tabs in the desktop build (keep the code and tests), and make sure a desktop admin sees a short "Manage models in the web admin panel" link instead.

Owned: `apps/app/features/{rating,learning}/**`, `apps/app/app/admin/{models,prompts,keys,instructions}*`, `apps/app/app/admin/_layout.tsx` (tabs only; the Integrations tab stays), worker `cloud/learning/**`, `seed/prompts/learned_*`, their tests and i18n keys under `rating.*` / `learning.*`.
