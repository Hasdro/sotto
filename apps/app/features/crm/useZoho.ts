/**
 * One person's Zoho connection (R10): status, connect through the system browser (the server
 * runs the OAuth flow, D-031) and disconnect.
 *
 * The browser half ends on another app's window, so this screen must notice by itself: it
 * re-reads the status whenever the window regains focus or becomes visible (desktop timers are
 * throttled in the background), and polls every 2 s for 3 minutes while a connect is pending.
 * When the status turns connected it refreshes the feature map (every screen sees `zoho`
 * available) and sets `justConnected` so the screen can confirm it. In the desktop app the
 * browser step ends on `agn-sales-shield://zoho/connected` (draft D-054 (backlog)), which re-reads at once; focus
 * and polling stay as the fallback (a browser that never opens the link).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import { CloudError, refreshFeatures } from "../../lib/cloud";
import { desktop } from "../../lib/desktop";
import { type ZohoStatus, zohoConnect, zohoDisconnect, zohoStatus } from "./api";

const POLL_MS = 2000;
const POLL_FOR_MS = 180_000;

export type ZohoConn = {
  status: ZohoStatus | null;
  waiting: boolean;
  justConnected: boolean;
  error: "failed" | "no_client" | null;
  connect: () => void;
  disconnect: () => void;
  reload: () => void;
};

/** Calls `fn` when the app window comes back to the front (web, desktop and phones). */
export function onReturn(fn: () => void): () => void {
  const offs: (() => void)[] = [];
  const w = globalThis as {
    addEventListener?: (t: string, f: () => void) => void;
    removeEventListener?: (t: string, f: () => void) => void;
    document?: { visibilityState?: string };
  };
  if (typeof w.addEventListener === "function") {
    const visible = () => {
      if (w.document?.visibilityState !== "hidden") fn();
    };
    w.addEventListener("focus", fn);
    w.addEventListener("visibilitychange", visible);
    offs.push(() => {
      w.removeEventListener?.("focus", fn);
      w.removeEventListener?.("visibilitychange", visible);
    });
  }
  const sub = AppState.addEventListener?.("change", (s) => {
    if (s === "active") fn();
  });
  if (sub) offs.push(() => sub.remove());
  return () => {
    for (const off of offs) off();
  };
}

export function useZoho(deps: { open?: (url: string) => unknown } = {}): ZohoConn {
  const [status, setStatus] = useState<ZohoStatus | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [justConnected, setJustConnected] = useState(false);
  const [error, setError] = useState<ZohoConn["error"]>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pending = useRef(false);
  const wasConnected = useRef<boolean | null>(null);
  const open = deps.open ?? ((url: string) => Linking.openURL(url));

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    pending.current = false;
    setWaiting(false);
  }, []);

  const reload = useCallback(() => {
    zohoStatus()
      .then((s) => {
        setStatus(s);
        const fresh = s.connected && !s.needs_reconnect;
        if (fresh && (pending.current || wasConnected.current === false)) {
          setJustConnected(true);
          void refreshFeatures();
        }
        if (fresh && pending.current) stop();
        wasConnected.current = fresh;
      })
      .catch(() => {});
  }, [stop]);

  useEffect(() => {
    reload();
    const off = onReturn(reload);
    const offLink = desktop()?.onDeepLink?.((link) => {
      if (link.kind === "zoho") reload();
    });
    return () => {
      off();
      offLink?.();
      stop();
    };
  }, [reload, stop]);

  const connect = useCallback(() => {
    setError(null);
    setJustConnected(false);
    zohoConnect()
      .then(({ url }) => {
        void open(url);
        pending.current = true;
        wasConnected.current = false;
        setWaiting(true);
        const until = Date.now() + POLL_FOR_MS;
        if (timer.current) clearInterval(timer.current);
        timer.current = setInterval(() => {
          if (Date.now() > until) stop();
          else reload();
        }, POLL_MS);
      })
      .catch((e: unknown) =>
        setError(e instanceof CloudError && e.code === "zoho_no_client" ? "no_client" : "failed"),
      );
  }, [open, reload, stop]);

  const disconnect = useCallback(() => {
    zohoDisconnect()
      .then(() => {
        setJustConnected(false);
        wasConnected.current = false;
        reload();
        void refreshFeatures();
      })
      .catch(() => setError("failed"));
  }, [reload]);

  return { status, waiting, justConnected, error, connect, disconnect, reload };
}
