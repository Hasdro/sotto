/**
 * Calls made on this Sotto server (D-020) or this device (D-022): `/api/calls`. In the local demo
 * they are shown above the sample calls; a real account shows only its own (T-024).
 */
import { CARD_TYPES as CARD_TYPE_LIST, type CardSource, type CardType } from "@sotto/shared";
import { useEffect, useState } from "react";
import { isCallSource } from "../../lib/callSource";
import { api } from "../../lib/server";
import type { PastCall, PastCard, PastLine } from "./mock";

export type ServerCallSummary = {
  id: string;
  started_at: number;
  ended_at: number | null;
  title: string;
  mode: "fake" | "live";
  cards: number;
  p50_ms: number | null;
  p95_ms: number | null;
  source?: string;
  review?: { success?: number } | null;
  notes?: string;
};

type Entry =
  | { kind: "line"; speaker: "customer" | "agent"; text: string; at_ms?: number }
  | {
      kind: "card";
      type: CardType;
      source: CardSource;
      text: string;
      at_ms?: number;
      id?: string;
    }
  | { kind: "escalation"; text: string; at_ms?: number };

export type ServerCallDetail = ServerCallSummary & { transcript: Entry[] };

const CARD_TYPES = new Set<string>(CARD_TYPE_LIST);
const SOURCES = new Set<string>(["playbook", "ai", "backup", "holding"]);

export function toPastCall(call: ServerCallSummary | ServerCallDetail): PastCall {
  const end = call.ended_at ?? call.started_at;
  const transcript: PastLine[] = [];
  const cards: PastCard[] = [];
  for (const e of "transcript" in call ? call.transcript : []) {
    if (e.kind === "line")
      transcript.push({ speaker: e.speaker, text: e.text, atMs: e.at_ms ?? 0 });
    if (e.kind === "card" && CARD_TYPES.has(e.type) && SOURCES.has(e.source)) {
      cards.push({
        type: e.type,
        source: e.source,
        text: e.text,
        atMs: e.at_ms ?? 0,
        ...(typeof e.id === "string" && e.id ? { id: e.id } : {}),
      });
    }
  }
  return {
    id: call.id,
    customer: call.title,
    company: "",
    startedAt: new Date(call.started_at).toISOString(),
    minutes: Math.max(1, Math.round((end - call.started_at) / 60000)),
    outcome: call.mode === "live" ? "live" : "practice",
    transcript,
    cards,
    ...(isCallSource(call.source) ? { source: call.source } : {}),
    cardCount: call.cards,
    ...(call.notes ? { notes: call.notes } : {}),
    ...(typeof call.review?.success === "number" ? { success: call.review.success } : {}),
  };
}

/** This server's calls, newest first; null while loading or when no server answers. */
export function useServerCalls(): PastCall[] | null {
  const [calls, setCalls] = useState<PastCall[] | null>(null);
  useEffect(() => {
    let live = true;
    api<{ calls: ServerCallSummary[] }>("/api/calls")
      .then((r) => live && setCalls(r.calls.map(toPastCall)))
      .catch(() => live && setCalls(null));
    return () => {
      live = false;
    };
  }, []);
  return calls;
}

/** One call from this server; "missing" when the server does not have it. */
export function useServerCall(id: string, skip: boolean): PastCall | "loading" | "missing" {
  const [call, setCall] = useState<PastCall | "loading" | "missing">(skip ? "missing" : "loading");
  useEffect(() => {
    if (skip) return;
    let live = true;
    api<ServerCallDetail>(`/api/calls/${encodeURIComponent(id)}`)
      .then((r) => live && setCall(toPastCall(r)))
      .catch(() => live && setCall("missing"));
    return () => {
      live = false;
    };
  }, [id, skip]);
  return call;
}
