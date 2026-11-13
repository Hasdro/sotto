/**
 * Audio auto-setup (ZC-08, T-075): the agent never picks devices or sources by hand unless a
 * check fails.
 * - Devices: the OS default microphone; a chosen one is used only while it is still plugged in
 *   (`pickMic`), so an unplugged headset silently falls back instead of failing the call.
 * - Source: a detected call app → the computer's sound is the customer and the microphone the
 *   agent (exact, R4); see `startPlan` in ListenStart.
 * - Level check: 5 seconds, each track opened and measured on its own ("say hello", "play any
 *   sound"); a failure gets one plain-language fix and, on the desktop, the exact OS pane.
 * - The result is remembered per device (this mic, desktop app or browser), in this browser
 *   profile only; no audio is stored or sent.
 *
 * Never a mixed track (R4): the check and the call keep the customer and the agent apart; only
 * the customer track may trigger a card.
 */
import type { PrivacyPane } from "../../lib/desktop";
import { type AudioSource, chosenMic, type MicHandle, MicUnavailable, startCapture } from "./mic";
import type { CallTextKey } from "./strings";

export const CHECK_MS = 5000;
/** RMS (full scale = 1) above which a track counts as heard: quiet speech is ~0.02. */
export const LEVEL_MIN = 0.01;

export type TrackResult = "ok" | "silent" | "denied" | "unsupported";
export type CheckResult = {
  /** The computer's sound; "skipped" where it cannot be heard (browser). */
  customer: TrackResult | "skipped";
  /** The microphone. */
  agent: TrackResult;
  at: number;
};
export type Levels = { customer: number; agent: number };

/** Root-mean-square level of one PCM16 frame, 0…1. Pure. */
export function rms(pcm: ArrayBuffer): number {
  const s = new Int16Array(pcm);
  if (s.length === 0) return 0;
  let sum = 0;
  for (const v of s) sum += (v / 0x8000) ** 2;
  return Math.sqrt(sum / s.length);
}

/** The microphone to ask for: the chosen one if still plugged in, else null (OS default). */
export const pickMic = chosenMic;

type Capture = (source: AudioSource, onFrame: (pcm: ArrayBuffer) => void) => Promise<MicHandle>;

/** Opens each track on its own for `CHECK_MS`, reports live levels, and grades each track. */
export async function runLevelCheck({
  computer,
  capture = startCapture,
  onLevel,
  wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = Date.now,
}: {
  computer: boolean;
  capture?: Capture;
  onLevel?: (l: Levels) => void;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<CheckResult> {
  const peak: Levels = { customer: 0, agent: 0 };
  const sink = (track: keyof Levels) => (pcm: ArrayBuffer) => {
    peak[track] = Math.max(peak[track], rms(pcm));
    onLevel?.({ ...peak });
  };
  const open = (source: AudioSource, track: keyof Levels) =>
    capture(source, sink(track)).then(
      (h) => ({ handle: h, error: null }),
      (e: unknown) => ({
        handle: null,
        error: (e instanceof MicUnavailable ? e.reason : "unsupported") as TrackResult,
      }),
    );
  const [customer, agent] = await Promise.all([
    computer ? open("computer", "customer") : Promise.resolve(null),
    open("mic", "agent"),
  ]);
  try {
    if (customer?.handle || agent.handle) await wait(CHECK_MS);
  } finally {
    customer?.handle?.stop();
    agent.handle?.stop();
  }
  const grade = (o: { error: TrackResult | null }, track: keyof Levels): TrackResult =>
    o.error ?? (peak[track] >= LEVEL_MIN ? "ok" : "silent");
  return {
    customer: customer ? grade(customer, "customer") : "skipped",
    agent: grade(agent, "agent"),
    at: now(),
  };
}

/** The one fix to show first (the customer's track matters most), or null when all is well. */
export function checkFix(r: CheckResult): { text: CallTextKey; pane: PrivacyPane | null } | null {
  if (r.customer === "denied" || r.customer === "unsupported")
    return { text: "check.fix.systemDenied", pane: "system-audio" };
  if (r.customer === "silent") return { text: "check.fix.systemSilent", pane: null };
  if (r.agent === "denied") return { text: "check.fix.micDenied", pane: "mic" };
  if (r.agent === "unsupported") return { text: "check.fix.micMissing", pane: null };
  if (r.agent === "silent") return { text: "check.fix.micSilent", pane: null };
  return null;
}

/** One key per microphone and per app (desktop app vs browser). */
export function deviceKey(micId: string | null, computer: boolean): string {
  return `${computer ? "desktop" : "web"}:${micId ?? "default"}`;
}

const KEY = "sotto.audioCheck";
// For this visit when storage is missing or blocked (phones, private windows, tests).
let memory: Record<string, CheckResult> = {};

function readAll(): Record<string, CheckResult> {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, CheckResult>) : memory;
  } catch {
    return memory;
  }
}

export function rememberCheck(key: string, result: CheckResult): void {
  memory = { ...readAll(), [key]: result };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* storage blocked: kept for this visit */
  }
}

export function rememberedCheck(key: string): CheckResult | null {
  return readAll()[key] ?? null;
}
