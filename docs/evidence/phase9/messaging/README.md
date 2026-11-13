# messaging evidence (T-063, T-064, T-065, T-071 Gallabox part)

- `integrations-smtp-*`, `integrations-gallabox-*`: Admin → Integrations after "Send test email" and "Load templates" (1280/390, light/dark, en/ar).
- `email-preview-*`, `whatsapp-preview-*`: the post-call actions after Preview, before Confirm.
- `axe.txt`: axe-core WCAG 2 A/AA on those exact states — 0 serious/critical.

How they were made (`rig/`): `serve.py` runs the management server on 127.0.0.1:8899 with a mocked Gallabox (the test fixture) and an SMTP sender that only records; `seed.py` signs up a test company and saves fake SMTP/Gallabox values; the web app is exported with `EXPO_PUBLIC_SOTTO_SERVER=http://127.0.0.1:8899`, plus a temporary `app/dev-messaging.tsx` hosting `EmailAction` and `WhatsAppAction` (not committed: the post-call panel belongs to zoho-actions); `shots.cjs` drives Playwright. No real mailbox, Gallabox account or credentials were used.
