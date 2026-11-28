/**
 * Admin → Integrations › Email formats (T-063, D-032, D-080): the formats whose opening and
 * signature are sent verbatim. Round 2: the SMTP mailbox moved to the vendor panel, so this
 * editor stands on its own here — and the opening, body and signature are rich text now
 * (bold, italic, lists, links as Markdown), rendered into the HTML part of the sent email.
 * The plain-text part keeps the same words, so formats saved before this change still work.
 * UI-016: one formatting toolbar, under the rich field the admin was last in, and a primary
 * Save formats that is on only when something changed.
 */
import { Button, Dropdown, Panel, Stack, Text, TextField } from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../lib/locale";
import { type EmailFormat, emailFormats, saveFormats } from "./api";
import { RichTextField } from "./RichTextField";
import { useEmailText } from "./strings";

const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

type RichKey = "opening" | "body" | "signature";

export function FormatsEditor() {
  const t = useEmailText();
  // The Dropdown's own chrome strings live in the shared table, not this feature's.
  const { t: gt } = useI18n();
  const [formats, setFormats] = useState<EmailFormat[]>([]);
  /** What the server has, to tell whether there is anything to save. */
  const [saved, setSaved] = useState("[]");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(0);
  const [active, setActive] = useState<RichKey>("body");
  const [note, setNote] = useState<string | null>(null);
  const keep = useCallback((list: EmailFormat[]) => {
    setFormats(list);
    setSaved(JSON.stringify(list));
  }, []);
  useEffect(() => {
    emailFormats()
      .then((r) => keep(r.formats))
      .catch(() => {});
  }, [keep]);
  if (!formats.length) return null;
  const f = formats[open] ?? formats[0];
  if (!f) return null;
  const edit = (patch: Partial<EmailFormat>) =>
    setFormats((all) => all.map((x, i) => (i === open ? { ...x, ...patch } : x)));
  const dirty = JSON.stringify(formats) !== saved;
  const rich = (key: RichKey, label: string, height: number) => (
    <RichTextField
      label={label}
      value={f[key]}
      onChangeText={(text) => edit({ [key]: text })}
      height={height}
      testID={`email-format-${key}`}
      toolbar={active === key}
      toolbarTestID="email-format-toolbar"
      onFocus={() => setActive(key)}
    />
  );
  return (
    <Panel testID="email-formats">
      <Stack gap="md">
        <Text variant="body" weight="semibold" accessibilityRole="header">
          {t("integrations.smtp.formats.title")}
        </Text>
        <Text variant="label" tone="muted">
          {t("integrations.smtp.formats.body")}
        </Text>
        {/* D-093: the format list grows with the formats; a SegmentedControl (2–4 options)
            overflows, so this is a searchable Dropdown now. */}
        <Dropdown
          options={formats.map((x, i) => ({ value: String(i), label: x.name }))}
          value={String(open)}
          onChange={(v) => setOpen(Number(v))}
          accessibilityLabel={t("integrations.smtp.formats.title")}
          searchPlaceholder={gt("dropdown.search")}
          emptyLabel={gt("dropdown.none")}
          testID="email-format-pick"
        />
        <TextField
          label={t("integrations.smtp.formats.name")}
          value={f.name}
          onChangeText={(name) => edit({ name })}
          testID="email-format-name"
        />
        <TextField
          label={t("integrations.smtp.formats.subject")}
          value={f.subject}
          onChangeText={(subject) => edit({ subject })}
          testID="email-format-subject"
        />
        {rich("opening", t("integrations.smtp.formats.opening"), 64)}
        {rich("body", t("integrations.smtp.formats.example"), 96)}
        {rich("signature", t("integrations.smtp.formats.signature"), 96)}
        <Stack direction="row" gap="sm" wrap align="center">
          <Button
            label={t("integrations.smtp.formats.save")}
            disabled={!dirty}
            busy={saving}
            onPress={() => {
              setSaving(true);
              setNote(null);
              saveFormats(formats)
                .then((r) => {
                  keep(r.formats);
                  setNote(t("integrations.smtp.saved"));
                })
                .catch((e) => setNote(t("integrations.smtp.failed", { error: errorOf(e) })))
                .finally(() => setSaving(false));
            }}
            testID="email-formats-save"
          />
          {note ? (
            <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
              {note}
            </Text>
          ) : null}
        </Stack>
      </Stack>
    </Panel>
  );
}
