/**
 * Admin screen for Voice Coach (V2, V4):
 * - Displays owner-configured status, monthly USD cap with estimated minutes, and current spend.
 * - Lets company admins toggle whether admins may view agent post-call review transcripts.
 */

import { Badge, Button, Panel, Stack, space, Text } from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FeatureOff, useFeature } from "../../components/FeatureGate";
import {
  type CoachSettings,
  getCoachSettings,
  setAdminTranscriptAccess,
} from "../../features/coach/api";
import { useCoachText } from "../../features/coach/strings";
import { SafeBoundary } from "../../features/coach/stubs";

export default function AdminCoachScreen() {
  const voiceCoach = useFeature("voice_coach");
  if (voiceCoach.state === "no_permission") return null;
  return (
    <SafeBoundary name="admin.coach">
      <AdminCoachInner featureOff={voiceCoach.state !== "available" ? voiceCoach : null} />
    </SafeBoundary>
  );
}

function AdminCoachInner({
  featureOff,
}: {
  featureOff: ReturnType<typeof useFeature> | null;
}) {
  const tc = useCoachText();
  const [settings, setSettings] = useState<CoachSettings | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setSettings(await getCoachSettings());
    } catch {
      // Offline or unconfigured.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleTranscripts() {
    if (!settings || saving) return;
    setSaving(true);
    try {
      const res = await setAdminTranscriptAccess(!settings.allow_admin_transcript);
      setSettings((prev) =>
        prev ? { ...prev, allow_admin_transcript: res.allow_admin_transcript } : prev,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="md" style={styles.page} testID="admin-coach-screen">
      <Stack gap="xs">
        <Text variant="title" weight="semibold" accessibilityRole="header">
          {tc("admin.title")}
        </Text>
        <Text variant="label" tone="muted">
          {tc("admin.subtitle")}
        </Text>
      </Stack>

      {featureOff ? <FeatureOff feature="voice_coach" effective={featureOff} /> : null}

      <Panel sunken testID="admin-coach-cap">
        <Stack gap="sm">
          <View style={styles.row}>
            <Text variant="label" weight="semibold">
              {tc("admin.status")}
            </Text>
            <Badge label={settings?.reason ?? "not_configured"} />
          </View>
          <View style={styles.row}>
            <Text variant="label" tone="muted">
              {tc("admin.cap")}
            </Text>
            <Text variant="label" weight="semibold">
              {settings?.cap_usd != null
                ? `$${settings.cap_usd.toFixed(2)} / mo (${settings.cap_minutes ?? 0} min)`
                : tc("admin.noCap")}
            </Text>
          </View>
          <View style={styles.row}>
            <Text variant="label" tone="muted">
              {tc("admin.spend")}
            </Text>
            <Text variant="label">
              {settings
                ? `$${settings.spend_usd.toFixed(2)} (${settings.used_minutes.toFixed(1)} min)`
                : "—"}
            </Text>
          </View>
        </Stack>
      </Panel>

      <Panel sunken testID="admin-coach-transcript-setting">
        <Stack gap="sm">
          <Text variant="label" weight="semibold">
            {tc("admin.transcriptTitle")}
          </Text>
          <Text variant="label" tone="muted">
            {tc("admin.transcriptDesc")}
          </Text>
          <View style={styles.row}>
            <Badge
              label={
                settings?.allow_admin_transcript
                  ? tc("admin.transcriptOn")
                  : tc("admin.transcriptOff")
              }
            />
            <Button
              variant="secondary"
              label={
                settings?.allow_admin_transcript
                  ? tc("admin.transcriptOff")
                  : tc("admin.transcriptOn")
              }
              onPress={toggleTranscripts}
              disabled={!settings || saving}
              testID="admin-coach-transcript-toggle"
            />
          </View>
        </Stack>
      </Panel>
    </Stack>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingVertical: space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
});
