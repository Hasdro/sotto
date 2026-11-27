/**
 * Desktop extras (owner, 22 Oct): keyboard shortcuts that work from any app (⌃⌥S start or end
 * listening, ⌃⌥C copy the newest card, ⌃⌥M show or hide the mini window), and the mini window
 * fed with the newest card while a call is on. The main window owns the call; the mini window
 * only shows it.
 */
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useCallSource } from "../../lib/callSource";
import { desktop, type MiniState, type Shortcut } from "../../lib/desktop";
import { usePrefs } from "../../lib/prefs";
import { selectCards } from "../cards/reducer";
import { splitCardWhy } from "./components/CardStack";
import type { CallSession } from "./useCallSession";

/** The newest card's sentence as the agent says it: without the "WHY:" insight (C1). */
export function newestCardText(session: CallSession): string | null {
  const hero = selectCards(session.state.cards)[0];
  return hero ? splitCardWhy(hero.text).main : null;
}

/**
 * What the mini window shows. Only a live call fills it (UX-005): once a call ends, real or
 * practice, it goes back to idle instead of keeping the last card next to the next meeting.
 */
export function miniStateOf(session: CallSession, source: string | null): MiniState {
  if (session.state.phase !== "live")
    return { live: false, card: null, partial: null, source: null };
  const hero = selectCards(session.state.cards)[0];
  return {
    live: true,
    card: hero
      ? {
          type: hero.type,
          source: hero.source,
          label: hero.label,
          text: splitCardWhy(hero.text).main,
          done: hero.done,
        }
      : null,
    partial: session.state.partial,
    source,
  };
}

export function DesktopBridge({
  session,
  activate,
}: {
  session: CallSession;
  activate: () => void;
}) {
  const router = useRouter();
  const source = useCallSource();
  const { miniWindow } = usePrefs();
  const latest = useRef(session);
  latest.current = session;
  // A shortcut can arrive before the call screen ever opened: start once the session is ready.
  const pending = useRef(false);
  const ready = session.state.connection === "open" && Boolean(session.state.hello);
  useEffect(() => {
    if (!ready || !pending.current) return;
    pending.current = false;
    if (latest.current.state.phase !== "live") latest.current.startListening("computer");
  }, [ready]);
  const state = miniStateOf(session, source);
  const key = JSON.stringify(state);

  useEffect(() => {
    desktop()?.sendMini?.(JSON.parse(key) as MiniState);
  }, [key]);

  // The mini window opens by itself when a call starts (Settings can turn that off).
  const live = state.live;
  useEffect(() => {
    if (live && miniWindow) desktop()?.showMini?.(true);
  }, [live, miniWindow]);

  useEffect(() => {
    const d = desktop();
    if (!d?.onShortcut) return;
    return d.onShortcut((s: Shortcut | "open") => {
      const now = latest.current;
      if (s === "listen") {
        if (now.state.phase === "live") now.end();
        else {
          pending.current = true;
          activate();
          router.navigate("/call");
          if (now.state.connection === "open" && now.state.hello) {
            pending.current = false;
            now.startListening("computer");
          }
        }
      } else if (s === "copy") {
        const text = newestCardText(now);
        if (text) void globalThis.navigator?.clipboard?.writeText(text).catch(() => {});
      } else if (s === "mini") {
        d.showMini?.(true);
      } else if (s === "open") {
        router.navigate("/call");
      }
    });
  }, [activate, router]);
  return null;
}
