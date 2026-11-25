/**
 * Post-call Voice Coach Review modal & `startReview(callId)` entry point (V1, V4).
 *
 * - Exported `startReview(callId)` lets Agent 2's post-call wizard ("Talk it through") and the
 *   Home Review Queue launch the exact same review screen.
 * - <= 3 minutes (180 s), interruptible, with text fallback in the exact same screen.
 * - Ends with "Anything I should remember for next time?" -> feeds Agent 2 style memory via
 *   `/api/v1/coach/reviews/{id}/complete`.
 */

import { Badge, Button, Panel, Sheet, Stack, space, Text, TextField, useTheme } from "@sotto/ui";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFeature } from "../../components/FeatureGate";
import { completeReview } from "./api";
import { useCoachText } from "./strings";
import { enqueue, logEvent, SafeBoundary } from "./stubs";

const MAX_REVIEW_S = 180;

type Listener = (target: { callId: string; reviewId?: string } | null) => void;
const listeners = new Set<Listener>();
let activeTarget: { callId: string; reviewId?: string } | null = null;

/** Public entry point exported for Agent 2's post-call wizard and the Home Review Queue. */
export function startReview(callId: string, reviewId?: string): void {
  activeTarget = { callId, reviewId };
  for (const fn of listeners) fn(activeTarget);
  logEvent("coach_review", "opened", { has_review_id: Boolean(reviewId) });
}

export function closeReview(): void {
  activeTarget = null;
  for (const fn of listeners) fn(null);
}

export function VoiceReviewHost({ onCompleted }: { onCompleted?: () => void }) {
  const [target, setTarget] = useState<{ callId: string; reviewId?: string } | null>(activeTarget);
  useEffect(() => {
    listeners.add(setTarget);
    return () => {
      listeners.delete(setTarget);
    };
  }, []);
  if (!target) return null;
  return (
    <SafeBoundary name="coach.review">
      <VoiceReviewModal
        callId={target.callId}
        reviewId={target.reviewId ?? target.callId}
        onClose={() => {
          closeReview();
          onCompleted?.();
        }}
      />
    </SafeBoundary>
  );
}

export function VoiceReviewModal({
  callId,
  reviewId,
  onClose,
}: {
  callId: string;
  reviewId: string;
  onClose: () => void;
}) {
  const tc = useCoachText();
  const { color } = useTheme();
  const voiceFeature = useFeature("voice_coach");
  const voiceEnabled = voiceFeature.state === "available";

  const [elapsed, setElapsed] = useState(0);
  const [speaking, setSpeaking] = useState(voiceEnabled);
  const [replyInput, setReplyInput] = useState("");
  const [rememberNote, setRememberNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [transcript, setTranscript] = useState<{ role: "assistant" | "user"; content: string }[]>([
    {
      role: "assistant",
      content:
        "Quick debrief: strong opening and clear pacing. Next time, ask about timeline before quoting. Anything I should remember for next time?",
    },
  ]);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed((s) => (s < MAX_REVIEW_S ? s + 1 : MAX_REVIEW_S));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, MAX_REVIEW_S - elapsed);
  const mins = Math.floor(remaining / 60);
  const secs = String(remaining % 60).padStart(2, "0");

  function handleSendText() {
    const clean = replyInput.trim();
    if (!clean) return;
    setSpeaking(false);
    setTranscript((prev) => [...prev, { role: "user", content: clean }]);
    setReplyInput("");
  }

  async function handleFinish() {
    if (saving) return;
    setSaving(true);
    const payload = {
      transcript,
      remember_note: rememberNote.trim() || undefined,
      duration_s: elapsed,
      voice: voiceEnabled,
    };
    try {
      await completeReview(reviewId, payload);
      logEvent("coach_review", "finished", { duration_s: elapsed, voice: voiceEnabled });
    } catch {
      enqueue("coach_review_complete", { callId, reviewId, ...payload });
    } finally {
      setSaving(false);
      onClose();
    }
  }

  return (
    <Sheet open onClose={onClose} title={tc("review.title")} testID="voice-review-modal">
      <Stack gap="sm">
        <View style={styles.row}>
          <Text variant="label" tone="muted">
            {tc("review.subtitle")}
          </Text>
          <Badge label={tc("review.timer", { remaining: `${mins}:${secs}` })} />
        </View>

        <Stack gap="xs" testID="voice-review-transcript">
          {transcript.map((item, idx) => (
            <Panel
              key={`tr-${idx}`}
              sunken={item.role === "assistant"}
              style={{ borderColor: color.border }}
            >
              <Text variant="label">{item.content}</Text>
            </Panel>
          ))}
        </Stack>

        {voiceEnabled ? (
          <View style={styles.row}>
            <Button
              variant="secondary"
              label={speaking ? tc("review.interrupt") : tc("review.speak")}
              onPress={() => setSpeaking((s) => !s)}
              testID="voice-review-interrupt"
            />
          </View>
        ) : null}

        <TextField
          label={tc("review.textFallback")}
          placeholder={tc("review.textFallback")}
          value={replyInput}
          onChangeText={setReplyInput}
          testID="voice-review-text-input"
        />
        <Button
          variant="secondary"
          label={tc("prep.coach.send")}
          onPress={handleSendText}
          disabled={!replyInput.trim()}
          testID="voice-review-text-send"
        />

        <TextField
          label={tc("review.rememberLabel")}
          placeholder={tc("review.rememberPlaceholder")}
          value={rememberNote}
          onChangeText={setRememberNote}
          multiline
          height={56}
          testID="voice-review-remember-input"
        />

        <View style={styles.row}>
          <Button
            variant="primary"
            label={tc("review.finish")}
            onPress={handleFinish}
            disabled={saving}
            testID="voice-review-finish"
          />
          <Button
            variant="secondary"
            label={tc("review.cancel")}
            onPress={onClose}
            testID="voice-review-close"
          />
        </View>
      </Stack>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  },
});
