/**
 * The client call engine (D-022): the same pipeline as the Python worker, running on the agent's
 * own device. These types mirror sotto_worker.contracts and the management server's bundle.
 */

export type Speaker = "customer" | "agent";

export type TranscriptEvent = {
  speaker: Speaker;
  text: string;
  final: boolean;
  /** Milliseconds on the engine clock. */
  start_ms: number;
  end_ms: number;
};

export type LLMMessage = { role: "user" | "assistant"; content: string };

export type LLMRequest = {
  system: string;
  messages: LLMMessage[];
  max_tokens: number;
  temperature: number;
  settings: Record<string, unknown>;
};

export interface LLMAdapter {
  readonly provider: string;
  readonly model: string;
  /** Open the HTTPS connection before the first turn (no tokens spent). Never throws. */
  warm(): Promise<void>;
  /** Streams visible text. Aborting the signal stops the request. */
  stream(req: LLMRequest, signal: AbortSignal): AsyncIterable<string>;
}

export interface Clock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export const realClock: Clock = {
  now: () => (globalThis.performance?.now ? Math.round(globalThis.performance.now()) : Date.now()),
  sleep: (ms, signal) =>
    new Promise((resolve) => {
      if (signal?.aborted) return resolve();
      const timer = setTimeout(resolve, Math.max(0, ms));
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    }),
};

/** A stage route as the bundle sends it (seed/models/default.yaml + the admin's choices). */
export type StageRoute = {
  provider: string;
  model: string;
  first_token_ms?: number;
  settings?: Record<string, unknown>;
  base_url?: string;
  api_key_env?: string;
};

export type PlaybookEntry = {
  id: string;
  kind: string;
  question: string;
  short_answer: string;
  details: string;
  follow_up: string;
  tags: string[];
  sample?: boolean;
};

export type PromptRecord = {
  key: string;
  version: number;
  stage: string;
  variables: string[];
  body: string;
};

export type CompanyProfile = {
  name: string;
  tone: string;
  call_goal: string;
  holding_line: Record<string, string>;
  escalation_label: Record<string, string>;
  card_language: string;
  ai_answers_allowed: boolean;
  agent_context: boolean;
  backup_disabled: string[];
  /** Company knowledge the AI reads on every card and review (owner, 22 Oct 2026). */
  context?: string;
};

export type ScenarioLine = { speaker: Speaker; text: string; gap_ms: number; duration_ms: number };
export type Scenario = { id: string; title: string; lines: ScenarioLine[] };

export type PlanState = {
  plan: string;
  status: string;
  days_left: number | null;
  seats: number;
  minutes_month: number;
  minutes_used: number;
  can_call: boolean;
  blocked_reason: string | null;
};

export type CardToneBundleConfig = {
  tone: string;
  how_we_talk?: string;
  banned_en?: string[];
  banned_ar?: string[];
};

export type LocalModelBundleConfig = {
  mode: "cloud" | "local_live" | "slow_jobs_only" | "local_live_slow_optin";
  base_url: string | null;
  holding_at_ms: number | null;
  badge: string | null;
  exclude_p95_alarm: boolean;
  allow_cloud_backup: boolean;
  model?: string | null;
};

/** GET /api/v1/bundle (sotto_worker/cloud/bundle.py). */
export type CallBundle = {
  v: 1;
  company: CompanyProfile;
  stages: Record<string, StageRoute>;
  providers: Record<
    string,
    {
      name: string;
      kind: "llm" | "stt";
      key_env: string;
      key_page: string;
      free: string;
      steps: string;
      models: string[];
      base_url?: string | null;
      /** False: only the Python worker runs this vendor; the apps cannot use it yet. */
      client?: boolean;
    }
  >;
  overrides?: string[];
  stage_slots: Record<string, { kind: "llm" | "stt"; label: string }>;
  prompts: Record<string, PromptRecord>;
  playbook: PlaybookEntry[];
  scenarios: Scenario[];
  keys: Record<string, string> | null;
  plan?: PlanState;
  key_status?: Record<string, number>;
  /** R11: the org's active learned instructions (null/absent: feature off or an older server). */
  learned?: { version: number; instructions: string[] } | null;
  /** R11 / A4: merged company + personal style memory rules injected into suggest prompt. */
  style_memory?: string[] | null;
  /** C3 / D-094: resolved effective card tone & banned openers for the session. */
  card_tone?: CardToneBundleConfig | null;
  /** Agent 3: optional rendered game plan text for suggest prompt. */
  game_plan?: string | null;
  /** L6 / D-096: per-user local model policy & routing decision for live calls. */
  local_model?: LocalModelBundleConfig | null;
};

export function newId(): string {
  const c = (
    globalThis as {
      crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array };
    }
  ).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
