/**
 * The inbox and the inbox-added playbook entries on this Sotto server (D-020, R2 steps 4–5).
 * Questions escalated in calls on the server appear above the sample questions; answering or
 * adding them goes to the server, which uses added answers in the next call's playbook.
 */
import { api } from "../../lib/server";
import type { InboxItem, InboxStatus } from "../inbox/mock";
import type { PlaybookEntry } from "../playbook/mock";

type ServerEscalation = {
  id: string;
  question: string;
  asked_at: number;
  status: InboxStatus;
  answer: string | null;
  transcript_excerpt?: string | null;
  agent_name?: string | null;
};
type ServerAdded = { id: string; question: string; answer: string; added_at: number };

export function toInboxItem(e: ServerEscalation, labels: { customer: string; agent: string }) {
  const item: InboxItem = {
    id: e.id,
    question: e.question,
    customer: labels.customer,
    agent: e.agent_name || labels.agent,
    askedAt: new Date(e.asked_at).toISOString(),
    status: e.status,
    source: "server",
  };
  if (e.answer) item.answer = e.answer;
  if (e.transcript_excerpt) item.excerpt = e.transcript_excerpt;
  return item;
}

export function toPlaybookEntry(e: ServerAdded): PlaybookEntry {
  return {
    id: `pb-${e.id}`,
    question: e.question,
    answer: e.answer,
    tags: ["from-inbox"],
    updated: new Date(e.added_at).toISOString().slice(0, 10),
  };
}

export async function loadServerInbox(labels: { customer: string; agent: string }) {
  const [inbox, added] = await Promise.all([
    api<{ escalations: ServerEscalation[] }>("/api/escalations"),
    api<{ entries: ServerAdded[] }>("/api/playbook/added"),
  ]);
  return {
    inbox: inbox.escalations.map((e) => toInboxItem(e, labels)),
    playbook: added.entries.map(toPlaybookEntry),
  };
}

export const escalationsApi = {
  answer: (id: string, answer: string) =>
    api(`/api/escalations/${encodeURIComponent(id)}/answer`, { method: "PUT", body: { answer } }),
  addToPlaybook: (id: string, answer: string) =>
    api(`/api/escalations/${encodeURIComponent(id)}/playbook`, {
      method: "POST",
      body: { answer },
    }),
};
