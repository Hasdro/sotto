import {
  Badge,
  Button,
  Icon,
  minTouchTarget,
  radius,
  size,
  space,
  Text,
  useTheme,
} from "@sotto/ui";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SourceChip } from "../../../components/SourceChip";
import { useCallSource } from "../../../lib/callSource";
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
  /** The context rail (transcript, notes; later prep and CRM): collapsed by default (T-050). */
  rail?: { open: boolean; onToggle: () => void } | null;
};

/**
 * Company, call status with a running clock, AI mode, the one context-rail toggle, and End call
 * (always in reach). The status is plain text with one warm dot, not a row of pills (T-050).
 */
export function CallHeader({
  company,
  phase,
  mode,
  startedAt,
  endedAt,
  mock,
  onEnd,
  wide,
  rail = null,
}: Props) {
  const { color } = useTheme();
  const { t } = useI18n();
  const source = useCallSource();
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
            <View style={styles.status} testID="status-live">
              <View style={[styles.liveDot, { backgroundColor: color.signal }]} />
              <Text variant="label" weight="semibold" color={color.signal}>
                {t("call.status.live")}
              </Text>
            </View>
          ) : null}
          {phase === "ended" ? (
            <Text variant="label" weight="semibold" tone="muted">
              {t("call.status.ended")}
            </Text>
          ) : null}
          {phase !== "idle" && source ? <SourceChip source={source} /> : null}
          {phase !== "idle" && startedAt !== null ? (
            <CallClock startedAt={startedAt} endedAt={endedAt} />
          ) : null}
          <Text variant="label" tone="muted" testID="mode-badge">
            {t(mode === "live" ? "call.mode.live" : "call.mode.fake")}
          </Text>
          {mock ? <Badge tone="notice" label={t("call.mockBadge")} /> : null}
        </View>
      </View>
      {rail ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(rail.open ? "call.rail.hide" : "call.rail.show")}
          accessibilityState={{ expanded: rail.open }}
          aria-expanded={rail.open}
          onPress={rail.onToggle}
          testID="rail-toggle"
          style={({ pressed }) => [
            styles.railToggle,
            {
              borderColor: color.borderStrong,
              backgroundColor: rail.open ? color.surfaceSunken : "transparent",
            },
            pressed ? styles.pressed : null,
          ]}
        >
          {/* A panel glyph: two columns, the end one is the rail. */}
          <View style={[styles.railGlyph, { borderColor: color.text }]}>
            <View
              style={[
                styles.railGlyphPane,
                { borderStartColor: color.text },
                rail.open ? { backgroundColor: color.text } : null,
              ]}
            />
          </View>
        </Pressable>
      ) : null}
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
  const { color } = useTheme();
  return (
    <View style={styles.clock}>
      <Icon name="timer" size={14} color={color.textMuted} />
      <Text variant="label" weight="medium" tone="muted">
        {clock((endedAt ?? now) - startedAt)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: "row", alignItems: "center", gap: space.xs },
  liveDot: { width: size.dot, height: size.dot, borderRadius: radius.pill },
  railToggle: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  railGlyph: {
    width: 20,
    height: 16,
    borderWidth: size.stroke,
    borderRadius: 3,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  railGlyphPane: { width: 7, borderStartWidth: size.stroke },
  pressed: { opacity: 0.8 },
  clock: { flexDirection: "row", alignItems: "center", gap: 4 },
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
