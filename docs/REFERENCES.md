# References

Use official sources. APIs here change often. Before writing code against any of them, check the current docs with Context7 (`use context7`), or fetch the page itself. Cite the URL in the spec or in a code comment when the behaviour is not obvious.

If a link is dead, find the new official page, fix the link here, and say so in the session log.

## Calling and media
| Topic | Link |
|---|---|
| LiveKit docs (home) | https://docs.livekit.io/ |
| LiveKit Agents (Python): worker, dispatch, turn detection | https://docs.livekit.io/agents/ |
| LiveKit SIP (trunks, dispatch rules, outbound) | https://docs.livekit.io/sip/ |
| LiveKit React Native SDK | https://github.com/livekit/client-sdk-react-native |
| LiveKit Expo plugin | https://github.com/livekit/client-sdk-react-native-expo-plugin |
| LiveKit Agents source + examples | https://github.com/livekit/agents |
| LiveKit CLI (`lk`) | https://github.com/livekit/livekit-cli |
| CallKit / ConnectionService bridge | https://github.com/react-native-webrtc/react-native-callkeep |
| Twilio Elastic SIP Trunking | https://www.twilio.com/docs/sip-trunking |
| Telnyx SIP trunking | https://developers.telnyx.com/docs/voice/sip-trunking |
| Yeastar P-Series SIP trunk docs | https://help.yeastar.com/ |

## App and desktop
| Topic | Link |
|---|---|
| Expo docs | https://docs.expo.dev/ |
| Expo development builds (needed for LiveKit) | https://docs.expo.dev/develop/development-builds/introduction/ |
| Expo Router | https://docs.expo.dev/router/introduction/ |
| EAS Build / Submit | https://docs.expo.dev/build/introduction/ |
| React Native RTL (I18nManager) | https://reactnative.dev/docs/i18nmanager |
| Flutter (if D-005 chooses it) | https://docs.flutter.dev/ |
| Tauri v2 (desktop installers) | https://v2.tauri.app/ |

## Speech-to-text (choose in Phase 0/2)
| Vendor | Link |
|---|---|
| Deepgram (streaming) | https://developers.deepgram.com/docs |
| Speechmatics (real-time, Arabic) | https://docs.speechmatics.com/ |
| Soniox (real-time, mixed languages) | https://soniox.com/docs |
| AssemblyAI (streaming) | https://www.assemblyai.com/docs |

## Models
| Topic | Link |
|---|---|
| Claude API docs | https://docs.claude.com/ |
| Prompt caching | https://docs.claude.com/en/docs/build-with-claude/prompt-caching |
| Streaming | https://docs.claude.com/en/docs/build-with-claude/streaming |
| Models overview (pick current IDs here, store them in `seed/models/`) | https://docs.claude.com/en/docs/about-claude/models/overview |
| OpenAI API | https://platform.openai.com/docs |
| Ollama OpenAI compatibility | https://github.com/ollama/ollama/blob/main/docs/openai.md |
| vLLM OpenAI-compatible server | https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html |
| LM Studio local server | https://lmstudio.ai/docs |
| OpenRouter | https://openrouter.ai/docs |
| Groq | https://console.groq.com/docs |

## Data, auth, backend
| Topic | Link |
|---|---|
| Supabase docs | https://supabase.com/docs |
| Row Level Security | https://supabase.com/docs/guides/database/postgres/row-level-security |
| Local development (CLI, Docker) | https://supabase.com/docs/guides/local-development |
| Database testing (pgTAP) | https://supabase.com/docs/guides/database/testing |
| Edge Functions | https://supabase.com/docs/guides/functions |
| Auth | https://supabase.com/docs/guides/auth |

## Integrations
| Topic | Link |
|---|---|
| Zoho CRM API | https://www.zoho.com/crm/developer/docs/api/v8/ |
| Resend | https://resend.com/docs |
| Postmark | https://postmarkapp.com/developer |
| Stripe Billing | https://docs.stripe.com/billing |
| Sentry for React Native / Expo | https://docs.sentry.io/platforms/react-native/ |
| Sentry for Python | https://docs.sentry.io/platforms/python/ |

## Security and quality
| Topic | Link |
|---|---|
| OWASP ASVS | https://owasp.org/www-project-application-security-verification-standard/ |
| OWASP MASVS (mobile) | https://mas.owasp.org/MASVS/ |
| WCAG 2.2 | https://www.w3.org/TR/WCAG22/ |
| gitleaks | https://github.com/gitleaks/gitleaks |

## Working with Claude Code
| Topic | Link |
|---|---|
| Claude Code docs | https://code.claude.com/docs |
| Best practices | https://code.claude.com/docs/en/best-practices |
| Claude Code on the web (cloud sessions) | https://code.claude.com/docs/en/claude-code-on-the-web |
| Hooks | https://code.claude.com/docs/en/hooks |
| Skills | https://code.claude.com/docs/en/skills |
| Subagents | https://code.claude.com/docs/en/sub-agents |
| agent-skills (upstream of `.claude/skills`) | https://github.com/addyosmani/agent-skills |
| Context7 MCP | https://github.com/upstash/context7 |

## Zoho CRM v8 (research 2026-11-12, official docs; verify on the owner's org before coding)
| Topic | Finding | Link |
|---|---|---|
| OAuth (server-based) | `{accounts}/oauth/v2/auth?scope=…&client_id=…&response_type=code&access_type=offline&redirect_uri=…`; code valid 2 min; redirect returns `code`, `location`, `accounts-server` | https://www.zoho.com/crm/developer/docs/api/v8/auth-request.html |
| Refresh / revoke | `POST {accounts}/oauth/v2/token` (grant_type=refresh_token) → `access_token`, `api_domain`, `expires_in` 3600; revoke `POST {accounts}/oauth/v2/token/revoke?token=…` | https://www.zoho.com/crm/developer/docs/api/v8/refresh.html · …/revoke-tokens.html |
| Token limits | access 1 h; refresh never expires until revoked; max 20 refresh tokens per user (21st drops the oldest); 10 access tokens per refresh token per 10 min → cache ~55 min | https://www.zoho.com/crm/developer/docs/api/v8/token-validity.html |
| Data centres | accounts.zoho.com / .eu / .in / .com.au / .jp / zohocloud.ca / .com.cn (+ .sa, .uk); always use the token response's `api_domain`; authoritative list `https://accounts.zoho.com/oauth/serverinfo` | https://www.zoho.com/crm/developer/docs/api/v8/multi-dc.html |
| Scopes | `ZohoCRM.modules.{leads,contacts}.ALL`, `.accounts.READ`, `.deals.READ`, `.events.ALL`, `.notes.CREATE` (+READ unverified), `ZohoCRM.coql.READ`, `ZohoCRM.settings.modules.READ`, `ZohoCRM.users.READ` (unverified; `users.ALL` confirmed), `ZohoSearch.securesearch.READ` | https://www.zoho.com/crm/developer/docs/api/v8/scopes.html |
| Meetings | API module `Events`, module/plural label "Meetings"; create `POST /crm/v8/Events` — `Event_Title`, `Start_DateTime`, `End_DateTime`, `Remind_At`; `Participants` [{type, participant, Email}] ≤ 50; `What_Id` + `$se_module` (Deals/Accounts); `Who_Id`. Send datetimes with an explicit offset. Owner and timezone fields unverified | https://www.zoho.com/crm/developer/docs/api/v8/modules-api.html · …/insert-records.html |
| Search | `GET /crm/v8/{module}/search` with one of criteria/email/phone/word; per_page ≤ 200; ≤ 2000 total. COQL `POST /crm/v8/coql` `{"select_query": …}` for time windows (Events in COQL unverified) | https://www.zoho.com/crm/developer/docs/api/v8/search-records.html · …/COQL-Overview.html |
| Notes | `POST /crm/v8/Deals/{id}/Notes` or `/Notes` with `Parent_Id: {module: {api_name: "Deals"}, id}`, `Note_Content` | https://www.zoho.com/crm/developer/docs/api/v8/create-notes.html |
| Idempotency | `POST /crm/v8/{module}/upsert` with `duplicate_check_fields` (default Email for Leads/Contacts); response `action` insert/update | https://www.zoho.com/crm/developer/docs/api/v8/upsert-records.html |
| Limits | daily credits by edition (Enterprise 50k + 1000/user); concurrency 20 (Enterprise); search 1 credit; upsert 1 credit / 10 records | https://www.zoho.com/crm/developer/docs/api/v8/api-limits.html |

**Demo slice as built (phase9/zoho-slice, 13 Nov 2026):** read-only scopes `ZohoCRM.modules.{contacts,leads,accounts,deals,notes}.READ` + `ZohoCRM.settings.modules.READ`, `access_type=offline&prompt=consent`; code exchange only at a known accounts server (the redirect's `accounts-server`, else the client's DC); `api_domain` must match `https://www.zohoapis.<dc>`. Reads: `GET /crm/v8/{Contacts|Leads}/search?{phone|email|word}=…&fields=…` (204 = none), `GET /crm/v8/Contacts/{id}`, related `…/{id}/Deals` and `…/{id}/Notes` with `fields`, `GET /crm/v8/Accounts/{id}`. **Not yet verified on a real org** (no account in the session): once the owner connects, an admin opens `GET /api/v1/zoho/modules` (returns api_name, plural_label, api_supported) and the result goes here; also confirm that search accepts `fields` and that the Notes related list returns `Created_Time`.

**Writes as built (phase9/zoho-actions, 14 Nov 2026):** scopes add `contacts.UPDATE`, `leads.CREATE/UPDATE`, `events.READ/CREATE`, `notes.CREATE` (no Deals/Accounts write scope). Meetings: `GET /crm/v8/Events/search?criteria=((Start_DateTime:greater_equal:…)and(Start_DateTime:less_equal:…))` — verify on the owner's org. Writes: `POST /Events` (Who_Id, What_Id + `$se_module: Deals`, Participants), `POST /Leads` (plain create, not upsert: an approved "new lead" must not overwrite), `PUT /Contacts/{id}`, `POST /Notes` with `Parent_Id {module:{api_name:"Deals"}, id}`.

**Must verify on the owner's org (T-053 first step):** `GET /crm/v8/settings/modules` (Events `api_supported`, any Zoho Meeting module), DC and `api_domain`, `users.READ`, `prompt=consent` for refresh tokens, edition, unique fields, a test Event with Participants/Owner/offsets, Note_Title.

## Gallabox WhatsApp (research 2026-11-12; Postman collection ~55 % read; verify on the owner's account)
| Topic | Finding | Link |
|---|---|---|
| Auth | base `https://server.gallabox.com/devapi`; headers `apiKey`, `apiSecret`; key from Settings › Developer › API Keys (2FA, secret shown once; scope All/Read/Restricted); accountId and channelId copied from settings | https://api-docs.gallabox.com/view/metadata/Tzz7QJTJ · https://docs.gallabox.com/settings/api-keys.md |
| Template send | `POST /devapi/messages/whatsapp` `{channelId, channelType:"whatsapp", recipient:{name, phone}, whatsapp:{type:"template", template:{templateName, headerValues, bodyValues:{Var: …}, buttonValues:[…]}}}` → 202 `{id, status:"ACCEPTED"}`; `language` field unverified | https://api-docs.gallabox.com/api/collections/17087523/Tzz7QJTJ |
| Free-form | same endpoint, `whatsapp:{type:"text", text:{body}}` — disabled in v1 (D-033) | same |
| Templates | `GET /devapi/accounts/:accountId/whatsappTemplates` → name, language, category (UTILITY/MARKETING), status, components, variables. **Response embeds a `channel` object with credential-like fields: redact, never log** | same |
| History | **No message-history endpoint found** (unverified `GET /conversations` on a third-party catalog). Contacts: `GET /accounts/:accountId/contacts?phone=` | same |
| 24 h window | Meta: opens/reset on each user message; outside it templates only. Gallabox error `131047` = window closed. No window-status field documented | https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages · https://docs.gallabox.com/whatsapp/message-error-codes.md |
| Ban risk | spam, misclassified templates, negative feedback → 1–30 day restrictions or removal; stop on `131056`, `131048`, `131049`, `132015`/`132016`; opt-in required; new portfolios 250 unique users/24 h | https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement.md · …/messaging-limits.md |
| Webhooks | `POST /devapi/webhooks` {requestUrl, events}; `Message.Received`, `Message.WA.Status.Received/Failed`; `x-gallabox-signature` = base64 HMAC-SHA256; needs Essential/Advanced plan | https://docs.gallabox.com/settings/webhooks.md |
| Rate limits | per method, unpublished; `X-RateLimit-*` headers; 429 `TOO_MANY_REQUEST` | overview |

**Design consequence (T-064):** `window_status()` can only be built from our own record of the last inbound `Message.Received` webhook per phone (or `131047`), so v1 returns `unknown` → template. "Last 100 messages" needs either a history endpoint (verify) or storing webhook messages, which D-033 forbids — owner decision before 0.7.0 if no endpoint exists.
