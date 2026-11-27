/**
 * Post-call email action (T-063, R12, D-032). Self-contained: the post-call panel (owned by the
 * zoho-actions stream) renders it with what it knows about the call. Nothing is sent until the
 * agent has seen the server's exact preview and pressed Confirm; a retry reuses the same
 * idempotency key, so the customer never gets the email twice.
 */
import {
  Button,
  LtrRun,
  Panel,
  SegmentedControl,
  Stack,
  space,
  Text,
  TextField,
  ToggleRow,
  useTheme,
} from "@sotto/ui";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FeatureOff, useFeature } from "../../components/FeatureGate";
import { useAttached } from "../crm/attached";
import {
  type Attachment,
  addressList,
  type Draft,
  type EmailFormat,
  emailAttachments,
  emailFormats,
  emailSenders,
  newIdempotencyKey,
  type Preview,
  previewEmail,
  type Sender,
  sendEmail,
} from "./api";
import { useEmailText } from "./strings";
import { type FollowUpWarnings, followUpWarnings } from "./warnings";

export type EmailActionProps = {
  callId: string | null;
  /** Prefills; the attached Zoho record fills whatever is not given. */
  customer?: { name?: string; email?: string };
  /** The follow-up draft written on this device (features/review/FollowUp), if any. */
  draft?: { subject: string; body: string } | null;
  /** A follow-up plan step (INT-08): the approved draft and the step's own send key. */
  prepared?: Partial<Draft> | null;
  idempotencyKey?: string;
  onSent?: (preview: Preview) => void;
  /** Reports the current draft (the follow-up plan prepares its steps from it). */
  onDraft?: (draft: Draft) => void;
  /** An action at the end of the card's title row, e.g. the follow-up's "Draft with AI"
   * (UX-011: inside the card it fills, not floating above it). */
  headerAction?: ReactNode;
};

type Step =
  | { kind: "compose"; error?: string }
  | { kind: "preview"; preview: Preview; key: string; error?: string }
  | { kind: "sending"; preview: Preview; key: string }
  | { kind: "sent"; preview: Preview; duplicate: boolean };

const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function EmailAction(props: EmailActionProps) {
  const effective = useFeature("email_send");
  if (effective.state === "no_permission") return null;
  if (effective.state !== "available")
    return <FeatureOff feature="email_send" effective={effective} />;
  return <Composer {...props} />;
}

function Composer({
  callId,
  customer,
  draft,
  prepared,
  idempotencyKey,
  onSent,
  onDraft,
  headerAction,
}: EmailActionProps) {
  const t = useEmailText();
  const attached = useAttached();
  const person = attached.kind === "attached" ? attached.brief.person : null;
  const [senders, setSenders] = useState<Sender[]>([]);
  const [formats, setFormats] = useState<EmailFormat[]>([]);
  const [sender, setSender] = useState(prepared?.sender ?? "");
  const [format, setFormat] = useState(prepared?.format ?? "");
  const [to, setTo] = useState(prepared?.to?.join(", ") ?? customer?.email ?? person?.email ?? "");
  const [cc, setCc] = useState(prepared?.cc?.join(", ") ?? "");
  const [name, setName] = useState(prepared?.customer_name ?? customer?.name ?? person?.name ?? "");
  const [subject, setSubject] = useState(prepared?.subject ?? draft?.subject ?? "");
  const [body, setBody] = useState(prepared?.body ?? draft?.body ?? "");
  const [touched, setTouched] = useState(Boolean(draft || prepared));
  const files = useFeature("email_attachments");
  const [library, setLibrary] = useState<Attachment[]>([]);
  const [chosenFiles, setChosenFiles] = useState<string[]>(prepared?.attachments ?? []);
  const [step, setStep] = useState<Step>({ kind: "compose" });

  useEffect(() => {
    emailSenders()
      .then((r) => {
        setSenders(r.senders);
        setSender((s) => s || r.senders[0]?.id || "");
      })
      .catch((e) => setStep({ kind: "compose", error: errorOf(e) }));
    emailFormats()
      .then((r) => {
        setFormats(r.formats);
        setFormat((f) => f || r.formats[0]?.id || "");
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (files.state !== "available") return;
    emailAttachments()
      .then((r) => setLibrary(r.attachments))
      .catch(() => setLibrary([]));
  }, [files.state]);

  const chosen = useMemo(() => formats.find((f) => f.id === format), [formats, format]);
  useEffect(() => {
    if (chosen && !touched) {
      setSubject(chosen.subject);
      setBody(chosen.body);
    }
  }, [chosen, touched]);

  const current: Draft = useMemo(
    () => ({
      sender,
      format,
      to: addressList(to),
      cc: addressList(cc),
      subject,
      body,
      customer_name: name.trim(),
      ...(chosenFiles.length ? { attachments: chosenFiles } : {}),
    }),
    [sender, format, to, cc, subject, body, name, chosenFiles],
  );
  // The follow-up plan prepares its email step from the current draft (INT-08).
  useEffect(() => {
    onDraft?.(current);
  }, [current, onDraft]);
  const edit =
    (set: (v: string) => void, marks = false) =>
    (v: string) => {
      set(v);
      if (marks) setTouched(true);
    };

  const preview = () =>
    previewEmail(current)
      .then((p) =>
        setStep({
          kind: "preview",
          preview: p,
          key: idempotencyKey ?? newIdempotencyKey(`${callId ?? "call"}-email`),
        }),
      )
      .catch((e) => setStep({ kind: "compose", error: errorOf(e) }));
  const confirm = (p: Preview, key: string) => {
    setStep({ kind: "sending", preview: p, key });
    sendEmail(current, key)
      .then((r) => {
        setStep({ kind: "sent", preview: p, duplicate: r.duplicate });
        onSent?.(p);
      })
      .catch((e) => setStep({ kind: "preview", preview: p, key, error: errorOf(e) }));
  };

  return (
    <Panel testID="email-action">
      <Stack gap="md">
        <View style={styles.head} testID="email-head">
          <Text variant="body" weight="semibold" accessibilityRole="header" style={styles.grow}>
            {t("email.title")}
          </Text>
          {step.kind === "compose" ? headerAction : null}
        </View>
        {step.kind === "compose" ? (
          <>
            {senders.length > 1 ? (
              <Labelled label={t("email.from")}>
                <SegmentedControl
                  options={senders.map((s) => ({ value: s.id, label: s.from_address }))}
                  value={sender}
                  onChange={setSender}
                  accessibilityLabel={t("email.from")}
                  testID="email-sender"
                />
              </Labelled>
            ) : senders[0] ? (
              <Text variant="label" tone="muted" testID="email-sender">
                {`${t("email.from")}: ${senders[0].from_name} · ${senders[0].from_address}`}
              </Text>
            ) : null}
            {formats.length > 1 && formats.length <= 4 ? (
              <Labelled label={t("email.format")}>
                <SegmentedControl
                  options={formats.map((f) => ({ value: f.id, label: f.name }))}
                  value={format}
                  onChange={setFormat}
                  accessibilityLabel={t("email.format")}
                  testID="email-format"
                />
              </Labelled>
            ) : null}
            <TextField
              label={t("email.to")}
              value={to}
              onChangeText={setTo}
              placeholder={t("email.addresses")}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              testID="email-to"
            />
            <TextField
              label={t("email.cc")}
              value={cc}
              onChangeText={setCc}
              placeholder={t("email.addresses")}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              testID="email-cc"
            />
            <TextField
              label={t("email.customer")}
              value={name}
              onChangeText={setName}
              testID="email-customer"
            />
            <TextField
              label={t("email.subject")}
              value={subject}
              onChangeText={edit(setSubject, true)}
              testID="email-subject"
            />
            <TextField
              label={t("email.body")}
              value={body}
              onChangeText={edit(setBody, true)}
              multiline
              height={160}
              testID="email-body"
            />
            {library.length ? (
              <Labelled label={t("email.attachments")}>
                <Stack gap="xs" testID="email-attachments">
                  {library.map((f) => {
                    const on = chosenFiles.includes(f.id);
                    return (
                      <ToggleRow
                        key={f.id}
                        value={on}
                        label={f.name}
                        description={sizeOf(f.size)}
                        onValueChange={() =>
                          setChosenFiles((a) => (on ? a.filter((x) => x !== f.id) : [...a, f.id]))
                        }
                        testID={`email-attach-${f.id}`}
                      />
                    );
                  })}
                </Stack>
              </Labelled>
            ) : null}
            <Stack direction="row" gap="sm" wrap>
              <Button
                label={t("email.preview")}
                disabled={!sender || !format || !to.trim() || !subject.trim() || !body.trim()}
                onPress={preview}
                testID="email-preview"
              />
            </Stack>
            {step.error ? <Problem text={t("email.failed", { error: step.error })} /> : null}
          </>
        ) : (
          <PreviewBox
            preview={step.preview}
            title={t(step.kind === "sent" ? "email.sent" : "email.previewTitle", {
              to: step.preview.to.join(", "),
            })}
          />
        )}
        {step.kind === "preview" || step.kind === "sending" ? (
          <>
            <Stack direction="row" gap="sm" wrap>
              <Button
                label={t(step.kind === "sending" ? "email.sending" : "email.confirm")}
                disabled={step.kind === "sending"}
                onPress={() => confirm(step.preview, step.key)}
                testID="email-confirm"
              />
              <Button
                variant="ghost"
                label={t("email.edit")}
                disabled={step.kind === "sending"}
                onPress={() => setStep({ kind: "compose" })}
                testID="email-edit"
              />
            </Stack>
            {step.kind === "preview" && step.error ? (
              <Problem text={t("email.failed", { error: step.error })} />
            ) : null}
          </>
        ) : null}
        {step.kind === "sent" ? (
          <Stack gap="sm">
            {step.duplicate ? (
              <Text variant="label" tone="muted">
                {t("email.duplicate")}
              </Text>
            ) : null}
            <Stack direction="row" gap="sm" wrap>
              <Button
                variant="secondary"
                label={t("email.another")}
                onPress={() => setStep({ kind: "compose" })}
                testID="email-another"
              />
            </Stack>
          </Stack>
        ) : null}
      </Stack>
    </Panel>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack gap="xs">
      <Text variant="label" weight="medium" tone="muted">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <Text
      variant="label"
      tone="danger"
      selectable
      aria-live="polite"
      accessibilityLiveRegion="polite"
      testID="email-error"
    >
      {text}
    </Text>
  );
}

/** UX-22: the preview reads like a mail client — From, To, Cc and Subject rows, then the body. */
function PreviewBox({ preview, title }: { preview: Preview; title: string }) {
  const t = useEmailText();
  const { color } = useTheme();
  const files = preview.attachments ?? [];
  const warn = followUpWarnings(`${preview.subject}\n${preview.text}`, files.length);
  const rows: [string, string, string][] = [
    [t("email.from"), `${preview.from.name} <${preview.from.address}>`, "from"],
    [t("email.to"), preview.to.join(", "), "to"],
    ...(preview.cc.length
      ? [[t("email.cc"), preview.cc.join(", "), "cc"] as [string, string, string]]
      : []),
    [t("email.subject"), preview.subject, "subject"],
  ];
  return (
    <Stack gap="sm">
      <Text variant="label" weight="semibold" aria-live="polite" accessibilityLiveRegion="polite">
        {title}
      </Text>
      <Panel sunken testID="email-preview-box">
        <Stack gap="xs">
          {rows.map(([label, value, id]) => (
            <View
              key={id}
              style={[styles.mailRow, { borderBottomColor: color.border }]}
              testID={`email-preview-${id}-row`}
            >
              <Text variant="label" tone="muted" style={styles.mailLabel}>
                {label}
              </Text>
              {id === "subject" ? (
                <Text
                  variant="body"
                  weight="semibold"
                  selectable
                  style={styles.mailValue}
                  testID="email-preview-subject"
                >
                  {value}
                </Text>
              ) : (
                <LtrRun variant="label" selectable style={styles.mailValue}>
                  {value}
                </LtrRun>
              )}
            </View>
          ))}
          <Text variant="body" selectable testID="email-preview-text" style={styles.mailBody}>
            {preview.text}
          </Text>
          {files.length ? (
            <Text variant="label" tone="muted" testID="email-preview-attachments">
              {t("email.attachedFiles", {
                files: files.map((f) => `${f.name} (${sizeOf(f.size)})`).join(", "),
              })}
            </Text>
          ) : null}
        </Stack>
      </Panel>
      <SendWarnings warnings={warn} />
    </Stack>
  );
}

/** The attachment and placeholder warnings (UX-22); shown under the preview and the copy box. */
export function SendWarnings({ warnings }: { warnings: FollowUpWarnings }) {
  const t = useEmailText();
  return (
    <>
      {warnings.attached ? (
        <Text variant="label" tone="danger" testID="email-warn-attached">
          {t("email.warnAttached")}
        </Text>
      ) : null}
      {warnings.placeholders.length ? (
        <Text variant="label" tone="danger" testID="email-warn-placeholder">
          {t("email.warnPlaceholder", { items: warnings.placeholders.join(", ") })}
        </Text>
      ) : null}
    </>
  );
}

function sizeOf(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.sm,
  },
  grow: { flex: 1, minWidth: 0 },
  mailRow: {
    flexDirection: "row",
    gap: space.md,
    paddingBottom: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mailLabel: { width: 64 },
  mailValue: { flex: 1, minWidth: 0 },
  mailBody: { paddingTop: space.sm },
});
