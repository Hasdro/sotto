/**
 * In-call session state (pure): connection, call phase, transcript, cards and escalations,
 * driven by validated demo-bridge messages (packages/shared demo.ts). Cards go through the
 * card stream reducer (features/cards/reducer.ts).
 */
import type { DemoServerMessage } from "@sotto/shared";
import { type CardsState, cardsReducer, initialCardsState } from "../cards/reducer";

export type Connection = "connecting" | "open" | "offline";
export type Phase = "idle" | "live" | "ended";
export type Speaker = "customer" | "agent";

export type TranscriptEntry = {
  id: number;
  speaker: Speaker | "system";
  /** For system lines: what happened. The screen picks the localised label from it. */
  system?: "escalation" | "connection_lost";
  /** Speech or the escalated question; empty for connection_lost (the screen supplies the text). */
  text: string;
  /** ms since call start (server clock for speech, client clock for system lines). */
  atMs: number;
};

export type Notice = { id: number; kind: "escalation" | "error"; text: string; at: number };

export type Hello = Extract<DemoServerMessage, { type: "hello" }>;

export type SessionState = {
  connection: Connection;
  phase: Phase;
  hello: Hello | null;
  callId: string | null;
  /** Client clock when the call started. */
  startedAt: number | null;
  endedAt: number | null;
  transcript: readonly TranscriptEntry[];
  cards: CardsState;
  escalations: readonly { question: string; at: number }[];
  /** The latest toast; the screen hides it after motion.toastMs. */
  notice: Notice | null;
  /** Monotonic id source for transcript entries and notices. */
  nextId: number;
};

export type SessionAction =
  | { type: "connection"; status: Connection }
  | { type: "server"; msg: DemoServerMessage; now: number }
  | { type: "dismiss_notice"; id: number };

/** Transcript lines kept in memory per call. */
export const MAX_TRANSCRIPT = 200;

export const initialSessionState: SessionState = {
  connection: "connecting",
  phase: "idle",
  hello: null,
  callId: null,
  startedAt: null,
  endedAt: null,
  transcript: [],
  cards: initialCardsState,
  escalations: [],
  notice: null,
  nextId: 1,
};

function appendLine(state: SessionState, entry: Omit<TranscriptEntry, "id">): SessionState {
  const transcript = [...state.transcript, { ...entry, id: state.nextId }].slice(-MAX_TRANSCRIPT);
  return { ...state, transcript, nextId: state.nextId + 1 };
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "connection":
      if (action.status === state.connection) return state;
      // A reconnect attempt keeps the offline screen up until the server says hello, so the
      // automatic retry does not flicker between "connecting" and "offline".
      if (state.connection === "offline" && action.status === "connecting") return state;
      return { ...state, connection: action.status };
    case "dismiss_notice":
      return state.notice?.id === action.id ? { ...state, notice: null } : state;
    case "server":
      return applyServer(state, action.msg, action.now);
  }
}

function applyServer(state: SessionState, msg: DemoServerMessage, now: number): SessionState {
  switch (msg.type) {
    case "hello": {
      const greeted = { ...state, connection: "open" as const, hello: msg };
      if (state.phase !== "live") return greeted;
      // A new greeting mid-call means the socket dropped and reconnected: the server has no
      // memory of this call, so it is over. Say so in the transcript.
      const atMs = state.startedAt === null ? 0 : Math.max(0, now - state.startedAt);
      return {
        ...appendLine(greeted, { speaker: "system", system: "connection_lost", text: "", atMs }),
        phase: "ended",
        endedAt: now,
      };
    }
    case "call_started":
      return {
        ...state,
        phase: "live",
        callId: msg.call_id,
        startedAt: now,
        endedAt: null,
        transcript: [],
        cards: cardsReducer(state.cards, { type: "reset" }),
        escalations: [],
        notice: null,
      };
    case "transcript":
      if (state.phase !== "live") return state;
      return appendLine(state, { speaker: msg.speaker, text: msg.text, atMs: msg.at_ms });
    case "turn_end":
      if (state.phase !== "live") return state;
      return {
        ...state,
        cards: cardsReducer(state.cards, { type: "turn_end", now, turnId: msg.turn_id ?? null }),
      };
    case "card":
      // Only cards of the current call; a stray card from an earlier call is dropped.
      if (state.phase !== "live" || (state.callId !== null && msg.card.call_id !== state.callId)) {
        return state;
      }
      return { ...state, cards: cardsReducer(state.cards, { type: "card", card: msg.card, now }) };
    case "escalation": {
      if (state.phase !== "live") return state;
      const atMs = state.startedAt === null ? 0 : Math.max(0, now - state.startedAt);
      const next = appendLine(state, {
        speaker: "system",
        system: "escalation",
        text: msg.question,
        atMs,
      });
      return {
        ...next,
        escalations: [...state.escalations, { question: msg.question, at: now }],
        notice: { id: next.nextId, kind: "escalation", text: msg.question, at: now },
        nextId: next.nextId + 1,
      };
    }
    case "call_ended":
      if (state.callId !== null && msg.call_id !== state.callId) return state;
      return { ...state, phase: "ended", endedAt: now };
    case "error":
      return {
        ...state,
        notice: { id: state.nextId, kind: "error", text: msg.message, at: now },
        nextId: state.nextId + 1,
      };
  }
}
