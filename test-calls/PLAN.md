# Golden-call plan (P0.4)

> **Status: draft based on Claude's recommendations (D-009). The owner has not agreed it or set a date yet.**

The golden set proves three things in `pnpm replay --all`:
- R1 latency (p50/p95);
- R4 (the agent never triggers a card);
- suggestion quality, scored by the judge.

It needs real or realistic calls with **separate customer and agent tracks**.

## What to record

10 calls, 5–10 minutes each:

| # | Content | Language | Special condition |
|---|---|---|---|
| 1–3 | First qualification call with a new lead | 1 English, 1 Arabic, 1 mixed | – |
| 4–5 | Price and competitor objections | mixed | – |
| 6 | "Send me details on WhatsApp" brush-off | Arabic | – |
| 7 | Product and package questions (top FAQs) | English | – |
| 8 | Questions the playbook cannot answer (tests the R2 chain) | mixed | – |
| 9 | Any topic | any | Noisy background (car, café) |
| 10 | Any topic | any | Agent talks over the customer (tests R4) |

Together the 10 calls cover the top 10 objections from `playbook/objections.md`.

## How to get separate tracks (in order of preference)

1. **Yeastar call recording with split channels**, if the PBX supports a stereo or dual-file recording. Check the Yeastar admin first.
2. **Two phones and two recorders.** It is a role-play: the "customer" records on one phone and the agent records on another. Clap once at the start so the tracks can be aligned.
3. **Role-play over LiveKit** once Phase 4 exists. Each participant is a separate track automatically. This is the fallback if 1 and 2 are not possible, but it delays P2.8.

Role-played calls are acceptable as long as the customer side is played by someone who is not the agent, using real objections.

## Consent wording (draft; the owner checks it with legal advice)

> "This call may be recorded to train and test our sales assistant software. The recording is kept privately and deleted after testing. Do you agree?"

The customer's spoken "yes" must be on the recording. Without it, use a role-play instead.

## Where audio is stored

- **Never in git.** `.gitignore` blocks `*.wav`, `*.mp3`, `*.m4a`, `*.ogg`, `*.flac` and `recordings/`.
- On the owner's Mac: `~/sotto-recordings/<call-id>.customer.wav` and `<call-id>.agent.wav`, as 16 kHz mono WAV.
- Later: a private Supabase storage bucket with RLS (Phase 5). The replay harness reads the folder path from an env var, `SOTTO_RECORDINGS_DIR`.

## How to label

For each call, write `test-calls/<call-id>.json` in the format in `README.md`. Each call needs at least 5 moments, and each moment has:
- `at_ms`: when the customer **finishes** the sentence (the R1 clock starts here);
- `speaker`: the speaker; for R4, moments where the agent speaks are labelled too, with `"expect": "no_card"`;
- `type`: one of `question`, `objection`, `answer`, `warning`;
- `good_suggestion`: what the best agent would say;
- `playbook_ref`: the playbook entry, or `null` when the playbook does not cover it.

Claude can draft the labels from a transcript. The owner or the best agent checks `good_suggestion`.

## Owner actions

- [ ] Agree to this plan and set a date for the recordings.
- [ ] Check whether Yeastar can record split channels.
- [ ] Record the 10 calls, or waive the gate until P2.8 (Phase 1 does not need them).
