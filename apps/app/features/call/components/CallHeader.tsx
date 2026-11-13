import {
  Badge,
  Button,
  Icon,
  minTouchTarget,
  radius,
  size,
  space,
  Text,
  useFocusRing,
  useGlassStyle,
  useTheme,
} from "@sotto/ui";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SourceChip } from "../../../components/SourceChip";
import { useCallSource } from "../../../lib/callSource";
import { useI18n } from "../../../lib/locale";
import { demoEnabled } from "../devGate";
import type { Phase } from "../session";
import { useCallText } from "../strings";
import { clock } from "./strings";

type Props = {
  company: string;
  phase: Phase;
  /** Shown only in the live dot's tooltip (UX-06a). */
  mode: "fake" | "live";
  /** A practice call (scripted scenarios or the dev mock): the only mode word in the header. */
  practice?: boolean;
  startedAt: number | null;
  endedAt: number | null;
  mock: boolean;
  onEnd: () => void;
  wide: boolean;
  /** The context rail (transcript, notes; later prep and CRM): collapsed by default (T-050). */
  rail?: { open: boolean; onToggle: () => void } | null;
};

/**
 * The context-rail toggle with its visible label on the start side, then company, status with a
 * running clock, and End call alone on the end side (UX-15). The status is plain text with one
 * warm dot (T-050); the AI mode lives in that dot's tooltip, and "Practice" is the only mode word
 * shown, on practice calls (UX-06a). The mock badge needs the dev gate as well as `mock`.
 */
export function CallHeader({
  company,
  phase,
  mode,
  practice = false,
  startedAt,
  endedAt,
  mock,
  onEnd,
  wide,
  rail = null,
}: Props) {
  const { color } = useTheme();
  const { t } = useI18n();
  const ct = useCallText();
  const source = useCallSource();
  return (
    <View style={[styles.bar, { backgroundColor: color.background }, wide ? styles.barWide : null]}>
      {rail ? <RailToggle open={rail.open} onToggle={rail.onToggle} /> : null}
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
            <LiveStatus
              tip={`${t(mode === "live" ? "call.mode.live" : "call.mode.fake")} · ${t(
                mode === "live" ? "call.mode.liveHint" : "call.mode.fakeHint",
              )}`}
            />
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
          {practice ? (
            <Text variant="label" weight="medium" tone="muted" testID="practice-label">
              {ct("call.practice")}
            </Text>
          ) : null}
          {mock && demoEnabled() ? (
            <Badge tone="notice" label={t("call.mockBadge")} testID="mock-badge" />
          ) : null}
        </View>
      </View>
      {phase === "live" ? (
        <Button label={t("call.end")} variant="danger" onPress={onEnd} testID="end-call" />
      ) : null}
    </View>
  );
}

/** "Live" with its dot; hover or focus shows the AI mode (UX-06a). */
function LiveStatus({ tip }: { tip: string }) {
  const { color } = useTheme();
  // Floating chrome (D-041): the tooltip is glass.
  const glass = useGlassStyle();
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <Pressable
      testID="status-live"
      accessibilityRole="text"
      accessibilityLabel={t("call.status.live")}
      accessibilityHint={tip}
      onHoverIn={() => setShown(true)}
      onHoverOut={() => setShown(false)}
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
      style={[styles.status, { backgroundColor: color.signalFill }]}
    >
      <View style={[styles.liveDot, { backgroundColor: color.signal }]} />
      <Text variant="label" weight="medium" color={color.onSignalFill}>
        {t("call.status.live")}
      </Text>
      {shown ? (
        <View testID="live-tooltip" pointerEvents="none" style={[styles.tip, glass]}>
          <Text variant="label">{tip}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** UX-15: a labelled toggle on the start side, away from End call. */
function RailToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { color } = useTheme();
  const { t } = useI18n();
  const ct = useCallText();
  const focus = useFocusRing();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={ct("call.rail.label")}
      accessibilityHint={t(open ? "call.rail.hide" : "call.rail.show")}
      accessibilityState={{ expanded: open }}
      aria-expanded={open}
      onPress={onToggle}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      testID="rail-toggle"
      style={({ pressed }) => [
        styles.railToggle,
        // The neutral chip (D-041): gray fill, darker when the rail is open; no outline.
        { backgroundColor: open ? color.bubble : color.surfaceSunken },
        pressed ? styles.pressed : null,
        focus.ring,
      ]}
    >
      {/* A panel glyph: two columns, the end one is the rail. */}
      <View style={[styles.railGlyph, { borderColor: color.text }]}>
        <View
          style={[
            styles.railGlyphPane,
            { borderStartColor: color.text },
            open ? { backgroundColor: color.text } : null,
          ]}
        />
      </View>
      <Text variant="label" weight="medium">
        {ct("call.rail.label")}
      </Text>
    </Pressable>
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
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 2,
    minHeight: 28,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  liveDot: { width: size.dot, height: size.dot, borderRadius: radius.pill },
  railToggle: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  tip: {
    position: "absolute",
    top: "100%",
    start: 0,
    marginTop: space.xs,
    zIndex: 10,
    minWidth: 220,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
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
  },
  barWide: { paddingHorizontal: space.xxl, paddingVertical: space.lg },
  titleBlock: { flex: 1, gap: space.xs, minWidth: 0 },
  badges: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm },
});
