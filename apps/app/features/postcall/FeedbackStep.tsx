/**
 * Step 5 of the Post-Call Wizard (Round 4, A2): Card feedback + whole-call feedback box.
 * - Only AI advice cards are rateable (R11).
 * - Each card has thumbs up/down, Round 4 reason chips (too long, too formal, wrong, not relevant),
 *   and an optional per-card note.
 * - Prominent whole-call feedback box ("What should the AI do differently?") supporting OS dictation.
 * - Everything submits via `submitFeedbackOrQueue` (server `add_feedback` or offline outbox) and
 *   triggers the background merge job, surfacing a "Learned N new things – view" toast.
 */
import {
  Button,
  IconButton,
  minTouchTarget,
  Panel,
  radius,
  Stack,
  space,
  Text,
  TextField,
  Toast,
  useTheme,
} from "@sotto/ui";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { CardView } from "../cards/reducer";
import {
  type CanonicalReason,
  isRateable,
  type Rating,
  REASONS_FOR,
  rateCard,
} from "../rating/ratings";
import { memoryApi, submitFeedbackOrQueue } from "./api";
import { type PostCallKey, usePostCallText } from "./strings";

type CardDraft = {
  rating: Rating | null;
  reasons: CanonicalReason[];
  note: string;
};

export type FeedbackStepProps = {
  callId: string | null;
  /** All cards from the call; non-AI cards (playbook/holding) are filtered out per R11. */
  cards: readonly CardView[];
  onSubmitted?: (result: { queued: boolean; learnedCount: number }) => void;
};

const REASON_KEY: Record<CanonicalReason, PostCallKey> = {
  too_long: "feedback.reason.too_long",
  too_formal: "feedback.reason.too_formal",
  wrong: "feedback.reason.wrong",
  not_relevant: "feedback.reason.not_relevant",
  good_phrasing: "feedback.reason.good_phrasing",
};

export function FeedbackStep({ callId, cards, onSubmitted }: FeedbackStepProps) {
  const ft = usePostCallText();
  const { color } = useTheme();
  const rateable = cards.filter((c) => c.done && isRateable(c));
  const [drafts, setDrafts] = useState<Record<string, CardDraft>>({});
  const [callNote, setCallNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [learnedCount, setLearnedCount] = useState(0);

  const draftOf = (id: string): CardDraft =>
    drafts[id] ?? { rating: null, reasons: [], note: "" };

  const setCardDraft = (id: string, patch: Partial<CardDraft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...draftOf(id), ...patch } }));

  const toggleReason = (id: string, reason: CanonicalReason) => {
    const cur = draftOf(id);
    const has = cur.reasons.includes(reason);
    setCardDraft(id, {
      reasons: has ? cur.reasons.filter((r) => r !== reason) : [...cur.reasons, reason],
    });
  };

  const handleSubmit = async () => {
    setBusy(true);
    setStatusMsg(null);
    let anyQueued = false;
    let submittedAny = false;
    try {
      for (const card of rateable) {
        const d = drafts[card.id];
        if (!d || (!d.rating && !d.note.trim())) continue;
        submittedAny = true;
        if (d.rating) {
          rateCard(card, d.rating, d.reasons, d.note);
        }
        const res = await submitFeedbackOrQueue({
          call_id: callId,
          source: "card",
          rating: d.rating,
          reasons: d.reasons,
          note: d.note.trim() || null,
          card_id: card.id,
        });
        if (res.queued) anyQueued = true;
      }
      if (callNote.trim()) {
        submittedAny = true;
        const res = await submitFeedbackOrQueue({
          call_id: callId,
          source: "call_note",
          rating: null,
          reasons: [],
          note: callNote.trim(),
        });
        if (res.queued) anyQueued = true;
      }

      let learned = 0;
      if (submittedAny && !anyQueued) {
        try {
          const merged = await memoryApi.merge(callId);
          learned = merged.learned_count;
          setLearnedCount(learned);
        } catch {
          // Raw feedback is already saved on the server; background retry handles merge failures.
        }
      }
      setStatusMsg(anyQueued ? ft("feedback.queuedOffline") : ft("feedback.saved"));
      onSubmitted?.({ queued: anyQueued, learnedCount: learned });
    } finally {
      setBusy(false);
    }
  };

  const hasInput =
    Boolean(callNote.trim()) ||
    Object.values(drafts).some((d) => d.rating !== null || Boolean(d.note.trim()));

  return (
    <Stack gap="md" testID="wizard-feedback-step">
      <View style={styles.header}>
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {ft("feedback.heading")}
        </Text>
        <Text variant="body" tone="muted">
          {ft("feedback.subheading")}
        </Text>
      </View>

      {learnedCount > 0 ? (
        <Toast
          testID="feedback-learned-toast"
          title={
            learnedCount === 1
              ? ft("feedback.learnedOne")
              : ft("feedback.learnedToast", { count: learnedCount })
          }
          action={{
            label: ft("memory.title"),
            onPress: () => router.push("/admin/memory"),
          }}
        />
      ) : null}

      <Panel testID="feedback-whole-call">
        <TextField
          testID="feedback-call-note"
          label={ft("feedback.callNoteLabel")}
          placeholder={ft("feedback.callNotePlaceholder")}
          value={callNote}
          onChangeText={setCallNote}
          multiline
        />
      </Panel>

      {rateable.length === 0 ? (
        <Panel testID="feedback-no-cards">
          <Text variant="body" tone="muted">
            {ft("feedback.noCards")}
          </Text>
        </Panel>
      ) : (
        <Stack gap="sm">
          {rateable.map((card) => {
            const d = draftOf(card.id);
            const reasons = d.rating ? REASONS_FOR[d.rating] : [];
            return (
              <Panel key={card.id} testID={`feedback-card-${card.id}`}>
                <Stack gap="sm">
                  <Text variant="body">{card.text}</Text>
                  <View style={styles.row} accessibilityRole="toolbar">
                    <IconButton
                      testID={`fb-up-${card.id}`}
                      icon="check"
                      label={ft("feedback.reason.good_phrasing")}
                      selected={d.rating === "up"}
                      outlined
                      onPress={() =>
                        setCardDraft(card.id, {
                          rating: d.rating === "up" ? null : "up",
                          reasons: [],
                        })
                      }
                    />
                    <IconButton
                      testID={`fb-down-${card.id}`}
                      icon="close"
                      label={ft("feedback.reason.wrong")}
                      selected={d.rating === "down"}
                      outlined
                      onPress={() =>
                        setCardDraft(card.id, {
                          rating: d.rating === "down" ? null : "down",
                          reasons: [],
                        })
                      }
                    />
                  </View>
                  {reasons.length > 0 ? (
                    <View style={styles.row}>
                      {reasons.map((reason) => {
                        const on = d.reasons.includes(reason);
                        return (
                          <Pressable
                            key={reason}
                            testID={`fb-reason-${reason}-${card.id}`}
                            onPress={() => toggleReason(card.id, reason)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}
                            aria-checked={on}
                            style={({ pressed }) => [
                              styles.chip,
                              {
                                borderColor: on ? color.primary : color.border,
                                backgroundColor: on ? color.surfaceSunken : "transparent",
                                opacity: pressed ? 0.8 : 1,
                              },
                            ]}
                          >
                            <Text
                              variant="label"
                              weight={on ? "semibold" : "medium"}
                              tone={on ? "primary" : "muted"}
                            >
                              {ft(REASON_KEY[reason])}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                  <TextField
                    testID={`fb-note-${card.id}`}
                    label={ft("feedback.cardNoteLabel")}
                    placeholder={ft("feedback.cardNotePlaceholder")}
                    value={d.note}
                    onChangeText={(txt) => setCardDraft(card.id, { note: txt })}
                  />
                </Stack>
              </Panel>
            );
          })}
        </Stack>
      )}

      {statusMsg ? (
        <Text
          variant="label"
          tone="muted"
          accessibilityLiveRegion="polite"
          aria-live="polite"
          testID="feedback-status"
        >
          {statusMsg}
        </Text>
      ) : null}

      <View style={styles.submitRow}>
        <Button
          testID="feedback-submit"
          label={busy ? ft("feedback.saving") : ft("feedback.submit")}
          disabled={busy || !hasInput}
          onPress={() => void handleSubmit()}
        />
      </View>
    </Stack>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  submitRow: { flexDirection: "row", justifyContent: "flex-end" },
  chip: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
