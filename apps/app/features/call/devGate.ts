/**
 * The local demo bridge (ws://127.0.0.1) and the `?mock=1` stream are development tools (D-013).
 * They run in development, and in the web build that `pnpm demo` makes, which sets
 * EXPO_PUBLIC_SOTTO_DEMO=1 at build time. Any other production build never connects to them and
 * shows a neutral "live calls arrive in Phase 4" state instead. A function, so tests can switch it.
 */
export function demoEnabled(): boolean {
  // Must stay the literal `process.env.EXPO_PUBLIC_…` form so Expo inlines it at build time.
  return __DEV__ || process.env.EXPO_PUBLIC_SOTTO_DEMO === "1";
}
