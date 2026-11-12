# Child session: phase9/flags-auth — T-045, T-046, T-047 (AGN Sales Shield 0.3.0)

Read `docs/prompts/common.md` first and follow it.

## Goal
1. **Feature flags (T-045, T-046; R7, D-028, D-036).**
   - A shared catalog module, plus a server-side evaluator that returns one state per feature, checked in this order: `off_by_platform` (entitlement or the global kill switch), `off_by_org`, `needs_connection`, `no_permission`, `available`.
   - Every feature-serving route answers `403 {"error":"feature_unavailable","feature","state"}`.
   - The session config carries the effective map. The app refreshes it on sign-in, on focus and every 10 minutes.
   - Retrofit call review, follow-up, recordings, reports, AI knowledge and integrations. Add catalog entries now, marked `needs_connection`, for zoho, gallabox, email_send, whatsapp, prep, card_ratings and learned_instructions.
   - Owner console: a per-organization entitlement matrix and a global kill switch.
   - Admin → Features: org toggles, default on, showing only entitled features with state and reason.
   - A `FeatureGate` component that greys the feature and shows a one-line reason and an action. It hides role-irrelevant features.
   - Every Admin → Features, entitlement and kill-switch change is written to the audit log.
2. **Persistent login (T-047; R9, D-029).**
   - Short access token plus a rotating refresh token with a 90-day sliding window.
   - A reused refresh token revokes the device session.
   - Silent renewal. Never sign out on a network error or 5xx. Sign out only on logout, password change, admin revoke, device removal or 90 days unused.
   - Desktop storage goes through Electron `safeStorage` in a new `apps/desktop/secure-store.cjs`, exposed through preload. The web build falls back to `localStorage`.
   - A one-time migration exchanges the old 30-day token for the new pair, with no re-login.
   - The owner console keeps its own cookie session.

## Owned files
- `apps/agent-worker/sotto_worker/cloud/**`: server, store, owner console, and new `features.py` and `auth` modules. Add their tests under `apps/agent-worker/tests/`.
- `apps/app/lib/cloud.ts`, `lib/server.ts`, `lib/useCloud.ts`, `lib/cloudCompat.ts`, `lib/role.tsx`.
- New: `apps/app/features/flags/**`, including UI strings in `features/flags/strings.ts` (en + ar). **Do not edit `lib/i18n.ts`**; brand-ui owns it.
- New: `apps/app/components/FeatureGate.tsx`, `apps/app/app/admin/features.tsx`.
- `apps/desktop/secure-store.cjs` (new) and `apps/desktop/preload.cjs`.
- In `apps/desktop/main.cjs`, only the lines that register the secure-store IPC.
- One-line `FeatureGate` wraps in existing screens. Keep each wrap minimal; brand-ui is reskinning those screens and will rebase over you.

## Evidence
- A server test for every one of the five states, plus an isolation test: org A cannot read or change org B's toggles.
- Auth tests:
  - rotation;
  - reuse revocation;
  - expiry after 90 days of inactivity;
  - 5xx and offline do not sign the user out;
  - migration from a 0.2.0 token.
- A dev Electron run showing the token in `safeStorage` and none in `localStorage`. Check the key names only, never the values.
- Screenshots of Admin → Features and the owner matrix in light and dark, and greyed states at 390 px and in RTL.
- Run a `security-auditor` subagent on the auth diff and fix the real findings.
