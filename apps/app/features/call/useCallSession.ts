/**
 * Connects the in-call screen to the demo bridge (or, dev-only, the mock stream) and exposes the
 * session state plus the three client actions: start, say, end.
 */
import type { DemoClientMessage } from "@sotto/shared";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Locale } from "../../lib/i18n";
import {
  type Bridge,
  type BridgeHandlers,
  bridgeUrl,
  connectBridge,
  type SocketFactory,
} from "./bridge";
import { demoEnabled } from "./devGate";
import { type MicError, type MicHandle, MicUnavailable, startMic } from "./mic";
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
  /** Spoken customer track (D-020): "off", "starting", "on", or why it could not start. */
  mic: MicState;
  toggleMic: () => void;
};

export type MicState = "off" | "starting" | "on" | MicError;

export function useCallSession(opts: {
  mock: boolean;
  locale: Locale;
  /** Tests inject a fake socket; the app uses the browser/RN WebSocket. */
  socketFactory?: SocketFactory;
}): CallSession {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const bridge = useRef<Bridge | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The locale only matters to the mock script; the real bridge must not reconnect on a language switch.
  const mockLocale: Locale | null = opts.mock ? opts.locale : null;
  const { socketFactory } = opts;

  useEffect(() => {
    // `attempt` is a dependency on purpose: bumping it reconnects.
    void attempt;
    if (!demoEnabled()) return; // production build: no localhost socket, no mock data
    const handlers: BridgeHandlers = {
      onStatus: (status) => dispatch({ type: "connection", status }),
      onMessage: (msg) => {
        // The raw server error goes to the console only; the screen shows a localised line.
        if (msg.type === "error") console.warn("[demo-bridge] server error:", msg.message);
        dispatch({ type: "server", msg, now: Date.now() });
      },
    };
    const b = mockLocale
      ? connectMockBridge(handlers, { locale: mockLocale, autostart: true })
      : connectBridge(bridgeUrl(), handlers, socketFactory);
    bridge.current = b;
    return () => {
      b.close();
      bridge.current = null;
    };
  }, [mockLocale, attempt, socketFactory]);

  // While offline, try again every RETRY_MS for as long as it lasts, so starting `pnpm demo`
  // after the app just works. A failed attempt leaves the state "offline", so this must be an
  // interval: a one-shot timer keyed on the state would fire only once.
  useEffect(() => {
    if (state.connection !== "offline") return;
    const id = setInterval(() => setAttempt((n) => n + 1), RETRY_MS);
    return () => clearInterval(id);
  }, [state.connection]);

  const send = useCallback((msg: DemoClientMessage) => bridge.current?.send(msg) ?? false, []);

  const [mic, setMic] = useState<MicState>("off");
  const micHandle = useRef<MicHandle | null>(null);
  const stopMic = useCallback(() => {
    micHandle.current?.stop();
    micHandle.current = null;
    setMic((m) => (m === "on" || m === "starting" ? "off" : m));
  }, []);
  const toggleMic = useCallback(() => {
    if (micHandle.current) {
      stopMic();
      send({ type: "audio_stop" });
      return;
    }
    if (!send({ type: "audio_start", sample_rate: 16000 })) return;
    setMic("starting");
    startMic((pcm) => bridge.current?.sendAudio(pcm))
      .then((handle) => {
        micHandle.current = handle;
        setMic("on");
      })
      .catch((err: unknown) => {
        send({ type: "audio_stop" });
        setMic(err instanceof MicUnavailable ? err.reason : "unsupported");
      });
  }, [send, stopMic]);
  // The microphone never outlives the call or the connection.
  const callOver = state.phase !== "live" || state.connection !== "open";
  useEffect(() => {
    if (callOver) stopMic();
  }, [callOver, stopMic]);
  useEffect(() => stopMic, [stopMic]);

  return {
    state,
    start: useCallback((scenarioId) => send({ type: "start", scenario_id: scenarioId }), [send]),
    say: useCallback((speaker, text) => send({ type: "say", speaker, text }), [send]),
    end: useCallback(() => send({ type: "end" }), [send]),
    retry: useCallback(() => setAttempt((n) => n + 1), []),
    dismissNotice: useCallback((id) => dispatch({ type: "dismiss_notice", id }), []),
    mic,
    toggleMic,
  };
}
