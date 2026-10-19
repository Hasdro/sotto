/**
 * Admin: Keys & providers (R6, P6.7, D-019/D-020). Per vendor: where to get a key, paste it
 * (write-only), test it, remove it. Per job (stage): which vendor and model the next call uses.
 */
import {
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  minTouchTarget,
  Panel,
  radius,
  Stack,
  space,
  Text,
  TextField,
  useTheme,
} from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import {
  keyStatus,
  keysApi,
  type Provider,
  type ProviderKind,
  type ProvidersState,
  type StageChoice,
} from "../../features/keys/api";
import type { StringKey } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";
import { ApiError } from "../../lib/server";

const STATUS: Record<ReturnType<typeof keyStatus>, { label: StringKey; tone: BadgeTone }> = {
  none: { label: "admin.keys.none", tone: "neutral" },
  panel: { label: "admin.keys.panel", tone: "primary" },
  server: { label: "admin.keys.server", tone: "primary" },
  ok: { label: "admin.keys.ok", tone: "answer" },
  failed: { label: "admin.keys.failed", tone: "warning" },
};

type Load =
  | { status: "loading" }
  | { status: "offline" }
  | { status: "ready"; data: ProvidersState };

export default function KeysScreen() {
  const { t } = useI18n();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const refresh = useCallback(() => {
    keysApi
      .list()
      .then((data) => setLoad({ status: "ready", data }))
      .catch(() => setLoad({ status: "offline" }));
  }, []);
  useEffect(refresh, [refresh]);

  if (load.status === "offline") {
    return (
      <EmptyState
        title={t("admin.keys.offline.title")}
        body={t("admin.keys.offline.body")}
        code="pnpm demo"
        action={{ label: t("call.offline.retry"), onPress: refresh }}
      />
    );
  }
  if (load.status === "loading") {
    return <Text tone="muted">{t("call.connecting.title")}</Text>;
  }
  const { data } = load;
  const update = (next: ProvidersState) => setLoad({ status: "ready", data: next });
  const group = (kind: ProviderKind) => data.providers.filter((p) => p.kind === kind);
  return (
    <Stack gap="xl" testID="admin-keys">
      <Text variant="body" tone="muted">
        {t("admin.keys.subtitle")}
      </Text>
      <Section title={t("admin.keys.llm")}>
        {group("llm").map((p) => (
          <ProviderCard key={p.id} provider={p} onChange={update} />
        ))}
      </Section>
      <Section title={t("admin.keys.stt")}>
        {group("stt").map((p) => (
          <ProviderCard key={p.id} provider={p} onChange={update} />
        ))}
      </Section>
      <Section title={t("admin.keys.stages")} hint={t("admin.keys.stagesHint")}>
        {data.stages.map((stage) => (
          <StageRow key={stage.id} stage={stage} providers={data.providers} onChange={update} />
        ))}
      </Section>
    </Stack>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap="md">
      <View>
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {title}
        </Text>
        {hint ? (
          <Text variant="label" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </Stack>
  );
}

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : String(err);
}

function ProviderCard({
  provider: p,
  onChange,
}: {
  provider: Provider;
  onChange: (next: ProvidersState) => void;
}) {
  const { t } = useI18n();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<null | "save" | "test" | "remove">(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const status = STATUS[keyStatus(p)];

  const run = (
    kind: "save" | "test" | "remove",
    action: () => Promise<ProvidersState>,
    done: (s: ProvidersState) => string,
  ) => {
    setBusy(kind);
    setMessage(null);
    action()
      .then((next) => {
        onChange(next);
        setMessage({ ok: next.result?.ok ?? true, text: done(next) });
        if (kind === "save") setKey("");
      })
      .catch((err: unknown) => setMessage({ ok: false, text: errorText(err) }))
      .finally(() => setBusy(null));
  };

  return (
    <Panel testID={`provider-${p.id}`}>
      <Stack gap="sm">
        <Stack direction="row" align="center" justify="space-between" gap="sm" wrap>
          <Text variant="body" weight="semibold">
            {p.name}
          </Text>
          <Badge label={t(status.label)} tone={status.tone} dot />
        </Stack>
        <Text variant="label" tone="muted">
          {p.free}
        </Text>
        <Text variant="label">{p.steps}</Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(p.key_page)}
          style={styles.link}
          testID={`get-key-${p.id}`}
        >
          <Text variant="label" weight="semibold" tone="primary">
            {`${t("admin.keys.getKey")} ↗`}
          </Text>
        </Pressable>
        <View style={styles.row}>
          <TextField
            accessibilityLabel={t("admin.keys.input", { name: p.name })}
            placeholder={t("admin.keys.input", { name: p.name })}
            value={key}
            onChangeText={setKey}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            maxLength={400}
            testID={`key-input-${p.id}`}
          />
          <Button
            label={t("admin.keys.save")}
            disabled={key.trim().length === 0 || busy !== null}
            onPress={() =>
              run(
                "save",
                () => keysApi.saveKey(p.id, key.trim()),
                () => t("admin.keys.saved"),
              )
            }
            testID={`key-save-${p.id}`}
          />
        </View>
        {p.key_set ? (
          <Stack direction="row" gap="sm" wrap>
            <Button
              label={busy === "test" ? t("admin.keys.testing") : t("admin.keys.test")}
              variant="secondary"
              disabled={busy !== null}
              onPress={() =>
                run(
                  "test",
                  () => keysApi.test(p.id),
                  (s) => s.result?.detail ?? "",
                )
              }
              testID={`key-test-${p.id}`}
            />
            {p.key_source === "panel" ? (
              <Button
                label={t("admin.keys.remove")}
                variant="ghost"
                disabled={busy !== null}
                onPress={() =>
                  run(
                    "remove",
                    () => keysApi.removeKey(p.id),
                    () => t("admin.keys.removed"),
                  )
                }
                testID={`key-remove-${p.id}`}
              />
            ) : null}
          </Stack>
        ) : null}
        {message ? (
          <Text
            variant="label"
            tone={message.ok ? "positive" : "danger"}
            accessibilityLiveRegion="polite"
          >
            {message.text}
          </Text>
        ) : p.test?.ok === false && p.test.detail ? (
          <Text variant="label" tone="danger">
            {p.test.detail}
          </Text>
        ) : null}
      </Stack>
    </Panel>
  );
}

function StageRow({
  stage,
  providers,
  onChange,
}: {
  stage: StageChoice;
  providers: Provider[];
  onChange: (next: ProvidersState) => void;
}) {
  const { t } = useI18n();
  const { color } = useTheme();
  const options = providers.filter((p) => p.kind === stage.kind);
  const [vendor, setVendor] = useState(stage.provider_id ?? options[0]?.id ?? "");
  const [model, setModel] = useState(stage.model ?? "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setVendor(stage.provider_id ?? "");
    setModel(stage.model ?? "");
  }, [stage.provider_id, stage.model]);
  const chosen = options.find((p) => p.id === vendor);
  const dirty = vendor !== stage.provider_id || model !== stage.model;
  const pick = (id: string) => {
    setVendor(id);
    const next = options.find((p) => p.id === id);
    if (next && !next.models.includes(model)) setModel(next.models[0] ?? "");
  };
  const act = (action: () => Promise<ProvidersState>) => {
    setError(null);
    action().then(onChange, (err: unknown) => setError(errorText(err)));
  };
  return (
    <Panel testID={`stage-${stage.id}`}>
      <Stack gap="sm">
        <Stack direction="row" align="center" justify="space-between" gap="sm" wrap>
          <Text variant="body" weight="semibold">
            {stage.label}
          </Text>
          <Badge
            label={t(stage.source === "panel" ? "admin.keys.custom" : "admin.keys.default")}
            tone={stage.source === "panel" ? "primary" : "neutral"}
          />
        </Stack>
        <Text variant="label" tone="muted">
          {t("admin.keys.vendor")}
        </Text>
        <View
          style={styles.chips}
          accessibilityRole="radiogroup"
          accessibilityLabel={t("admin.keys.vendor")}
        >
          {options.map((p) => {
            const active = p.id === vendor;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                onPress={() => pick(p.id)}
                testID={`stage-${stage.id}-vendor-${p.id}`}
                style={[
                  styles.chip,
                  {
                    borderColor: active ? color.primary : color.borderStrong,
                    backgroundColor: active ? color.surfaceSunken : color.surface,
                  },
                ]}
              >
                <Text
                  variant="label"
                  weight={active ? "semibold" : "regular"}
                  tone={active ? "primary" : "default"}
                >
                  {p.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {chosen && !chosen.key_set ? (
          <Text variant="label" tone="notice">
            {t("admin.keys.noKey", { name: chosen.name })}
          </Text>
        ) : null}
        <TextField
          label={t("admin.keys.model")}
          value={model}
          onChangeText={setModel}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={200}
          testID={`stage-${stage.id}-model`}
        />
        {chosen && chosen.models.length > 0 ? (
          <View style={styles.chips}>
            {chosen.models.slice(0, 12).map((m) => (
              <Pressable
                key={m}
                accessibilityRole="button"
                onPress={() => setModel(m)}
                style={[
                  styles.modelChip,
                  { borderColor: m === model ? color.primary : color.border },
                ]}
              >
                <Text variant="label" tone={m === model ? "primary" : "muted"}>
                  {m}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Stack direction="row" gap="sm" wrap>
          <Button
            label={t("admin.keys.use")}
            disabled={!dirty || !vendor || model.trim() === ""}
            onPress={() => act(() => keysApi.setStage(stage.id, vendor, model.trim()))}
            testID={`stage-${stage.id}-save`}
          />
          {stage.source === "panel" ? (
            <Button
              label={t("admin.keys.reset")}
              variant="ghost"
              onPress={() => act(() => keysApi.resetStage(stage.id))}
            />
          ) : null}
        </Stack>
        {error ? (
          <Text variant="label" tone="danger">
            {error}
          </Text>
        ) : null}
      </Stack>
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, flexWrap: "wrap" },
  link: { minHeight: minTouchTarget, justifyContent: "center", alignSelf: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: radius.pill,
  },
  modelChip: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
});
