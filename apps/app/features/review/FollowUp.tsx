/**
 * One "Follow up with <name>" card after the call (UX-05, D-045). The `followup` draft (made on
 * this device with the company's own AI, owner 22 Oct) is the email body; WhatsApp is the second
 * tab. One send path per channel: the org's email (server preview, then confirm), or — where
 * email sending is not set up — the draft to copy into a mail app; WhatsApp through the org's
 * Gallabox templates. Nothing is ever sent without the agent's confirm (R12). "Skip follow-up"
 * has a 5 s Undo (UX-23) and is kept with the call.
 */
import { buildRuntime, type FollowUp as Draft, draftFollowUp } from "@sotto/engine";
import {
  Button,
  Icon,
  LRI,
  motion,
  PDI,
  radius,
  SegmentedControl,
  Stack,
  space,
  Text,
  TextField,
  Toast,
  useTheme,
} from "@sotto/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useFeature } from "../../components/FeatureGate";
import { deviceCall, setAfterCallItem } from "../../lib/deviceHistory";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";
import { useAttached } from "../crm/attached";
import { EmailAction } from "../email";
import { SendWarnings } from "../email/EmailAction";
import { followUpWarnings } from "../email/warnings";
import { WhatsAppAction } from "../whatsapp";
import { useReviewText } from "./strings";

type Channel = "email" | "whatsapp";
type Phase = "idle" | "drafting" | "ready" | "none";
type Handled = "open" | "skipping" | "skipped" | "sent";

export function FollowUp({
  callId,
  auto = false,
  onOpenChange,
}: {
  callId: string | null;
  /** Right after the call: draft at once (UX-05). History drafts only on request. */
  auto?: boolean;
  /** 1 while the follow-up is neither sent nor skipped, else 0 (UX-24). */
  onOpenChange?: (open: number) => void;
}) {
  const { t } = useI18n();
  const ft = useReviewText();
  const { color } = useTheme();
  const cloud = useCloud();
  const crm = useAttached();
  const email = useFeature("email_send");
  const [channel, setChannel] = useState<Channel>("email");
  const [phase, setPhase] = useState<Phase>("idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [version, setVersion] = useState(0);
  const [handled, setHandled] = useState<Handled>("open");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bundle = cloud.status === "signed_in" ? cloud.bundle : null;
  const call = callId ? deviceCall(callId) : null;
  const lines = (call?.transcript ?? []).flatMap((e) =>
    e.kind === "line" ? [{ speaker: e.speaker, text: e.text }] : [],
  );
  const person = crm.kind === "attached" ? crm.brief.person : null;
  const visible = Boolean(bundle && lines.some((l) => l.speaker === "customer"));
  const label = person?.name
    ? ft("fu.title", { name: `${LRI}${person.name}${PDI}` })
    : ft("fu.titleNoName");

  const make = useCallback(() => {
    if (!bundle) return;
    setPhase("drafting");
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
      setDraft(d);
      setVersion((v) => v + 1);
      setPhase(d ? "ready" : "none");
    });
  }, [bundle, lines]);
  // Drafts once when the card appears (phase leaves "idle" on the first run).
  useEffect(() => {
    if (auto && visible && phase === "idle") make();
  }, [auto, visible, phase, make]);
  useEffect(() => {
    onOpenChange?.(visible && (handled === "open" || handled === "skipping") ? 1 : 0);
  }, [onOpenChange, visible, handled]);
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  if (!visible) return null;
  const mark = (state: "saved" | "skipped") => {
    if (callId) setAfterCallItem(callId, { id: "followup", label }, state);
  };
  const skip = () => {
    setHandled("skipping");
    timer.current = setTimeout(() => {
      setHandled("skipped");
      mark("skipped");
    }, motion.undoMs);
  };
  const undo = () => {
    if (timer.current) clearTimeout(timer.current);
    setHandled("open");
  };
  const sent = () => {
    setHandled("sent");
    mark("saved");
  };

  if (handled === "skipping" || handled === "skipped") {
    return handled === "skipping" ? (
      <Toast
        title={ft("fu.skipped")}
        body={label}
        action={{ label: ft("fu.undo"), onPress: undo }}
        testID="followup-skip-toast"
      />
    ) : null;
  }
  return (
    <View
      style={[styles.box, { backgroundColor: color.surface, borderColor: color.border }]}
      testID="followup"
    >
      <View style={styles.row}>
        <View style={styles.titleRow}>
          <Icon name="mail" size={17} color={color.textMuted} />
          <Text variant="heading" weight="semibold" accessibilityRole="header">
            {label}
          </Text>
        </View>
        <View style={styles.grow} />
        {handled === "sent" ? (
          <Text variant="label" tone="muted" testID="followup-sent">
            {ft("fu.sent")}
          </Text>
        ) : (
          <Button variant="ghost" label={ft("fu.skip")} onPress={skip} testID="followup-skip" />
        )}
      </View>
      <SegmentedControl
        options={[
          { value: "email", label: ft("fu.email") },
          { value: "whatsapp", label: ft("fu.whatsapp") },
        ]}
        value={channel}
        onChange={setChannel}
        accessibilityLabel={ft("fu.channel")}
        testID="followup-channel"
      />
      {channel === "email" ? (
        <Stack gap="md">
          {phase === "drafting" ? (
            <Text variant="label" tone="muted" testID="followup-drafting">
              {ft("fu.drafting")}
            </Text>
          ) : null}
          {phase === "none" ? (
            <Text variant="label" tone="muted">
              {ft("fu.none")}
            </Text>
          ) : null}
          {phase === "idle" ? (
            <Stack direction="row" gap="sm">
              <Button label={t("followup.draft")} onPress={make} testID="followup-draft" />
            </Stack>
          ) : null}
          {phase === "drafting" ? null : email.state === "available" ? (
            <EmailAction
              key={version}
              callId={callId}
              customer={{ name: person?.name, email: person?.email }}
              draft={draft}
              onSent={sent}
            />
          ) : phase === "ready" && draft ? (
            <CopyDraft key={version} draft={draft} />
          ) : null}
        </Stack>
      ) : (
        <WhatsAppAction
          callId={callId}
          customer={{ name: person?.name, phone: person?.phone }}
          onSent={sent}
        />
      )}
    </View>
  );
}

/** No org email: the draft to edit and copy into the agent's own mail app. */
function CopyDraft({ draft }: { draft: Draft }) {
  const { t } = useI18n();
  const ft = useReviewText();
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [copied, setCopied] = useState(false);
  return (
    <Stack gap="md" testID="followup-copybox">
      <Text variant="label" tone="muted">
        {ft("fu.copyHint")}
      </Text>
      <TextField label={t("followup.subject")} value={subject} onChangeText={setSubject} />
      <TextField
        label={t("followup.body")}
        value={body}
        onChangeText={setBody}
        multiline
        height={220}
        testID="followup-body"
      />
      <SendWarnings warnings={followUpWarnings(`${subject}\n${body}`)} />
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
    </Stack>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.xs, flexShrink: 1 },
  box: {
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  grow: { flex: 1, minWidth: 0 },
});
