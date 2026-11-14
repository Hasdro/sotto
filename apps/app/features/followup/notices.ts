/**
 * Desktop notifications for due follow-up steps (INT-08, D-055). While the app is open it asks the
 * server for due steps every minute and shows one system notification per new step; clicking it
 * opens that step on Home (`/?step=<id>`). The notification only opens the step: sending is the
 * agent's own tap there. Phones and the browser show the same steps on Home without a notice.
 */
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useFeature } from "../../components/FeatureGate";
import { desktop, type FollowupNotice } from "../../lib/desktop";
import { useI18n } from "../../lib/locale";
import { type DueStep, dueSteps } from "./api";
import { followupText } from "./strings";

export const POLL_MS = 60_000;
const announced = new Set<string>();

/** The notice for one due step (shared with the desktop test fixture). */
export function noticeFor(step: DueStep, t: ReturnType<typeof followupText>): FollowupNotice {
  return {
    stepId: step.id,
    title: t("due.notice", { kind: t(`kind.${step.kind}`), name: step.customer_name }).slice(0, 80),
    body: t("due.noticeBody"),
  };
}

/** Announces steps not announced yet in this app session; returns how many were shown. */
export async function announce(
  steps: DueStep[],
  t: ReturnType<typeof followupText>,
): Promise<number> {
  const d = desktop();
  if (!d?.notify) return 0;
  let shown = 0;
  for (const s of steps) {
    if (announced.has(s.id)) continue;
    announced.add(s.id);
    if (await d.notify(noticeFor(s, t)).catch(() => false)) shown += 1;
  }
  return shown;
}

export function resetAnnounced(): void {
  announced.clear();
}

export function useFollowupNotices(): void {
  const feature = useFeature("followup_plan");
  const router = useRouter();
  const { locale } = useI18n();
  const on = feature.state === "available";
  useEffect(() => {
    const d = desktop();
    if (!on || !d?.notify) return;
    const t = followupText(locale);
    let stopped = false;
    const poll = () =>
      void dueSteps()
        .then((r) => (stopped ? 0 : announce(r.steps, t)))
        .catch(() => 0);
    poll();
    const timer = setInterval(poll, POLL_MS);
    const off = d.onNotifyOpen?.((stepId) => router.push(`/?step=${stepId}`));
    return () => {
      stopped = true;
      clearInterval(timer);
      off?.();
    };
  }, [on, locale, router]);
}
