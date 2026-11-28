/**
 * Admin screen for Voice Coach (V2, V4):
 * - Displays owner-configured status, monthly USD cap with estimated minutes, and current spend.
 * - Lets company admins choose whether admins may view agent post-call review transcripts
 *   (UI-015: one control naming both choices, the current one selected).
 */

import { Badge, Panel, SegmentedControl, Stack, space, Text } from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FeatureOff, useFeature } from "../../components/FeatureGate";
import { SafeBoundary } from "../../components/SafeBoundary";
import {
  type CoachSettings,
  getCoachSettings,
  setAdminTranscriptAccess,
} from "../../features/coach/api";
import { type CoachTextKey, useCoachText } from "../../features/coach/strings";

type Access = "private" | "admins";

const REASON_KEY: Record<string, CoachTextKey> = {
  ok: "admin.reason.ok",
  not_configured: "admin.reason.not_configured",
  off_by_platform: "admin.reason.off_by_platform",
  no_cap: "admin.reason.no_cap",
  cap_reached: "admin.reason.cap_reached",
};

export default function AdminCoachScreen() {
  const voiceCoach = useFeature("voice_coach");
  if (voiceCoach.state === "no_permission" || voiceCoach.state === "off_by_platform") return null;
  return (
    <SafeBoundary name="admin.coach">
      <AdminCoachInner featureOff={voiceCoach.state !== "available" ? voiceCoach : null} />
    </SafeBoundary>
  );
}

function AdminCoachInner({ featureOff }: { featureOff: ReturnType<typeof useFeature> | null }) {
  const tc = useCoachText();
  const [settings, setSettings] = useState<CoachSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  async function chooseAccess(next: Access) {
    const allow = next === "admins";
    if (!settings || saving || featureOff || allow === settings.allow_admin_transcript) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await setAdminTranscriptAccess(allow);
      setSettings((prev) =>
        prev ? { ...prev, allow_admin_transcript: res.allow_admin_transcript } : prev,
      );
    } catch {
      setErrorMsg(tc("admin.error"));
    } finally {
      setSaving(false);
    }
  }

  const statusReason = settings?.reason ?? "not_configured";
  const reasonLabel = REASON_KEY[statusReason] ? tc(REASON_KEY[statusReason]) : statusReason;

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
      {errorMsg ? (
        <Text
          variant="label"
          tone="muted"
          accessibilityLiveRegion="polite"
          testID="admin-coach-error"
        >
          {errorMsg}
        </Text>
      ) : null}

      <Panel sunken testID="admin-coach-cap">
        <Stack gap="sm">
          <View style={styles.row}>
            <Text variant="label" weight="semibold">
              {tc("admin.status")}
            </Text>
            <Badge label={reasonLabel} />
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
          <SegmentedControl<Access>
            options={[
              { value: "private", label: tc("admin.transcriptOff") },
              { value: "admins", label: tc("admin.transcriptOn") },
            ]}
            value={settings?.allow_admin_transcript ? "admins" : "private"}
            onChange={(v) => void chooseAccess(v)}
            disabled={!settings || saving || Boolean(featureOff)}
            accessibilityLabel={tc("admin.transcriptTitle")}
            testID="admin-coach-transcript"
          />
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
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
});
