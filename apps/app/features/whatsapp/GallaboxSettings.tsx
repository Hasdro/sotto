/**
 * Admin → Integrations › WhatsApp (T-064/T-071, D-033, D-039): Gallabox API key, secret, account
 * and channel (write-only), then "Load templates" pulls every template from Gallabox and the
 * admin ticks the ones agents may send. The server re-reads the chosen ones from Gallabox and
 * caches their parameters; nothing from Gallabox's `channel` object ever reaches the app.
 */
import { Badge, Button, Divider, Panel, Stack, Text, TextField, ToggleRow } from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import {
  fieldsOf,
  type GallaboxInput,
  type GallaboxStatus,
  gallaboxStatus,
  keyOf,
  loadTemplates,
  removeGallabox,
  saveAllowList,
  saveGallabox,
  type Template,
} from "./api";
import { useWhatsAppText, type WhatsAppKey } from "./strings";

const FIELDS: { id: keyof GallaboxInput; label: WhatsAppKey; secret: boolean }[] = [
  { id: "api_key", label: "integrations.gallabox.apiKey", secret: true },
  { id: "api_secret", label: "integrations.gallabox.apiSecret", secret: true },
  { id: "account_id", label: "integrations.gallabox.accountId", secret: false },
  { id: "channel_id", label: "integrations.gallabox.channelId", secret: false },
];
const EMPTY: GallaboxInput = { api_key: "", api_secret: "", account_id: "", channel_id: "" };
const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function GallaboxSettings() {
  const t = useWhatsAppText();
  const [status, setStatus] = useState<GallaboxStatus | null>(null);
  const [input, setInput] = useState<GallaboxInput>(EMPTY);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState<Template[] | "loading" | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [listNote, setListNote] = useState<string | null>(null);

  const fill = useCallback((s: GallaboxStatus) => {
    setStatus(s);
    setPicked(new Set(s.templates.map(keyOf)));
  }, []);
  useEffect(() => {
    gallaboxStatus()
      .then(fill)
      .catch(() => {});
  }, [fill]);

  const configured = status?.configured === true;
  const complete = FIELDS.every((f) => input[f.id].trim());
  const save = (p: Promise<GallaboxStatus>) => {
    setBusy(true);
    setNote(null);
    p.then((s) => {
      fill(s);
      setInput(EMPTY);
      setNote(t("integrations.gallabox.saved"));
    })
      .catch((e) => setNote(t("integrations.gallabox.failed", { error: errorOf(e) })))
      .finally(() => setBusy(false));
  };
  const load = () => {
    setLoaded("loading");
    setListNote(null);
    loadTemplates()
      .then((r) => setLoaded(r.templates))
      .catch((e) => {
        setLoaded(null);
        setListNote(t("integrations.gallabox.loadFailed", { error: errorOf(e) }));
      });
  };
  const toggle = (k: string, on: boolean) =>
    setPicked((s) => {
      const next = new Set(s);
      if (on) next.add(k);
      else next.delete(k);
      return next;
    });
  const saveList = (list: Template[]) => {
    const selected = list
      .filter((x) => picked.has(keyOf(x)))
      .map((x) => ({ name: x.name, language: x.language }));
    saveAllowList(selected)
      .then((s) => {
        fill(s);
        setListNote(t("integrations.gallabox.listSaved", { count: String(s.templates.length) }));
      })
      .catch((e) => setListNote(t("integrations.gallabox.failed", { error: errorOf(e) })));
  };

  return (
    <Panel testID="gallabox-settings">
      <Stack gap="md">
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {t("integrations.gallabox.title")}
        </Text>
        <Text variant="body" tone="muted">
          {t("integrations.gallabox.body")}
        </Text>
        <Stack direction="row" gap="sm" wrap>
          <Badge
            testID="gallabox-state"
            dot
            tone={configured ? "answer" : "neutral"}
            label={t(configured ? "integrations.gallabox.connected" : "integrations.gallabox.none")}
          />
        </Stack>
        {FIELDS.map((f) => (
          <TextField
            key={f.id}
            label={t(f.label)}
            value={input[f.id]}
            onChangeText={(v) => setInput((x) => ({ ...x, [f.id]: v }))}
            secureTextEntry={f.secret}
            autoCapitalize="none"
            autoCorrect={false}
            testID={`gallabox-${f.id}`}
          />
        ))}
        <Stack direction="row" gap="sm" wrap>
          <Button
            label={t("integrations.gallabox.save")}
            disabled={busy || (configured ? !FIELDS.some((f) => input[f.id].trim()) : !complete)}
            onPress={() => save(saveGallabox(input))}
            testID="gallabox-save"
          />
          {configured ? (
            <Button
              variant="ghost"
              label={t("integrations.gallabox.remove")}
              disabled={busy}
              onPress={() => save(removeGallabox())}
              testID="gallabox-remove"
            />
          ) : null}
        </Stack>
        {note ? (
          <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
            {note}
          </Text>
        ) : null}
        <Divider />
        <Text variant="body" weight="semibold" accessibilityRole="header">
          {t("integrations.gallabox.templates")}
        </Text>
        <Text variant="label" tone="muted">
          {t("integrations.gallabox.templatesBody")}
        </Text>
        <Stack direction="row" gap="sm" wrap>
          <Button
            variant="secondary"
            label={t(
              loaded === "loading" ? "integrations.gallabox.loading" : "integrations.gallabox.load",
            )}
            disabled={!configured || loaded === "loading"}
            onPress={load}
            testID="gallabox-load"
          />
        </Stack>
        {Array.isArray(loaded) ? (
          <Stack
            gap="xs"
            testID="gallabox-picker"
            accessibilityLabel={t("integrations.gallabox.pick")}
          >
            {loaded.map((x) => {
              const k = keyOf(x);
              const approved = !x.status || x.status === "APPROVED";
              const params = fieldsOf(x).map((p) => p.name);
              return (
                <ToggleRow
                  key={k}
                  label={`${x.name} · ${x.language}${x.category ? ` · ${x.category}` : ""}`}
                  description={
                    approved
                      ? params.length
                        ? t("integrations.gallabox.params", { params: params.join(", ") })
                        : t("integrations.gallabox.noParams")
                      : t("integrations.gallabox.notApproved", { status: x.status })
                  }
                  value={picked.has(k)}
                  onValueChange={(on) => approved && toggle(k, on)}
                  testID={`gallabox-pick-${k}`}
                />
              );
            })}
            <Stack direction="row" gap="sm" wrap>
              <Button
                label={t("integrations.gallabox.saveList")}
                onPress={() => saveList(loaded)}
                testID="gallabox-save-list"
              />
            </Stack>
          </Stack>
        ) : (
          <Stack gap="xs" testID="gallabox-allowed">
            <Text variant="label" weight="medium" tone="muted">
              {t("integrations.gallabox.allowed")}
            </Text>
            {status?.templates.length ? (
              status.templates.map((x) => (
                <Text key={keyOf(x)} variant="body">
                  {`${x.name} · ${x.language}`}
                </Text>
              ))
            ) : (
              <Text variant="body" tone="muted">
                {t("integrations.gallabox.empty")}
              </Text>
            )}
          </Stack>
        )}
        {listNote ? (
          <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
            {listNote}
          </Text>
        ) : null}
      </Stack>
    </Panel>
  );
}
