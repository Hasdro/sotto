/**
 * Admin › Connections › Attachments (INT-14b): the only files agents can add to a follow-up email.
 * The admin uploads PDF, PNG, JPEG, Word, Excel or PowerPoint files (5 MB each, 20 files, 25 MB);
 * agents pick from this list and never upload. The server checks the type by name and content.
 */
import { Button, EmptyState, Panel, Stack, space, Text } from "@sotto/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { FeatureOff, useFeature } from "../../components/FeatureGate";
import { cloudApi } from "../../lib/cloud";
import type { Attachment } from "./api";
import { useEmailText } from "./strings";

type Listing = { attachments: (Attachment & { created_at: number })[]; types: string[] };
const URL = "/api/v1/company/email/attachments";
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx";
const MAX = 5 * 1024 * 1024;
const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const listAttachments = () => cloudApi<Listing>(`${URL}?t=${Date.now()}`);
export const uploadAttachment = (file: Blob, name: string) =>
  cloudApi<Listing>(`${URL}?name=${encodeURIComponent(name)}`, { method: "PUT", raw: file });
export const deleteAttachment = (id: string) =>
  cloudApi<Listing>(`${URL}/${id}`, { method: "DELETE" });

export function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function AttachmentsSettings() {
  const effective = useFeature("email_attachments");
  if (effective.state === "off_by_platform" || effective.state === "off_by_org")
    return <FeatureOff feature="email_attachments" effective={effective} />;
  return <Library />;
}

function Library() {
  const t = useEmailText();
  const [list, setList] = useState<Listing["attachments"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const load = useCallback(() => {
    listAttachments()
      .then((r) => setList(r.attachments))
      .catch((e) => {
        setList([]);
        setError(errorOf(e));
      });
  }, []);
  useEffect(load, [load]);

  const pick = () => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (!input.current) {
      const el = document.createElement("input");
      el.type = "file";
      el.accept = ACCEPT;
      el.style.display = "none";
      el.addEventListener("change", () => {
        const file = el.files?.[0];
        el.value = "";
        if (file) upload(file);
      });
      document.body.appendChild(el);
      input.current = el;
    }
    input.current.click();
  };
  const upload = (file: File) => {
    setError(null);
    if (file.size > MAX) {
      setError(t("att.tooBig"));
      return;
    }
    setBusy(true);
    uploadAttachment(file, file.name)
      .then((r) => setList(r.attachments))
      .catch((e) => setError(errorOf(e)))
      .finally(() => setBusy(false));
  };
  const remove = (id: string) =>
    deleteAttachment(id)
      .then((r) => setList(r.attachments))
      .catch((e) => setError(errorOf(e)));

  return (
    <Panel testID="attachments-settings">
      <Stack gap="md">
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {t("att.title")}
        </Text>
        <Text variant="label" tone="muted">
          {t("att.hint")}
        </Text>
        {list === null ? null : list.length === 0 ? (
          <EmptyState title={t("att.none")} testID="attachments-empty" />
        ) : (
          <Stack gap="xs">
            {list.map((a) => (
              <View key={a.id} style={styles.row} testID={`attachment-${a.id}`}>
                <Text variant="body" style={styles.grow} numberOfLines={1}>
                  {a.name}
                </Text>
                <Text variant="label" tone="muted">
                  {sizeLabel(a.size)}
                </Text>
                <Button
                  variant="ghost"
                  label={t("att.delete")}
                  accessibilityLabel={t("att.deleteOne", { name: a.name })}
                  onPress={() => void remove(a.id)}
                  testID={`attachment-delete-${a.id}`}
                />
              </View>
            ))}
          </Stack>
        )}
        {Platform.OS === "web" ? (
          <Stack direction="row" gap="sm" wrap>
            <Button
              label={busy ? t("att.uploading") : t("att.add")}
              disabled={busy}
              onPress={pick}
              testID="attachments-add"
            />
          </Stack>
        ) : (
          <Text variant="label" tone="muted">
            {t("att.desktopOnly")}
          </Text>
        )}
        <Text variant="label" tone="muted">
          {t("att.limits")}
        </Text>
        {error ? (
          <Text variant="label" tone="danger" aria-live="polite" testID="attachments-error">
            {error}
          </Text>
        ) : null}
      </Stack>
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  grow: { flex: 1, minWidth: 0 },
});
