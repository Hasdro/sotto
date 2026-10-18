import { Badge, Button, space, Text, useTheme } from "@sotto/ui";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useI18n } from "../../../lib/locale";
import type { Phase } from "../session";
import { clock } from "./strings";

type Props = {
  company: string;
  phase: Phase;
  mode: "fake" | "live";
  startedAt: number | null;
  endedAt: number | null;
  mock: boolean;
  onEnd: () => void;
  wide: boolean;
};

/** Company, call status with a running clock, AI mode, and End call (always in reach). */
export function CallHeader({ company, phase, mode, startedAt, endedAt, mock, onEnd, wide }: Props) {
  const { color } = useTheme();
  const { t } = useI18n();
  return (
    <View
      style={[
        styles.bar,
        { borderBottomColor: color.border, backgroundColor: color.background },
        wide ? styles.barWide : null,
      ]}
    >
      <View style={styles.titleBlock}>
        <Text
          variant={wide ? "title" : "heading"}
          weight="semibold"
          numberOfLines={2}
          accessibilityRole="header"
        >
          {company}
        </Text>
        <View style={styles.badges}>
          {phase === "live" ? (
            <Badge tone="warning" dot label={t("call.status.live")} testID="status-live" />
          ) : null}
          {phase === "ended" ? <Badge label={t("call.status.ended")} /> : null}
          {phase !== "idle" && startedAt !== null ? (
            <CallClock startedAt={startedAt} endedAt={endedAt} />
          ) : null}
          <Badge
            tone={mode === "live" ? "answer" : "holding"}
            label={t(mode === "live" ? "call.mode.live" : "call.mode.fake")}
            testID="mode-badge"
          />
          {mock ? <Badge tone="notice" label={t("call.mockBadge")} /> : null}
        </View>
      </View>
      {phase === "live" ? (
        <Button label={t("call.end")} variant="danger" onPress={onEnd} testID="end-call" />
      ) : null}
    </View>
  );
}

/** Its own component so the once-a-second tick re-renders only this text. */
function CallClock({ startedAt, endedAt }: { startedAt: number; endedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endedAt !== null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endedAt]);
  return (
    <Text variant="label" weight="medium" tone="muted" accessibilityLabel={undefined}>
      {clock((endedAt ?? now) - startedAt)}
    </Text>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
  },
  barWide: { paddingHorizontal: space.xxl, paddingVertical: space.lg },
  titleBlock: { flex: 1, gap: space.xs, minWidth: 0 },
  badges: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm },
});
