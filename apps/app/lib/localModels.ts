/**
 * Client API helpers for Local / Offline Models (L6, D-096).
 * All network calls route through `request()` in `lib/cloud.ts` (timeout, retries, auth).
 */
import type { LocalEndpointStatus } from "../features/settings/LocalModelsSettings";
import { cloudApi } from "./cloud";

export type LocalEndpointKind = "text" | "stt" | "tts";

export type LocalCompanyPolicy = {
  company_id: string;
  text_enabled: boolean;
  voice_enabled: boolean;
  allow_cloud_backup: boolean;
};

export type LocalEndpointRow = {
  company_id: string;
  user_id: string;
  kind: LocalEndpointKind;
  base_url: string;
  status: "connected" | "unreachable";
  status_label?: string;
  measured_ms: number | null;
  meets_r1: boolean;
  live_opt_in: boolean;
};

export type LocalModelsResponse = {
  policy: LocalCompanyPolicy;
  endpoints: LocalEndpointRow[];
};

export type LocalTestResponse = LocalEndpointStatus & {
  detail: string;
  status_label?: string;
  measured_ms?: number | null;
  meets_r1?: boolean;
  endpoint: LocalEndpointRow;
};

/** Fetch the org local-model policy and current user's saved endpoints. */
export function fetchLocalModels(): Promise<LocalModelsResponse> {
  return cloudApi<LocalModelsResponse>("/api/v1/local-models");
}

/** Probe a local model URL (reachability + latency benchmark) and persist its status. */
export async function testLocalEndpoint(
  kind: LocalEndpointKind,
  baseUrl: string,
  liveOptIn: boolean,
): Promise<LocalEndpointStatus> {
  const res = await cloudApi<{
    reachable: boolean;
    status_label: string;
    measured_ms: number | null;
    meets_r1: boolean;
    detail: string;
  }>("/api/v1/local-models/test", {
    method: "POST",
    body: { kind, base_url: baseUrl, live_opt_in: liveOptIn },
  });
  return {
    reachable: res.reachable,
    statusLabel: res.status_label,
    measuredMs: res.measured_ms,
    meetsR1: res.meets_r1,
  };
}

/** Save updated URL or D-096 slow-opt-in setting for a local model endpoint. */
export function saveLocalEndpoint(
  kind: LocalEndpointKind,
  baseUrl: string,
  liveOptIn: boolean,
): Promise<{ endpoint: LocalEndpointRow }> {
  return cloudApi<{ endpoint: LocalEndpointRow }>("/api/v1/local-models", {
    method: "PUT",
    body: { kind, base_url: baseUrl, live_opt_in: liveOptIn },
  });
}

/** Remove the signed-in user's local endpoint configuration for `kind`. */
export function removeLocalEndpoint(kind: LocalEndpointKind): Promise<{ ok: boolean }> {
  return cloudApi<{ ok: boolean }>(`/api/v1/local-models/${encodeURIComponent(kind)}`, {
    method: "DELETE",
  });
}
