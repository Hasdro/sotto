/**
 * D-059: AGN runs providers, keys, models and prompts from the owner console. A company admin
 * sees and changes them only when AGN switched "bring your own" on for the company; otherwise
 * the screens say why (D-028 off_by_platform). The server enforces it too (403 byo_providers).
 */
import { EmptyState } from "@sotto/ui";
import type { ReactNode } from "react";
import type { CloudState } from "../../lib/cloud";
import { useCloud } from "../../lib/useCloud";
import type { Effective } from "../flags/catalog";
import { useByoText } from "./strings";

export const BYO = "byo_providers";

/** The BYO state, or null when not signed in to a server (the Mac demo's own panel). */
export function byoOf(state: CloudState): Effective | null {
  if (state.status !== "signed_in" || !state.me.company) return null;
  const map = (state.me.features ?? {}) as Record<string, Effective | undefined>;
  // An older server sends no BYO entry: it predates D-059, so the screens work as before.
  return map[BYO] ?? null;
}

export function ByoOffNotice() {
  const t = useByoText();
  return <EmptyState testID="byo-off" title={t("byo.off.title")} body={t("byo.off.body")} />;
}

/** Renders the screen only while BYO is available (or the server predates it). */
export function ByoGate({ children }: { children: ReactNode }) {
  const state = byoOf(useCloud());
  if (state && state.state !== "available") return <ByoOffNotice />;
  return <>{children}</>;
}
