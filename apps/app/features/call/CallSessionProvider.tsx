/**
 * The call lives above the navigator (T-025): opening History or going back mid-call no longer
 * ends it. The session connects the first time the call screen opens and then stays up until the
 * agent ends the call, signs out (the bundle goes, so the bridge closes) or the app closes.
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";
import { resetCall } from "../crm/attached";
import { AutoPickup } from "./autoPickup";
import type { SocketFactory } from "./bridge";
import { DesktopBridge } from "./DesktopBridge";
import { type CallSession, useCallSession } from "./useCallSession";

type Shared = { session: CallSession; activate: () => void };

const SharedCall = createContext<Shared | null>(null);

export function CallSessionProvider({
  children,
  socketFactory,
}: {
  children: ReactNode;
  /** Tests inject a fake socket. */
  socketFactory?: SocketFactory;
}) {
  const { locale } = useI18n();
  const [active, setActive] = useState(false);
  const session = useCallSession({
    mock: false,
    locale,
    enabled: active,
    ...(socketFactory ? { socketFactory } : {}),
  });
  const activate = useCallback(() => setActive(true), []);
  // R3 (review): a linked record or call brief never outlives the account that made it, so the
  // next account on this computer starts clean (signed out, or the gate unmounts the app).
  const account = useCloud();
  const userId = account.status === "signed_in" ? account.me.user.id : null;
  useEffect(() => {
    if (userId === null) resetCall();
  }, [userId]);
  useEffect(() => () => resetCall(), []);
  return (
    <SharedCall.Provider value={{ session, activate }}>
      <AutoPickup session={session} activate={activate} />
      <DesktopBridge session={session} activate={activate} />
      {children}
    </SharedCall.Provider>
  );
}

/** The shared call's phase; null outside the provider (the mini window, tests). */
export function useCallPhase(): CallSession["state"]["phase"] | null {
  return useContext(SharedCall)?.session.state.phase ?? null;
}

/** The app-wide call session; the call screen activates it on first visit. */
export function useSharedCall(): Shared {
  const shared = useContext(SharedCall);
  if (!shared) throw new Error("useSharedCall needs a CallSessionProvider");
  return shared;
}
