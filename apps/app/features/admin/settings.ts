/**
 * Company settings on the Sotto server (D-020): AI answers outside the playbook (R2), backup
 * providers (R2), agent-track context (R4) and card language (D-018). The next call uses them.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/server";

export type CardLanguage = "auto" | "en" | "ar";
export type CompanySettings = {
  ai_answers_allowed: boolean;
  backup_allowed: boolean;
  agent_context: boolean;
  card_language: CardLanguage;
  /** Company knowledge the AI reads on every card and review (owner, 22 Oct). */
  context?: string;
};

/** Without a server (dev mock, tests) the screen keeps working on these local values. */
export const LOCAL_DEFAULTS: CompanySettings = {
  ai_answers_allowed: true,
  backup_allowed: true,
  agent_context: true,
  card_language: "en", // D-018: English by default
};

type Response = { settings: CompanySettings };

export function useCompanySettings(): {
  settings: CompanySettings;
  change: (patch: Partial<CompanySettings>) => void;
  saved: "local" | "server";
} {
  const [settings, setSettings] = useState<CompanySettings>(LOCAL_DEFAULTS);
  const [saved, setSaved] = useState<"local" | "server">("local");
  useEffect(() => {
    let live = true;
    api<Response>("/api/company/settings")
      .then((r) => {
        if (!live) return;
        setSettings(r.settings);
        setSaved("server");
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const change = useCallback(
    (patch: Partial<CompanySettings>) => {
      setSettings((s) => ({ ...s, ...patch }));
      if (saved !== "server") return;
      api<Response>("/api/company/settings", { method: "PUT", body: patch })
        .then((r) => setSettings(r.settings))
        .catch(() => {});
    },
    [saved],
  );
  return { settings, change, saved };
}
