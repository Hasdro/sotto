/**
 * "Suggested updates (n)" after the call (UX-04, D-044, R12): one checklist, nothing pre-ticked,
 * an Edit disclosure per row, and one "Save n to Zoho" that sends only the ticked rows. Each row
 * is its own approval with its own idempotency key (kept for the row's life, so a retry never
 * writes twice) and its own audit row on the server. "Skip" hides a row with a 5 s Undo (UX-23);
 * skipped and saved rows are kept with the call for History.
 */
import type { CallReview } from "@sotto/engine";
import {
  Button,
  ChecklistRow,
  motion,
  Panel,
  Stack,
  Text,
  TextField,
  Toast,
  ToggleRow,
} from "@sotto/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { callNotes } from "../../lib/callNotes";
import { CloudError, saveCallLog } from "../../lib/cloud";
import { deviceCall, setAfterCallItem } from "../../lib/deviceHistory";
import { useI18n } from "../../lib/locale";
import { type ActionKind, zohoAction } from "../crm/api";
import { PREP_FIELDS, useAttachedState } from "../crm/attached";
import { useZoho } from "../crm/useZoho";
import { newKey, type Perform } from "./ActionCard";
import {
  buildItems,
  callLogPreview,
  deviceTimeZone,
  type Item,
  type ItemId,
  zohoWebUrl,
} from "./checklist";
import { useActionsText } from "./strings";

type Status =
  | "open"
  | "saving"
  | "saved"
  | "failed"
  | "unknown"
  | "reconnect"
  | "skipping"
  | "skipped";
type Row = {
  values: Record<string, string>;
  ticked: boolean;
  status: Status;
  error?: string;
  touched?: boolean;
};
export type SaveLog = typeof saveCallLog;

const HANDLED: readonly Status[] = ["saved", "unknown", "skipped"];
const MODULE_OF: Partial<Record<ItemId, string>> = { meeting: "Events", lead: "Leads" };

export function AfterCallChecklist({
  callId,
  review,
  perform,
  saveLog = saveCallLog,
  onOpenChange,
}: {
  callId: string;
  review: CallReview | null;
  perform?: Perform;
  saveLog?: SaveLog;
  /** How many rows are still open (neither saved nor skipped), for "Start another call". */
  onOpenChange?: (open: number) => void;
}) {
  const { t } = useI18n();
  const at = useActionsText();
  const { crm, prep } = useAttachedState();
  const conn = useZoho();
  const brief = crm.kind === "attached" ? crm.brief : null;
  const prepNotes = PREP_FIELDS.filter((f) => f !== "attendees" && prep[f].trim())
    .map((f) => `${t(`prep.${f}`)}: ${prep[f].trim()}`)
    .join("\n");
  const note = deviceCall(callId)?.notes ?? callNotes();
  const items = useMemo(
    () => buildItems({ t, at, callId, brief, review, note, prepNotes }),
    [t, at, callId, brief, review, note, prepNotes],
  );
  const [rows, setRows] = useState<Partial<Record<ItemId, Row>>>({});
  const [toast, setToast] = useState<Item | null>(null);
  const keys = useRef<Partial<Record<ItemId, string>>>({});
  const timers = useRef<Partial<Record<ItemId, ReturnType<typeof setTimeout>>>>({});
  const records = useRef<Partial<Record<ItemId, string>>>({});

  // New items (or a review that arrived late) get their initial values until the agent edits.
  useEffect(() => {
    setRows((old) => {
      let next = old;
      for (const i of items) {
        const row = next[i.id];
        const fresh = !row || (!row.touched && row.status === "open");
        if (fresh && JSON.stringify(row?.values) !== JSON.stringify(i.initial)) {
          next = {
            ...next,
            [i.id]: { ticked: false, status: "open", ...row, values: { ...i.initial } },
          };
        }
      }
      return next;
    });
  }, [items]);
  useEffect(
    () => () => {
      for (const h of Object.values(timers.current)) clearTimeout(h);
    },
    [],
  );

  const row = (id: ItemId): Row => rows[id] ?? { values: {}, ticked: false, status: "open" };
  const update = (id: ItemId, patch: Partial<Row>) =>
    setRows((old) => ({ ...old, [id]: { ...row(id), ...old[id], ...patch } }));

  const openCount = items.filter((i) => !HANDLED.includes(row(i.id).status)).length;
  useEffect(() => onOpenChange?.(openCount), [onOpenChange, openCount]);

  const pending = items.filter((i) => {
    const r = row(i.id);
    return r.ticked && !HANDLED.includes(r.status) && r.status !== "saving";
  });

  const saveOne = async (item: Item) => {
    const r = row(item.id);
    const fields = item.build(r.values);
    if (typeof fields === "string") {
      update(item.id, { status: "failed", error: fields });
      return;
    }
    keys.current[item.id] ??= newKey();
    update(item.id, { status: "saving", error: undefined });
    try {
      const out =
        item.id === "call_log"
          ? await saveLog(fields as Parameters<SaveLog>[0])
          : await (perform ?? zohoAction)(
              item.id as ActionKind,
              fields,
              keys.current[item.id] as string,
            );
      records.current[item.id] = out.id;
      update(item.id, { status: "saved" });
      setAfterCallItem(callId, { id: item.id, label: item.label(r.values) }, "saved");
    } catch (e) {
      const code = e instanceof CloudError ? e.code : "";
      // zoho_unknown: Zoho may have saved it; the server keeps the key, so no retry from here.
      update(item.id, {
        status:
          code === "zoho_reconnect" ? "reconnect" : code === "zoho_unknown" ? "unknown" : "failed",
      });
    }
  };
  const save = () => {
    for (const item of pending) void saveOne(item);
  };

  const skip = (item: Item) => {
    update(item.id, { status: "skipping", ticked: false });
    setToast(item);
    timers.current[item.id] = setTimeout(() => {
      update(item.id, { status: "skipped" });
      setAfterCallItem(callId, { id: item.id, label: item.label(row(item.id).values) }, "skipped");
      setToast((cur) => (cur?.id === item.id ? null : cur));
    }, motion.undoMs);
  };
  const undo = (item: Item) => {
    clearTimeout(timers.current[item.id]);
    update(item.id, { status: "open" });
    setToast(null);
  };

  const saved = items.filter((i) => row(i.id).status === "saved");
  const link = (() => {
    const log = items.find((i) => i.id === "call_log" && row(i.id).status === "saved");
    const target = log ?? saved.find((i) => i.parent || MODULE_OF[i.id]);
    if (!target) return null;
    const module = target.parent?.module ?? MODULE_OF[target.id] ?? "";
    const id = target.parent?.id ?? records.current[target.id] ?? "";
    return zohoWebUrl(conn.status?.api_domain, module, id);
  })();

  const visible = items.filter((i) => !["skipping", "skipped"].includes(row(i.id).status));
  if (items.length === 0) return null;
  return (
    <Panel testID="after-checklist">
      <Stack gap="md">
        <View>
          <Text variant="heading" weight="semibold" accessibilityRole="header">
            {at("after.updates", { n: items.length })}
          </Text>
          {openCount > 0 ? (
            <Text variant="label" tone="muted">
              {at("after.updatesBody")}
            </Text>
          ) : null}
        </View>
        {visible.map((item) => (
          <RowView
            key={item.id}
            item={item}
            row={row(item.id)}
            review={review}
            onValues={(values) => {
              const current = row(item.id).values;
              // A changed date or time needs a fresh confirmation (INT-02m).
              const reset =
                item.id === "meeting" &&
                (values.date !== current.date || values.time !== current.time) &&
                values.confirmed === current.confirmed;
              const next = reset ? { ...values, confirmed: "" } : values;
              update(item.id, {
                values: next,
                touched: true,
                ticked: row(item.id).ticked && item.ready(next),
              });
            }}
            onTick={(ticked) => update(item.id, { ticked })}
            onSkip={() => skip(item)}
          />
        ))}
        {openCount > 0 ? (
          <Stack direction="row" gap="sm" wrap>
            <Button
              label={at("after.save", { n: pending.length })}
              disabled={pending.length === 0}
              helper={pending.length === 0 ? at("after.saveHelper") : undefined}
              onPress={save}
              testID="after-save"
            />
          </Stack>
        ) : (
          <Stack direction="row" gap="sm" wrap align="center" testID="after-done">
            <Text weight="semibold">
              {saved.length > 0 ? at("after.done") : at("after.allHandled")}
            </Text>
            {saved.length > 0 && link ? (
              <Button
                variant="ghost"
                label={at("after.open")}
                onPress={() => void Linking.openURL(link)}
                testID="after-open-zoho"
              />
            ) : null}
          </Stack>
        )}
        {toast ? (
          <Toast
            title={at("after.skipped")}
            body={toast.label(row(toast.id).values)}
            action={{ label: at("after.undo"), onPress: () => undo(toast) }}
            testID="after-skip-toast"
          />
        ) : null}
      </Stack>
    </Panel>
  );
}

function RowView({
  item,
  row,
  review,
  onValues,
  onTick,
  onSkip,
}: {
  item: Item;
  row: Row;
  review: CallReview | null;
  onValues: (values: Record<string, string>) => void;
  onTick: (ticked: boolean) => void;
  onSkip: () => void;
}) {
  const at = useActionsText();
  const v = row.values;
  const ready = item.ready(v);
  const busy = row.status === "saving";
  const done = row.status === "saved" || row.status === "unknown";
  const set = (name: string) => (value: string) => onValues({ ...v, [name]: value });
  const built = item.id === "call_log" ? item.build(v) : null;
  const status =
    row.status === "saving"
      ? at("after.saving")
      : row.status === "saved"
        ? at("after.status.saved")
        : row.status === "failed"
          ? (row.error ?? at("after.status.failed"))
          : row.status === "unknown"
            ? at("after.status.unknown")
            : row.status === "reconnect"
              ? at("after.status.reconnect")
              : "";
  const tz = deviceTimeZone();
  return (
    <View testID={`after-row-${item.id}`}>
      <ChecklistRow
        checked={done || row.ticked}
        label={item.label(v)}
        onToggle={onTick}
        disabled={done || busy || !ready}
        editLabel={done ? undefined : at("after.edit")}
        testID={`after-${item.id}`}
      >
        <Stack gap="sm">
          {item.fields.map((f) => (
            <TextField
              key={f.name}
              label={f.label}
              value={v[f.name] ?? ""}
              onChangeText={set(f.name)}
              multiline={f.multiline}
              height={f.multiline ? 72 : undefined}
              editable={!busy}
              testID={`after-${item.id}-${f.name}`}
            />
          ))}
          {item.id === "meeting" ? (
            <ToggleRow
              label={at("after.meeting.confirm", { tz })}
              value={v.confirmed === tz}
              onValueChange={(on) => onValues({ ...v, confirmed: on ? tz : "" })}
              testID="after-meeting-confirm"
            />
          ) : null}
          {item.id === "call_log" && (review?.risks?.length ?? 0) > 0 ? (
            <ToggleRow
              label={at("after.callLog.risks")}
              value={v.risks === "1"}
              onValueChange={(on) => onValues({ ...v, risks: on ? "1" : "" })}
              testID="after-call_log-risks"
            />
          ) : null}
          {built && typeof built !== "string" ? (
            <Panel sunken testID="after-call_log-preview">
              <Stack gap="xs">
                <Text variant="label" weight="semibold">
                  {at("after.callLog.preview")}
                </Text>
                <Text variant="label" selectable testID="after-call_log-preview-text">
                  {callLogPreview(built)}
                </Text>
              </Stack>
            </Panel>
          ) : null}
        </Stack>
      </ChecklistRow>
      <Stack direction="row" gap="sm" wrap align="center">
        {!ready && !done && item.blockedHint ? (
          <Text variant="label" tone="muted" style={{ flexShrink: 1 }}>
            {item.blockedHint}
          </Text>
        ) : null}
        {status ? (
          <Text
            variant="label"
            tone={row.status === "saved" ? "muted" : "danger"}
            aria-live="polite"
            accessibilityLiveRegion="polite"
            testID={`after-${item.id}-status`}
          >
            {status}
          </Text>
        ) : null}
        {done || busy ? null : (
          <Button
            variant="ghost"
            label={at("after.skip")}
            accessibilityLabel={at("after.skipItem", { label: item.label(v) })}
            onPress={onSkip}
            testID={`after-${item.id}-skip`}
          />
        )}
      </Stack>
    </View>
  );
}
