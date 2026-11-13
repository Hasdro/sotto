/**
 * Plan and trial banner (R3, P3.5): days left in the trial with seats and minutes used, or why
 * calls are blocked. Shown to managers and admins on every page except the call screen. When the
 * plan blocks calls, everyone sees a short line saying so — agents and the call screen included,
 * since that is where a block bites (T-026).
 */
import { space, Text, useTheme } from "@sotto/ui";
import { usePathname } from "expo-router";
import { type ReactNode, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { bannerFor, type Plan, samplePlan } from "../features/admin/plan";
import type { StringKey } from "../lib/i18n";
import { useI18n } from "../lib/locale";
import { useRole } from "../lib/role";
import { useCloud } from "../lib/useCloud";

export function PlanBanner() {
  return usePlanBanner()?.node ?? null;
}

/** The plan line for this person and page, and whether it is the "calls paused" alert (which
 * outranks every other banner, ZC-14c). */
export function usePlanBanner(): { kind: "paused" | "plan"; node: ReactNode } | null {
  const { t } = useI18n();
  const { color } = useTheme();
  const { role } = useRole();
  const pathname = usePathname();
  const cloud = useCloud();
  const company = cloud.status === "signed_in" ? cloud.me.company : null;
  const plan = useMemo<Plan>(() => {
    if (!company) return samplePlan();
    // The real plan from the management server (D-022).
    return {
      state: company.status,
      trialEndsAt:
        company.status === "trial" && company.days_left !== null
          ? new Date(Date.now() + company.days_left * 86_400_000 - 60_000).toISOString()
          : null,
      seats: { used: company.seats_used, limit: company.seats },
      minutes: { used: company.minutes_used, limit: company.minutes_month },
    };
  }, [company]);
  const banner = bannerFor(plan);
  const onCall = pathname === "/" || pathname.startsWith("/call");
  const paused = pausedReason(company, banner);
  if (paused && (role === "agent" || onCall)) {
    return {
      kind: "paused",
      node: (
        <View
          testID="calls-paused"
          accessibilityRole="alert"
          style={[
            styles.bar,
            { backgroundColor: color.noticeFill, borderBottomColor: color.noticeBorder },
          ]}
        >
          <Text variant="label" weight="medium" color={color.noticeText}>
            {t("plan.paused", { reason: t(paused) })}
          </Text>
        </View>
      ),
    };
  }
  if (!banner || role === "agent" || onCall) return null;
  const blocked = banner.kind === "blocked";
  const notice = blocked || banner.urgent;
  const text = blocked
    ? t(banner.reason === "expired" ? "plan.expired" : "plan.suspended")
    : t(banner.daysLeft === 1 ? "plan.trial.one" : "plan.trial", {
        days: banner.daysLeft,
        seats: plan.seats.used,
        seatLimit: plan.seats.limit,
        minutes: plan.minutes.used.toLocaleString("en-US"),
        minuteLimit: plan.minutes.limit.toLocaleString("en-US"),
      });
  return {
    kind: "plan",
    node: (
      <View
        testID="plan-banner"
        accessibilityRole="summary"
        style={[
          styles.bar,
          {
            backgroundColor: notice ? color.noticeFill : color.surfaceSunken,
            borderBottomColor: notice ? color.noticeBorder : color.border,
          },
        ]}
      >
        <Text variant="label" weight="medium" color={notice ? color.noticeText : undefined}>
          {text}
        </Text>
      </View>
    ),
  };
}

/** Why calls are blocked, or null when they are allowed. */
function pausedReason(
  company: { can_call: boolean; status: string; blocked_reason: string | null } | null,
  banner: ReturnType<typeof bannerFor>,
): StringKey | null {
  const status = banner?.kind === "blocked" ? banner.reason : company?.status;
  if (status === "expired") return "plan.reason.expired";
  if (status === "suspended") return "plan.reason.suspended";
  if (company && !company.can_call) {
    return company.blocked_reason?.includes("minutes")
      ? "plan.reason.minutes"
      : "plan.reason.other";
  }
  return null;
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: 1 },
});
