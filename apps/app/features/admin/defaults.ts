/**
 * Company defaults (ZC-11c, D-049, D-063) against `/api/v1/company/defaults` (ZC-11s): the
 * recording policy, the manager, the AI-vendor consent and the vendor allow-list. Tone and call
 * goal are saved there too; until the server accepts them they stay on this screen (the next
 * bundle keeps AGN's defaults). Without a server the page works on local values.
 */
import { useCallback, useEffect, useState } from "react";
import { type CompanyDefaults, cloudApi, type RecordCalls } from "../../lib/cloud";
import { useCloud } from "../../lib/useCloud";

export type { RecordCalls };
export type ConsentChoice = "all" | "primary_only";

export type DefaultsView = CompanyDefaults & { tone?: string; call_goal?: string };
export type DefaultsChange = {
  record_calls?: RecordCalls;
  consent?: { choice: ConsentChoice; text_version: string };
  vendor_allow_list?: string[];
  tone?: string;
  call_goal?: string;
};

export const defaultsApi = {
  get: () => cloudApi<DefaultsView>("/api/v1/company/defaults"),
  save: (change: DefaultsChange) =>
    cloudApi<DefaultsView>("/api/v1/company/defaults", { method: "PUT", body: change }),
};

const LOCAL: DefaultsView = { record_calls: "agent_choice", consent: null, vendor_allow_list: [] };

export type DefaultsState = {
  defaults: DefaultsView;
  /** "server": saved for the company; "local": no server, or not signed in. */
  saved: "local" | "server";
  error: string | null;
  save: (change: DefaultsChange) => Promise<boolean>;
};

export function useCompanyDefaults(): DefaultsState {
  const cloud = useCloud();
  const signedIn = cloud.status === "signed_in";
  const company = signedIn ? cloud.bundle?.company : undefined;
  const [defaults, setDefaults] = useState<DefaultsView>(LOCAL);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    defaultsApi
      .get()
      .then((d) => {
        if (live) setDefaults((old) => ({ ...old, ...d }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [signedIn]);
  const save = useCallback(
    async (change: DefaultsChange) => {
      setError(null);
      setDefaults((d) => ({ ...d, ...localOf(change) }));
      if (!signedIn) return true;
      try {
        const next = await defaultsApi.save(change);
        setDefaults((d) => ({ ...d, ...next, ...localOf(change, true) }));
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [signedIn],
  );
  // Prefilled (ZC B6): the company's tone and goal from the call bundle until the admin sets them.
  const view: DefaultsView = {
    ...defaults,
    tone: defaults.tone ?? company?.tone ?? "",
    call_goal: defaults.call_goal ?? company?.call_goal ?? "",
  };
  return { defaults: view, saved: signedIn ? "server" : "local", error, save };
}

/** The part of a change the screen shows at once; a consent record gets its time locally. */
function localOf(change: DefaultsChange, onlyText = false): Partial<DefaultsView> {
  const out: Partial<DefaultsView> = {};
  if (change.tone !== undefined) out.tone = change.tone;
  if (change.call_goal !== undefined) out.call_goal = change.call_goal;
  if (onlyText) return out;
  if (change.record_calls) out.record_calls = change.record_calls;
  if (change.vendor_allow_list) out.vendor_allow_list = change.vendor_allow_list;
  if (change.consent)
    out.consent = {
      choice: change.consent.choice,
      text_version: change.consent.text_version,
      accepted_by: "",
      accepted_at: Date.now(),
    };
  return out;
}
