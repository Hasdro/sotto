/**
 * Admin → Integrations › WhatsApp (T-064/T-071, D-033, D-039; ZC-07). The admin types only the
 * Gallabox API key, secret and account ID. After a valid key the server pulls the WhatsApp
 * numbers and the APPROVED templates into pick lists: one number is chosen by itself, every
 * approved template starts ticked, and each parameter's source is guessed, so only the
 * unmapped ones are shown. Channel ids never reach the app (opaque refs); D-033 is unchanged:
 * templates only.
 */
import {
  Badge,
  Button,
  Disclosure,
  Divider,
  Panel,
  SegmentedControl,
  Stack,
  Text,
  TextField,
  ToggleRow,
} from "@sotto/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Discovered,
  gallaboxChannel,
  gallaboxDiscover,
  SOURCES,
  saveAllowListMapped,
} from "../integrations/api";
import { type IntegrationsKey, useIntegrationsText } from "../integrations/strings";
import {
  type GallaboxInput,
  type GallaboxStatus,
  gallaboxStatus,
  keyOf,
  removeGallabox,
  saveGallabox,
  type Template,
} from "./api";
import { useWhatsAppText, type WhatsAppKey } from "./strings";

const KEYS: { id: keyof GallaboxInput; label: WhatsAppKey; secret: boolean }[] = [
  { id: "api_key", label: "integrations.gallabox.apiKey", secret: true },
  { id: "api_secret", label: "integrations.gallabox.apiSecret", secret: true },
  { id: "account_id", label: "integrations.gallabox.accountId", secret: false },
];
const EMPTY: GallaboxInput = { api_key: "", api_secret: "", account_id: "", channel_id: "" };
const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
type Mapping = Record<string, Record<string, string>>; // template key → param → source

export function GallaboxSettings() {
  const t = useWhatsAppText();
  const ti = useIntegrationsText();
  const [status, setStatus] = useState<GallaboxStatus | null>(null);
  const [input, setInput] = useState<GallaboxInput>(EMPTY);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Discovered | "loading" | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mapping, setMapping] = useState<Mapping>({});
  const [listNote, setListNote] = useState<string | null>(null);
  // The text function is new on every render: read it through a ref so loading runs once.
  const tRef = useRef(t);
  tRef.current = t;

  const discover = useCallback((saved: GallaboxStatus | null) => {
    setFound("loading");
    setListNote(null);
    gallaboxDiscover()
      .then((d) => {
        setFound(d);
        setStatus(d.status);
        // The allow-list defaults to every approved template (ZC-07); a saved list wins.
        const kept = (saved ?? d.status).templates.map(keyOf);
        setPicked(new Set(kept.length ? kept : d.templates.map(keyOf)));
      })
      .catch((e) => {
        setFound(null);
        setListNote(tRef.current("integrations.gallabox.loadFailed", { error: errorOf(e) }));
      });
  }, []);
  useEffect(() => {
    gallaboxStatus()
      .then((s) => {
        setStatus(s);
        setPicked(new Set(s.templates.map(keyOf)));
        if (s.configured) discover(s);
      })
      .catch(() => {});
  }, [discover]);

  const configured = status?.configured === true;
  const complete = KEYS.every((f) => input[f.id].trim());
  const changed = KEYS.some((f) => input[f.id].trim()) || Boolean(input.channel_id.trim());
  const saveWhy = busy
    ? ti("smtp.why.busy")
    : configured
      ? changed
        ? undefined
        : ti("gallabox.why.changed")
      : complete
        ? undefined
        : ti("gallabox.why.keys");
  const save = () => {
    setBusy(true);
    setNote(null);
    saveGallabox(input)
      .then((s) => {
        setStatus(s);
        setInput(EMPTY);
        setNote(t("integrations.gallabox.saved"));
        discover(null); // after a valid key: fill the pick lists at once
      })
      .catch((e) => setNote(t("integrations.gallabox.failed", { error: errorOf(e) })))
      .finally(() => setBusy(false));
  };
  const remove = () => {
    setBusy(true);
    removeGallabox()
      .then((s) => {
        setStatus(s);
        setFound(null);
        setPicked(new Set());
      })
      .catch((e) => setNote(t("integrations.gallabox.failed", { error: errorOf(e) })))
      .finally(() => setBusy(false));
  };
  const pickChannel = (ref: string) =>
    gallaboxChannel(ref)
      .then((s) => {
        setStatus(s);
        setFound((d) =>
          d && d !== "loading"
            ? { ...d, channels: d.channels.map((c) => ({ ...c, selected: c.ref === ref })) }
            : d,
        );
      })
      .catch((e) => setListNote(t("integrations.gallabox.failed", { error: errorOf(e) })));
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
      .map((x) => ({
        name: x.name,
        language: x.language,
        ...(mapping[keyOf(x)] ? { mapping: mapping[keyOf(x)] } : {}),
      }));
    saveAllowListMapped(selected)
      .then((s) => {
        setStatus(s);
        setListNote(t("integrations.gallabox.listSaved", { count: String(s.templates.length) }));
      })
      .catch((e) => setListNote(t("integrations.gallabox.failed", { error: errorOf(e) })));
  };
  const ready = found && found !== "loading" ? found : null;

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
        {KEYS.map((f) => (
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
            disabled={Boolean(saveWhy)}
            helper={saveWhy}
            onPress={save}
            testID="gallabox-save"
          />
          {configured ? (
            <Button
              variant="ghost"
              label={t("integrations.gallabox.remove")}
              disabled={busy}
              onPress={remove}
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
          {ti("gallabox.channel.title")}
        </Text>
        {ready && ready.channels.length > 1 ? (
          <Stack gap="xs" testID="gallabox-channels">
            <Text variant="label" tone="muted">
              {ti("gallabox.channel.pick")}
            </Text>
            <SegmentedControl
              options={ready.channels.map((c) => ({ value: c.ref, label: c.label }))}
              value={ready.channels.find((c) => c.selected)?.ref ?? ""}
              onChange={pickChannel}
              accessibilityLabel={ti("gallabox.channel.pick")}
              testID="gallabox-channel-pick"
            />
          </Stack>
        ) : status?.channel?.set ? (
          <Text variant="body" testID="gallabox-channel">
            {ti("gallabox.channel.one", { label: status.channel.label || "WhatsApp" })}
          </Text>
        ) : ready ? (
          <Text variant="label" tone="muted" testID="gallabox-channel-none">
            {ti("gallabox.channel.none")}
          </Text>
        ) : null}
        {configured && !status?.channel?.set ? (
          <Disclosure title={ti("gallabox.channel.manual")} testID="gallabox-channel-manual">
            <TextField
              label={t("integrations.gallabox.channelId")}
              value={input.channel_id}
              onChangeText={(v) => setInput((x) => ({ ...x, channel_id: v }))}
              autoCapitalize="none"
              autoCorrect={false}
              testID="gallabox-channel_id"
            />
          </Disclosure>
        ) : null}

        <Divider />
        <Text variant="body" weight="semibold" accessibilityRole="header">
          {t("integrations.gallabox.templates")}
        </Text>
        {ready ? (
          <TemplatePicker
            found={ready}
            picked={picked}
            mapping={mapping}
            onToggle={toggle}
            onMap={(k, param, source) =>
              setMapping((m) => ({ ...m, [k]: { ...(m[k] ?? {}), [param]: source } }))
            }
            onSave={() => saveList(ready.templates)}
            onReload={() => discover(status)}
          />
        ) : (
          <Stack gap="xs">
            <Text variant="label" tone="muted">
              {found === "loading" ? t("integrations.gallabox.loading") : ti("gallabox.why.load")}
            </Text>
            {configured && found !== "loading" ? (
              <Button
                variant="secondary"
                label={t("integrations.gallabox.load")}
                onPress={() => discover(status)}
                testID="gallabox-load"
              />
            ) : null}
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

function TemplatePicker({
  found,
  picked,
  mapping,
  onToggle,
  onMap,
  onSave,
  onReload,
}: {
  found: Discovered;
  picked: Set<string>;
  mapping: Mapping;
  onToggle: (k: string, on: boolean) => void;
  onMap: (k: string, param: string, source: string) => void;
  onSave: () => void;
  onReload: () => void;
}) {
  const t = useWhatsAppText();
  const ti = useIntegrationsText();
  if (found.templates.length === 0) {
    return (
      <Stack gap="xs" testID="gallabox-picker">
        <Text variant="label" tone="muted">
          {ti("gallabox.templates.none")}
        </Text>
        <Button
          variant="secondary"
          label={ti("gallabox.templates.reload")}
          onPress={onReload}
          testID="gallabox-load"
        />
      </Stack>
    );
  }
  return (
    <Stack gap="sm" testID="gallabox-picker" accessibilityLabel={t("integrations.gallabox.pick")}>
      <Text variant="label" tone="muted">
        {ti("gallabox.templates.found", { count: String(found.templates.length) })}
        {found.hidden ? ` ${ti("gallabox.templates.hidden", { count: String(found.hidden) })}` : ""}
      </Text>
      {found.templates.map((x) => {
        const k = keyOf(x);
        const unmapped = found.unmapped[k] ?? [];
        const mapped = x.params.filter((p) => p.source).map((p) => p.name);
        return (
          <Stack key={k} gap="xs">
            <ToggleRow
              label={`${x.name} · ${x.language}${x.category ? ` · ${x.category}` : ""}`}
              description={
                mapped.length
                  ? t("integrations.gallabox.params", { params: [...new Set(mapped)].join(", ") })
                  : undefined
              }
              value={picked.has(k)}
              onValueChange={(on) => onToggle(k, on)}
              testID={`gallabox-pick-${k}`}
            />
            {picked.has(k)
              ? unmapped.map((param) => (
                  <SourcePick
                    key={param}
                    param={param}
                    value={mapping[k]?.[param] ?? ""}
                    onChange={(source) => onMap(k, param, source)}
                    testID={`gallabox-map-${k}-${param}`}
                  />
                ))
              : null}
          </Stack>
        );
      })}
      <Button
        label={t("integrations.gallabox.saveList")}
        disabled={picked.size === 0}
        helper={picked.size === 0 ? ti("gallabox.why.pick") : undefined}
        onPress={onSave}
        testID="gallabox-save-list"
      />
    </Stack>
  );
}

/** One unmapped parameter: where its value comes from (or the agent types it). */
function SourcePick({
  param,
  value,
  onChange,
  testID,
}: {
  param: string;
  value: string;
  onChange: (source: string) => void;
  testID: string;
}) {
  const ti = useIntegrationsText();
  const options = ["", ...SOURCES];
  return (
    <Stack gap="xs" testID={testID}>
      <Text variant="label" weight="medium" tone="muted">
        {ti("gallabox.map.title", { param: `{{${param}}}` })}
      </Text>
      <Stack direction="row" gap="xs" wrap accessibilityRole="radiogroup">
        {options.map((o) => (
          <Button
            key={o || "typed"}
            size="md"
            variant={o === value ? "primary" : "ghost"}
            label={o ? ti(`source.${o}` as IntegrationsKey) : ti("gallabox.map.typed")}
            accessibilityLabel={`${o ? ti(`source.${o}` as IntegrationsKey) : ti("gallabox.map.typed")}${o === value ? " ✓" : ""}`}
            onPress={() => onChange(o)}
            testID={`${testID}-${o || "typed"}`}
          />
        ))}
      </Stack>
    </Stack>
  );
}
