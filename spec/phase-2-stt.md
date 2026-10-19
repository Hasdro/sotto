# Spec: real-time STT adapters (P2.3, D-019)

## Objective
Four real-time English speech-to-text adapters behind one interface: Deepgram, AssemblyAI, Speechmatics and ElevenLabs. The owner picks the primary and the backup by setting (`seed/models/default.yaml` today, the Keys & providers panel in P6.7). There are no code changes to switch.

## Interface (`sotto_worker/contracts.py`)
```python
@dataclass(frozen=True)
class STTOptions:
    speaker: Speaker              # the track this stream belongs to (R4: set by the room, never guessed)
    sample_rate: int = 16000      # PCM16 mono little-endian
    language: str = "en"          # D-018

class STTAdapter(Protocol):
    provider: str
    model: str
    def transcribe(self, audio: AsyncIterator[bytes], opts: STTOptions) -> AsyncIterator[TranscriptEvent]: ...
```
- `audio`: raw PCM16 chunks of about 20–100 ms. The adapter re-chunks if a vendor needs it (AssemblyAI: 50–1000 ms per message).
- Events: `TranscriptEvent(speaker=opts.speaker, text, final, start_ms, end_ms)`. Times are ms from the stream start. Partials have `final=False`; only finals feed the pipeline today (drafting on partials is T-004).
- `finalize()` (T-007): while a stream is open, asks the vendor for the final transcript now (Deepgram `{"type":"Finalize"}`, AssemblyAI `{"type":"ForceEndpoint"}`, Speechmatics `{"message":"ForceEndOfUtterance"}`, ElevenLabs an empty `input_audio_chunk` with `commit: true`). Returns False when no stream is open. Our end-of-turn stage calls it, so finals do not wait for the vendor's silence rule.
- When `audio` ends, the adapter sends the vendor's end-of-stream message, yields the remaining finals, and returns.
- Vendor errors, or a socket closed early, raise `STTError` (the vendor name, never the key). Failover to the backup (F-02) is Phase 4 (P4.4), not this task.

## Vendors (official docs checked 2026-10-20)

| Vendor | URL | Auth header | Audio | Finals | End |
|---|---|---|---|---|---|
| Deepgram | `wss://api.deepgram.com/v1/listen?model=…&encoding=linear16&sample_rate=…&channels=1&interim_results=true&language=en&smart_format=true` | `Authorization: Token <key>` | binary | `type=Results`, `is_final=true`; `start`/`duration` in s | send `{"type":"CloseStream"}` |
| AssemblyAI | `wss://streaming.assemblyai.com/v3/ws?sample_rate=…&encoding=pcm_s16le&speech_model=…&format_turns=true` | `Authorization: <key>` | binary, 50–1000 ms | `type=Turn`, `end_of_turn=true` and `turn_is_formatted=true`; `words[].start/end` in ms | send `{"type":"Terminate"}`, wait for `Termination` |
| Speechmatics | `wss://eu.rt.speechmatics.com/v2/` | `Authorization: Bearer <key>` | `StartRecognition` (raw `pcm_s16le`, `enable_partials`, `max_delay`, `model`), then binary | `AddTranscript`: `metadata.transcript`, `metadata.start_time/end_time` in s | `{"message":"EndOfStream","last_seq_no":n}`, wait for `EndOfTranscript` |
| ElevenLabs | `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=…&audio_format=pcm_16000&commit_strategy=vad&language_code=en&include_timestamps=true` | `xi-api-key: <key>` | JSON `input_audio_chunk` with base64 audio | `committed_transcript_with_timestamps`: `words[].start/end` in s | send a final chunk with `commit: true`, then close |

## Key binding (D-016 extended)
`DEEPGRAM_API_KEY` → `api.deepgram.com`; `ASSEMBLYAI_API_KEY` → `streaming.assemblyai.com`; `SPEECHMATICS_API_KEY` → `eu.rt.speechmatics.com` / `global.rt.speechmatics.com`; `ELEVENLABS_API_KEY` → `api.elevenlabs.io`. Only `wss://` URLs are allowed, user info in a URL is rejected, and a key never goes in a URL.

## Routing
- `stt` and `stt_backup` are stages, and `BACKUP_STAGE["stt"] = "stt_backup"`, so a company's `backup_allowed` covers STT (R2).
- The seed default is Deepgram as primary and AssemblyAI as backup (recommended in STT-OPTIONS; the owner can change it).
- `make_stt(route, env)` builds the adapter; `preload_adapters` covers STT modules too.

## Testing
- Unit: each adapter runs against a scripted fake WebSocket. The tests check:
  - the URL, the headers and the first messages;
  - the audio framing;
  - the event mapping (text, final flag, ms times, speaker);
  - the end-of-stream handshake;
  - error to `STTError`;
  - that the key is never in the URL or the error text.
- Live: `pnpm stt:live` (Mac, keys in `.env`). It synthesises English speech with macOS `say` into a temp file (never in git) and streams it in real time to every vendor that has a key. It reports the text and the delay from the last audio byte to the final transcript. This is the P2.3 evidence; the golden-call benchmark is P2.8.

## Boundaries
- WebSocket code lives only in `sotto_worker/adapters/stt/`, using the `websockets` library (no vendor SDKs).
- Vendor model names appear only in `seed/models/` and the adapters.
