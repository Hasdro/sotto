/**
 * Real-time speech-to-text from the client (D-022), raw WebSocket, no SDK. Browsers cannot set
 * headers on a WebSocket, so the socket authenticates with a short-lived token that the
 * management server mints from the company's key (POST /api/v1/stt-token/{vendor}); the real
 * key never reaches the device for STT.
 *
 * AssemblyAI Universal-Streaming v3 and Speechmatics real-time v2, same framing as
 * sotto_worker/adapters/stt/{assemblyai,speechmatics}.py (docs checked 2026-10-20).
 */
import type { TranscriptEvent } from "../types.ts";

export type SttToken = { token: string; param: string };
export type TokenSource = (vendor: string) => Promise<SttToken>;

export interface SocketLike {
  readyState: number;
  binaryType: string;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  send(data: string | ArrayBuffer): void;
  close(code?: number): void;
}
export type SocketFactory = (url: string) => SocketLike;
const OPEN = 1;

export type SttHandlers = {
  onEvent: (event: TranscriptEvent) => void;
  /** The stream failed (vendor error or closed early). Called at most once. */
  onError: (error: Error) => void;
};

export interface SttStream {
  readonly provider: string;
  /** One 20 ms PCM16 mono 16 kHz frame. */
  send(frame: ArrayBuffer): void;
  /** Ask for the final transcript now (our end of turn, T-007). */
  finalize(): void;
  /** End of audio: resolves once the vendor sent its last finals (or after a timeout). */
  end(): Promise<void>;
}

export type SttRoute = { provider: string; model: string; base_url?: string };

const END_TIMEOUT_MS = 5000;
const ALLOWED_HOSTS: Record<string, string[]> = {
  assemblyai: ["streaming.assemblyai.com"],
  speechmatics: ["eu.rt.speechmatics.com", "global.rt.speechmatics.com"],
};
const DEFAULT_URL: Record<string, string> = {
  assemblyai: "wss://streaming.assemblyai.com/v3/ws",
  speechmatics: "wss://eu.rt.speechmatics.com/v2/",
};

export const STT_VENDORS = Object.keys(DEFAULT_URL);

function concat(chunks: ArrayBuffer[]): ArrayBuffer {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(new Uint8Array(c), at);
    at += c.byteLength;
  }
  return out.buffer;
}

function vendorUrl(route: SttRoute): URL {
  const url = new URL(route.base_url ?? (DEFAULT_URL[route.provider] as string));
  const hosts = ALLOWED_HOSTS[route.provider] ?? [];
  if (url.protocol !== "wss:" || !hosts.includes(url.hostname)) {
    throw new Error(`${route.provider}: speech must go to ${hosts.join(" or ")} over wss`);
  }
  return url;
}

export async function openStt(
  route: SttRoute,
  tokens: TokenSource,
  handlers: SttHandlers,
  socketFactory: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike,
): Promise<SttStream> {
  if (!(route.provider in DEFAULT_URL)) throw new Error(`no client STT for ${route.provider}`);
  const url = vendorUrl(route);
  const { token, param } = await tokens(route.provider);
  const isAai = route.provider === "assemblyai";
  if (isAai) {
    url.searchParams.set("sample_rate", "16000");
    url.searchParams.set("encoding", "pcm_s16le");
    url.searchParams.set("speech_model", route.model);
    url.searchParams.set("format_turns", "true");
  }
  url.searchParams.set(param, token);

  const ws = socketFactory(url.toString());
  ws.binaryType = "arraybuffer";
  let ready = isAai; // Speechmatics: audio only after RecognitionStarted
  let opened = false;
  let failed = false;
  let ending = false;
  let finished: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    finished = resolve;
  });
  const waiting: ArrayBuffer[] = []; // audio before the socket is ready
  let batch: ArrayBuffer[] = []; // AssemblyAI wants 50 to 1000 ms per message: send 100 ms
  let seq = 0;

  const fail = (message: string) => {
    if (failed || ending) return;
    failed = true;
    handlers.onError(new Error(`speech-to-text ${route.provider}: ${message}`));
    finished();
  };
  const sendAudio = (chunk: ArrayBuffer) => {
    if (ws.readyState !== OPEN) return;
    ws.send(chunk);
    seq += 1;
  };
  const flushBatch = () => {
    if (batch.length) sendAudio(concat(batch));
    batch = [];
  };

  ws.onopen = () => {
    opened = true;
    if (!isAai) {
      ws.send(
        JSON.stringify({
          message: "StartRecognition",
          audio_format: { type: "raw", encoding: "pcm_s16le", sample_rate: 16000 },
          transcription_config: {
            language: "en",
            enable_partials: true,
            max_delay: 0.7,
            model: route.model,
          },
        }),
      );
    } else {
      for (const f of waiting.splice(0)) batch.push(f);
    }
  };
  ws.onerror = () => fail("connection error");
  ws.onclose = (ev) => {
    if (!ending && !failed) fail(`closed (${ev.code ?? "?"}${ev.reason ? ` ${ev.reason}` : ""})`);
    finished();
  };
  ws.onmessage = (ev) => {
    if (typeof ev.data !== "string") return;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (isAai) {
      if (m.type === "Termination") return finished();
      if (m.type === "Error" || "error" in m) return fail(String(m.error ?? "error"));
      if (m.type !== "Turn") return;
      const text = String(m.transcript ?? "");
      if (!text.trim()) return;
      const words = (m.words as { start: number; end: number }[] | undefined) ?? [];
      const start = words[0]?.start ?? 0;
      const end = words.at(-1)?.end ?? start;
      const final = Boolean(m.end_of_turn) && Boolean(m.turn_is_formatted);
      handlers.onEvent({ speaker: "customer", text, final, start_ms: start, end_ms: end });
      return;
    }
    const kind = m.message;
    if (kind === "RecognitionStarted") {
      ready = true;
      for (const f of waiting.splice(0)) sendAudio(f);
      return;
    }
    if (kind === "EndOfTranscript") return finished();
    if (kind === "Error") return fail(`${String(m.type ?? "error")}: ${String(m.reason ?? "")}`);
    if (kind !== "AddPartialTranscript" && kind !== "AddTranscript") return;
    const meta =
      (m.metadata as { transcript?: string; start_time?: number; end_time?: number }) ?? {};
    const text = String(meta.transcript ?? "");
    if (!text.trim()) return;
    handlers.onEvent({
      speaker: "customer",
      text,
      final: kind === "AddTranscript",
      start_ms: Math.round((meta.start_time ?? 0) * 1000),
      end_ms: Math.round((meta.end_time ?? 0) * 1000),
    });
  };

  return {
    provider: route.provider,
    send(frame) {
      if (failed || ending) return;
      if (!opened || !ready) {
        if (waiting.length < 500) waiting.push(frame);
        return;
      }
      if (isAai) {
        batch.push(frame);
        if (batch.length >= 5) flushBatch();
      } else sendAudio(frame);
    },
    finalize() {
      if (ws.readyState !== OPEN || failed) return;
      if (isAai) {
        flushBatch();
        ws.send(JSON.stringify({ type: "ForceEndpoint" }));
      } else if (ready) ws.send(JSON.stringify({ message: "ForceEndOfUtterance" }));
    },
    async end() {
      if (failed) return;
      if (ws.readyState === OPEN) {
        if (isAai) {
          flushBatch();
          ws.send(JSON.stringify({ type: "Terminate" }));
        } else ws.send(JSON.stringify({ message: "EndOfStream", last_seq_no: seq }));
      }
      ending = true;
      const timer = new Promise<void>((resolve) => setTimeout(resolve, END_TIMEOUT_MS));
      await Promise.race([done, timer]);
      try {
        ws.close(1000);
      } catch {
        /* already closed */
      }
    },
  };
}
