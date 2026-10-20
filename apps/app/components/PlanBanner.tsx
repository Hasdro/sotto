/**
 * Plan and trial banner (R3, P3.5): days left in the trial with seats and minutes used, or why
 * calls are blocked. Shown to managers and admins on every page except the call screen.
 */
import { space, Text, useTheme } from "@sotto/ui";
import { usePathname } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { bannerFor, type Plan, samplePlan } from "../features/admin/plan";
import { useI18n } from "../lib/locale";
import { useRole } from "../lib/role";
import { useCloud } from "../lib/useCloud";

export function PlanBanner() {
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
  return (
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
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: 1 },
});
