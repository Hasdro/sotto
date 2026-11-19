/**
 * Bug reports (Round 3, D-086): the in-app report, the screenshot upload, and the admin
 * review queue. The queue endpoints are owner-only (the owner console's cookie); the app
 * session cannot use them, so they go through a plain fetch — never cloudApi, whose 401
 * path would sign the user out (cloud.ts). A 401/403 there means the queue lives in the
 * owner console, and the queue screen says so.
 */
import { cloudApi } from "../../lib/cloud";
import { apiOrigin } from "../../lib/server";

export type BugReportStatus = "new" | "reviewed" | "submitted" | "closed";

export type BugReport = {
  id: string;
  company_id: string;
  user_id: string;
  company_name: string;
  user_email: string;
  title: string;
  description: string;
  page_url: string;
  screenshot_url: string;
  status: BugReportStatus;
  github_issue_url: string | null;
  created_at: number;
  updated_at: number;
};

export type BillingInfo = {
  plan: string;
  status: "trial" | "active" | "expired" | "suspended";
  days_left: number | null;
  /** ms since epoch; trial end for trials, paid_until otherwise. */
  ends_at: number | null;
  seats: number;
  seats_used: number;
  minutes_month: number;
  minutes_used: number;
  can_call: boolean;
  blocked_reason: string | null;
  plan_name: string;
  /** null for the pre-Zoho plans (team/custom), whose price AGN sets. */
  price_aed: number | null;
  currency: "AED";
  billing_period: "monthly";
  zoho_plan_code: string | null;
  /** The next plan's Zoho hosted page, or null (top plan) / a TODO placeholder until the
   * real URLs are pasted in (D-090). Never a guessed URL. */
  upgrade_url: string | null;
};

/** The client billing section (D-090): plan, price, next charge, upgrade page. */
export async function billingInfo(): Promise<BillingInfo> {
  return cloudApi<BillingInfo>("/api/v1/billing");
}

export async function submitBugReport(input: {
  title: string;
  description: string;
  page_url: string;
  screenshot_url?: string;
}): Promise<{ id: string }> {
  return cloudApi<{ id: string }>("/api/v1/bug-reports", { method: "POST", body: input });
}

/** A screenshot, sent as a raw image body (the server takes no multipart). Returns the
 * public, unguessable URL that goes into the report and, later, the GitHub issue. */
export async function uploadScreenshot(file: Blob): Promise<string> {
  const r = await cloudApi<{ url: string }>("/api/v1/issue-attachments", {
    method: "POST",
    raw: file,
  });
  return r.url;
}

export class OwnerApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** An owner-console endpoint from the app. A 401 here is expected in production (the
 * owner console is a separate origin with its own cookie); it must never sign the user
 * out, so this is a plain fetch, not cloudApi. */
async function ownerFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`${apiOrigin()}${path}`, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers: init?.body === undefined ? {} : { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new OwnerApiError(response.status, message);
  }
  return data as T;
}

/** The review queue, newest first. Throws OwnerApiError(401) outside the owner console. */
export async function listBugReports(status?: BugReportStatus): Promise<{ reports: BugReport[] }> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return ownerFetch<{ reports: BugReport[] }>(`/api/owner/bug-reports${q}`);
}

export async function updateBugReport(
  id: string,
  patch: { title?: string; description?: string; status?: BugReportStatus },
): Promise<BugReport> {
  return ownerFetch<BugReport>(`/api/owner/bug-reports/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
  });
}

export async function submitBugReportToGithub(
  id: string,
): Promise<{ issue_url: string; issue_number: number }> {
  return ownerFetch<{ issue_url: string; issue_number: number }>(
    `/api/owner/bug-reports/${encodeURIComponent(id)}/submit`,
    { method: "POST", body: {} },
  );
}
