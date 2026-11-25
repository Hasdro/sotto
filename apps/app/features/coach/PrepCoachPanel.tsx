/**
 * Pre-call brainstorming coach & editable Game Plan (B1, B2).
 *
 * - Text chat always available when `prep_coach` is available; voice toggle shown only when
 *   `voice_coach` is available (owner-configured + under cap).
 * - Uses attached Zoho brief when present; works cleanly without Zoho.
 * - Produces an editable game plan (3 goals, objections+answers, questions, avoid) saved with
 *   the call and displayed read-only in the rail during the live call.
 * - Never forces a chat before "Start listening" (B1).
 */

import { Badge, Button, Panel, Stack, space, Text, TextField, useTheme } from "@sotto/ui";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FeatureOff, useFeature } from "../../components/FeatureGate";
import { useAttachedState } from "../crm/attached";
import {
  type GamePlan,
  generateGamePlan,
  getGamePlan,
  type PrepMessage,
  saveGamePlan,
  sendPrepMessage,
} from "./api";
import { useCoachText } from "./strings";
import { enqueue, logEvent, SafeBoundary } from "./stubs";

type Props = {
  callId: string;
  onGamePlanChange?: (plan: GamePlan | null) => void;
  onStartListening?: () => void;
};

export function PrepCoachPanel({ callId, onGamePlanChange, onStartListening }: Props) {
  const prepCoach = useFeature("prep_coach");
  if (prepCoach.state === "no_permission") return null;
  if (prepCoach.state !== "available") {
    return <FeatureOff feature="prep_coach" effective={prepCoach} />;
  }
  return (
    <SafeBoundary name="coach.prep">
      <PrepCoachInner
        callId={callId}
        onGamePlanChange={onGamePlanChange}
        onStartListening={onStartListening}
      />
    </SafeBoundary>
  );
}

function PrepCoachInner({ callId, onGamePlanChange, onStartListening }: Props) {
  const tc = useCoachText();
  const { color } = useTheme();
  const voiceFeature = useFeature("voice_coach");
  const voiceAllowed = voiceFeature.state === "available";
  const attached = useAttachedState();

  const [messages, setMessages] = useState<PrepMessage[]>([]);
  const [input, setInput] = useState("");
  const [voiceMode, setVoiceMode] = useState(false);
  const [busy, setBusy] = useState<"chat" | "plan" | "save" | null>(null);
  const [plan, setPlan] = useState<GamePlan | null>(null);
  const [goalsText, setGoalsText] = useState("");
  const [questionsText, setQuestionsText] = useState("");
  const [avoidText, setAvoidText] = useState("");
  const [savedNotice, setSavedNotice] = useState(false);

  const zohoBriefText =
    attached.crm.kind === "attached"
      ? [
          attached.crm.brief.person?.name,
          attached.crm.brief.account?.name,
          attached.crm.brief.meeting?.title,
        ]
          .filter(Boolean)
          .join(" · ")
      : "";
  const prepNotesText = [attached.prep.tldr, attached.prep.objective, attached.prep.pains]
    .filter(Boolean)
    .join(" | ");

  useEffect(() => {
    let active = true;
    getGamePlan(callId)
      .then((existing) => {
        if (!active || !existing) return;
        setPlan(existing);
        setGoalsText(existing.goals.join("\n"));
        setQuestionsText(existing.questions.join("\n"));
        setAvoidText(existing.avoid.join("\n"));
        onGamePlanChange?.(existing);
      })
      .catch(() => {
        // Offline or unsaved call — start with empty game plan.
      });
    return () => {
      active = false;
    };
  }, [callId, onGamePlanChange]);

  async function handleSend() {
    const clean = input.trim();
    if (!clean || busy) return;
    setBusy("chat");
    setInput("");
    const optimistic: PrepMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: clean,
      created_at: Date.now(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await sendPrepMessage(callId, {
        message: clean,
        crm_brief: zohoBriefText,
        prep_notes: prepNotesText,
        voice: voiceAllowed && voiceMode,
      });
      setMessages((prev) => [...prev, res.message]);
      logEvent("coach_prep", "chat_sent", { voice: voiceAllowed && voiceMode });
    } catch {
      enqueue("coach_prep_message", { callId, message: clean });
    } finally {
      setBusy(null);
    }
  }

  async function handleGeneratePlan() {
    if (busy) return;
    setBusy("plan");
    setSavedNotice(false);
    try {
      const next = await generateGamePlan(callId, {
        crm_brief: zohoBriefText,
        prep_notes: prepNotesText,
      });
      setPlan(next);
      setGoalsText(next.goals.join("\n"));
      setQuestionsText(next.questions.join("\n"));
      setAvoidText(next.avoid.join("\n"));
      onGamePlanChange?.(next);
      logEvent("coach_prep", "game_plan_generated", { goals: next.goals.length });
    } finally {
      setBusy(null);
    }
  }

  async function handleSavePlan() {
    if (busy) return;
    setBusy("save");
    setSavedNotice(false);
    const goals = goalsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    const questions = questionsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    const avoid = avoidText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    try {
      const saved = await saveGamePlan(callId, {
        goals,
        objections: plan?.objections ?? [],
        questions,
        avoid,
      });
      setPlan(saved);
      onGamePlanChange?.(saved);
      setSavedNotice(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel sunken testID="prep-coach-panel">
      <Stack gap="sm">
        <View style={styles.headerRow}>
          <Text variant="label" weight="semibold" tone="muted" accessibilityRole="header">
            {tc("prep.coach.title")}
          </Text>
          {voiceAllowed ? (
            <Button
              variant="secondary"
              label={voiceMode ? tc("prep.coach.voiceOn") : tc("prep.coach.voiceOff")}
              onPress={() => setVoiceMode((v) => !v)}
              testID="prep-coach-voice-toggle"
            />
          ) : null}
        </View>
        <Text variant="label" tone="muted">
          {tc("prep.coach.subtitle")}
        </Text>
        {!zohoBriefText ? (
          <Text variant="label" tone="muted" testID="prep-coach-no-zoho">
            {tc("prep.coach.noZoho")}
          </Text>
        ) : null}

        {messages.length > 0 ? (
          <Stack gap="xs" testID="prep-coach-messages">
            {messages.map((m) => (
              <View
                key={m.id}
                style={[
                  styles.bubble,
                  {
                    backgroundColor: m.role === "assistant" ? color.surface : color.background,
                    borderColor: color.border,
                  },
                ]}
              >
                <Text variant="label">{m.content}</Text>
              </View>
            ))}
          </Stack>
        ) : null}

        <TextField
          label={tc("prep.coach.title")}
          placeholder={tc("prep.coach.placeholder")}
          value={input}
          onChangeText={setInput}
          testID="prep-coach-input"
        />
        <View style={styles.actionRow}>
          <Button
            variant="secondary"
            label={tc("prep.coach.send")}
            onPress={handleSend}
            disabled={!input.trim() || busy !== null}
            testID="prep-coach-send"
          />
          <Button
            variant="secondary"
            label={busy === "plan" ? tc("prep.coach.generating") : tc("prep.coach.generate")}
            onPress={handleGeneratePlan}
            disabled={busy !== null}
            testID="prep-coach-generate"
          />
          {onStartListening ? (
            <Button
              variant="primary"
              label={tc("prep.coach.startNow")}
              onPress={onStartListening}
              testID="prep-coach-start-now"
            />
          ) : null}
        </View>

        <Stack gap="xs" testID="prep-game-plan-editor">
          <View style={styles.headerRow}>
            <Text variant="label" weight="semibold" tone="muted">
              {tc("plan.title")}
            </Text>
            {savedNotice ? <Badge label={tc("plan.saved")} tone="success" /> : null}
          </View>
          <TextField
            label={tc("plan.goals")}
            value={goalsText}
            onChangeText={setGoalsText}
            multiline
            height={64}
            testID="plan-goals-input"
          />
          <TextField
            label={tc("plan.questions")}
            value={questionsText}
            onChangeText={setQuestionsText}
            multiline
            height={56}
            testID="plan-questions-input"
          />
          <TextField
            label={tc("plan.avoid")}
            value={avoidText}
            onChangeText={setAvoidText}
            multiline
            height={56}
            testID="plan-avoid-input"
          />
          <Button
            variant="secondary"
            label={tc("plan.save")}
            onPress={handleSavePlan}
            disabled={busy !== null}
            testID="plan-save-btn"
          />
        </Stack>
      </Stack>
    </Panel>
  );
}

const styles = StyleSheet.create({
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
  bubble: {
    padding: space.sm,
    borderWidth: 1,
    borderRadius: 8,
  },
});
