/**
 * Event-driven worker / audio pipeline supervisor (S2):
 * When a pipeline or audio stream drops mid-call, emits "Reconnecting…" and restarts the
 * pipeline within ≤ 3 s while resuming the exact same callId.
 */
import { logEvent } from "./obs";

export type PipelineStatus = "idle" | "connected" | "reconnecting" | "failed";

export type PipelineSupervisorState = {
  status: PipelineStatus;
  callId: string | null;
  bannerText: string | null;
  attempts: number;
  lastRecoveredMs: number | null;
};

export type RestartFn = (callId: string) => Promise<boolean>;

export class PipelineSupervisor {
  private state: PipelineSupervisorState = {
    status: "idle",
    callId: null,
    bannerText: null,
    attempts: 0,
    lastRecoveredMs: null,
  };
  private readonly listeners = new Set<(s: PipelineSupervisorState) => void>();
  private readonly backoffMs: readonly number[];
  private readonly maxRecoveryMs: number;
  private recovering: Promise<boolean> | null = null;

  constructor(opts?: { backoffMs?: readonly number[]; maxRecoveryMs?: number }) {
    // 200 ms + 500 ms + 1000 ms = 1700 ms total wait, well inside the 3000 ms S2 budget.
    this.backoffMs = opts?.backoffMs ?? [200, 500, 1000];
    this.maxRecoveryMs = opts?.maxRecoveryMs ?? 3000;
  }

  snapshot(): PipelineSupervisorState {
    return { ...this.state };
  }

  subscribe(fn: (s: PipelineSupervisorState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(next: PipelineSupervisorState): void {
    this.state = next;
    for (const fn of this.listeners) fn(this.snapshot());
  }

  markConnected(callId: string): void {
    this.emit({
      status: "connected",
      callId,
      bannerText: null,
      attempts: 0,
      lastRecoveredMs: this.state.lastRecoveredMs,
    });
  }

  markEnded(): void {
    this.emit({
      status: "idle",
      callId: null,
      bannerText: null,
      attempts: 0,
      lastRecoveredMs: null,
    });
  }

  /**
   * Triggered on a pipeline/audio drop event. Immediately surfaces "Reconnecting…" and
   * attempts to restart and resume the exact same `callId` within `maxRecoveryMs` (≤ 3 s).
   */
  handleDrop(restart: RestartFn, reason = "pipeline_drop"): Promise<boolean> {
    if (!this.state.callId) return Promise.resolve(false);
    if (this.recovering) return this.recovering;
    const callId = this.state.callId;
    const startedAt = Date.now();
    this.emit({
      status: "reconnecting",
      callId,
      bannerText: "Reconnecting…",
      attempts: 0,
      lastRecoveredMs: null,
    });
    logEvent("pipeline.supervisor", "drop_detected", {
      level: "warn",
      callId,
      reason,
    });

    const run = async (): Promise<boolean> => {
      for (let i = 0; i < this.backoffMs.length; i += 1) {
        const wait = this.backoffMs[i] ?? 0;
        const elapsed = Date.now() - startedAt;
        if (elapsed + wait > this.maxRecoveryMs) break;
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        this.emit({
          status: "reconnecting",
          callId,
          bannerText: "Reconnecting…",
          attempts: i + 1,
          lastRecoveredMs: null,
        });
        try {
          const ok = await restart(callId);
          if (ok) {
            const recoveredMs = Date.now() - startedAt;
            this.emit({
              status: "connected",
              callId,
              bannerText: null,
              attempts: i + 1,
              lastRecoveredMs: recoveredMs,
            });
            logEvent("pipeline.supervisor", "resumed", {
              callId,
              durationMs: recoveredMs,
              attempts: i + 1,
            });
            return true;
          }
        } catch {
          // Retry within budget
        }
      }
      this.emit({
        status: "failed",
        callId,
        bannerText: "Connection lost — tap Retry to reconnect.",
        attempts: this.backoffMs.length,
        lastRecoveredMs: null,
      });
      logEvent("pipeline.supervisor", "resume_failed", {
        level: "error",
        callId,
        durationMs: Date.now() - startedAt,
      });
      return false;
    };

    this.recovering = run().finally(() => {
      this.recovering = null;
    });
    return this.recovering;
  }
}
