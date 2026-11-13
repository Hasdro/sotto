/**
 * One Zoho write the agent approves on its own card (R12, T-062): edit the fields, then
 * "Approve and save" or "Dismiss". Nothing is sent before the press. The card keeps one
 * idempotency key for its whole life, so a retry after a timeout never writes twice.
 */
import { Button, Panel, Stack, Text, TextField } from "@sotto/ui";
import { useRef, useState } from "react";
import { CloudError } from "../../lib/cloud";
import type { StringKey } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";
import { type ActionKind, zohoAction } from "../crm/api";

export type FieldSpec = { name: string; label: StringKey; multiline?: boolean };
export type Perform = typeof zohoAction;

export function newKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

type Phase = "idle" | "saving" | "saved" | "failed" | "reconnect" | "unknown" | "dismissed";

export function ActionCard({
  kind,
  title,
  specs,
  initial,
  build,
  perform = zohoAction,
  onSaved,
}: {
  kind: ActionKind;
  title: string;
  specs: FieldSpec[];
  initial: Record<string, string>;
  /** Turns the edited values into the request fields, or returns a string key for an error. */
  build: (values: Record<string, string>) => Record<string, string> | StringKey;
  perform?: Perform;
  onSaved?: (id: string) => void;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState(initial);
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<StringKey | null>(null);
  const key = useRef(newKey());

  if (phase === "dismissed") {
    return (
      <Text variant="label" tone="muted" testID={`action-${kind}-dismissed`}>
        {`${title} · ${t("actions.dismissed")}`}
      </Text>
    );
  }
  const approve = () => {
    const fields = build(values);
    if (typeof fields === "string") {
      setProblem(fields);
      return;
    }
    setProblem(null);
    setPhase("saving");
    perform(kind, fields, key.current)
      .then((r) => {
        setPhase("saved");
        onSaved?.(r.id);
      })
      .catch((e: unknown) => {
        const code = e instanceof CloudError ? e.code : "";
        // zoho_unknown: Zoho may have saved it; the server keeps the key, so no retry here.
        setPhase(
          code === "zoho_reconnect" ? "reconnect" : code === "zoho_unknown" ? "unknown" : "failed",
        );
      });
  };
  const done = phase === "saved" || phase === "unknown";
  return (
    <Panel sunken testID={`action-${kind}`}>
      <Stack gap="sm">
        <Text weight="semibold">{title}</Text>
        {specs.map((f) => (
          <TextField
            key={f.name}
            label={t(f.label)}
            value={values[f.name] ?? ""}
            onChangeText={(v) => setValues((old) => ({ ...old, [f.name]: v }))}
            multiline={f.multiline}
            height={f.multiline ? 72 : undefined}
            editable={!done && phase !== "saving"}
            testID={`action-${kind}-${f.name}`}
          />
        ))}
        {problem ? (
          <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
            {t(problem)}
          </Text>
        ) : null}
        <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
          {phase === "saving"
            ? t("actions.saving")
            : phase === "saved"
              ? t("actions.saved")
              : phase === "failed"
                ? t("actions.failed")
                : phase === "reconnect"
                  ? t("actions.reconnect")
                  : phase === "unknown"
                    ? t("actions.unknown")
                    : ""}
        </Text>
        {done ? null : (
          <Stack direction="row" gap="sm" wrap>
            <Button
              label={t("actions.approve")}
              onPress={approve}
              disabled={phase === "saving"}
              testID={`action-${kind}-approve`}
            />
            <Button
              variant="ghost"
              label={t("actions.dismiss")}
              onPress={() => setPhase("dismissed")}
              disabled={phase === "saving"}
              testID={`action-${kind}-dismiss`}
            />
          </Stack>
        )}
      </Stack>
    </Panel>
  );
}

/** "2026-11-14 10:30" in the device's time zone → ISO 8601 with its offset, or null. */
export function localToIso(text: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as number[];
  const at = new Date(y ?? 0, (mo ?? 1) - 1, d, h, mi);
  if (Number.isNaN(at.getTime()) || at.getMonth() !== (mo ?? 1) - 1) return null;
  return isoWithOffset(at);
}

export function isoWithOffset(at: Date): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const off = -at.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}:00${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`
  );
}

export function localText(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
