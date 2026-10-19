# Owner answers — 2026-10-19

Submitted by the owner on the "Sotto Owner Decisions" page
(https://claude.ai/artifact/7KfhEygJMdxMi5gPRdmWV6, db `answers/owner`, version 23,
submitted 2026-10-19T19:16Z). Copied here verbatim so a local session can apply them
without the artifact. **Not yet applied** to BRIEF.md, DECISIONS.md or `.claude/settings.json`;
that is the first task of the next session (see TRACKER → Now).

Owner notes are quoted exactly. Everything else is the option label the owner picked.

## AI

| Question | Answer |
|---|---|
| Primary LLM (live suggestions) | Groq (free) |
| Backup LLM | Google Gemini Flash (free) |
| Free tiers may keep what we send — when is that OK? | Not sure, explain more when it matters |
| Speech-to-text | Something else. Note: *"find something free for me to pick but keep the paid providers as suggestions, what about elevenlabs?"* |
| Customers needing on-premise AI | No, not for the first customers |

## Calls

| Question | Answer |
|---|---|
| Calls go through the Sotto app? | Yes, calls go through the app |
| Phone line for app calls | Use our existing Yeastar system |
| Customer languages | Mostly English. Note: *"Consider it only English"* |
| Card language | Always English |
| Goal of a good call | Close the sale on the call |

## What the agent sees

| Question | Answer |
|---|---|
| AI answers from general knowledge when the playbook has none? | Yes, with the warning label |
| AI also listens to the agent, as context only? | Yes, as context only |
| Card types | Answer, Next question, Objection handling, Warning |

## Business

| Question | Answer |
|---|---|
| First 1–3 companies and agent counts | (left blank) |
| Free trial | 14 days, 3 seats, 300 minutes |
| Transcript retention / audio | Also keep audio (no duration given in the note) |
| Data residency (UAE/GCC) | No requirement |
| Who may edit prompts | Me plus each company's admins |
| Success measures | Cards in ≤ 1.5 s; share of calls made through Sotto; agents' thumbs up/down; manager answers unanswered questions within 24 h |
| Monthly budget while building | $0, free tiers only (ask me for the phone line) |

## Accounts and keys

| Question | Answer |
|---|---|
| Free accounts the owner can open this week | Groq, Google AI Studio, Supabase, LiveKit Cloud, Deepgram |
| How keys are handed over | Only `.env` on my Mac (no cloud-environment secrets) |

## Technical decisions

| Item | Answer |
|---|---|
| D-009 build on written assumptions | Approve |
| D-010 Expo (React Native) | Approve |
| D-011 Biome | Approve |
| D-012 short-lived per-call worker key | Approve |
| D-013 local demo first, live calls later | Approve |
| D-014 visual design from the demo | Approve |
| D-015 server-function security rules in small tested files | Approve |
| ARCHITECTURE.md | Approve |

## Inputs and repo

| Question | Answer |
|---|---|
| Real playbook | I'll send documents; you draft, I correct |
| 10 golden test calls | Later; keep using the simulated test |
| Two coding-hook fixes (show Stop-hook errors, never trap a session without Python tools; run the two formatters separately) | Yes, apply both |
| Allow writing `.env.example` (names only) | Yes, allow `.env.example` only |

## What these change — to apply next session

1. **DECISIONS.md:** mark D-009–D-015 and the architecture as owner-approved (2026-10-19). Add a decision that confirms D-016 (Groq primary, Gemini backup) as the owner's choice.
2. **English only (new decision needed).** Customer speech and cards are English only. This narrows STT testing (no Gulf Arabic / code-switch requirement) and the trigger rules.
   - R5 still asks for Arabic RTL **UI** support. The answer does not say to drop it, so keep RTL in the UI until the owner explicitly changes R5 (a requirement change needs the owner).
   - Check P0 assumptions and BRIEF entries that mention Gulf Arabic.
3. **STT:** research free real-time options for English, including ElevenLabs as the owner asked. Present a short pick-list (free first, paid as suggestions) for the owner to choose from. Verify current free tiers against the vendors' own docs; don't rely on memory. Deepgram is already on the owner's account list.
4. **Phone line:** Yeastar. P4 needs the Yeastar admin details later, and a check that this Yeastar model can send a SIP trunk to LiveKit. Ask the owner when P4 live calls start.
5. **Retention:** audio is kept, but no duration was given. Ask the owner for the duration. Audio storage also needs a consent/legal note per company and storage on a free tier. Until answered, keep the default of no audio storage in code (`[!]` owner).
6. **Free tiers and customer data:** the owner is unsure. Before the first real customer call, explain the trade-off again (the Gemini free tier may train on inputs) and get an explicit choice.
7. **Keys:** `.env` on the Mac only. Live smoke tests (P2.3 on Groq/Gemini) run in local sessions only; cloud sessions stay on fake models.
8. **BRIEF.md:**
   - call goal: close on the call;
   - card types: answer / next question / objection / warning;
   - the AI may answer generally, with the label;
   - agent track: context only;
   - trial: 14 d / 3 seats / 300 min;
   - residency: none;
   - prompt editors: owner + company admins;
   - success metrics;
   - budget $0;
   - playbook from owner documents;
   - golden calls later;
   - first companies still unknown.
9. **`.claude/settings.json` (owner-approved):**
   - add an allow rule for `.env.example` only (real `.env*` stay denied);
   - apply the two hook fixes: surface Stop-hook errors and don't trap sessions without the Python tools; run Biome and ruff formatters separately.
   Then create `.env.example` from the names in `docs/ENV.md`, with no values.
10. Update the project map artifact (https://claude.ai/artifact/JV2NzAysf1dCB9kEdHCc2s) so it shows the decisions as answered.
