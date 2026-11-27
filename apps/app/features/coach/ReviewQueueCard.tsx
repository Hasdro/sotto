/**
 * Home Review Queue card with count badge + Morning Brief card (V3, V5).
 * Mounted from `apps/app/app/home.tsx`; Home places it above Recent calls (UX-003).
 */

import { Badge, Button, Panel, Stack, space, Text } from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFeature } from "../../components/FeatureGate";
import { SafeBoundary } from "../../components/SafeBoundary";
import { useI18n } from "../../lib/locale";
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
import { briefLines } from "./brief";
import { useCoachText } from "./strings";
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
  const { locale } = useI18n();
  const briefFeature = useFeature("morning_brief");
  const reviewFeature = useFeature("call_review");
  const voiceFeature = useFeature("voice_coach");
  const reviewsAllowed = reviewFeature.state === "available" || voiceFeature.state === "available";
  const [reviews, setReviews] = useState<CoachReviewItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [briefPrefs, setBriefPrefs] = useState<MorningBriefPrefs | null>(null);

  const load = useCallback(async () => {
    if (reviewsAllowed) {
      try {
        const q = await listReviewQueue();
        setReviews(q.reviews);
        setPendingCount(q.pending_count);
      } catch {
        // Offline or unauthenticated — keep current list.
      }
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
  }, [briefFeature.state, reviewsAllowed]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!reviewsAllowed && briefFeature.state !== "available") return null;

  async function handleSnooze(id: string, preset: "1h" | "tomorrow_morning" | "custom") {
    try {
      await snoozeReview(id, preset, {
        ...(preset === "custom" ? { until_ms: Date.now() + 3 * 3600_000 } : {}),
        timezone_offset_min: -new Date().getTimezoneOffset(),
      });
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
    <Stack gap="md" testID="coach-home-cards">
      {briefFeature.state === "available" && briefPrefs ? (
        <Panel sunken testID="morning-brief-card">
          <Stack gap="xs">
            <View style={styles.headerRow}>
              <Text variant="label" weight="semibold" accessibilityRole="header">
                {tc("brief.title")}
              </Text>
              <Button
                variant="outline"
                label={briefPrefs.enabled ? tc("brief.off") : tc("brief.on")}
                onPress={handleToggleBrief}
                testID="morning-brief-toggle"
              />
            </View>
            {briefPrefs.enabled && brief
              ? briefLines(brief.content, tc, locale).map((line) => (
                  <Text key={line} variant="label" testID="morning-brief-line">
                    {line}
                  </Text>
                ))
              : null}
          </Stack>
        </Panel>
      ) : null}

      {reviewsAllowed ? (
        <Panel sunken testID="review-queue-card">
          <Stack gap="sm">
            <View style={styles.headerRow}>
              <Text variant="label" weight="semibold" accessibilityRole="header">
                {tc("queue.title")}
              </Text>
              <Badge
                label={tc("queue.badge", { count: pendingCount })}
                testID="review-queue-badge"
              />
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
                        label={tc("queue.snoozePick")}
                        onPress={() => handleSnooze(item.id, "custom")}
                        testID={`review-snooze-custom-${item.id}`}
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
      ) : null}
      <VoiceReviewHost onCompleted={() => void load()} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  // Wraps instead of squeezing the title when the card is narrow (Home's side column, UX-003).
  headerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
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
