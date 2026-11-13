/**
 * /reset-password#token=… (UX-39r, D-053): the page the reset email links to. The token sits in
 * the fragment so it never reaches a server log; on the first render the page reads it, drops
 * it from the address bar (history.replaceState) and tells the browser to send no Referer, all
 * before any request. Then: new password twice → confirm. The server answers one way for an
 * expired or a used link (no oracle), so the page does too.
 */
import { Button, Panel, Screen, Stack, space, Text, TextField, Wordmark } from "@sotto/ui";
import { useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { CloudError, confirmPasswordReset } from "../lib/cloud";
import type { StringKey } from "../lib/i18n";
import { useI18n } from "../lib/locale";

const MIN_PASSWORD = 10;

type Web = {
  location?: { hash: string; pathname: string; search: string };
  history?: { replaceState: (data: unknown, unused: string, url: string) => void };
  document?: {
    head?: { appendChild: (n: unknown) => void; querySelector: (s: string) => unknown };
    createElement: (tag: string) => { setAttribute: (k: string, v: string) => void };
  };
};

/** Reads the token from `#token=…` and removes it from the address bar and the referrer. */
export function takeResetToken(web: Web = globalThis as Web): string | null {
  if (Platform.OS !== "web") return null;
  const doc = web.document;
  if (doc?.head && !doc.head.querySelector('meta[name="referrer"]')) {
    const meta = doc.createElement("meta");
    meta.setAttribute("name", "referrer");
    meta.setAttribute("content", "no-referrer");
    doc.head.appendChild(meta);
  }
  const hash = web.location?.hash ?? "";
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  if (hash && web.location && web.history) {
    web.history.replaceState(null, "", `${web.location.pathname}${web.location.search}`);
  }
  return token?.trim() || null;
}

function problemOf(e: unknown): StringKey {
  if (e instanceof CloudError) {
    if (e.code === "reset_invalid") return "reset.invalid";
    if (e.code === "weak_password") return "reset.short";
    if (e.code === "rate_limited" || e.status === 429) return "reset.limited";
  }
  return "reset.failed";
}

export default function ResetPasswordScreen() {
  const { t } = useI18n();
  const [token] = useState(() => takeResetToken());
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<StringKey | null>(token ? null : "reset.missing");
  const submit = () => {
    if (!token || busy) return;
    if (password.length < MIN_PASSWORD) return setProblem("reset.short");
    if (password !== again) return setProblem("reset.mismatch");
    setBusy(true);
    setProblem(null);
    confirmPasswordReset(token, password)
      .then(() => setDone(true))
      .catch((e: unknown) => setProblem(problemOf(e)))
      .finally(() => setBusy(false));
  };
  return (
    <Screen style={styles.center} testID="reset-password">
      <Panel style={styles.panel}>
        <Stack gap="lg">
          <Wordmark name={t("app.name")} />
          <Stack gap="xs">
            <Text variant="heading" weight="semibold" accessibilityRole="header">
              {t("reset.title")}
            </Text>
            {done ? null : (
              <Text variant="body" tone="muted">
                {t("reset.body")}
              </Text>
            )}
          </Stack>
          {done ? (
            <Text
              variant="body"
              weight="medium"
              accessibilityLiveRegion="polite"
              aria-live="polite"
              testID="reset-done"
            >
              {t("reset.done")}
            </Text>
          ) : (
            <>
              <TextField
                label={t("reset.password")}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                editable={token !== null}
                testID="reset-new"
              />
              <TextField
                label={t("reset.confirm")}
                value={again}
                onChangeText={setAgain}
                onSubmitEditing={submit}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                editable={token !== null}
                testID="reset-again"
              />
              {problem ? (
                <Text
                  variant="label"
                  tone="danger"
                  accessibilityLiveRegion="polite"
                  aria-live="polite"
                  testID="reset-error"
                >
                  {t(problem)}
                </Text>
              ) : null}
              <Button
                label={t("reset.save")}
                onPress={submit}
                disabled={busy || !token || password === "" || again === ""}
                testID="reset-save"
              />
            </>
          )}
        </Stack>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: "center", alignItems: "center" },
  panel: { width: "100%", maxWidth: 440, padding: space.xl },
});
