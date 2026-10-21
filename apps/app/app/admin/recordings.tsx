/** Admin → Recordings (owner, 22 Oct): the team's uploaded calls of the last 30 days, newest
 * first, each with its agent, source, date, length and chance to close; press one to listen. */
import { Button, EmptyState, Panel, Stack, space, Text, useTheme } from "@sotto/ui";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { RecordingPlayer } from "../../features/history/RecordingPlayer";
import type { UsageRow } from "../../features/reports/data";
import { isCallSource, SOURCE_META } from "../../lib/callSource";
import { cloudApi } from "../../lib/cloud";
import { formatDate, formatTime } from "../../lib/format";
import { useI18n } from "../../lib/locale";

type Row = UsageRow & { recording_bytes?: number | null };

export default function RecordingsScreen() {
  const { t, locale } = useI18n();
  const { color } = useTheme();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    cloudApi<{ calls: Row[] }>("/api/v1/company/usage?days=30")
      .then((r) => setRows(r.calls.filter((c) => (c.recording_bytes ?? 0) > 0)))
      .catch(() => setRows([]));
  }, []);
  if (rows === null) return null;
  if (!rows.length) {
    return <EmptyState title={t("admin.rec.none.title")} body={t("admin.rec.none.body")} />;
  }
  return (
    <Stack gap="md" testID="admin-recordings">
      <Text variant="body" tone="muted">
        {t("admin.rec.subtitle")}
      </Text>
      <Panel>
        {rows.map((r, i) => {
          const callId = r.id.slice(r.id.indexOf(":") + 1);
          const meta = SOURCE_META[isCallSource(r.source) ? r.source : "computer"];
          const iso = new Date(r.started_at).toISOString();
          return (
            <View
              key={r.id}
              style={[
                styles.row,
                i > 0 ? { borderTopColor: color.border, borderTopWidth: 1 } : null,
              ]}
            >
              <View style={styles.line}>
                <Text variant="heading">{meta.icon}</Text>
                <View style={styles.grow}>
                  <Text weight="semibold" numberOfLines={1}>
                    {r.name || r.email}
                  </Text>
                  <Text variant="label" tone="muted">
                    {`📅 ${formatDate(iso, locale)}  🕒 ${formatTime(iso, locale)}  ⏳ ${Math.max(1, Math.round(r.duration_s / 60))} min${r.review ? `  🎯 ${r.review.success}%` : ""}`}
                  </Text>
                </View>
                <Button
                  variant={open === callId ? "secondary" : "primary"}
                  label={open === callId ? t("admin.rec.hide") : t("admin.rec.listen")}
                  onPress={() => setOpen(open === callId ? null : callId)}
                  testID={`listen-${callId}`}
                />
              </View>
              {open === callId ? <RecordingPlayer callId={callId} /> : null}
            </View>
          );
        })}
      </Panel>
    </Stack>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.md, gap: space.sm },
  line: { flexDirection: "row", alignItems: "center", gap: space.md },
  grow: { flex: 1, minWidth: 0 },
});
