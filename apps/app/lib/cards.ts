/**
 * Client API for card tone presets and banned phrases (C3, D-094).
 * Uses `cloudApi` from `lib/cloud.ts` without modifying `cloud.ts` (master brief §3.5).
 */
import { cloudApi } from "./cloud";

export type TonePreset = "casual" | "direct" | "warm" | "formal";

export const TONE_PRESETS: readonly TonePreset[] = ["casual", "direct", "warm", "formal"];
export const HOW_WE_TALK_MAX = 200;

export type ToneSettingsResponse = {
  tone: TonePreset;
  source: "agent" | "company" | "platform";
  company_default: TonePreset;
  allowed_presets: TonePreset[];
  how_we_talk: string;
  banned_en: string[];
  banned_ar: string[];
  company_banned_en: string[];
  company_banned_ar: string[];
  platform_banned_en: string[];
  platform_banned_ar: string[];
};

export async function getToneSettings(): Promise<ToneSettingsResponse> {
  return cloudApi<ToneSettingsResponse>("/api/v1/cards/tone");
}

export async function saveCompanyTone(input: {
  default_tone: TonePreset;
  allowed_presets: TonePreset[];
  how_we_talk: string;
  banned_en: string[];
  banned_ar: string[];
}): Promise<unknown> {
  return cloudApi("/api/v1/cards/tone/company", { method: "PUT", body: input });
}

export async function saveAgentTone(
  tone: TonePreset | null,
): Promise<{ tone: TonePreset; source: string }> {
  return cloudApi<{ tone: TonePreset; source: string }>("/api/v1/cards/tone/agent", {
    method: "PUT",
    body: { tone: tone ?? "" },
  });
}
