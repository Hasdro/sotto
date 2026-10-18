/**
 * Connects the in-call screen to the demo bridge (or, dev-only, the mock stream) and exposes the
 * session state plus the three client actions: start, say, end.
 */
import type { DemoClientMessage } from "@sotto/shared";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Locale } from "../../lib/i18n";
import { type Bridge, type BridgeHandlers, bridgeUrl, connectBridge } from "./bridge";
import { connectMockBridge } from "./mock-stream";
import { initialSessionState, type SessionState, type Speaker, sessionReducer } from "./session";

/** Delay between automatic reconnect attempts while the bridge is offline. */
export const RETRY_MS = 3000;

export type CallSession = {
  state: SessionState;
  start: (scenarioId: string | null) => boolean;
  say: (speaker: Speaker, text: string) => boolean;
  end: () => boolean;
  retry: () => void;
  dismissNotice: (id: number) => void;
};

export function useCallSession(opts: { mock: boolean; locale: Locale }): CallSession {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const bridge = useRef<Bridge | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The locale only matters to the mock script; the real bridge must not reconnect on a language switch.
  const mockLocale: Locale | null = opts.mock ? opts.locale : null;

  useEffect(() => {
    // `attempt` is a dependency on purpose: bumping it reconnects.
    void attempt;
    const handlers: BridgeHandlers = {
      onStatus: (status) => dispatch({ type: "connection", status }),
      onMessage: (msg) => dispatch({ type: "server", msg, now: Date.now() }),
    };
    const b = mockLocale
      ? connectMockBridge(handlers, { locale: mockLocale, autostart: true })
      : connectBridge(bridgeUrl(), handlers);
    bridge.current = b;
    return () => {
      b.close();
      bridge.current = null;
    };
  }, [mockLocale, attempt]);

  // While offline, try again on a timer, so starting `pnpm demo` after the app just works.
  useEffect(() => {
    if (state.connection !== "offline") return;
    const id = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
    return () => clearTimeout(id);
  }, [state.connection]);

  const send = useCallback((msg: DemoClientMessage) => bridge.current?.send(msg) ?? false, []);

  return {
    state,
    start: useCallback((scenarioId) => send({ type: "start", scenario_id: scenarioId }), [send]),
    say: useCallback((speaker, text) => send({ type: "say", speaker, text }), [send]),
    end: useCallback(() => send({ type: "end" }), [send]),
    retry: useCallback(() => setAttempt((n) => n + 1), []),
    dismissNotice: useCallback((id) => dispatch({ type: "dismiss_notice", id }), []),
  };
}
