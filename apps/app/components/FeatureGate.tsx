/**
 * Feature gate (R7, D-028): shows a feature only when the server says it is available. A feature
 * someone's workflow needs but cannot use right now is greyed with a one-line reason and, where
 * it helps, an action; a feature that is not for their role is hidden. The server enforces the
 * same states on every route (D-036), so this is presentation only.
 *
 * Without a management server (local demo, tests) every feature is available, as before flags.
 */
import { Button, Icon, radius, space, Text, useTheme } from "@sotto/ui";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { type Effective, type FeatureId, stateOf } from "../features/flags/catalog";
import { reasonFor, useFlagText } from "../features/flags/strings";
import { useCloud } from "../lib/useCloud";

export function useFeature(id: FeatureId): Effective {
  const cloud = useCloud();
  return cloud.status === "signed_in" ? stateOf(cloud.me.features, id) : { state: "available" };
}

export function FeatureGate({ feature, children }: { feature: FeatureId; children: ReactNode }) {
  const effective = useFeature(feature);
  if (effective.state === "available") return children;
  if (effective.state === "no_permission") return null;
  return <FeatureOff feature={feature} effective={effective} />;
}

export function FeatureOff({ feature, effective }: { feature: FeatureId; effective: Effective }) {
  const text = useFlagText();
  const { color } = useTheme();
  const cloud = useCloud();
  const admin = cloud.status === "signed_in" && cloud.me.user.role === "admin";
  const reason = reasonFor(text, effective, admin);
  const action =
    effective.state === "off_by_org" && admin
      ? { label: text.action.features, href: "/admin/features" }
      : effective.state === "needs_connection" && effective.cause !== "release"
        ? { label: text.action.settings, href: "/settings" }
        : null;
  return (
    <View
      testID={`feature-off-${feature}`}
      accessibilityRole="summary"
      aria-disabled
      style={[styles.box, { backgroundColor: color.surfaceSunken, borderColor: color.border }]}
    >
      <Icon name="lock" size={18} color={color.textMuted} />
      <View style={styles.text}>
        <Text weight="semibold" tone="muted">
          {text.name[feature]}
        </Text>
        <Text variant="label" tone="muted">
          {reason}
        </Text>
      </View>
      {action ? (
        <Button
          variant="ghost"
          label={action.label}
          onPress={() => router.push(action.href)}
          testID={`feature-off-${feature}-action`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  text: { flex: 1, minWidth: 180, gap: 2 },
});
