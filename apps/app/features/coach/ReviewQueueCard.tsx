/**
 * Home Review Queue card with count badge + Morning Brief card (V3, V5).
 * Mounted from `apps/app/app/home.tsx`.
 */

import { Badge, Button, Panel, Stack, space, Text } from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFeature } from "../../components/FeatureGate";
import {
  type CoachReviewItem,
  dismissReview,
  getMorningBrief,
  listReviewQueue,
  type MorningBrief,
  type MorningBriefPrefs,
  setMorningBriefPrefs,
  snoozeReview,
} from "./api";
import { useCoachText } from "./strings";
import { SafeBoundary } from "./stubs";
import { startReview, VoiceReviewHost } from "./VoiceReviewModal";

export function ReviewQueueCard() {
  return (
    <SafeBoundary name="coach.home">
      <ReviewQueueInner />
    </SafeBoundary>
  );
}

function ReviewQueueInner() {
  const tc = useCoachText();
  const briefFeature = useFeature("morning_brief");
  const [reviews, setReviews] = useState<CoachReviewItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [briefPrefs, setBriefPrefs] = useState<MorningBriefPrefs | null>(null);

  const load = useCallback(async () => {
    try {
      const q = await listReviewQueue();
      setReviews(q.reviews);
      setPendingCount(q.pending_count);
    } catch {
      // Offline or unauthenticated — keep current list.
    }
    if (briefFeature.state === "available") {
      try {
        const mb = await getMorningBrief();
        setBrief(mb.brief);
        setBriefPrefs(mb.prefs);
      } catch {
        // Ignore if server unreachable.
      }
    }
  }, [briefFeature.state]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSnooze(id: string, preset: "1h" | "tomorrow_morning") {
    try {
      await snoozeReview(id, preset, { timezone_offset_min: -new Date().getTimezoneOffset() });
      await load();
    } catch {
      // Handled gracefully.
    }
  }

  async function handleDismiss(id: string) {
    try {
      await dismissReview(id);
      await load();
    } catch {
      // Handled gracefully.
    }
  }

  async function handleToggleBrief() {
    if (!briefPrefs) return;
    try {
      const next = await setMorningBriefPrefs(!briefPrefs.enabled);
      setBriefPrefs(next);
    } catch {
      // Handled gracefully.
    }
  }

  return (
    <Stack gap="md" style={styles.container} testID="coach-home-cards">
      {briefFeature.state === "available" && brief && briefPrefs?.enabled ? (
        <Panel sunken testID="morning-brief-card">
          <Stack gap="xs">
            <View style={styles.headerRow}>
              <Text variant="label" weight="semibold" accessibilityRole="header">
                {tc("brief.title")}
              </Text>
              <Button
                variant="secondary"
                label={tc("brief.off")}
                onPress={handleToggleBrief}
                testID="morning-brief-toggle"
              />
            </View>
            <Text variant="label">{brief.content.summary_text}</Text>
          </Stack>
        </Panel>
      ) : null}

      <Panel sunken testID="review-queue-card">
        <Stack gap="sm">
          <View style={styles.headerRow}>
            <Text variant="label" weight="semibold" accessibilityRole="header">
              {tc("queue.title")}
            </Text>
            <Badge label={tc("queue.badge", { count: pendingCount })} testID="review-queue-badge" />
          </View>
          {reviews.length === 0 ? (
            <Text variant="label" tone="muted" testID="review-queue-empty">
              {tc("queue.empty")}
            </Text>
          ) : (
            reviews.map((item) => (
              <Panel key={item.id} testID={`review-item-${item.id}`}>
                <Stack gap="xs">
                  <View style={styles.headerRow}>
                    <Text variant="label" weight="semibold">
                      {item.call_id}
                    </Text>
                    {item.status === "snoozed" ? <Badge label={tc("queue.snoozed")} /> : null}
                  </View>
                  <View style={styles.actionRow}>
                    <Button
                      variant="primary"
                      label={tc("queue.start")}
                      onPress={() => startReview(item.call_id, item.id)}
                      testID={`review-start-${item.id}`}
                    />
                    <Button
                      variant="secondary"
                      label={tc("queue.snooze1h")}
                      onPress={() => handleSnooze(item.id, "1h")}
                      testID={`review-snooze-1h-${item.id}`}
                    />
                    <Button
                      variant="secondary"
                      label={tc("queue.snoozeTomorrow")}
                      onPress={() => handleSnooze(item.id, "tomorrow_morning")}
                      testID={`review-snooze-tomorrow-${item.id}`}
                    />
                    <Button
                      variant="secondary"
                      label={tc("queue.dismiss")}
                      onPress={() => handleDismiss(item.id)}
                      testID={`review-dismiss-${item.id}`}
                    />
                  </View>
                </Stack>
              </Panel>
            ))
          )}
        </Stack>
      </Panel>
      <VoiceReviewHost onCompleted={() => void load()} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
});
