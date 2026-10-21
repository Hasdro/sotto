/**
 * Connects the in-call screen to the demo bridge (or, dev-only, the mock stream) and exposes the
 * session state plus the three client actions: start, say, end.
 */
import type { DemoClientMessage } from "@sotto/shared";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Locale } from "../../lib/i18n";
import { prefs } from "../../lib/prefs";
import { saveRecording, setCallBusy } from "../../lib/recordings";
import { useCloud } from "../../lib/useCloud";
import {
  type Bridge,
  type BridgeHandlers,
  bridgeUrl,
  connectBridge,
  type SocketFactory,
} from "./bridge";
import { demoEnabled } from "./devGate";
import { connectLocal } from "./local";
import {
  type AudioSource,
  type MicError,
  type MicHandle,
  MicUnavailable,
  startCapture,
  startMic,
} from "./mic";
import { connectMockBridge } from "./mock-stream";
import { Recorder } from "./recorder";
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
  /** Which source is (or was last) listening. */
  source: AudioSource;
  toggleMic: (source?: AudioSource) => void;
  /** A real call (D-024): starts the call and listens to the given source at once. */
  startListening: (source: AudioSource) => void;
};

export type MicState = "off" | "starting" | "on" | MicError;

export function useCallSession(opts: {
  mock: boolean;
  locale: Locale;
  /** False until the call screen first opens (CallSessionProvider): nothing connects before. */
  enabled?: boolean;
  /** Tests inject a fake socket; the app uses the browser/RN WebSocket. */
  socketFactory?: SocketFactory;
}): CallSession {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const bridge = useRef<Bridge | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The locale only matters to the mock script; the real bridge must not reconnect on a language switch.
  const mockLocale: Locale | null = opts.mock ? opts.locale : null;
  const { socketFactory } = opts;
  const enabled = opts.enabled ?? true;
  const cloud = useCloud();
  // Signed in to the management server (D-022): calls run on this device with this bundle.
  const bundle = cloud.status === "signed_in" ? cloud.bundle : null;

  useEffect(() => {
    // `attempt` is a dependency on purpose: bumping it reconnects.
    void attempt;
    if (!demoEnabled()) return; // production build: no localhost socket, no mock data
    if (!enabled) return;
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
      : bundle
        ? connectLocal(bundle, handlers)
        : connectBridge(bridgeUrl(), handlers, socketFactory);
    bridge.current = b;
    return () => {
      b.close();
      bridge.current = null;
    };
  }, [mockLocale, attempt, socketFactory, bundle, enabled]);

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
  const [source, setSource] = useState<AudioSource>("mic");
  const micHandle = useRef<MicHandle | null>(null);
  const sourceRef = useRef<AudioSource>("mic");
  // Odd while a start waits for the browser's permission prompt. Bumped on every stop, so a
  // permission granted after the user pressed stop (or after the call ended) is let go at once.
  const micAttempt = useRef(0);
  // The recording (owner, 21 Oct): one per call, saved when the call ends.
  const recorder = useRef<Recorder | null>(null);
  const agentMic = useRef<MicHandle | null>(null);
  const stopMic = useCallback(() => {
    if (micAttempt.current % 2 === 1) micAttempt.current += 1; // cancel a pending start
    micHandle.current?.stop();
    micHandle.current = null;
    if (agentMic.current) bridge.current?.agent?.stop();
    agentMic.current?.stop();
    agentMic.current = null;
    setMic((m) => (m === "on" || m === "starting" ? "off" : m));
  }, []);
  const toggleMic = useCallback(
    (which?: AudioSource) => {
      if (micHandle.current || micAttempt.current % 2 === 1) {
        stopMic();
        send({ type: "audio_stop" });
        return;
      }
      if (!send({ type: "audio_start", sample_rate: 16000 })) return;
      micAttempt.current += 1; // odd: starting
      const attempt = micAttempt.current;
      setMic("starting");
      const chosen = which ?? sourceRef.current;
      sourceRef.current = chosen;
      setSource(chosen);
      if (prefs().record && !recorder.current) recorder.current = new Recorder();
      const onFrame = (pcm: ArrayBuffer) => {
        bridge.current?.sendAudio(pcm);
        recorder.current?.add("customer", pcm);
      };
      (chosen === "mic" ? startMic(onFrame) : startCapture(chosen, onFrame))
        .then((handle) => {
          if (micAttempt.current !== attempt) {
            handle.stop(); // stopped while the browser was asking for permission
            return;
          }
          micAttempt.current += 1; // even: settled
          micHandle.current = handle;
          setMic("on");
          // The computer's sound has only the customer. The agent's microphone adds their side: as
          // context for the AI (never a card trigger, R4) and for the recording.
          if (chosen === "computer") {
            startMic((pcm) => {
              bridge.current?.agent?.push(pcm);
              recorder.current?.add("agent", pcm);
            })
              .then((h) => {
                if (micHandle.current !== handle) {
                  h.stop();
                  return;
                }
                agentMic.current = h;
                bridge.current?.agent?.start();
              })
              .catch(() => {}); // no microphone: the customer's side alone
          }
        })
        .catch((err: unknown) => {
          if (micAttempt.current !== attempt) return;
          micAttempt.current += 1;
          send({ type: "audio_stop" });
          setMic(err instanceof MicUnavailable ? err.reason : "unsupported");
        });
    },
    [send, stopMic],
  );
  // The microphone never outlives the call or the connection.
  const callOver = state.phase !== "live" || state.connection !== "open";
  const callId = state.callId;
  // Recordings upload only between calls (and once at app start).
  useEffect(() => setCallBusy(!callOver), [callOver]);
  useEffect(() => {
    if (!callOver) return;
    stopMic();
    const rec = recorder.current;
    recorder.current = null;
    if (rec && !rec.empty && callId) void saveRecording(callId, rec.wav());
  }, [callOver, stopMic, callId]);
  useEffect(() => stopMic, [stopMic]);

  return {
    state,
    start: useCallback((scenarioId) => send({ type: "start", scenario_id: scenarioId }), [send]),
    say: useCallback((speaker, text) => send({ type: "say", speaker, text }), [send]),
    end: useCallback(() => send({ type: "end" }), [send]),
    retry: useCallback(() => setAttempt((n) => n + 1), []),
    dismissNotice: useCallback((id) => dispatch({ type: "dismiss_notice", id }), []),
    mic,
    source,
    toggleMic,
    startListening: useCallback(
      (which: AudioSource) => {
        if (send({ type: "start", scenario_id: null })) toggleMic(which);
      },
      [send, toggleMic],
    ),
  };
}
