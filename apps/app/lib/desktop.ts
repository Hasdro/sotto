/**
 * The desktop app's bridge (apps/desktop/preload.cjs): which call app is on the microphone, the
 * keyboard shortcuts, and the floating mini window. Null in the browser and on phones.
 */
export type CallState = { app: string | null };
export type Shortcut = "listen" | "copy" | "mini";
export type MiniCard = {
  type: string;
  source: string;
  label: string | null;
  text: string;
  done: boolean;
};
export type MiniState = {
  live: boolean;
  card: MiniCard | null;
  partial: string | null;
  source: string | null;
};

/** An `agn-sales-shield://` link the desktop app understood (draft D-054 (backlog)); never carries a token. */
export type DeepLink = { kind: "zoho"; status: "connected" | "cancelled" };
export type PrivacyPane = "mic" | "system-audio";
export type PrivacyResult = { ok: true } | { ok: false; reason: string };

export type Desktop = {
  callState: () => Promise<CallState>;
  onCallState: (cb: (s: CallState) => void) => () => void;
  onShortcut?: (cb: (s: Shortcut) => void) => () => void;
  sendMini?: (s: MiniState) => void;
  onMini?: (cb: (s: MiniState) => void) => () => void;
  showMini?: (show: boolean) => void;
  /** From the mini window: ask the main window to do something. */
  miniAction?: (a: Shortcut | "open") => void;
  /** W1-DESK: the app's own deep links (zoho/connected, zoho/cancelled). */
  onDeepLink?: (cb: (link: DeepLink) => void) => () => void;
  /** W1-DESK / UX-21: opens the OS privacy pane; `not_needed` where the OS asks nothing. */
  openPrivacySettings?: (pane: PrivacyPane) => Promise<PrivacyResult>;
  /** INT-08: a system notification for a due follow-up step; resolves false if not shown. */
  notify?: (notice: FollowupNotice) => Promise<boolean>;
  /** INT-08: the person clicked a follow-up notification; gives the step to open. */
  onNotifyOpen?: (cb: (stepId: string) => void) => () => void;
};

/** What the page may put in a notification: a step id (16 hex) and two short lines. */
export type FollowupNotice = { stepId: string; title: string; body: string };

export function desktop(): Desktop | null {
  return (globalThis as { sottoDesktop?: Desktop }).sottoDesktop ?? null;
}
