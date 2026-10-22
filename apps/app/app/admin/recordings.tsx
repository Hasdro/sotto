/** Admin → Recordings (owner, 22 Oct): the team's uploaded calls of the last 30 days, newest
 * first, each with its agent, source, date, length and chance to close; press one to listen. */
import {
  Button,
  EmptyState,
  Icon,
  type IconName,
  Panel,
  Stack,
  space,
  Text,
  useTheme,
} from "@sotto/ui";
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
                <Icon name={meta.icon} size={22} color={color.textMuted} />
                <View style={styles.grow}>
                  <Text weight="semibold" numberOfLines={1}>
                    {r.name || r.email}
                  </Text>
                  <View style={styles.facts}>
                    <Fact icon="calendar" text={formatDate(iso, locale)} />
                    <Fact icon="clock" text={formatTime(iso, locale)} />
                    <Fact
                      icon="timer"
                      text={t("history.minutes", {
                        count: Math.max(1, Math.round(r.duration_s / 60)),
                      })}
                    />
                    {r.review ? <Fact icon="target" text={`${r.review.success}%`} /> : null}
                  </View>
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

function Fact({ icon, text }: { icon: IconName; text: string }) {
  const { color } = useTheme();
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={14} color={color.textMuted} />
      <Text variant="label" tone="muted">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.md, gap: space.sm },
  line: { flexDirection: "row", alignItems: "center", gap: space.md },
  grow: { flex: 1, minWidth: 0 },
  facts: { flexDirection: "row", flexWrap: "wrap", columnGap: space.md, rowGap: 2 },
  fact: { flexDirection: "row", alignItems: "center", gap: 4 },
});
