# Speech-to-text pick-list (P2.3, English only)

Checked on 2026-10-20 against each vendor's own pricing page, not from memory. Free tiers change often, so check again before signing up.

**Scope:**
- English only (D-018). Real-time streaming is required, because the card must appear within 1.5 s (R1).
- Sotto needs a **primary** and a **backup** from different companies (R2).
- The owner asked for free first, with paid options as suggestions, and specifically about ElevenLabs.

## Free to start (pick two)

| # | Vendor (real-time model) | Free allowance | After the free credit | Free-tier limits | Notes |
|---|---|---|---|---|---|
| 1 | **Deepgram** (Nova-3 / Flux English) | **$200 one-time credit**, no card, no expiry: about **690 hours** of streaming at the current promo rate | $0.0048/min Nova-3 (promo) ≈ $0.29/h; Flux English $0.0065/min ≈ $0.39/h | Pay-as-you-go: up to 150 concurrent streams | Already on the owner's account list. Flux has built-in end-of-turn detection, which may save ~100–200 ms of R1 budget. **Recommended primary.** |
| 2 | **AssemblyAI** (Universal-Streaming) | **$50 one-time credit**, no card | $0.15/h: the cheapest paid real-time rate here | Free: 5 new streams per minute | Billed on connection time, so idle seconds count. **Recommended backup.** |
| 3 | **Speechmatics** (Melia 1 real-time) | **$100 one-time credit**, no card, valid 12 months | $0.40/h (or $0.27/h with the model-training discount) | Free: 2 concurrent real-time sessions | Strong accuracy. Fine as a backup in testing; 2 sessions is too few for a team. |
| 4 | **Gladia** (real-time) | **€50 one-time credit**, valid 1 year (≈ 73 h real-time) | €0.68/h | 30 concurrent real-time sessions | Most expensive paid rate on this list. |
| 5 | **ElevenLabs** (Scribe v2 Realtime) | Free plan: 10k credits a month. The pricing page lists about **2.5 hours of Scribe v2 Realtime** at the first tier | $0.39/h (Scribe v2 Realtime) | Free: 2 concurrent requests. **No commercial license on Free**; the $6/month Starter plan adds it | Advertises ~150 ms latency. Fine for trying out; too small and not licensed for real calls on Free. |
| 6 | **Microsoft Azure Speech** (F0) | **5 audio hours a month** of real-time, recurring | Standard paid tier (price not shown on the page today) | Concurrency per Azure quotas | The only recurring monthly free allowance found. Needs an Azure account. |

**Not real-time (cannot be the live transcriber):** Groq Whisper. It is free and fast, but only on finished recordings, so it can serve the replay and summaries.

**Free and self-hosted:** open models such as Whisper or Parakeet run on our own server. There is no per-minute fee, but you pay for a server, and keeping latency within R1 is our work. They can be added later behind the same STT adapter (R6).

## Paid, if a free tier runs out (suggestions)

| Vendor | Real-time price | Why consider it |
|---|---|---|
| Soniox | $0.12/h | The lowest real-time list price found. No free credit is advertised. |
| AssemblyAI | $0.15/h | Cheap backup that is already in the list above. |
| Deepgram Nova-3 | ≈ $0.29/h (promo) | Mature real-time API with high concurrency. |

At the BRIEF's year-1 volume (7,500 call minutes a day ≈ 125 h a day), Deepgram costs about $36 a day and AssemblyAI about $19 a day. Only the customer track is transcribed for triggering (R4). Transcribing the agent track for context (D-017/BRIEF) would roughly double this.

## Recommendation

- **Primary: Deepgram.** It has the largest free credit, no expiry, high concurrency and a built-in end-of-turn option. It is already on your account list.
- **Backup: AssemblyAI.** It is a different company, has a $50 free credit and the cheapest paid rate.
- **ElevenLabs:** not now. The free plan has about 2.5 real-time hours a month and no commercial license. Worth a benchmark later if accuracy on our recordings justifies $0.39/h.

Next step after the owner picks:
1. The owner creates the two accounts and puts the keys in `.env` on the Mac (`DEEPGRAM_API_KEY`, `ASSEMBLYAI_API_KEY`).
2. Claude builds the two STT adapters (P2.3) and benchmarks them on the synthetic replay. The real benchmark follows when golden calls exist (P0.5).

## First live measurement (2026-10-20, `pnpm stt:live`, synthetic speech)

| Vendor | Final transcript after end of speech (p50 / max) | Word errors |
|---|---|---|
| Deepgram (nova-3) | 829 / 892 ms | 0% |
| AssemblyAI (universal-streaming-english) | 667 / 733 ms | 0% |
| Speechmatics (standard) | 458–500 ms; the 3rd clip hit the free plan's concurrency limit | (2 of 3 clips) |
| ElevenLabs | not run (no key) | – |

Both main candidates are accurate on clean speech. Both are slower than the 350 ms budget, because they wait for their own silence detection. The fix is on our side (tracker T-007).

## Sources (vendor pages, 2026-10-20)

- Deepgram pricing: https://deepgram.com/pricing
- AssemblyAI pricing: https://www.assemblyai.com/pricing
- Speechmatics pricing: https://www.speechmatics.com/pricing
- Gladia pricing: https://www.gladia.io/pricing
- ElevenLabs API pricing: https://elevenlabs.io/pricing/api. Plans: https://elevenlabs.io/pricing
- ElevenLabs real-time STT docs: https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/server-side-streaming.md
- Azure Speech pricing: https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/
- Soniox pricing: https://soniox.com/pricing
