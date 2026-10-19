# Getting API keys (owner guide)

**You choose the vendors; Claude only takes the keys.** Every vendor below plugs into the same slot, so you can switch later without new code (R6, D-019).

**Where keys go:**
- **In the app (recommended, D-020):** go to Admin → **Keys & providers**. Each vendor has a "Get a key" link, the steps, a field to paste the key, and a **Test** button. Below the vendors, pick which vendor does each job. Keys are encrypted on the Sotto server and never shown again. On your hosted server this is the only place for keys.
- **Or `.env` on your Mac** for the local demo (D-017). Create it once:

```bash
cd ~/Documents/GitHub/sotto && cp -n .env.example .env && open -e .env
```

Paste each key after its `=`, save, and tell Claude "the X key is set". Never paste a key into chat, a page, an email or a screenshot.

The panel's vendor list, links and steps come from `seed/models/providers.yaml`, and this page explains the same steps in more detail.

Links were checked on 2026-10-20. Vendors move their menus, so if a link lands on a dashboard, use the menu path given.

## AI that writes the cards (pick a main and a backup from different companies)

| Vendor | Free? | Get a key | Steps | `.env` name |
|---|---|---|---|---|
| **Groq** | Free tier, no card | https://console.groq.com/keys | Sign up, choose **Create API Key**, name it `sotto-dev`, copy it (it is shown once). | `GROQ_API_KEY` |
| **Google Gemini** (AI Studio) | Free tier, no card (free tier may use your data to improve Google's models) | https://aistudio.google.com/apikey | Sign in with a Google account, choose **Create API key**, copy it. | `GEMINI_API_KEY` |
| **OpenRouter** (many models, one key) | Free models capped at about 50 requests a day | https://openrouter.ai/settings/keys | Sign up, choose **Create API Key**, set a credit limit, copy it (starts with `sk-or-v1-`; shown once). | `OPENROUTER_API_KEY` |
| **OpenAI** | Paid from the first request | https://platform.openai.com/api-keys | Sign in, choose **Create new secret key**, copy it. | `OPENAI_API_KEY` |
| **Anthropic (Claude)** | Paid | https://console.anthropic.com/settings/keys | Sign in, choose **Create Key**, copy it. | `ANTHROPIC_API_KEY` |

## Speech-to-text (pick a main and a backup from different companies)

Details and prices are in `docs/STT-OPTIONS.md`.

| Vendor | Free to start | Get a key | Steps | `.env` name |
|---|---|---|---|---|
| **Deepgram** | $200 credit, no card | https://console.deepgram.com/ | Sign up. In the top-left project menu pick your project, open **Settings → API Keys**, choose **Create a New API Key**, give it a name and the Member role, copy it (shown once). | `DEEPGRAM_API_KEY` |
| **AssemblyAI** | $50 credit, no card | https://www.assemblyai.com/dashboard/home | Sign up. In the sidebar open **API Keys** (under Workspace / Manage), copy the key or create a new one. | `ASSEMBLYAI_API_KEY` |
| **Speechmatics** | $100 credit, no card | https://portal.speechmatics.com/api-keys | Sign up. Open **Settings → API Keys** (in some portal versions it is under your project), name the key, copy it (shown once; at most 5 keys). | `SPEECHMATICS_API_KEY` |
| **ElevenLabs** (Scribe) | Small free plan, no commercial license; $6/month Starter adds it | https://elevenlabs.io/app/settings/api-keys | Sign up, open **Settings → API Keys**, choose **Create API Key**, copy it. | `ELEVENLABS_API_KEY` |

## Other services (needed in later phases)

| Service | Phase | Get a key | `.env` names |
|---|---|---|---|
| **LiveKit Cloud** (call audio) | 4 | https://cloud.livekit.io/: create a project, then **Settings → API Keys** | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| **Supabase** (database, sign-in) | 5 | https://supabase.com/dashboard: create project `sotto-dev`, then **Project Settings → API** | `SUPABASE_URL`, `SUPABASE_ANON_KEY` (keep the service-role key to yourself) |
| **Resend** (escalation emails) | 7 | https://resend.com/api-keys | `RESEND_API_KEY` |

## Sources

- Deepgram: [creating API keys](https://developers.deepgram.com/docs/create-additional-api-keys)
- AssemblyAI: [how to get your API key](https://assemblyai.com/docs/faq/how-to-get-your-api-key)
- Speechmatics: [API keys](https://docs.speechmatics.com/administration/api-keys), [authentication](https://docs.speechmatics.com/introduction/authentication)
- OpenRouter: [authentication](https://openrouter.ai/docs/guides/overview/auth/management-api-keys.md)
