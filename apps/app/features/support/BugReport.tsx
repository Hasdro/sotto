/**
 * Report a bug (Round 3, D-086): what is wrong, in the person's own words, plus an optional
 * screenshot they attach themselves. Nothing is captured automatically — no screenshot, no
 * metadata beyond the page address, which the app already knows. The report lands in the
 * vendor's review queue (owner console + Admin › Bug reports); it only reaches GitHub
 * after a vendor reviews and submits it.
 */
import { Button, Sheet, Stack, Text, TextField } from "@sotto/ui";
import { usePathname } from "expo-router";
import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useI18n } from "../../lib/locale";
import { buildDiagnosticsText } from "../../lib/obs";
import { submitBugReport, uploadScreenshot } from "./api";

const IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif";

/** The file picker on web (and desktop, which is the same web build): a real <input>, so
 * the person picks a screenshot from their computer. There is no native picker and no
 * auto-capture by design. */
function pickImage(): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (Platform.OS !== "web") {
      resolve(null);
      return;
    }
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) {
      resolve(null);
      return;
    }
    const input = doc.createElement("input");
    input.type = "file";
    input.accept = IMAGE_TYPES;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** The page this report is about: the full address on web, the route elsewhere. */
function pageAddress(pathname: string): string {
  const href = (globalThis as { location?: { href?: string } }).location?.href;
  return href && href.length > 0 ? href : pathname;
}

export function BugReportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagCopied, setDiagCopied] = useState(false);

  const close = () => {
    setTitle("");
    setDescription("");
    setScreenshotUrl("");
    setSent(false);
    setError(null);
    setDiagCopied(false);
    onClose();
  };

  const attach = () => {
    setError(null);
    void pickImage().then((file) => {
      if (!file) return;
      setAttaching(true);
      uploadScreenshot(file)
        .then((url) => setScreenshotUrl(url))
        .catch(() => setError(t("bug.attachFailed")))
        .finally(() => setAttaching(false));
    });
  };

  const copyDiagnostics = () => {
    void buildDiagnosticsText({ route: pathname }).then(async (txt) => {
      const nav = (
        globalThis as { navigator?: { clipboard?: { writeText?: (s: string) => Promise<void> } } }
      ).navigator;
      if (nav?.clipboard?.writeText) await nav.clipboard.writeText(txt).catch(() => {});
      setDiagCopied(true);
    });
  };

  const submit = () => {
    if (title.trim().length === 0 || description.trim().length === 0) {
      setError(t("bug.needText"));
      return;
    }
    setError(null);
    setSending(true);
    submitBugReport({
      title: title.trim(),
      description: description.trim(),
      page_url: pageAddress(pathname),
      ...(screenshotUrl ? { screenshot_url: screenshotUrl } : {}),
    })
      .then(() => setSent(true))
      .catch(() => setError(t("bug.failed")))
      .finally(() => setSending(false));
  };

  return (
    <Sheet open={open} title={t("bug.title")} onClose={close} closeLabel={t("tutorial.skip")}>
      {sent ? (
        <Stack gap="md">
          <Text>{t("bug.sent")}</Text>
          <Button label={t("tutorial.skip")} onPress={close} testID="bug-report-done" />
        </Stack>
      ) : (
        <Stack gap="md">
          <TextField
            label={t("bug.titleField")}
            value={title}
            onChangeText={setTitle}
            testID="bug-report-title"
          />
          <TextField
            label={t("bug.description")}
            placeholder={t("bug.descriptionPlaceholder")}
            value={description}
            onChangeText={setDescription}
            multiline
            height={120}
            testID="bug-report-description"
          />
          <View style={styles.page}>
            <Text variant="label" tone="muted">
              {t("bug.page")}: {pageAddress(pathname)}
            </Text>
          </View>
          {screenshotUrl ? (
            <Stack direction="row" gap="sm" align="center">
              <Text variant="label" weight="medium">
                {t("bug.attached")}
              </Text>
              <Button
                variant="ghost"
                label={t("bug.remove")}
                onPress={() => setScreenshotUrl("")}
                testID="bug-report-remove-shot"
              />
            </Stack>
          ) : (
            <Button
              variant="secondary"
              label={attaching ? t("bug.sending") : t("bug.attach")}
              onPress={attach}
              disabled={attaching}
              testID="bug-report-attach"
            />
          )}
          <Text variant="label" tone="muted">
            {t("bug.attachNote")}
          </Text>
          {error ? (
            <Text variant="label" tone="muted" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Button
            label={t("bug.submit")}
            onPress={submit}
            disabled={sending}
            testID="bug-report-submit"
          />
          <Button
            variant="ghost"
            label={diagCopied ? "Diagnostics copied" : "Copy diagnostics"}
            onPress={copyDiagnostics}
            testID="copy-diagnostics-button"
          />
        </Stack>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  page: { flexShrink: 1 },
});
