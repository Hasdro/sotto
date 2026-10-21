/**
 * A whole call on the client (D-022): the demo protocol (packages/shared demo.ts) answered
 * locally instead of by the server's /ws, so the call screen works the same either way.
 * Ported from sotto_worker/server/calls.py + runtime.py.
 */
import type { DemoClientMessage, DemoServerMessage } from "@sotto/shared";
import { hasCredentials, makeLLM } from "./adapters/llm.ts";
import {
  type SocketFactory,
  STT_VENDORS,
  type SttRoute,
  type TokenSource,
} from "./adapters/stt.ts";
import { PlaybookIndex } from "./playbook.ts";
import { ModelRouter } from "./router.ts";
import { CallSession, type CardTimingRecord, type Escalation } from "./session.ts";
import { CustomerAudio } from "./spoken.ts";
import {
  type CallBundle,
  type Clock,
  type CompanyProfile,
  newId,
  realClock,
  type Speaker,
  type StageRoute,
} from "./types.ts";

const STT_KEY_ENV: Record<string, string> = {
  assemblyai: "ASSEMBLYAI_API_KEY",
  speechmatics: "SPEECHMATICS_API_KEY",
};
/** Warm once at call start, then at the HTTP keep-alive (120 s): each ping spends the company's
 * own vendor quota, and every 25 s cost ten agents ~24 of Groq's ~30 free requests a minute. */
export const KEEP_WARM_EVERY_MS = 120_000;
const MAX_LINE_CHARS = 2000;

export type Runtime = {
  company: CompanyProfile;
  router: ModelRouter;
  playbook: PlaybookIndex;
  mode: "fake" | "live";
  sttRoutes: SttRoute[];
  notes: string[];
  bundle: CallBundle;
};

/** Live models when the suggest route has a key; otherwise the offline demo model (as the
 * worker's build_demo_runtime). A backup without a key is switched off for this call. */
export function buildRuntime(
  bundle: CallBundle,
  clock: Clock = realClock,
  fetchFn?: typeof fetch,
): Runtime {
  const keys = bundle.keys ?? {};
  const stages: Record<string, StageRoute> = { ...bundle.stages };
  const disabled = new Set(bundle.company.backup_disabled);
  const notes: string[] = [];
  let mode: "fake" | "live" = "live";
  const primary = stages.suggest;
  // Agents read these notes: plain words, no key names (the admin sees the vendor on Keys).
  if (!primary || !hasCredentials(primary, keys)) {
    stages.suggest = {
      provider: "fake",
      model: "demo",
      first_token_ms: primary?.first_token_ms ?? 700,
    };
    delete stages.suggest_backup;
    mode = "fake";
    notes.push("Real AI answers are off — ask your admin to connect a model.");
  } else {
    const backup = stages.suggest_backup;
    if (backup && !hasCredentials(backup, keys)) {
      disabled.add("suggest_backup");
      notes.push("The backup AI is off — ask your admin to connect a second model.");
    }
  }
  const status = bundle.key_status ?? {};
  const sttRoutes: SttRoute[] = (["stt", "stt_backup"] as const)
    .filter((s) => !disabled.has(s))
    .map((s) => stages[s])
    .filter((r): r is StageRoute => r !== undefined && STT_VENDORS.includes(r.provider))
    .filter(
      (r) =>
        Boolean(status[STT_KEY_ENV[r.provider] ?? ""]) ||
        Boolean(keys[STT_KEY_ENV[r.provider] ?? ""]),
    )
    .map((r) => ({
      provider: r.provider,
      model: r.model,
      ...(r.base_url ? { base_url: r.base_url } : {}),
    }));
  const router = new ModelRouter(
    stages,
    (route) => makeLLM(route, keys, clock, fetchFn),
    clock,
    disabled,
  );
  return {
    company: { ...bundle.company, backup_disabled: [...disabled] },
    router,
    playbook: new PlaybookIndex(bundle.playbook),
    mode,
    sttRoutes,
    notes,
    bundle,
  };
}

export type CallSummary = {
  call_id: string;
  started_at: number;
  duration_s: number;
  cards: number;
  playbook_cards: number;
  ai_cards: number;
  holding_lines: number;
  escalations: number;
  p50_ms: number | null;
  p95_ms: number | null;
  stt_vendor: string;
  llm_vendor: string;
};

export type LocalCallDeps = {
  runtime: Runtime;
  send: (msg: DemoServerMessage) => void;
  tokens?: TokenSource;
  onEscalation?: (e: Escalation) => void;
  onEnded?: (summary: CallSummary) => void;
  clock?: Clock;
  socketFactory?: SocketFactory;
  /** Scenario pacing; 0.5 plays twice as fast. */
  speed?: number;
};

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null;
}

/** One connection's worth of calls, like the server's /ws handler. */
export class LocalCallBridge {
  private call: LocalCall | null = null;

  private readonly deps: LocalCallDeps;

  constructor(deps: LocalCallDeps) {
    this.deps = deps;
    const r = deps.runtime;
    deps.send({
      type: "hello",
      v: 1,
      company_name: r.company.name,
      mode: r.mode,
      scenarios: r.bundle.scenarios.map((s) => ({ id: s.id, title: s.title })),
      stt_vendor: r.sttRoutes[0]?.provider ?? null,
    });
    for (const note of r.notes) deps.send({ type: "notice", message: note.slice(0, 500) });
  }

  handle(msg: DemoClientMessage): void {
    switch (msg.type) {
      case "start": {
        void this.call?.end();
        this.call = new LocalCall(this.deps);
        this.call.begin();
        const scenario = msg.scenario_id
          ? this.deps.runtime.bundle.scenarios.find((s) => s.id === msg.scenario_id)
          : undefined;
        if (msg.scenario_id && !scenario)
          this.deps.send({ type: "error", message: "unknown scenario" });
        if (scenario) void this.call.play(scenario.lines);
        return;
      }
      case "say":
        if (!this.call) {
          this.call = new LocalCall(this.deps);
          this.call.begin();
        }
        this.call.say(msg.speaker, msg.text);
        return;
      case "audio_start":
        if (!this.call) {
          this.call = new LocalCall(this.deps);
          this.call.begin();
        }
        void this.call.audioStart();
        return;
      case "audio_stop":
        void this.call?.audioStop();
        return;
      case "end": {
        const call = this.call;
        this.call = null;
        void call?.end();
        return;
      }
    }
  }

  audio(pcm: ArrayBuffer): void {
    this.call?.audioFrame(pcm);
  }

  close(): void {
    void this.call?.end();
    this.call = null;
  }
}

export class LocalCall {
  readonly callId = newId();
  private readonly clock: Clock;
  private readonly startedAt = Date.now();
  private readonly t0: number;
  private readonly session: CallSession;
  private readonly timings: CardTimingRecord[] = [];
  private escalations = 0;
  private audio: CustomerAudio | null = null;
  private sttVendorUsed: string | null = null;
  private keepWarm: ReturnType<typeof setInterval> | null = null;
  private playback: AbortController | null = null;
  private ended = false;

  private readonly deps: LocalCallDeps;

  constructor(deps: LocalCallDeps) {
    this.deps = deps;
    this.clock = deps.clock ?? realClock;
    this.t0 = this.clock.now();
    const prompt = deps.runtime.bundle.prompts.suggest;
    if (!prompt) throw new Error("the suggest prompt is missing from the bundle");
    this.session = new CallSession({
      callId: this.callId,
      company: deps.runtime.company,
      router: deps.runtime.router,
      prompt,
      playbook: deps.runtime.playbook,
      clock: this.clock,
      onCard: (card) => deps.send({ type: "card", card }),
      onEscalation: (e) => {
        this.escalations += 1;
        deps.send({ type: "escalation", question: e.question.slice(0, MAX_LINE_CHARS) });
        deps.onEscalation?.(e);
      },
      onTiming: (t) => this.timings.push(t),
    });
  }

  begin(): void {
    this.deps.send({ type: "call_started", call_id: this.callId });
    void this.session.warm();
    this.keepWarm = setInterval(() => void this.session.warm(), KEEP_WARM_EVERY_MS);
  }

  private at(ms?: number): number {
    return Math.max(Math.round((ms ?? this.clock.now()) - this.t0), 0);
  }

  turn(speaker: Speaker, text: string, start: number, end: number, t0: number): void {
    if (this.ended) return;
    const line = text.slice(0, MAX_LINE_CHARS);
    const at = this.at(end);
    this.deps.send({ type: "transcript", speaker, text: line, at_ms: at });
    const turnId = this.session.onTranscript(
      { speaker, text: line, final: true, start_ms: start, end_ms: end },
      t0,
    );
    if (speaker === "customer") this.deps.send({ type: "turn_end", at_ms: at, turn_id: turnId });
  }

  say(speaker: Speaker, text: string, durationMs = 1500): void {
    const now = this.clock.now();
    this.turn(speaker, text, Math.max(now - durationMs, 0), now, now);
  }

  async play(lines: { speaker: Speaker; text: string; gap_ms: number; duration_ms: number }[]) {
    const ctrl = new AbortController();
    this.playback = ctrl;
    const speed = this.deps.speed ?? 1;
    for (const line of lines) {
      await this.clock.sleep((line.gap_ms + line.duration_ms) * speed, ctrl.signal);
      if (ctrl.signal.aborted || this.ended) return;
      this.say(line.speaker, line.text, line.duration_ms);
    }
  }

  async audioStart(): Promise<void> {
    if (this.audio) return;
    const { sttRoutes } = this.deps.runtime;
    if (!sttRoutes.length || !this.deps.tokens) {
      this.deps.send({
        type: "error",
        message: "Speech-to-text is off — ask your admin to connect it.",
      });
      return;
    }
    this.audio = new CustomerAudio({
      routes: sttRoutes,
      tokens: this.deps.tokens,
      clock: this.clock,
      onTurn: (e, t0) => this.turn("customer", e.text, e.start_ms, e.end_ms, t0),
      onPartial: (text) =>
        this.deps.send({ type: "partial", speaker: "customer", text: text.slice(0, 2000) }),
      onNotice: (message) => this.deps.send({ type: "notice", message: message.slice(0, 500) }),
      ...(this.deps.socketFactory ? { socketFactory: this.deps.socketFactory } : {}),
    });
    await this.audio.start();
  }

  audioFrame(pcm: ArrayBuffer): void {
    this.audio?.push(pcm);
  }

  async audioStop(): Promise<void> {
    const audio = this.audio;
    this.audio = null;
    if (audio?.vendor) this.sttVendorUsed = audio.vendor; // the backup, if the main one failed
    await audio?.stop();
  }

  async end(): Promise<void> {
    if (this.ended) return;
    await this.audioStop();
    this.ended = true;
    this.playback?.abort();
    if (this.keepWarm) clearInterval(this.keepWarm);
    await Promise.race([this.session.drain(), this.clock.sleep(9000)]);
    this.session.close();
    const firsts = this.timings.map((t) => t.firstDeltaMs).sort((a, b) => a - b);
    const llm = this.timings.find((t) => t.provider && t.provider !== "fake");
    const summary: CallSummary = {
      call_id: this.callId,
      started_at: this.startedAt,
      duration_s: Math.max(1, Math.round((Date.now() - this.startedAt) / 1000)),
      cards: this.timings.length,
      playbook_cards: this.timings.filter((t) => t.source === "playbook").length,
      ai_cards: this.timings.filter((t) => t.source === "ai" || t.source === "backup").length,
      holding_lines: this.timings.filter((t) => t.source === "holding").length,
      escalations: this.escalations,
      p50_ms: percentile(firsts, 0.5),
      p95_ms: percentile(firsts, 0.95),
      stt_vendor: this.sttVendorUsed ?? this.deps.runtime.sttRoutes[0]?.provider ?? "",
      llm_vendor: llm?.provider ?? (this.deps.runtime.mode === "fake" ? "demo" : ""),
    };
    this.deps.send({ type: "call_ended", call_id: this.callId });
    this.deps.onEnded?.(summary);
  }
}
