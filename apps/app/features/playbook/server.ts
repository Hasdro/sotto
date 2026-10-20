/**
 * The playbook the server's calls actually use (D-020): the company's playbook file, answers
 * added from the inbox, and answers managers write here (P3.5 editor). Null when there is no
 * server, and the screen falls back to the sample playbook.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/server";
import type { PlaybookEntry } from "./mock";

type ServerEntry = {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  source: "file" | "inbox" | "custom";
  updated_at: number | null;
};
type Payload = { entries: ServerEntry[] };

export type EntryInput = { question: string; answer: string; tags: string[] };

function toEntry(e: ServerEntry): PlaybookEntry {
  return {
    id: e.id,
    question: e.question,
    answer: e.answer,
    tags: e.tags,
    updated: e.updated_at === null ? "" : new Date(e.updated_at).toISOString().slice(0, 10),
    source: e.source,
  };
}

export function parseTags(text: string): string[] {
  return text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function useServerPlaybook() {
  const [entries, setEntries] = useState<PlaybookEntry[] | null>(null);
  const apply = useCallback((p: Payload) => setEntries(p.entries.map(toEntry)), []);
  useEffect(() => {
    api<Payload>("/api/playbook")
      .then(apply)
      .catch(() => setEntries(null));
  }, [apply]);
  const enc = encodeURIComponent;
  return {
    entries,
    add: (input: EntryInput) =>
      api<Payload>("/api/playbook", { method: "POST", body: input }).then(apply),
    edit: (id: string, input: EntryInput) =>
      api<Payload>(`/api/playbook/${enc(id)}`, { method: "PUT", body: input }).then(apply),
    remove: (id: string) =>
      api<Payload>(`/api/playbook/${enc(id)}`, { method: "DELETE" }).then(apply),
  };
}
