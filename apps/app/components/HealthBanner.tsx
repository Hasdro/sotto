/**
 * Config health (ZC-14c, draft D-057 (backlog)): the server computes one status per company and sends it with
 * the feature map. When it needs attention the shell shows one line with the first reason this
 * person can fix and a button to the page that fixes it. Agents only see what is theirs to fix
 * (their Zoho connection); plan and email problems go to the people who can open those pages.
 */
import { Button, radius, space, Text, useTheme } from "@sotto/ui";
import { router } from "expo-router";
import { type ReactNode, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { type CrmKey, useCrmText } from "../features/crm/strings";
import { type ConfigHealth, configHealth, type HealthReason, refreshFeatures } from "../lib/cloud";
import { useI18n } from "../lib/locale";
import { canOpen, type ViewRole } from "../lib/role";
import { useCloud } from "../lib/useCloud";

// W4-SCOPES (D-069): connected before the wave-4 scope bundle; each person reconnects once.
export const SCOPES_OUTDATED = "zoho_scopes_outdated";
/** Where `zoho_scopes_outdated` is fixed (the server's HEALTH_FIX names the same route). */
export const SCOPES_FIX = "/settings#zoho";
const AGENT_CODES: ReadonlySet<string> = new Set(["zoho_token_expired", SCOPES_OUTDATED]);
const KNOWN: ReadonlySet<string> = new Set([
  "zoho_token_expired",
  SCOPES_OUTDATED,
  "smtp_failing",
  "minutes_low",
  "trial_ending",
]);

/** The one reason to show this role, or null when there is nothing for them to fix. */
export function healthReasonFor(health: ConfigHealth, role: ViewRole): HealthReason | null {
  if (health.status !== "needs_attention") return null;
  return (
    health.reasons.find(
      (r) =>
        KNOWN.has(r.code) &&
        (role !== "agent" || AGENT_CODES.has(r.code)) &&
        canOpen(role, r.fix.split(/[?#]/)[0] ?? r.fix),
    ) ?? null
  );
}

export function useHealthBanner(role: ViewRole): ReactNode {
  const cloud = useCloud(); // re-renders when the feature map (and with it the health) changes
  const signedIn = cloud.status === "signed_in";
  // The health comes with the feature map; read it once at sign-in instead of waiting for the
  // first 10-minute refresh (D-036).
  useEffect(() => {
    if (signedIn) void refreshFeatures();
  }, [signedIn]);
  if (!signedIn) return null;
  const reason = healthReasonFor(configHealth(), role);
  return reason ? <HealthLine reason={reason} /> : null;
}

function HealthLine({ reason }: { reason: HealthReason }) {
  const { t } = useI18n();
  const ct = useCrmText();
  const { color } = useTheme();
  // Labels for codes newer than lib/i18n.ts live with their feature (D-058).
  // lib/cloud.ts's HealthReason union does not name it yet (hub file): compare as text.
  const outdated = (reason.code as string) === SCOPES_OUTDATED;
  const label = (key: string) => (outdated ? ct(key as CrmKey) : t(key as Parameters<typeof t>[0]));
  return (
    <View
      testID="health-banner"
      accessibilityRole="summary"
      style={[styles.bar, { backgroundColor: color.noticeFill, borderColor: color.noticeBorder }]}
    >
      <Text variant="label" weight="medium" color={color.noticeText} style={styles.text}>
        {label(`health.${reason.code}`)}
      </Text>
      <Button
        variant="ghost"
        label={label(`health.fix.${reason.code}`)}
        onPress={() => router.push(outdated ? SCOPES_FIX : reason.fix)}
        testID="health-fix"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.md,
    marginHorizontal: space.lg,
    marginTop: space.md,
    paddingStart: space.lg,
    paddingEnd: space.xs,
    paddingVertical: space.xs,
    borderWidth: 1,
    borderRadius: radius.xl,
  },
  text: { flexShrink: 1 },
});
