/**
 * Mock admin data (Phase 3 shells of R3 and R6; real data arrives in Phases 5–6).
 *
 * Model column: the hard rule keeps model names out of application code, so the mock shows the
 * tier of each seed default instead of its id. Phase 6 reads the real ids from the database.
 */
export type Role = "owner" | "admin" | "manager" | "agent";

export type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  devices: number;
  lastActive: string;
};

export const TEAM: Member[] = [
  {
    id: "u1",
    name: "Hana Saleh",
    email: "hana@palmgrove.example",
    role: "admin",
    devices: 2,
    lastActive: "Today 11:40",
  },
  {
    id: "u2",
    name: "Yousef Darwish",
    email: "yousef@palmgrove.example",
    role: "manager",
    devices: 2,
    lastActive: "Today 10:05",
  },
  {
    id: "u3",
    name: "Sara Khalil",
    email: "sara@palmgrove.example",
    role: "agent",
    devices: 3,
    lastActive: "Now",
  },
  {
    id: "u4",
    name: "Karim Aziz",
    email: "karim@palmgrove.example",
    role: "agent",
    devices: 1,
    lastActive: "Yesterday",
  },
  {
    id: "u5",
    name: "Mona Farouk",
    email: "mona@palmgrove.example",
    role: "agent",
    devices: 2,
    lastActive: "Oct 15",
  },
];

export type PromptRecord = {
  key: string;
  description: string;
  scope: "platform" | "company" | "team" | "campaign";
  published: number;
  versions: number;
  draft: boolean;
  /** Last replay quality score, 0–100. */
  score: number;
  updated: string;
};

export const PROMPTS: PromptRecord[] = [
  {
    key: "suggest",
    description: "Live suggestion card",
    scope: "company",
    published: 4,
    versions: 5,
    draft: true,
    score: 91,
    updated: "Oct 16",
  },
  {
    key: "trigger",
    description: "Does this turn need a card?",
    scope: "platform",
    published: 2,
    versions: 2,
    draft: false,
    score: 96,
    updated: "Oct 10",
  },
  {
    key: "summary",
    description: "After-call summary",
    scope: "company",
    published: 1,
    versions: 1,
    draft: false,
    score: 88,
    updated: "Oct 08",
  },
  {
    key: "escalation_email",
    description: "Email to the sales manager",
    scope: "team",
    published: 3,
    versions: 3,
    draft: false,
    score: 93,
    updated: "Oct 05",
  },
  {
    key: "judge",
    description: "Scores suggestion quality in replays",
    scope: "platform",
    published: 1,
    versions: 1,
    draft: false,
    score: 100,
    updated: "Sep 30",
  },
];

export type Stage =
  | "stt"
  | "turn"
  | "trigger"
  | "suggest"
  | "suggest_backup"
  | "summary"
  | "embed"
  | "judge";

export type StageModel = {
  stage: Stage;
  provider: string;
  /** Display tier of the seed default (see the note at the top). */
  model: string;
  /** Live-path budget for this stage in ms (ENGINEERING §9), or null when the stage is offline. */
  budgetMs: number | null;
  /** p95 of the last golden-set benchmark, ms. */
  p95Ms: number | null;
};

export const STAGE_MODELS: StageModel[] = [
  { stage: "stt", provider: "Fake", model: "fake-stt", budgetMs: 100, p95Ms: 40 },
  { stage: "turn", provider: "Fake", model: "fake-turn", budgetMs: 250, p95Ms: 210 },
  { stage: "trigger", provider: "Anthropic", model: "Fast tier", budgetMs: 400, p95Ms: 310 },
  { stage: "suggest", provider: "Anthropic", model: "Fast tier", budgetMs: 700, p95Ms: 520 },
  { stage: "suggest_backup", provider: "OpenAI", model: "Mini tier", budgetMs: 700, p95Ms: 610 },
  {
    stage: "embed",
    provider: "Ollama (OpenAI-compatible)",
    model: "Local embeddings",
    budgetMs: 50,
    p95Ms: 74,
  },
  { stage: "summary", provider: "Anthropic", model: "Large tier", budgetMs: null, p95Ms: null },
  { stage: "judge", provider: "Anthropic", model: "Large tier", budgetMs: null, p95Ms: null },
];

export type BenchmarkVerdict = "meets" | "misses" | "offline";

/** R6: a live-path stage may only use a model whose last benchmark p95 is within its budget. */
export function verdict(m: StageModel): BenchmarkVerdict {
  if (m.budgetMs === null || m.p95Ms === null) return "offline";
  return m.p95Ms <= m.budgetMs ? "meets" : "misses";
}
