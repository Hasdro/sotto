/**
 * Offline banner (S4): shown when network calls fail with offline/timeout or when queued outbox
 * items are waiting to send once the connection returns.
 */
import { Button, radius, space, Text, useTheme } from "@sotto/ui";
import { type ReactNode, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import * as cloud from "../lib/cloud";
import { flushOutbox, outboxCount, subscribeOutbox } from "../lib/outbox";

const noopSub = () => () => {};
const getOffline = () => (typeof cloud.isOffline === "function" ? cloud.isOffline() : false);
const subOffline = (fn: () => void) =>
  typeof cloud.subscribeOffline === "function" ? cloud.subscribeOffline(fn) : noopSub();

export function useOfflineBanner(): ReactNode {
  const offline = useSyncExternalStore(subOffline, getOffline, getOffline);
  const queued = useSyncExternalStore(subscribeOutbox, outboxCount, outboxCount);
  if (!offline && queued === 0) return null;
  return <OfflineBanner offline={offline} queued={queued} />;
}

export function OfflineBanner({ offline, queued }: { offline: boolean; queued: number }) {
  const { color } = useTheme();
  const text = offline
    ? queued > 0
      ? `You're offline — ${queued} queued item${queued === 1 ? "" : "s"} will send when you're back online.`
      : "You're offline — follow-ups and feedback will queue and send when you're back online."
    : `${queued} queued item${queued === 1 ? "" : "s"} waiting to send.`;
  return (
    <View
      testID="offline-banner"
      accessibilityRole="alert"
      style={[
        styles.bar,
        { backgroundColor: color.noticeFill, borderColor: color.noticeBorder },
      ]}
    >
      <Text variant="label" weight="medium" color={color.noticeText} style={styles.text}>
        {text}
      </Text>
      {queued > 0 && !offline ? (
        <Button
          variant="ghost"
          label="Send now"
          onPress={() => void flushOutbox()}
          testID="offline-flush"
        />
      ) : null}
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
    paddingEnd: space.sm,
    paddingVertical: space.xs,
    borderWidth: 1,
    borderRadius: radius.xl,
  },
  text: { flexShrink: 1 },
});
