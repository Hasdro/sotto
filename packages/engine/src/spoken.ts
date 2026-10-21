/**
 * A spoken customer track on the client (D-022), ported from sotto_worker/server/audio.py:
 * an energy VAD ends the turn after END_SILENCE_MS of quiet, we ask the vendor for the final at
 * once, and t0 (the R1 clock) is when the customer stopped speaking. On an STT failure the
 * backup vendor takes over for the rest of the call (R2).
 */
import type { SttRoute, SttStream, TokenSource } from "./adapters/stt.ts";
import { openStt, type SocketFactory } from "./adapters/stt.ts";
import type { Clock, TranscriptEvent } from "./types.ts";

export const FRAME_MS = 20;
const FRAME_SAMPLES = 320;
export const END_SILENCE_MS = 300;
const MIN_SPEECH_MS = 160;
const FLUSH_AFTER_MS = 1500;
const TAIL_WAIT_MS = 400;
const HOLD_MS = 500;
const MIN_THRESHOLD = 350;
const NOISE_FACTOR = 3;
const STOP_WAIT_MS = 2000;
/** Audio kept while a vendor connects (token + socket), sent once it is open (T-019). */
const MAX_UNSENT_FRAMES = 500; // 10 s
const SENTENCE_END = /[.?!؟]\s*$/;
const CONTINUATION_WORDS = new Set(
  (
    "and but or so because the a an to of for with my our your their is are was if that which " +
    "about in on at from than like um uh"
  ).split(" "),
);

export function rms(frame: Int16Array): number {
  if (!frame.length) return 0;
  let sum = 0;
  for (const s of frame) sum += s * s;
  return Math.sqrt(sum / frame.length);
}

export function midThought(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  const last = words.at(-1);
  // A vendor's formatter may close a cut sentence with "." ("…included with the."); "?" and "!"
  // still end it.
  return last !== undefined && !/[?!؟]\s*$/.test(text) && CONTINUATION_WORDS.has(last);
}

/** Joins finals; a piece cut after a dangling word loses its "." and the next piece goes on. */
function joinFinals(texts: string[]): string {
  let out = "";
  for (const raw of texts) {
    const text = raw.trim();
    if (!text) continue;
    if (out && midThought(out) && /\.\s*$/.test(out)) {
      out = `${out.replace(/\.\s*$/, "")} ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    } else {
      out = out ? `${out} ${text}` : text;
    }
  }
  return out;
}

export class EndOfTurnVAD {
  speaking = false;
  speechMs = 0;
  silenceMs = 0;
  noiseFloor = 100;
  private candidateMs = 0;

  private readonly endSilenceMs: number;

  constructor(endSilenceMs = END_SILENCE_MS) {
    this.endSilenceMs = endSilenceMs;
  }

  threshold(): number {
    return Math.max(MIN_THRESHOLD, this.noiseFloor * NOISE_FACTOR);
  }

  feed(frame: Int16Array): "start" | "end" | null {
    const level = rms(frame);
    const voiced = level > this.threshold();
    if (!voiced) this.noiseFloor = 0.95 * this.noiseFloor + 0.05 * level;
    if (!this.speaking) {
      this.candidateMs = voiced ? this.candidateMs + FRAME_MS : 0;
      if (this.candidateMs >= MIN_SPEECH_MS) {
        this.speaking = true;
        this.speechMs = this.candidateMs;
        this.silenceMs = 0;
        this.candidateMs = 0;
        return "start";
      }
      return null;
    }
    if (voiced) {
      this.speechMs += FRAME_MS;
      this.silenceMs = 0;
      return null;
    }
    this.silenceMs += FRAME_MS;
    if (this.silenceMs >= this.endSilenceMs) {
      this.speaking = false;
      return "end";
    }
    return null;
  }
}

export type CustomerAudioDeps = {
  routes: SttRoute[];
  tokens: TokenSource;
  clock: Clock;
  onTurn: (event: TranscriptEvent, t0: number) => void;
  onPartial: (text: string) => void;
  onNotice: (message: string) => void;
  socketFactory?: SocketFactory;
};

export class CustomerAudio {
  private readonly vad = new EndOfTurnVAD();
  private pending: TranscriptEvent[] = [];
  private streamMs = 0;
  private streamBase = 0;
  private lastTurnStreamEnd: number | null = null;
  private hold = false;
  private speechStart: number | null = null;
  private closing: [number, number, number] | null = null;
  private stt: SttStream | null = null;
  private routeIndex = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private carry = new Int16Array(0);
  private unsent: ArrayBuffer[] = [];
  private unsentStartMs = 0;
  private stopped = false;
  vendor: string | null = null;

  private readonly deps: CustomerAudioDeps;

  constructor(deps: CustomerAudioDeps) {
    this.deps = deps;
    if (!deps.routes.length) throw new Error("no speech-to-text vendor is set up");
  }

  async start(): Promise<void> {
    await this.openNext();
  }

  private async openNext(): Promise<void> {
    while (this.routeIndex < this.deps.routes.length && !this.stopped) {
      const route = this.deps.routes[this.routeIndex] as SttRoute;
      this.routeIndex += 1;
      try {
        const stt = await openStt(
          route,
          this.deps.tokens,
          {
            onEvent: (e) => this.event(e),
            onError: (err) => this.failed(route, err),
          },
          this.deps.socketFactory,
        );
        // The vendor's clock starts with the first audio it receives: the frames kept while it
        // connected. Without them its timestamps run behind ours and a sentence that follows
        // closely would be taken for a late tail of the previous one.
        this.streamBase = this.unsent.length ? this.unsentStartMs : this.streamMs;
        for (const frame of this.unsent) stt.send(frame);
        this.unsent = [];
        this.stt = stt;
        this.vendor = route.provider;
        return;
      } catch (err) {
        this.failed(route, err instanceof Error ? err : new Error(String(err)), false);
      }
    }
    this.vendor = null;
  }

  private failed(route: SttRoute, err: Error, reopen = true): void {
    this.stt = null;
    const more = this.routeIndex < this.deps.routes.length;
    this.deps.onNotice(
      `speech-to-text ${route.provider} failed (${err.message})${more ? "; switching to the backup vendor" : ""}`,
    );
    if (reopen && more) void this.openNext();
  }

  /** Raw PCM16 mono 16 kHz from the microphone, any length. */
  push(pcm: ArrayBuffer): void {
    if (this.stopped) return;
    const incoming = new Int16Array(pcm);
    const all = new Int16Array(this.carry.length + incoming.length);
    all.set(this.carry);
    all.set(incoming, this.carry.length);
    let at = 0;
    while (all.length - at >= FRAME_SAMPLES) {
      const frame = all.slice(at, at + FRAME_SAMPLES);
      at += FRAME_SAMPLES;
      if (this.stt) this.stt.send(frame.buffer);
      else this.keep(frame.buffer);
      this.streamMs += FRAME_MS;
      this.onVad(this.vad.feed(frame));
    }
    this.carry = all.slice(at);
  }

  private keep(frame: ArrayBuffer): void {
    if (!this.unsent.length) this.unsentStartMs = this.streamMs;
    this.unsent.push(frame);
    if (this.unsent.length > MAX_UNSENT_FRAMES) {
      this.unsent.shift();
      this.unsentStartMs += FRAME_MS;
    }
  }

  private onVad(change: "start" | "end" | null): void {
    const now = this.deps.clock.now();
    if (change === "start") {
      const unsent = this.pending.map((e) => e.text).join(" ");
      if (this.closing !== null && (this.hold || midThought(unsent))) {
        this.hold = false; // they went on after "…about the": still the same turn
        this.closing = null;
        this.clearFlush();
      } else {
        this.speechStart = now - this.vad.speechMs;
      }
    } else if (change === "end") {
      const end = now - END_SILENCE_MS;
      const start = this.speechStart ?? end;
      this.closing = [start, end, this.streamMs - END_SILENCE_MS];
      try {
        this.stt?.finalize();
      } catch {
        /* a failed finalize only costs vendor latency */
      }
      this.armFlush();
    }
  }

  private clearFlush(): void {
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  private armFlush(wait?: number): void {
    this.clearFlush();
    const ms = wait ?? (this.pending.length ? TAIL_WAIT_MS : FLUSH_AFTER_MS);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, ms);
  }

  private event(e: TranscriptEvent): void {
    if (!e.final) {
      this.deps.onPartial(e.text);
      return;
    }
    this.deps.onPartial("");
    const last = this.lastTurnStreamEnd;
    if (last !== null && this.streamBase + e.start_ms < last) return; // late tail of a sent turn
    this.pending.push(e);
    if (this.closing === null) return;
    // A final that ends the sentence goes now: the 300 ms of silence already ended the turn, so a
    // further settle wait only delayed every card (T-028). flush() still holds a mid-thought cut.
    if (SENTENCE_END.test(e.text)) this.flush();
    else this.armFlush(TAIL_WAIT_MS);
  }

  private flush(): void {
    this.clearFlush();
    const closing = this.closing;
    if (!this.pending.length || closing === null) return;
    const [start, end, endStream] = closing;
    let mine = this.pending.filter((e) => this.streamBase + e.start_ms < endStream);
    const rest = mine.length ? this.pending.filter((e) => !mine.includes(e)) : [];
    if (!mine.length) mine = this.pending;
    const text = joinFinals(mine.map((e) => e.text));
    if (!this.hold && midThought(text)) {
      this.hold = true; // "…and the": give them HOLD_MS to go on
      this.armFlush(HOLD_MS);
      return;
    }
    this.hold = false;
    this.pending = rest;
    this.closing = null;
    this.lastTurnStreamEnd = endStream;
    if (text) {
      this.deps.onTurn(
        { speaker: "customer", text, final: true, start_ms: start, end_ms: end },
        end,
      );
    }
  }

  /** End of the spoken track: let the vendor send its last finals, then send the last turn. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    const stt = this.stt;
    if (stt !== null) {
      await Promise.race([stt.end(), this.deps.clock.sleep(STOP_WAIT_MS)]);
    }
    this.stopped = true;
    if (this.pending.length) {
      if (this.closing === null) {
        const now = this.deps.clock.now();
        this.closing = [this.speechStart ?? now, now, this.streamMs];
      }
      this.hold = true;
      this.flush();
    }
    this.clearFlush();
    this.stt = null;
    this.unsent = [];
  }
}
