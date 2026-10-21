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
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Linking, Pressable, StyleSheet, View } from "react-native";
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
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState<string[]>([]);
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
  // Only vendors in use, with a key, or picked from "Add a provider" are shown (owner, 21 Oct).
  const inUse = new Set(data.stages.map((st) => st.provider_id));
  const shown = (p: Provider) => p.key_set || p.custom || inUse.has(p.id) || added.includes(p.id);
  const q = query.trim().toLowerCase();
  const match = (p: Provider) => !q || p.name.toLowerCase().includes(q) || p.id.includes(q);
  const group = (kind: ProviderKind) =>
    data.providers.filter((p) => p.kind === kind && shown(p) && match(p));
  const more = data.providers.filter((p) => !shown(p) && match(p));
  return (
    <Stack gap="xl" testID="admin-keys">
      <Text variant="body" tone="muted">
        {t("admin.keys.subtitle")}
      </Text>
      <SetupChecklist data={data} />
      <View style={styles.tools}>
        <View style={styles.grow}>
          <TextField
            accessibilityLabel={t("admin.keys.search")}
            placeholder={t("admin.keys.search")}
            value={query}
            onChangeText={setQuery}
            testID="keys-search"
          />
        </View>
        <AddProvider
          options={more}
          onPick={(id) => {
            setAdded((list) => [...list, id]);
            setQuery("");
          }}
        />
      </View>
      <Section title={t("admin.keys.llm")} count={group("llm").length}>
        {group("llm").map((p) => (
          <ProviderCard key={p.id} provider={p} onChange={update} />
        ))}
      </Section>
      <Section title={t("admin.keys.custom.title")} hint={t("admin.keys.custom.hint")}>
        <EndpointForm onChange={update} />
      </Section>
      <Section title={t("admin.keys.stt")} count={group("stt").length}>
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

/** First run (T-037): the three things a new company needs before a call helps. Shown until both
 * keys are set; each step uses the vendor's own catalogue copy and "Get a key" link. */
function SetupChecklist({ data }: { data: ProvidersState }) {
  const { t } = useI18n();
  const { color } = useTheme();
  const vendorOf = (stageId: string) => {
    const id = data.stages.find((s) => s.id === stageId)?.provider_id;
    return data.providers.find((p) => p.id === id) ?? null;
  };
  const model = vendorOf("suggest");
  const speech = vendorOf("stt");
  if (model?.key_set && speech?.key_set) return null;
  const steps: { id: string; title: string; done: boolean; vendor: Provider | null }[] = [
    { id: "suggest", title: t("admin.keys.setup.model"), done: !!model?.key_set, vendor: model },
    { id: "stt", title: t("admin.keys.setup.stt"), done: !!speech?.key_set, vendor: speech },
    {
      id: "playbook",
      title: t("admin.keys.setup.playbook"),
      done: (data.playbook_entries ?? 0) > 0,
      vendor: null,
    },
  ];
  return (
    <Panel testID="setup-checklist">
      <Stack gap="md">
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {t("admin.keys.setup.title")}
        </Text>
        {steps.map((step, i) => (
          <View key={step.id} style={styles.step} testID={`setup-${step.id}`}>
            <View
              style={[
                styles.stepMark,
                {
                  backgroundColor: color.surfaceSunken,
                  borderColor: step.done ? color.positive : color.border,
                },
              ]}
              accessibilityLabel={t(step.done ? "admin.keys.setup.done" : "admin.keys.setup.todo")}
            >
              <Text
                variant="label"
                weight="semibold"
                color={step.done ? color.positive : undefined}
              >
                {step.done ? "✓" : String(i + 1)}
              </Text>
            </View>
            <Stack gap="xs" style={styles.stepBody}>
              <Text variant="body" weight="semibold">
                {step.vendor ? `${step.title} — ${step.vendor.name}` : step.title}
              </Text>
              {step.vendor && !step.done && step.vendor.steps ? (
                <Text variant="label" tone="muted">
                  {step.vendor.steps}
                </Text>
              ) : null}
              {!step.done && step.vendor?.key_page ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(step.vendor?.key_page ?? "")}
                  style={styles.stepLink}
                >
                  <Text variant="label" weight="semibold" tone="primary">
                    {`${t("admin.keys.getKey")} ↗`}
                  </Text>
                </Pressable>
              ) : null}
              {!step.done && step.id === "playbook" ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push("/playbook")}
                  style={styles.stepLink}
                >
                  <Text variant="label" weight="semibold" tone="primary">
                    {t("admin.keys.setup.openPlaybook")}
                  </Text>
                </Pressable>
              ) : null}
            </Stack>
          </View>
        ))}
      </Stack>
    </Panel>
  );
}

function Section({
  title,
  hint,
  count,
  closed = false,
  children,
}: {
  title: string;
  hint?: string;
  count?: number;
  closed?: boolean;
  children: React.ReactNode;
}) {
  const { color } = useTheme();
  const [open, setOpen] = useState(!closed);
  return (
    <Stack gap="md">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.sectionHead}
      >
        <Chevron open={open} />
        <View style={styles.grow}>
          <Text variant="heading" weight="semibold" accessibilityRole="header">
            {title}
          </Text>
          {hint ? (
            <Text variant="label" tone="muted">
              {hint}
            </Text>
          ) : null}
        </View>
        {count !== undefined ? (
          <View style={[styles.count, { backgroundColor: color.surfaceSunken }]}>
            <Text variant="label" weight="semibold">
              {String(count)}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {open ? <Reveal>{children}</Reveal> : null}
    </Stack>
  );
}

/** A small turning arrow for open/closed rows. */
function Chevron({ open }: { open: boolean }) {
  const { color } = useTheme();
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(turn, { toValue: open ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [open, turn]);
  return (
    <Animated.View
      style={[
        styles.chevron,
        {
          borderColor: color.textMuted,
          transform: [
            { rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["-45deg", "45deg"] }) },
          ],
        },
      ]}
    />
  );
}

/** Fades and slides content in when a section opens. */
function Reveal({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [v]);
  return (
    <Animated.View
      style={{
        gap: 12,
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** "Add a provider": a pick list of the vendors not shown yet. */
function AddProvider({ options, onPick }: { options: Provider[]; onPick: (id: string) => void }) {
  const { t } = useI18n();
  const { color } = useTheme();
  const [open, setOpen] = useState(false);
  if (options.length === 0) return null;
  return (
    <View style={styles.addWrap}>
      <Button
        variant="secondary"
        label={t("admin.keys.add")}
        onPress={() => setOpen(!open)}
        testID="keys-add"
      />
      {open ? (
        <View
          accessibilityRole="menu"
          style={[
            styles.menu,
            { backgroundColor: color.surface, borderColor: color.border, shadowColor: color.scrim },
          ]}
          testID="keys-add-menu"
        >
          {options.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="menuitem"
              onPress={() => {
                setOpen(false);
                onPick(p.id);
              }}
              style={styles.menuItem}
              testID={`keys-add-${p.id}`}
            >
              <Text weight="medium">{p.name}</Text>
              <Text variant="label" tone="muted" numberOfLines={1}>
                {`${t(p.kind === "llm" ? "admin.keys.llm" : "admin.keys.stt")} · ${p.free}`}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
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
  const [open, setOpen] = useState(!p.key_set || Boolean(p.custom));

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
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(!open)}
          style={styles.cardHead}
          testID={`provider-toggle-${p.id}`}
        >
          <Chevron open={open} />
          <Text variant="body" weight="semibold" style={styles.grow}>
            {p.name}
          </Text>
          <Badge label={t(status.label)} tone={status.tone} dot />
        </Pressable>
        {open ? (
          <Reveal>
            {p.custom ? (
              <Text variant="label" tone="muted">
                {p.base_url}
              </Text>
            ) : (
              <>
                <Text variant="label" tone="muted">
                  {p.free}
                </Text>
                <Text variant="label">{p.steps}</Text>
              </>
            )}
            {p.custom ? null : (
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
            )}
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
            {p.key_set || p.custom ? (
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
                {p.custom ? (
                  <Button
                    label={t("admin.keys.custom.remove")}
                    variant="ghost"
                    disabled={busy !== null}
                    onPress={() =>
                      run(
                        "remove",
                        () => keysApi.removeEndpoint(p.id),
                        () => "",
                      )
                    }
                    testID={`endpoint-remove-${p.id}`}
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
          </Reveal>
        ) : null}
      </Stack>
    </Panel>
  );
}

function EndpointForm({ onChange }: { onChange: (next: ProvidersState) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    setError(null);
    keysApi.addEndpoint(name.trim(), url.trim(), key.trim()).then(
      (next) => {
        onChange(next);
        setName("");
        setUrl("");
        setKey("");
      },
      (err: unknown) => setError(errorText(err)),
    );
  };
  return (
    <Panel testID="endpoint-form">
      <Stack gap="sm">
        <TextField
          label={t("admin.keys.custom.name")}
          value={name}
          onChangeText={setName}
          maxLength={40}
          testID="endpoint-name"
        />
        <TextField
          label={t("admin.keys.custom.url")}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          testID="endpoint-url"
        />
        <TextField
          label={t("admin.keys.custom.key")}
          value={key}
          onChangeText={setKey}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          testID="endpoint-key"
        />
        <View>
          <Button
            label={t("admin.keys.custom.add")}
            variant="secondary"
            disabled={name.trim().length < 2 || url.trim() === ""}
            onPress={add}
            testID="endpoint-add"
          />
        </View>
        {error ? (
          <Text variant="label" tone="danger">
            {error}
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
  const usable = (p: Provider) => p.client !== false;
  const [vendor, setVendor] = useState(stage.provider_id ?? options.find(usable)?.id ?? "");
  const [model, setModel] = useState(stage.model ?? "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setVendor(stage.provider_id ?? "");
    setModel(stage.model ?? "");
  }, [stage.provider_id, stage.model]);
  const chosen = options.find((p) => p.id === vendor);
  const dirty = vendor !== stage.provider_id || model !== stage.model;
  const pick = (id: string) => {
    const next = options.find((p) => p.id === id);
    if (next && !usable(next)) return;
    setVendor(id);
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
            const off = !usable(p);
            return (
              <Pressable
                key={p.id}
                accessibilityRole="radio"
                aria-checked={active}
                aria-disabled={off}
                accessibilityState={{ checked: active, disabled: off }}
                disabled={off}
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
                  tone={active ? "primary" : off ? "muted" : "default"}
                >
                  {p.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {options.some((p) => !usable(p)) ? (
          <Text variant="label" tone="muted">
            {t("admin.keys.notInApp", {
              names: options
                .filter((p) => !usable(p))
                .map((p) => p.name)
                .join(", "),
            })}
          </Text>
        ) : null}
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
        <Speed stage={stage} onChange={onChange} />
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

function Speed({
  stage,
  onChange,
}: {
  stage: StageChoice;
  onChange: (next: ProvidersState) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (stage.kind === "stt") {
    return (
      <Text variant="label" tone="muted">
        {t("admin.keys.speedStt")}
      </Text>
    );
  }
  const b = stage.benchmark;
  const slow = b?.ok && stage.deadline_ms && b.worst_ms !== null && b.worst_ms > stage.deadline_ms;
  const measure = () => {
    setBusy(true);
    setError(null);
    keysApi
      .measure(stage.id)
      .then(onChange, (err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(false));
  };
  return (
    <View style={styles.speed} testID={`speed-${stage.id}`}>
      <Text variant="label" tone={b && !b.ok ? "danger" : "muted"} style={styles.grow}>
        {!b
          ? t("admin.keys.speedNone")
          : b.ok
            ? t("admin.keys.speed", { p50: b.p50_ms ?? 0, worst: b.worst_ms ?? 0, n: b.samples })
            : t("admin.keys.speedFailed", { detail: b.detail })}
        {slow ? ` ${t("admin.keys.speedSlow", { deadline: stage.deadline_ms ?? 0 })}` : ""}
      </Text>
      <Button
        label={t(busy ? "admin.keys.measuring" : "admin.keys.measure")}
        variant="secondary"
        disabled={busy}
        onPress={measure}
        testID={`measure-${stage.id}`}
      />
      {error ? (
        <Text variant="label" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tools: { flexDirection: "row", alignItems: "flex-start", gap: 12, flexWrap: "wrap", zIndex: 10 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  chevron: { width: 8, height: 8, borderRightWidth: 2, borderBottomWidth: 2, marginHorizontal: 4 },
  count: {
    minWidth: 28,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  addWrap: { position: "relative" },
  menu: {
    position: "absolute",
    top: 52,
    right: 0,
    width: 320,
    maxHeight: 360,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    overflow: "scroll",
  },
  menuItem: { paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  stepMark: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLink: { minHeight: minTouchTarget, justifyContent: "center", alignSelf: "flex-start" },
  stepBody: { flex: 1, minWidth: 0 },
  speed: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  grow: { flexGrow: 1, flexShrink: 1, minWidth: 200 },
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
