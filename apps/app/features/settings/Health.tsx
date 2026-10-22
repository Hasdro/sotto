/**
 * Settings → Health check (owner, 22 Oct, ticked in the hub): one button that says whether the
 * server, the AI key, speech-to-text, the AI's measured speed and this computer's microphone are
 * ready. Read-only: it never saves a key or starts a call, and it never sends call words.
 */
import { Button, Icon, space, Text, useTheme } from "@sotto/ui";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { cloudOrigin } from "../../lib/cloud";
import type { StringKey } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";
import { apiOrigin } from "../../lib/server";
import { computerAudioAvailable } from "../call/mic";
import { keysApi, type ProvidersState } from "../keys/api";

export type HealthTone = "ok" | "warn" | "off";
export type HealthId = "server" | "ai" | "stt" | "mic" | "speed";
type Detail = { key: StringKey; params?: Record<string, string | number> };
export type HealthRow = {
  id: HealthId;
  tone: HealthTone;
  detail: Detail;
  /** A vendor name, when there is one to show. */
  text?: string;
};

export type HealthInput = {
  server: boolean;
  providers: ProvidersState | null;
  mic: boolean;
  computer: boolean;
};

const LABEL: Record<HealthId, StringKey> = {
  server: "settings.health.server",
  ai: "settings.health.ai",
  stt: "settings.health.stt",
  mic: "settings.health.mic",
  speed: "settings.health.speed",
};

const stage = (p: ProvidersState | null, id: string) => p?.stages.find((s) => s.id === id);
const provider = (p: ProvidersState | null, id: string | null | undefined) =>
  id ? p?.providers.find((x) => x.id === id) : undefined;

/** The five lines the panel shows. Pure, so the rules are tested without a browser. */
export function assessHealth(input: HealthInput): HealthRow[] {
  const { providers } = input;
  const aiStage = stage(providers, "suggest");
  const ai = provider(providers, aiStage?.provider_id);
  const sttStage = stage(providers, "stt");
  const stt = provider(providers, sttStage?.provider_id);
  const speed = aiStage?.benchmark?.p50_ms ?? null;
  const slow = speed !== null && speed > 1500;
  return [
    {
      id: "server",
      tone: input.server ? "ok" : "warn",
      detail: { key: input.server ? "settings.health.ok" : "settings.health.server.fail" },
    },
    {
      id: "ai",
      tone: !ai ? "off" : !ai.key_set ? "warn" : ai.test?.ok === false ? "warn" : "ok",
      detail: {
        key: !ai
          ? "settings.health.noStage"
          : !ai.key_set
            ? "settings.health.noKey"
            : ai.test?.ok === false
              ? "settings.health.testFailed"
              : "settings.health.ok",
      },
      ...(ai ? { text: ai.name } : {}),
    },
    {
      id: "stt",
      tone: !stt
        ? "off"
        : stt.client === false
          ? "warn"
          : !stt.key_set
            ? "warn"
            : stt.test?.ok === false
              ? "warn"
              : "ok",
      detail: {
        key: !stt
          ? "settings.health.noStage"
          : stt.client === false
            ? "settings.health.notInApp"
            : !stt.key_set
              ? "settings.health.noKey"
              : stt.test?.ok === false
                ? "settings.health.testFailed"
                : "settings.health.ok",
      },
      ...(stt ? { text: stt.name } : {}),
    },
    {
      id: "mic",
      tone: input.mic ? "ok" : "warn",
      detail: {
        key: input.mic
          ? input.computer
            ? "settings.health.computer"
            : "settings.health.micOnly"
          : "settings.health.noMic",
      },
    },
    {
      id: "speed",
      tone: speed === null ? "off" : slow ? "warn" : "ok",
      detail: {
        key:
          speed === null
            ? "settings.health.noBenchmark"
            : slow
              ? "settings.health.speedSlow"
              : "settings.health.speedDetail",
        ...(speed === null ? {} : { params: { ms: speed } }),
      },
    },
  ];
}

async function ping(): Promise<boolean> {
  const base = cloudOrigin() ?? apiOrigin();
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 5000);
  try {
    const r = await fetch(`${base}/healthz`, { signal: stop.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function hasMicrophone(): Promise<boolean> {
  const media = (globalThis as { navigator?: Navigator }).navigator?.mediaDevices;
  try {
    const all = await media?.enumerateDevices?.();
    return Boolean(all?.some((d) => d.kind === "audioinput"));
  } catch {
    return false;
  }
}

export function Health() {
  const { t } = useI18n();
  const { color, card } = useTheme();
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [rows, setRows] = useState<HealthRow[]>([]);
  const run = async () => {
    setState("running");
    const [server, providers, mic] = await Promise.all([
      ping(),
      keysApi.list().catch(() => null),
      hasMicrophone(),
    ]);
    setRows(assessHealth({ server, providers, mic, computer: computerAudioAvailable() }));
    setState("done");
  };
  const tone = (r: HealthRow) =>
    r.tone === "ok" ? color.positive : r.tone === "warn" ? card.warning.accent : color.textMuted;
  return (
    <View style={styles.wrap} testID="health">
      <Text variant="body" tone="muted">
        {t("settings.health.body")}
      </Text>
      <View>
        <Button
          label={t(state === "running" ? "settings.health.running" : "settings.health.run")}
          variant="secondary"
          disabled={state === "running"}
          onPress={() => void run()}
          testID="health-run"
        />
      </View>
      {state === "done" ? (
        <View style={styles.rows}>
          {rows.map((r) => (
            <View key={r.id} style={[styles.row, { borderTopColor: color.border }]}>
              <Icon
                name={r.tone === "ok" ? "check" : r.tone === "warn" ? "info" : "close"}
                size={16}
                color={tone(r)}
              />
              <Text variant="label" weight="semibold" style={styles.label}>
                {t(LABEL[r.id])}
              </Text>
              <Text variant="label" tone="muted" style={styles.detail} numberOfLines={2}>
                {r.text ? `${r.text} · ` : ""}
                {t(r.detail.key, r.detail.params)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  rows: { gap: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  label: { width: 150 },
  detail: { flex: 1, minWidth: 0 },
});
