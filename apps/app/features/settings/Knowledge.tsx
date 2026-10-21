/**
 * Company knowledge for the AI (owner, 22 Oct): what the company wants every card and review to
 * know — who it sells to, products, prices it is happy to quote, rules. Admins write it here or
 * import text files; the next call uses it. Everyone else sees nothing here.
 */
import { Button, radius, space, Text, TextField } from "@sotto/ui";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useI18n } from "../../lib/locale";
import { api } from "../../lib/server";
import { useCloud } from "../../lib/useCloud";

export const KNOWLEDGE_MAX = 8000;

type Settings = { settings: { context?: string } };

export function Knowledge() {
  const { t } = useI18n();
  const cloud = useCloud();
  const admin = cloud.status === "signed_in" && cloud.me.user.role === "admin";
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(() => {
    if (!admin) return;
    api<Settings>("/api/company/settings")
      .then((r) => {
        setText(r.settings.context ?? "");
        setSaved(r.settings.context ?? "");
      })
      .catch(() => {});
  }, [admin]);
  if (!admin) return null;
  const over = text.length > KNOWLEDGE_MAX;
  const save = () => {
    setState("saving");
    api<Settings>("/api/company/settings", { method: "PUT", body: { context: text.trim() } })
      .then((r) => {
        setSaved(r.settings.context ?? "");
        setText(r.settings.context ?? "");
        setState("saved");
      })
      .catch(() => setState("error"));
  };
  return (
    <View style={styles.box} testID="settings-knowledge">
      <Text variant="label" tone="muted">
        {t("settings.knowledge.body")}
      </Text>
      <TextField
        accessibilityLabel={t("settings.knowledge")}
        multiline
        value={text}
        onChangeText={(v) => {
          setText(v);
          setState("idle");
        }}
        placeholder={t("settings.knowledge.placeholder")}
        testID="knowledge-text"
        height={200}
      />
      <View style={styles.row}>
        <Text variant="label" tone={over ? "danger" : "muted"}>
          {`${text.length.toLocaleString()} / ${KNOWLEDGE_MAX.toLocaleString()}`}
        </Text>
        <View style={styles.flex} />
        {Platform.OS === "web" ? (
          <Button
            variant="secondary"
            label={t("settings.knowledge.import")}
            onPress={() => pickTextFiles((add) => setText((v) => (v ? `${v}\n\n${add}` : add)))}
            testID="knowledge-import"
          />
        ) : null}
        <Button
          label={t(state === "saving" ? "settings.knowledge.saving" : "settings.knowledge.save")}
          onPress={save}
          disabled={over || state === "saving" || text.trim() === saved.trim()}
          testID="knowledge-save"
        />
      </View>
      {state === "saved" ? (
        <Text variant="label" tone="positive">
          {t("settings.knowledge.saved")}
        </Text>
      ) : null}
      {state === "error" ? (
        <Text variant="label" tone="danger">
          {t("settings.knowledge.error")}
        </Text>
      ) : null}
    </View>
  );
}

/** Web and desktop: reads .txt / .md / .csv files and hands their text back, file by file. */
function pickTextFiles(onText: (text: string) => void): void {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc) return;
  const input = doc.createElement("input");
  input.type = "file";
  input.accept = ".txt,.md,.csv,text/plain,text/markdown,text/csv";
  input.multiple = true;
  input.onchange = () => {
    for (const file of Array.from(input.files ?? [])) {
      void file.text().then((body) => onText(`# ${file.name}\n${body.trim()}`));
    }
  };
  input.click();
}

const styles = StyleSheet.create({
  box: { gap: space.sm, borderRadius: radius.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  flex: { flex: 1 },
});
