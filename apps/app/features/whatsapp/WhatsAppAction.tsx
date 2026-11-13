/**
 * Post-call WhatsApp action (T-065, R12, D-033). Self-contained, for the post-call panel owned by
 * the zoho-actions stream. Only the organisation's approved templates; the agent fills the
 * parameters (the customer's name is prefilled), sees the exact preview and confirms. Free-form
 * text is not offered: Gallabox gives no reliable 24-hour-window signal.
 */
import { Button, Panel, SegmentedControl, Stack, Text, TextField } from "@sotto/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { FeatureOff, useFeature } from "../../components/FeatureGate";
import { useAttached } from "../crm/attached";
import { newIdempotencyKey } from "../email/api";
import {
  allowedTemplates,
  fieldsOf,
  keyOf,
  type Message,
  type Preview,
  prefill,
  previewWhatsApp,
  sendWhatsApp,
  type Template,
} from "./api";
import { useWhatsAppText } from "./strings";

export type WhatsAppActionProps = {
  callId: string | null;
  /** Prefills; the attached Zoho record fills whatever is not given. */
  customer?: { name?: string; phone?: string };
  onSent?: (preview: Preview) => void;
};

type Step =
  | { kind: "compose"; error?: string }
  | { kind: "preview"; preview: Preview; key: string; error?: string }
  | { kind: "sending"; preview: Preview; key: string }
  | { kind: "sent"; preview: Preview; duplicate: boolean };

const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function WhatsAppAction(props: WhatsAppActionProps) {
  const effective = useFeature("whatsapp");
  if (effective.state === "no_permission") return null;
  if (effective.state !== "available")
    return <FeatureOff feature="whatsapp" effective={effective} />;
  return <Composer {...props} />;
}

function Composer({ callId, customer, onSent }: WhatsAppActionProps) {
  const t = useWhatsAppText();
  const attached = useAttached();
  const person = attached.kind === "attached" ? attached.brief.person : null;
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [picked, setPicked] = useState("");
  const [name, setName] = useState(customer?.name ?? person?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? person?.phone ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [step, setStep] = useState<Step>({ kind: "compose" });
  const nameNow = useRef(name);
  nameNow.current = name;

  useEffect(() => {
    allowedTemplates()
      .then((r) => {
        setTemplates(r.templates);
        const first = r.templates[0];
        if (first) {
          setPicked(keyOf(first));
          setValues(prefill(first, { name: nameNow.current }));
        }
      })
      .catch((e) => {
        setTemplates([]);
        setStep({ kind: "compose", error: errorOf(e) });
      });
  }, []);

  const template = useMemo(
    () => templates?.find((x) => keyOf(x) === picked) ?? null,
    [templates, picked],
  );
  // A newly picked template starts from its own prefills (the customer's first name).
  const choose = (list: Template[], key: string) => {
    setPicked(key);
    const next = list.find((x) => keyOf(x) === key);
    setValues(next ? prefill(next, { name }) : {});
  };

  if (templates === null) return null;
  const fields = template ? fieldsOf(template) : [];
  const message: Message | null = template
    ? {
        template: template.name,
        language: template.language,
        recipient: { name: name.trim(), phone },
        values,
      }
    : null;
  const filled = fields.every((p) => values[p.name]?.trim());

  const preview = () => {
    if (!message) return;
    previewWhatsApp(message)
      .then((p) =>
        setStep({ kind: "preview", preview: p, key: newIdempotencyKey(`${callId ?? "call"}-wa`) }),
      )
      .catch((e) => setStep({ kind: "compose", error: errorOf(e) }));
  };
  const confirm = (p: Preview, key: string) => {
    if (!message) return;
    setStep({ kind: "sending", preview: p, key });
    sendWhatsApp(message, key)
      .then((r) => {
        setStep({ kind: "sent", preview: p, duplicate: r.duplicate });
        onSent?.(p);
      })
      .catch((e) => setStep({ kind: "preview", preview: p, key, error: errorOf(e) }));
  };

  return (
    <Panel testID="whatsapp-action">
      <Stack gap="md">
        <Text variant="body" weight="semibold" accessibilityRole="header">
          {t("whatsapp.title")}
        </Text>
        <Text variant="label" tone="muted">
          {t("whatsapp.templateOnly")}
        </Text>
        {step.kind === "compose" ? (
          templates.length === 0 ? (
            <>
              <Text variant="body" tone="muted" testID="whatsapp-none">
                {t("whatsapp.none")}
              </Text>
              {step.error ? <Problem text={t("whatsapp.failed", { error: step.error })} /> : null}
            </>
          ) : (
            <>
              <Stack gap="xs">
                <Text variant="label" weight="medium" tone="muted">
                  {t("whatsapp.template")}
                </Text>
                {templates.length <= 4 ? (
                  <SegmentedControl
                    options={templates.map((x) => ({ value: keyOf(x), label: x.name }))}
                    value={picked}
                    onChange={(k) => choose(templates, k)}
                    accessibilityLabel={t("whatsapp.template")}
                    testID="whatsapp-template"
                  />
                ) : (
                  <Stack gap="xs" testID="whatsapp-template">
                    {templates.map((x) => (
                      <Button
                        key={keyOf(x)}
                        variant={keyOf(x) === picked ? "primary" : "ghost"}
                        label={`${x.name} · ${x.language}`}
                        onPress={() => choose(templates, keyOf(x))}
                        testID={`whatsapp-template-${keyOf(x)}`}
                      />
                    ))}
                  </Stack>
                )}
              </Stack>
              {template?.body ? (
                <Panel sunken>
                  <Text variant="label" tone="muted" selectable>
                    {template.body}
                  </Text>
                </Panel>
              ) : null}
              <TextField
                label={t("whatsapp.name")}
                value={name}
                onChangeText={setName}
                testID="whatsapp-name"
              />
              <TextField
                label={t("whatsapp.phone")}
                value={phone}
                onChangeText={setPhone}
                placeholder="+971 50 123 4567"
                keyboardType="phone-pad"
                testID="whatsapp-phone"
              />
              {fields.map((p) => (
                <TextField
                  key={p.name}
                  label={t("whatsapp.param", { name: p.name })}
                  value={values[p.name] ?? ""}
                  onChangeText={(v) => setValues((x) => ({ ...x, [p.name]: v }))}
                  placeholder={
                    p.example ? t("whatsapp.example", { example: p.example }) : undefined
                  }
                  testID={`whatsapp-param-${p.name}`}
                />
              ))}
              <Stack direction="row" gap="sm" wrap>
                <Button
                  label={t("whatsapp.preview")}
                  disabled={!template || !filled || !phone.trim()}
                  onPress={preview}
                  testID="whatsapp-preview"
                />
              </Stack>
              {step.error ? <Problem text={t("whatsapp.failed", { error: step.error })} /> : null}
            </>
          )
        ) : (
          <Panel sunken testID="whatsapp-preview-box">
            <Stack gap="sm">
              <Text
                variant="label"
                weight="semibold"
                aria-live="polite"
                accessibilityLiveRegion="polite"
              >
                {t(step.kind === "sent" ? "whatsapp.sent" : "whatsapp.previewTitle")}
              </Text>
              <Text variant="label" tone="muted" selectable>
                {t("whatsapp.to", { name: step.preview.to.name, phone: step.preview.to.phone })}
              </Text>
              <Text variant="label" tone="muted">
                {`${step.preview.template} · ${step.preview.language}`}
              </Text>
              <Text variant="body" selectable testID="whatsapp-preview-text">
                {step.preview.text}
              </Text>
            </Stack>
          </Panel>
        )}
        {step.kind === "preview" || step.kind === "sending" ? (
          <>
            <Stack direction="row" gap="sm" wrap>
              <Button
                label={t(step.kind === "sending" ? "whatsapp.sending" : "whatsapp.confirm")}
                disabled={step.kind === "sending"}
                onPress={() => confirm(step.preview, step.key)}
                testID="whatsapp-confirm"
              />
              <Button
                variant="ghost"
                label={t("whatsapp.edit")}
                disabled={step.kind === "sending"}
                onPress={() => setStep({ kind: "compose" })}
                testID="whatsapp-edit"
              />
            </Stack>
            {step.kind === "preview" && step.error ? (
              <Problem text={t("whatsapp.failed", { error: step.error })} />
            ) : null}
          </>
        ) : null}
        {step.kind === "sent" ? (
          <Stack gap="sm">
            {step.duplicate ? (
              <Text variant="label" tone="muted">
                {t("whatsapp.duplicate")}
              </Text>
            ) : null}
            <Stack direction="row" gap="sm" wrap>
              <Button
                variant="secondary"
                label={t("whatsapp.another")}
                onPress={() => setStep({ kind: "compose" })}
                testID="whatsapp-another"
              />
            </Stack>
          </Stack>
        ) : null}
      </Stack>
    </Panel>
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
      testID="whatsapp-error"
    >
      {text}
    </Text>
  );
}
