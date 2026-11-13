/**
 * After the call (W1-SPLIT, T-072): the "Call ended" panel, the Zoho writes, the review and the
 * follow-up. Moved out of app/call.tsx unchanged (same render, same testIDs) so the live call and
 * the after-call view can be owned and changed separately (wave 2: review-post-call).
 */
import { Button, Panel, Stack, space, Text } from "@sotto/ui";
import type { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import { FeatureGate } from "../../../components/FeatureGate";
import { useI18n } from "../../../lib/locale";
import { PostCallPanel } from "../../actions/PostCallPanel";
import { useAttached } from "../../crm/attached";
import { EmailAction } from "../../email";
import { CallReviewPanel } from "../../review/CallReviewPanel";
import { FollowUp } from "../../review/FollowUp";
import { WhatsAppAction } from "../../whatsapp";

type Props = {
  /** Cards shown during the call (for "n suggestions"). */
  cardCount: number;
  /** A practice call (scripted scenarios or the dev mock stream). */
  practice: boolean;
  /** The dev-only `?mock=1` stream: canned Zoho writes. */
  mock: boolean;
  callId: string | null;
  /** Dev mock: canned Zoho writes (never in a release). */
  perform?: ComponentProps<typeof PostCallPanel>["perform"] | undefined;
  onAgain: () => void;
};

export function EndedView({ cardCount, practice, mock, callId, perform, onAgain }: Props) {
  const { t } = useI18n();
  return (
    <>
      <Panel style={styles.ended} testID="call-ended">
        <View style={styles.grow}>
          <Text variant="heading" weight="semibold" accessibilityRole="header">
            {t("call.ended.title")}
          </Text>
          <Text variant="body" tone="muted">
            {t("call.ended.body", { cards: cardCount })}
          </Text>
        </View>
        <Button label={t("call.ended.again")} onPress={onAgain} />
      </Panel>
      {!practice || mock ? (
        // R12 (T-061): Zoho writes, each approved on its own card, and the follow-up slot.
        <PostCallPanel {...(perform ? { perform } : {})} slot={<MessagingSlot callId={callId} />} />
      ) : null}
      {!practice ? (
        <FeatureGate feature="call_review">
          <CallReviewPanel callId={callId} />
        </FeatureGate>
      ) : null}
      {!practice ? (
        <FeatureGate feature="follow_up">
          <FollowUp callId={callId} />
        </FeatureGate>
      ) : null}
    </>
  );
}

/** R12 (T-063/T-065): email and WhatsApp after the call, prefilled from the attached Zoho record.
 * Each action greys or hides itself from the feature map and sends only after its own confirm. */
function MessagingSlot({ callId }: { callId: string | null }) {
  const crm = useAttached();
  const person = crm.kind === "attached" ? crm.brief.person : null;
  return (
    <Stack gap="md">
      <EmailAction callId={callId} customer={{ name: person?.name, email: person?.email }} />
      <WhatsAppAction callId={callId} customer={{ name: person?.name, phone: person?.phone }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  ended: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.md },
});
