# Child: messaging (0.6.0 email + 0.7.0 Gallabox) — branch `phase9/messaging`

Follow `docs/prompts/common.md`. Read REQUIREMENTS R12, D-032, D-033, D-036, D-037, D-039 and `docs/REFERENCES.md` § Gallabox.

**Goal:** an org admin configures email and WhatsApp in **Admin → Integrations** (write-only, encrypted, never returned, same pattern as the Zoho client fields), and the agent sends approved emails and WhatsApp templates after a call.

Tasks:
1. **SMTP per org (T-063 setup):** fields host, port (465 SSL / 587 STARTTLS), username, password (write-only), from name, from address; "Send test email" button that sends to the admin's own address and shows the exact SMTP error on failure. Platform-level SMTP in the owner console as fallback (same precedence as Zoho: org wins). Adapter in `adapters/` only.
2. **Email send (T-063):** senders, formats, static blocks verbatim, To/CC, preview, explicit confirm, audit row, idempotency key (no duplicate on retry). Flag-gated per D-036.
3. **Gallabox credentials (T-071/T-064):** API key, API secret, channel id (write-only). "Load templates" pulls all templates from Gallabox into a dropdown; the admin selects and saves the allow-list; for each saved template cache its parameters (names, types, example) so the app knows what to fill. Redact the `channel` object's credential-like fields from anything stored or returned.
4. **WhatsApp send (T-065):** only allow-listed templates; parameters filled (prefilled from call/Zoho brief where obvious), preview, confirm, audit, idempotency. No message history stored. Free-text only if the window is verifiably open (Gallabox has no window-status field: so template-only for now, record that).
5. **Post-call actions:** build email and WhatsApp as self-contained action components + server routes. The post-call panel shell is owned by `phase9/zoho-actions`; export your components for it and do not edit the panel file — note the import line in your report.

Owned: `apps/agent-worker/sotto_worker/cloud/{email,gallabox}/**`, `apps/agent-worker/sotto_worker/**/adapters/{smtp,gallabox}*`, their tests, `apps/app/features/{email,whatsapp}/**`, `apps/app/app/admin/integrations*` (coordinate: add sections, don't rewrite the Zoho section), new i18n keys under `email.*` / `whatsapp.*` / `integrations.smtp.*` / `integrations.gallabox.*`.

The owner will paste their Hostinger SMTP (smtp.hostinger.com, 465) and Gallabox values in the UI after deploy; never ask for them in chat, never put any in git or tests (use a local fake SMTP server and a mocked Gallabox in tests). Evidence: tests, screenshots of Integrations (SMTP + Gallabox with template dropdown), send preview.
