/**
 * The model router with the R2 backup race, ported from sotto_worker/router/router.py:
 * the backup starts when the primary errors, its circuit is open, or t0 + first_token_ms passes
 * without a first chunk; the first chunk from either wins and the loser is aborted.
 *
 * ZC-06 platform circuit: a stage whose vendor AGN demoted for everyone carries `demoted_until`
 * (epoch ms) in the bundle; until then the backup goes first, and the primary only runs if the
 * backup fails. Primary failures are reported (setFailureReporter) so the server can demote.
 */
import type { Clock, LLMAdapter, LLMRequest, StageRoute } from "./types.ts";

export const BACKUP_STAGE: Record<string, string> = {
  suggest: "suggest_backup",
  stt: "stt_backup",
};
const CIRCUIT_FAILURES = 3;
const CIRCUIT_WINDOW_MS = 30_000;
const CIRCUIT_OPEN_MS = 60_000;

export type FallbackReason = "timeout" | "error" | "circuit_open" | "demoted";

/** A bundle stage route with the server's platform fields (cloud/bundle.py). */
export type PlatformRoute = StageRoute & { vendor?: string; demoted_until?: number };

export type PrimaryFailure = { stage: string; provider: string; reason: "error" | "timeout" };
let failureReporter: ((f: PrimaryFailure) => void) | null = null;

/** The app passes its batching reporter here (lib/cloud.ts); null switches reporting off. */
export function setFailureReporter(fn: ((f: PrimaryFailure) => void) | null): void {
  failureReporter = fn;
}

function report(stage: string, route: StageRoute, reason: "error" | "timeout"): void {
  const provider = (route as PlatformRoute).vendor;
  if (!provider || !failureReporter) return;
  try {
    failureReporter({ stage, provider, reason });
  } catch {
    /* reporting never breaks a call */
  }
}

/** True while AGN has demoted this route's vendor for everyone (wall clock: the server's ms). */
export function isDemoted(route: StageRoute, now: number = Date.now()): boolean {
  const until = (route as PlatformRoute).demoted_until;
  return typeof until === "number" && until > now;
}
type Source = "primary" | "backup";

export type RouteResult = {
  winner?: Source;
  provider?: string;
  model?: string;
  firstTokenAt?: number;
  fallbackReason?: FallbackReason;
};

export class AllProvidersFailed extends Error {}

class Circuit {
  private failures: number[] = [];
  private openUntil = -1;
  private readonly clock: Clock;
  constructor(clock: Clock) {
    this.clock = clock;
  }
  isOpen(): boolean {
    return this.clock.now() < this.openUntil;
  }
  failure(): void {
    const now = this.clock.now();
    this.failures = [...this.failures.filter((t) => now - t <= CIRCUIT_WINDOW_MS), now];
    if (this.failures.length >= CIRCUIT_FAILURES) {
      this.openUntil = now + CIRCUIT_OPEN_MS;
      this.failures = [];
    }
  }
  success(): void {
    this.failures = [];
  }
}

type Item =
  | { source: Source; kind: "chunk"; text: string }
  | { source: Source; kind: "end" }
  | {
      source: Source;
      kind: "error";
      error: unknown;
    };

/** A tiny async queue with a wake-up promise. */
class Queue<T> {
  private items: T[] = [];
  private waiter: (() => void) | null = null;
  push(item: T): void {
    this.items.push(item);
    this.waiter?.();
    this.waiter = null;
  }
  shift(): T | undefined {
    return this.items.shift();
  }
  get size(): number {
    return this.items.length;
  }
  wait(): Promise<void> {
    if (this.items.length) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }
}

export type AdapterFactory = (route: StageRoute) => LLMAdapter;

export class ModelRouter {
  private readonly adapters = new Map<string, LLMAdapter>();
  private readonly circuits = new Map<string, Circuit>();

  private readonly stages: Record<string, StageRoute>;

  private readonly factory: AdapterFactory;

  private readonly clock: Clock;

  private readonly backupDisabled: ReadonlySet<string>;

  constructor(
    stages: Record<string, StageRoute>,
    factory: AdapterFactory,
    clock: Clock,
    backupDisabled: ReadonlySet<string> = new Set(),
  ) {
    this.stages = stages;

    this.factory = factory;

    this.clock = clock;

    this.backupDisabled = backupDisabled;
  }

  route(stage: string): StageRoute {
    const route = this.stages[stage];
    if (!route) throw new Error(`no route for stage ${stage}`);
    return route;
  }

  adapter(stage: string): LLMAdapter {
    const route = this.route(stage);
    const key = JSON.stringify([route.provider, route.model, route.base_url, route.api_key_env]);
    let adapter = this.adapters.get(key);
    if (!adapter) {
      adapter = this.factory(route);
      this.adapters.set(key, adapter);
    }
    return adapter;
  }

  backupOf(stage: string): string | null {
    const backup = BACKUP_STAGE[stage];
    if (!backup || this.backupDisabled.has(backup) || !this.stages[backup]) return null;
    return backup;
  }

  private circuit(route: StageRoute): Circuit {
    const key = JSON.stringify([route.provider, route.model, route.base_url, route.api_key_env]);
    let circuit = this.circuits.get(key);
    if (!circuit) {
      circuit = new Circuit(this.clock);
      this.circuits.set(key, circuit);
    }
    return circuit;
  }

  async warm(stage: string): Promise<void> {
    const stages = [stage, this.backupOf(stage)].filter((s): s is string => s !== null);
    await Promise.all(
      stages.map(async (s) => {
        try {
          await this.adapter(s).warm();
        } catch {
          /* a stage without a usable adapter simply is not warmed */
        }
      }),
    );
  }

  /** Each model runs with its own route's settings (token limit, temperature, reasoning), not
   * the primary's: a backup from another vendor needs its own (T-019). */
  private requestFor(stage: string, req: LLMRequest): LLMRequest {
    const settings = this.route(stage).settings;
    if (!settings) return req;
    return {
      ...req,
      max_tokens: Number(settings.max_tokens ?? req.max_tokens),
      temperature: Number(settings.temperature ?? req.temperature),
      settings: { ...settings },
    };
  }

  async *stream(
    stage: string,
    req: LLMRequest,
    opts: { t0: number; result?: RouteResult; signal?: AbortSignal },
  ): AsyncGenerator<string> {
    const result = opts.result ?? {};
    const primaryRoute = this.route(stage);
    const backupStage = this.backupOf(stage);
    const primaryCircuit = this.circuit(primaryRoute);
    const queue = new Queue<Item>();
    const controllers = new Map<Source, AbortController>();
    const failed = new Set<Source>();
    const outer = opts.signal;

    const pump = async (
      source: Source,
      adapter: LLMAdapter,
      ctrl: AbortController,
      which: string,
    ) => {
      try {
        for await (const text of adapter.stream(this.requestFor(which, req), ctrl.signal)) {
          if (ctrl.signal.aborted) return;
          queue.push({ source, kind: "chunk", text });
        }
        if (!ctrl.signal.aborted) queue.push({ source, kind: "end" });
      } catch (error) {
        if (!ctrl.signal.aborted) queue.push({ source, kind: "error", error });
      }
    };
    const start = (source: Source, which: string): boolean => {
      let adapter: LLMAdapter;
      try {
        adapter = this.adapter(which);
      } catch (error) {
        queue.push({ source, kind: "error", error });
        controllers.set(source, new AbortController());
        return false;
      }
      const ctrl = new AbortController();
      controllers.set(source, ctrl);
      void pump(source, adapter, ctrl, which);
      return true;
    };
    const startBackup = (reason: FallbackReason) => {
      if (backupStage === null || controllers.has("backup")) return;
      result.fallbackReason = result.fallbackReason ?? reason;
      start("backup", backupStage);
    };
    const abortAll = () => {
      for (const c of controllers.values()) c.abort();
    };
    outer?.addEventListener("abort", abortAll, { once: true });

    if (backupStage !== null && isDemoted(primaryRoute)) startBackup("demoted");
    else if (primaryCircuit.isOpen() && backupStage !== null) startBackup("circuit_open");
    else start("primary", stage);

    let deadline: Promise<"deadline"> | null = null;
    const deadlineCtrl = new AbortController();
    if (primaryRoute.first_token_ms !== undefined && controllers.has("primary")) {
      const wait = opts.t0 + primaryRoute.first_token_ms - this.clock.now();
      deadline = this.clock.sleep(wait, deadlineCtrl.signal).then(() => "deadline" as const);
    }

    let winner: Source | null = null;
    try {
      for (;;) {
        if (outer?.aborted) return;
        if (!queue.size) {
          const waits: Promise<unknown>[] = [queue.wait()];
          if (winner === null && deadline !== null) waits.push(deadline);
          const first = await Promise.race(waits);
          if (first === "deadline" && !queue.size) {
            deadline = null;
            report(stage, primaryRoute, "timeout");
            startBackup("timeout");
            continue;
          }
        }
        const item = queue.shift();
        if (!item) continue;
        if (winner !== null && item.source !== winner) continue;
        if (item.kind === "error" || (item.kind === "end" && winner === null)) {
          if (item.kind === "end" && winner !== null) return;
          failed.add(item.source);
          if (item.source === "primary") {
            primaryCircuit.failure();
            report(stage, primaryRoute, "error");
          }
          if (winner !== null) throw item.kind === "error" ? item.error : new Error("stream ended");
          startBackup("error");
          // Backup first (demoted or circuit open) and it failed: the primary is the last try.
          if (item.source === "backup" && !controllers.has("primary")) start("primary", stage);
          if ([...controllers.keys()].every((s) => failed.has(s))) {
            throw new AllProvidersFailed(`${stage}: every provider failed`);
          }
          continue;
        }
        if (item.kind === "end") return;
        if (winner === null) {
          winner = item.source;
          const route = item.source === "primary" ? primaryRoute : this.route(backupStage ?? stage);
          result.winner = item.source;
          result.provider = route.provider;
          result.model = route.model;
          result.firstTokenAt = this.clock.now();
          if (item.source === "primary") primaryCircuit.success();
          const loser: Source = item.source === "primary" ? "backup" : "primary";
          controllers.get(loser)?.abort();
          deadlineCtrl.abort();
        }
        yield item.text;
      }
    } finally {
      deadlineCtrl.abort();
      abortAll();
      outer?.removeEventListener("abort", abortAll);
    }
  }
}
