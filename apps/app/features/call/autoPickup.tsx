/**
 * Auto pick-up (owner, 21 Oct 2026), desktop app on macOS: when a call app (Zoom, Teams, Meet,
 * 3CX, Yeastar…) starts using the microphone, Sotto opens the call screen and listens to the
 * computer's sound; when that app lets the microphone go, the call Sotto started ends. Calls the
 * agent started by hand are never ended for them. Off in Settings, or outside the desktop app.
 */
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { setCallSource, sourceOf } from "../../lib/callSource";
import { usePrefs } from "../../lib/prefs";
import type { CallSession } from "./useCallSession";

type CallState = { app: string | null };
type Desktop = {
  callState: () => Promise<CallState>;
  onCallState: (cb: (s: CallState) => void) => () => void;
};

function desktop(): Desktop | null {
  return (globalThis as { sottoDesktop?: Desktop }).sottoDesktop ?? null;
}

export type Pickup = { waiting: boolean; auto: boolean };
export type PickupAction = "open" | "listen" | "end" | null;

/** What to do now, given whether a call app is on and where the session is. Pure. */
export function pickupStep(
  p: Pickup,
  s: { onCall: boolean; enabled: boolean; ready: boolean; live: boolean },
): [Pickup, PickupAction] {
  if (!s.onCall) {
    if (p.auto && s.live) return [{ waiting: false, auto: false }, "end"];
    return [{ waiting: false, auto: p.auto && s.live }, null];
  }
  if (!s.enabled || s.live) return [{ waiting: false, auto: p.auto && s.live }, null];
  if (!p.waiting && !p.auto) return [{ waiting: true, auto: false }, "open"];
  if (p.waiting && s.ready) return [{ waiting: false, auto: true }, "listen"];
  return [p, null];
}

export function AutoPickup({ session, activate }: { session: CallSession; activate: () => void }) {
  const router = useRouter();
  const { autoPickup } = usePrefs();
  const [app, setApp] = useState<string | null>(null);
  const onCall = app !== null;
  const pickup = useRef<Pickup>({ waiting: false, auto: false });
  useEffect(() => {
    const d = desktop();
    if (!d) return;
    void d.callState().then((s) => setApp(s.app));
    return d.onCallState((s) => setApp(s.app));
  }, []);
  const { state, startListening, end } = session;
  const ready = state.connection === "open" && Boolean(state.hello);
  const live = state.phase === "live";
  useEffect(() => {
    const [next, action] = pickupStep(pickup.current, { onCall, enabled: autoPickup, ready, live });
    pickup.current = next;
    if (action === "open") {
      activate();
      router.push("/call");
    } else if (action === "listen") {
      if (app) setCallSource(sourceOf(app));
      startListening("computer");
    } else if (action === "end") end();
  }, [onCall, app, autoPickup, ready, live, activate, router, startListening, end]);
  return null;
}
