/**
 * One call's live path on the client (D-022), ported from sotto_worker/pipeline/session.py:
 * customer final turn → trigger → playbook → (AI via router, backup race) → streamed card,
 * the holding line at t0 + 1400 ms, a late answer replacing it until t0 + 5 s, and exactly one
 * escalation per (call, question).
 */
import type { CardMessage } from "@sotto/shared";
import { CONFIDENT, matchText, NEAR_ENTRIES, type PlaybookHit, type PlaybookIndex } from "./playbook.ts";
import type { ModelRouter, RouteResult } from "./router.ts";
import { classify, questionHash, renderPrompt, type TurnKind, VerdictParser } from "./turns.ts";
import {
  type Clock,
  type CompanyProfile,
  type LLMRequest,
  newId,
  type PromptRecord,
  type TranscriptEvent,
} from "./types.ts";

export const HOLDING_AT_MS = 1400;
export const LATE_ANSWER_UNTIL_MS = 5000;
export const ANSWER_HARD_LIMIT_MS = 8000;
const CONTEXT_WINDOW_MS = 60_000;
/** A customer statement this close before a question is read with it ("My wife worries about the
 * noise. What would you tell her?"): the playbook, the AI and the manager see the whole ask. */
const LEAD_IN_GAP_MS = 4000;
const LEAD_IN_MAX_CHARS = 300;
const TURN_MARKER = "---turn---";
const LANGUAGE_NAME: Record<string, string> = { en: "English", ar: "Arabic" };

type CardType = CardMessage["type"];
type CardSource = CardMessage["source"];

export type Escalation = {
  callId: string;
  question: string;
  language: string;
  transcriptExcerpt: string;
  at: number;
};

export type CardTimingRecord = {
  cardId: string;
  source: CardSource;
  turnKind: TurnKind;
  firstDeltaMs: number;
  totalMs: number;
  provider?: string | undefined;
  model?: string | undefined;
  fallbackReason?: string | undefined;
};

type Turn = {
  turnId: string;
  event: TranscriptEvent;
  kind: TurnKind;
  t0: number;
  sttFinalMs: number;
  language: string;
  lookupMs: number;
  /** The nearest playbook entries (score > 0), best first; the model sees them (T-032). */
  nearest: PlaybookHit[];
};

export type SessionDeps = {
  callId: string;
  company: CompanyProfile;
  router: ModelRouter;
  prompt: PromptRecord;
  playbook: PlaybookIndex;
  clock: Clock;
  onCard: (card: CardMessage) => void;
  onEscalation: (e: Escalation) => void;
  onTiming: (t: CardTimingRecord) => void;
};

export function languageFor(company: CompanyProfile, text: string): string {
  if (company.card_language === "en" || company.card_language === "ar")
    return company.card_language;
  return /[؀-ۿ]/.test(text) ? "ar" : "en";
}

class CardWriter {
  readonly cardId = newId();
  private seq = 0;
  private firstDelta: number | null = null;
  closed = false;

  private readonly s: CallSession;

  private readonly type: CardType;

  private readonly source: CardSource;

  private readonly label: string | null;

  private readonly turn: Turn;

  private readonly result: RouteResult | null;

  constructor(
    s: CallSession,
    type: CardType,
    source: CardSource,
    label: string | null,
    turn: Turn,
    result: RouteResult | null = null,
  ) {
    this.s = s;

    this.type = type;

    this.source = source;

    this.label = label;

    this.turn = turn;

    this.result = result;
  }

  delta(text: string, done = false): void {
    const now = this.s.clock.now();
    let timing: CardMessage["timing"] = null;
    if (this.seq === 0) {
      this.firstDelta = Math.max(now - this.turn.t0, 0);
      const firstToken =
        this.result?.firstTokenAt !== undefined
          ? Math.max(this.result.firstTokenAt - this.turn.t0, 0)
          : Math.max(now - this.turn.t0, 0);
      timing = {
        turn_end_ms: 0,
        stt_final_ms: Math.round(this.turn.sttFinalMs),
        lookup_ms: Math.round(this.turn.lookupMs),
        first_token_ms: Math.round(firstToken),
      };
    }
    const card: CardMessage = {
      v: 1,
      card_id: this.cardId,
      call_id: this.s.callId,
      turn_id: this.turn.turnId,
      seq: this.seq,
      type: this.type,
      source: this.source,
      label: this.seq === 0 ? this.label : null,
      delta: text,
      done,
      timing,
    };
    this.seq += 1;
    this.closed = done;
    this.s.deps.onCard(card);
    if (done) {
      this.s.deps.onTiming({
        cardId: this.cardId,
        source: this.source,
        turnKind: this.turn.kind,
        firstDeltaMs: Math.round(this.firstDelta ?? 0),
        totalMs: Math.round(Math.max(now - this.turn.t0, 0)),
        provider: this.result?.provider,
        model: this.result?.model,
        fallbackReason: this.result?.fallbackReason,
      });
    }
  }
}

export class CallSession {
  readonly callId: string;
  readonly clock: Clock;
  private readonly events: TranscriptEvent[] = [];
  private readonly escalated = new Set<string>();
  private readonly running = new Set<Promise<void>>();
  private readonly aborts = new Set<AbortController>();
  holdingAt = HOLDING_AT_MS;

  readonly deps: SessionDeps;

  constructor(deps: SessionDeps) {
    this.deps = deps;
    this.callId = deps.callId;
    this.clock = deps.clock;
  }

  warm(): Promise<void> {
    return this.deps.router.warm("suggest");
  }

  /** Feed a transcript event; `t0` is when the speaker stopped (the R1 clock start). Returns the
   * turn id when the event starts a turn that will produce a card. */
  onTranscript(event: TranscriptEvent, t0: number): string | null {
    if (!event.final) return null;
    if (event.speaker === "agent" && !this.deps.company.agent_context) return null;
    const previous = this.events.at(-1);
    this.events.push(event);
    const kind = classify(event); // R4: agent speech never classifies
    if (kind === null) return null;
    const leadIn =
      previous !== undefined &&
      previous.speaker === "customer" &&
      event.speaker === "customer" &&
      classify(previous) === null &&
      previous.text.length <= LEAD_IN_MAX_CHARS &&
      event.start_ms - previous.end_ms <= LEAD_IN_GAP_MS
        ? previous.text.trim()
        : "";
    const turn: Turn = {
      turnId: newId(),
      event: leadIn ? { ...event, text: `${leadIn} ${event.text.trim()}` } : event,
      kind,
      t0,
      sttFinalMs: Math.max(this.clock.now() - t0, 0),
      language: languageFor(this.deps.company, event.text),
      lookupMs: 0,
      nearest: [],
    };
    const task = this.runTurn(turn).catch((err) => console.warn("[engine] turn failed", err));
    this.running.add(task);
    void task.finally(() => this.running.delete(task));
    return turn.turnId;
  }

  async drain(): Promise<void> {
    while (this.running.size) await Promise.allSettled([...this.running]);
  }

  close(): void {
    for (const c of this.aborts) c.abort();
  }

  private async runTurn(turn: Turn): Promise<void> {
    await Promise.resolve(); // let the caller send turn_end first (same order as the worker)
    const cardType: CardType = turn.kind === "question" ? "answer" : "objection";
    const started = this.clock.now();
    // One scan per turn: a confident top entry is the card; otherwise the nearest few go to the
    // model, which may answer from one of them (T-032).
    const top = this.deps.playbook.ranked(turn.event.text, NEAR_ENTRIES);
    turn.lookupMs = this.clock.now() - started;
    turn.nearest = top.filter((h) => h.score > 0);
    const hit = top[0] !== undefined && top[0].score >= CONFIDENT ? top[0] : null;
    if (hit !== null) {
      new CardWriter(this, cardType, "playbook", null, turn).delta(hit.entry.short_answer, true);
      return;
    }
    if (!this.deps.company.ai_answers_allowed) {
      this.holding(turn);
      this.escalate(turn);
      return;
    }
    await this.aiTurn(turn, cardType);
  }

  private aiWriter(turn: Turn, cardType: CardType, result: RouteResult): CardWriter {
    const source: CardSource = result.winner === "backup" ? "backup" : "ai";
    const labels = this.deps.company.escalation_label;
    const label = labels[turn.language] ?? labels.en ?? null;
    return new CardWriter(this, cardType, source, label, turn, result);
  }

  private async aiTurn(turn: Turn, cardType: CardType): Promise<void> {
    const result: RouteResult = {};
    const ctrl = new AbortController();
    this.aborts.add(ctrl);
    let writer: CardWriter | null = null;
    let request: LLMRequest;
    try {
      request = this.request(turn);
    } catch (err) {
      console.warn("[engine] prompt failed", err);
      this.holding(turn);
      this.escalate(turn);
      return;
    }
    const suggest = async (): Promise<boolean> => {
      const parser = new VerdictParser();
      for await (const chunk of this.deps.router.stream("suggest", request, {
        t0: turn.t0,
        result,
        signal: ctrl.signal,
      })) {
        const text = parser.feed(chunk);
        if (parser.verdict === "no_answer") return false;
        if (text) {
          writer = writer ?? this.aiWriter(turn, cardType, result);
          writer.delta(text);
        }
      }
      const tail = parser.finish();
      if (tail) {
        writer = writer ?? this.aiWriter(turn, cardType, result);
        writer.delta(tail);
      }
      if (writer === null) return false;
      (writer as CardWriter).delta("", true);
      return true;
    };
    let finished = false;
    let answered = false;
    const task = suggest().then(
      (ok) => {
        finished = true;
        answered = ok;
      },
      () => {
        finished = true;
        answered = false;
      },
    );
    const until = async (at: number) => {
      const stop = new AbortController();
      await Promise.race([task, this.clock.sleep(at - this.clock.now(), stop.signal)]);
      stop.abort();
      return finished;
    };
    let holdingSent = false;
    try {
      let done = await until(turn.t0 + this.holdingAt);
      if (!done && writer === null) {
        this.holding(turn);
        holdingSent = true;
        done = await until(turn.t0 + LATE_ANSWER_UNTIL_MS);
      }
      if (!done && writer !== null) await until(turn.t0 + ANSWER_HARD_LIMIT_MS);
    } finally {
      ctrl.abort();
      this.aborts.delete(ctrl);
    }
    const w = writer as CardWriter | null;
    if (w !== null && !w.closed) w.delta("", true); // close what the agent reads; never retract
    if (!answered) {
      if (w === null && !holdingSent) this.holding(turn);
      this.escalate(turn);
    }
  }

  private holding(turn: Turn): void {
    const lines = this.deps.company.holding_line;
    const text = lines[turn.language] ?? lines.en ?? "Let me confirm that and get back to you.";
    new CardWriter(this, "holding", "holding", null, turn).delta(text, true);
  }

  private escalate(turn: Turn): void {
    const key = questionHash(turn.event.text);
    if (this.escalated.has(key)) return;
    this.escalated.add(key);
    this.deps.onEscalation({
      callId: this.callId,
      question: turn.event.text,
      language: turn.language,
      transcriptExcerpt: this.context(turn.event.end_ms),
      at: turn.t0,
    });
  }

  private context(until: number): string {
    return this.events
      .filter((e) => until - CONTEXT_WINDOW_MS <= e.end_ms && e.end_ms <= until)
      .map((e) => `${e.speaker === "customer" ? "Customer" : "Agent"}: ${e.text}`)
      .join("\n");
  }

  private request(turn: Turn): LLMRequest {
    const company = this.deps.company;
    const variables: Record<string, string> = {
      "company.name": company.name,
      "company.tone": company.tone,
      "company.call_goal": company.call_goal,
      "playbook.match": matchText(turn.nearest),
      "transcript.last_60s": this.context(turn.event.end_ms),
      "turn.kind": turn.kind,
      "turn.text": turn.event.text,
      "card.language": LANGUAGE_NAME[turn.language] ?? turn.language,
    };
    const text = renderPrompt(this.deps.prompt.body, variables);
    const at = text.indexOf(TURN_MARKER);
    let system = at >= 0 ? text.slice(0, at) : "";
    let user = at >= 0 ? text.slice(at + TURN_MARKER.length) : text;
    if (!user.trim()) {
      user = system;
      system = "";
    }
    const settings = this.deps.router.route("suggest").settings ?? {};
    return {
      system: system.trim(),
      messages: [{ role: "user", content: user.trim() }],
      max_tokens: Number(settings.max_tokens ?? 120),
      temperature: Number(settings.temperature ?? 0.2),
      settings,
    };
  }
}
