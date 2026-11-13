/**
 * After the call (UX-04): one short review line, one checklist of suggested Zoho updates
 * (nothing pre-ticked, one save), one follow-up card, then a clear done state. Cards and the
 * transcript live in History detail. "Start another call" stays secondary while an item is
 * still open (UX-24) and becomes the primary action once everything is saved or skipped.
 */
import { Button, Panel, Stack, space, Text } from "@sotto/ui";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FeatureGate } from "../../../components/FeatureGate";
import { useReview } from "../../../lib/deviceHistory";
import { useI18n } from "../../../lib/locale";
import type { Perform } from "../../actions/ActionCard";
import { AfterCallChecklist, type SaveLog } from "../../actions/AfterCallChecklist";
import { ZohoGate } from "../../actions/PostCallPanel";
import { CallReviewPanel } from "../../review/CallReviewPanel";
import { FollowUp } from "../../review/FollowUp";
import { useReviewText } from "../../review/strings";

type Props = {
  /** Cards shown during the call (for "n suggestions"). */
  cardCount: number;
  /** A practice call (scripted scenarios or the dev mock stream). */
  practice: boolean;
  /** The dev-only `?mock=1` stream: canned Zoho writes. */
  mock: boolean;
  callId: string | null;
  /** Dev mock: canned Zoho writes (never in a release). */
  perform?: Perform | undefined;
  /** Tests: the call-log write. */
  saveLog?: SaveLog | undefined;
  onAgain: () => void;
};

export function EndedView({ cardCount, practice, mock, callId, perform, saveLog, onAgain }: Props) {
  const { t } = useI18n();
  const rt = useReviewText();
  const review = useReview(callId);
  const [openUpdates, setOpenUpdates] = useState(0);
  const [openFollowUp, setOpenFollowUp] = useState(0);
  const onUpdates = useCallback((n: number) => setOpenUpdates(n), []);
  const onFollowUp = useCallback((n: number) => setOpenFollowUp(n), []);
  const open = openUpdates + openFollowUp;
  const showUpdates = (!practice || mock) && callId;
  return (
    <Stack gap="md" testID="after-call">
      <Panel style={styles.ended} testID="call-ended">
        <View style={styles.grow}>
          <Text variant="heading" weight="semibold" accessibilityRole="header">
            {t("call.ended.title")}
          </Text>
          <Text variant="body" tone="muted">
            {t("call.ended.body", { cards: cardCount })}
          </Text>
        </View>
        {callId && !practice ? (
          <Button
            variant="ghost"
            label={rt("after.inHistory")}
            onPress={() => router.push(`/history/${callId}`)}
            testID="after-history"
          />
        ) : null}
      </Panel>
      {!practice ? (
        <FeatureGate feature="call_review">
          <CallReviewPanel callId={callId} />
        </FeatureGate>
      ) : null}
      {showUpdates ? (
        // R12, D-044: each ticked row is its own approval and its own idempotent write.
        <ZohoGate>
          <AfterCallChecklist
            callId={callId}
            review={review.status === "ready" ? review.review : null}
            {...(perform ? { perform } : {})}
            {...(saveLog ? { saveLog } : {})}
            onOpenChange={onUpdates}
          />
        </ZohoGate>
      ) : null}
      {!practice ? (
        <FeatureGate feature="follow_up">
          <FollowUp callId={callId} auto onOpenChange={onFollowUp} />
        </FeatureGate>
      ) : null}
      <View style={styles.again} testID={`after-again-${open > 0 ? "secondary" : "primary"}`}>
        {open === 0 && !practice ? (
          <Text variant="body" weight="semibold" testID="after-all-done">
            {rt("after.allDone")}
          </Text>
        ) : null}
        <View style={styles.grow} />
        <Button
          variant={open > 0 ? "secondary" : "primary"}
          label={t("call.ended.again")}
          onPress={onAgain}
          testID="call-again"
        />
      </View>
    </Stack>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  ended: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.md },
  again: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.md },
});
