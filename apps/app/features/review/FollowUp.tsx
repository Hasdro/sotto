/**
 * Follow-up email (owner, 22 Oct): one press after the call drafts the email to the customer
 * from what was said; the agent edits it and copies it into their mail app. Nothing is sent by
 * Sotto, and the draft is made on this device with the company's own AI.
 */
import { buildRuntime, draftFollowUp } from "@sotto/engine";
import { Button, Icon, radius, space, Text, TextField, useTheme } from "@sotto/ui";
import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { deviceCall } from "../../lib/deviceHistory";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";

export function FollowUp({ callId }: { callId: string | null }) {
  const { t } = useI18n();
  const { color } = useTheme();
  const cloud = useCloud();
  const [state, setState] = useState<"idle" | "drafting" | "ready" | "none">("idle");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);
  const bundle = cloud.status === "signed_in" ? cloud.bundle : null;
  const call = callId ? deviceCall(callId) : null;
  const lines = (call?.transcript ?? []).flatMap((e) =>
    e.kind === "line" ? [{ speaker: e.speaker, text: e.text }] : [],
  );
  if (!bundle || !lines.some((l) => l.speaker === "customer")) return null;
  const draft = () => {
    setState("drafting");
    const fetchFn =
      Platform.OS === "web" ? undefined : (require("expo/fetch") as { fetch: typeof fetch }).fetch;
    const runtime = buildRuntime(bundle, undefined, fetchFn);
    void draftFollowUp({
      router: runtime.router,
      prompt: bundle.prompts.followup,
      company: runtime.company,
      lines,
      now: Date.now(),
    }).then((d) => {
      if (!d) return setState("none");
      setSubject(d.subject);
      setBody(d.body);
      setState("ready");
    });
  };
  return (
    <View
      style={[styles.box, { backgroundColor: color.surface, borderColor: color.border }]}
      testID="followup"
    >
      <View style={styles.row}>
        <View style={styles.titleRow}>
          <Icon name="mail" size={17} color={color.textMuted} />
          <Text weight="semibold">{t("followup.title")}</Text>
        </View>
        <View style={styles.grow} />
        <Button
          variant={state === "ready" ? "secondary" : "primary"}
          label={t(
            state === "drafting"
              ? "followup.drafting"
              : state === "ready"
                ? "followup.again"
                : "followup.draft",
          )}
          disabled={state === "drafting"}
          onPress={draft}
          testID="followup-draft"
        />
      </View>
      {state === "none" ? (
        <Text variant="label" tone="muted">
          {t("followup.none")}
        </Text>
      ) : null}
      {state === "ready" ? (
        <>
          <TextField label={t("followup.subject")} value={subject} onChangeText={setSubject} />
          <TextField
            label={t("followup.body")}
            value={body}
            onChangeText={setBody}
            multiline
            height={220}
            testID="followup-body"
          />
          <View style={styles.row}>
            <Text variant="label" tone="muted" style={styles.grow}>
              {t("followup.check")}
            </Text>
            <Button
              label={copied ? t("mini.copied") : t("followup.copy")}
              onPress={() => {
                void globalThis.navigator?.clipboard
                  ?.writeText(subject ? `${subject}\n\n${body}` : body)
                  .then(() => setCopied(true))
                  .catch(() => {});
              }}
              testID="followup-copy"
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  box: {
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  grow: { flex: 1, minWidth: 0 },
});
