/**
 * The keys the desktop app listens for (owner, 22 Oct). Windows has no ⌃/⌥, and Ctrl+Alt is AltGr
 * on many non-US keyboards, so the Windows build uses Ctrl+Shift+Alt; macOS keeps ⌃⌥.
 */
const DEFAULT = { listen: "⌃⌥S", copy: "⌃⌥C", mini: "⌃⌥M" };
const WINDOWS = { listen: "Ctrl+Shift+Alt+S", copy: "Ctrl+Shift+Alt+C", mini: "Ctrl+Shift+Alt+M" };

export function isWindows(): boolean {
  const ua = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? "";
  return /Windows/i.test(ua);
}

export function shortcutKeys(): typeof DEFAULT {
  return isWindows() ? WINDOWS : DEFAULT;
}
