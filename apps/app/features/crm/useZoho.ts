/**
 * One person's Zoho connection (R10): status, connect through the system browser (the server
 * runs the OAuth flow, D-031) and disconnect. After "Connect" it polls the status every 2 s for
 * up to 3 minutes, then refreshes the feature map so every screen sees `zoho` available.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { CloudError, refreshFeatures } from "../../lib/cloud";
import { type ZohoStatus, zohoConnect, zohoDisconnect, zohoStatus } from "./api";

const POLL_MS = 2000;
const POLL_FOR_MS = 180_000;

export type ZohoConn = {
  status: ZohoStatus | null;
  waiting: boolean;
  error: "failed" | "no_client" | null;
  connect: () => void;
  disconnect: () => void;
  reload: () => void;
};

export function useZoho(deps: { open?: (url: string) => unknown } = {}): ZohoConn {
  const [status, setStatus] = useState<ZohoStatus | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<ZohoConn["error"]>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const open = deps.open ?? ((url: string) => Linking.openURL(url));

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setWaiting(false);
  }, []);

  const reload = useCallback(() => {
    zohoStatus()
      .then((s) => {
        setStatus(s);
        if (s.connected && timer.current) {
          stop();
          void refreshFeatures();
        }
      })
      .catch(() => {});
  }, [stop]);

  useEffect(() => {
    reload();
    return stop;
  }, [reload, stop]);

  const connect = useCallback(() => {
    setError(null);
    zohoConnect()
      .then(({ url }) => {
        void open(url);
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
        reload();
        void refreshFeatures();
      })
      .catch(() => setError("failed"));
  }, [reload]);

  return { status, waiting, error, connect, disconnect, reload };
}
