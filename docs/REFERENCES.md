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
