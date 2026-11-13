/**
 * The call app the desktop app sees on the microphone right now (Zoom, Teams, 3CX…), or null;
 * always null in the browser and on phones. Auto pick-up and the start screen read it.
 */
import { useEffect, useState } from "react";
import { type CallSource, SOURCE_META, sourceOf } from "../../lib/callSource";
import { desktop } from "../../lib/desktop";

export function useCallApp(): string | null {
  const [app, setApp] = useState<string | null>(null);
  useEffect(() => {
    const d = desktop();
    if (!d) return;
    let live = true;
    void d
      .callState()
      .then((s) => live && setApp(s.app))
      .catch(() => {});
    const off = d.onCallState((s) => setApp(s.app));
    return () => {
      live = false;
      off();
    };
  }, []);
  return app;
}

/** "Zoom", "Microsoft Teams"…; null for an app we cannot name. */
export function callAppName(app: string | null): string | null {
  if (!app) return null;
  const source: CallSource = sourceOf(app);
  return source === "computer" ? null : SOURCE_META[source].name;
}
