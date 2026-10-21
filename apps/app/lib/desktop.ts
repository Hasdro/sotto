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

export type Desktop = {
  callState: () => Promise<CallState>;
  onCallState: (cb: (s: CallState) => void) => () => void;
  onShortcut?: (cb: (s: Shortcut) => void) => () => void;
  sendMini?: (s: MiniState) => void;
  onMini?: (cb: (s: MiniState) => void) => () => void;
  showMini?: (show: boolean) => void;
  /** From the mini window: ask the main window to do something. */
  miniAction?: (a: Shortcut | "open") => void;
};

export function desktop(): Desktop | null {
  return (globalThis as { sottoDesktop?: Desktop }).sottoDesktop ?? null;
}
