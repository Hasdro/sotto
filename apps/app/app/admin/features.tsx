/**
 * Admin → Features (R7, D-028): the organisation's on/off switch for every feature AGN included
 * in its plan, default on, with the state and reason each one has right now. Changes are in the
 * audit log; the server applies them on the next request and the apps within 10 minutes.
 */
import {
  Badge,
  type BadgeTone,
  EmptyState,
  minTouchTarget,
  Panel,
  Stack,
  space,
  Text,
  useTheme,
} from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Switch, View } from "react-native";
import type { Effective, FeatureId, FeatureState } from "../../features/flags/catalog";
import { reasonFor, useFlagText } from "../../features/flags/strings";
import { cloudApi, refreshFeatures } from "../../lib/cloud";
import { useCloud } from "../../lib/useCloud";

type Row = Effective & {
  id: FeatureId;
  enabled: boolean;
  roles: ("admin" | "manager" | "agent")[];
};

/** Plumbing rows an admin never decides on their own: they follow the visible feature that uses
 * them (Zoho needs Integrations; WhatsApp needs Gallabox; ratings drive learned instructions). */
export const HIDDEN_FEATURES: readonly FeatureId[] = [
  "integrations",
  "gallabox",
  "learned_instructions",
  "prep",
  "call_logs_github",
  "local_models_text",
  "local_models_voice",
  "voice_coach",
];

const TONE: Record<FeatureState, BadgeTone> = {
  available: "answer",
  off_by_platform: "neutral",
  off_by_org: "neutral",
  needs_connection: "question",
  no_permission: "neutral",
};

export default function FeaturesScreen() {
  const text = useFlagText();
  const cloud = useCloud();
  const { color } = useTheme();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<FeatureId | null>(null);

  useEffect(() => {
    if (cloud.status !== "signed_in") return;
    cloudApi<{ features: Row[] }>("/api/v1/company/features")
      .then((r) => setRows(r.features))
      .catch(() => setNote(text.admin.loadFailed));
  }, [cloud.status, text.admin.loadFailed]);

  const toggle = useCallback(
    (id: FeatureId, enabled: boolean) => {
      setBusy(id);
      setNote(null);
      cloudApi<{ features: Row[] }>(`/api/v1/company/features/${id}`, {
        method: "PUT",
        body: { enabled },
      })
        .then((r) => {
          setRows(r.features);
          setNote(text.admin.saved);
          void refreshFeatures();
        })
        .catch(() => setNote(text.admin.failed))
        .finally(() => setBusy(null));
    },
    [text.admin.saved, text.admin.failed],
  );

  if (cloud.status !== "signed_in") {
    return <EmptyState testID="admin-features-none" title={text.admin.noServer} />;
  }
  return (
    <Stack gap="md" testID="admin-features">
      <Text variant="body" tone="muted">
        {text.admin.subtitle}
      </Text>
      {note ? (
        <Text variant="label" tone="muted" accessibilityLiveRegion="polite" aria-live="polite">
          {note}
        </Text>
      ) : null}
      {rows ? (
        <Panel>
          {rows
            .filter((r) => !HIDDEN_FEATURES.includes(r.id))
            .map((row, i) => {
              const locked = row.state === "off_by_platform";
              const reason = row.state !== "available" ? reasonFor(text, row, true) : "";
              return (
                <View
                  key={row.id}
                  style={[
                    styles.row,
                    i > 0 ? [styles.divided, { borderTopColor: color.border }] : null,
                  ]}
                >
                  <View style={styles.toggle}>
                    <View style={styles.toggleText}>
                      <Text variant="body" weight="medium">
                        {text.name[row.id]}
                      </Text>
                      <Text variant="label" tone="muted">
                        {text.about[row.id]}
                      </Text>
                    </View>
                    <Switch
                      testID={`feature-toggle-${row.id}`}
                      accessibilityLabel={
                        locked ? `${text.name[row.id]}: ${reason}` : text.name[row.id]
                      }
                      accessibilityHint={text.about[row.id]}
                      disabled={locked}
                      value={locked ? false : row.enabled}
                      onValueChange={(v) => {
                        if (busy === null) toggle(row.id, v);
                      }}
                      trackColor={{ false: color.borderStrong, true: color.primary }}
                      thumbColor={color.surface}
                      ios_backgroundColor={color.borderStrong}
                    />
                  </View>
                  <View style={styles.facts}>
                    <Badge
                      label={text.state[row.state]}
                      tone={TONE[row.state]}
                      testID={`feature-state-${row.id}`}
                    />
                    {reason ? (
                      <Text variant="label" tone="muted">
                        {reason}
                      </Text>
                    ) : null}
                    <Text variant="label" tone="muted">
                      {`${text.admin.for}: ${row.roles.map((r) => text.admin.roles[r]).join(", ")}`}
                    </Text>
                  </View>
                </View>
              );
            })}
        </Panel>
      ) : null}
    </Stack>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.sm, gap: space.xs },
  divided: { borderTopWidth: StyleSheet.hairlineWidth },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    minHeight: minTouchTarget + space.md,
  },
  toggleText: { flex: 1, gap: 2 },
  facts: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm },
});
