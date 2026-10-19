/**
 * Access gate for a hosted Sotto server (D-020): when the server asks for an access code, the app
 * shows a sign-in form before anything else. The server enforces it on every API call and socket;
 * this screen is only the front door. Without a server (dev mock, tests) the app opens as before.
 */
import { Button, Panel, Screen, Stack, space, Text, TextField, Wordmark } from "@sotto/ui";
import { type ReactNode, useEffect, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { demoEnabled } from "../features/call/devGate";
import type { StringKey } from "../lib/i18n";
import { useI18n } from "../lib/locale";
import { ApiError, api } from "../lib/server";

type Me = { auth_required: boolean; signed_in: boolean };
type Gate = "checking" | "open" | "closed";

export function AccessGate({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>(
    demoEnabled() && Platform.OS === "web" ? "checking" : "open",
  );
  useEffect(() => {
    if (gate !== "checking") return;
    api<Me>("/api/me")
      .then((me) => setGate(me.auth_required && !me.signed_in ? "closed" : "open"))
      .catch(() => setGate("open")); // no server answering: nothing to sign in to
  }, [gate]);
  if (gate === "open") return children;
  if (gate === "checking") return null;
  return <SignIn onSignedIn={() => setGate("open")} />;
}

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<StringKey | null>(null);
  const submit = () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    api("/api/session", { method: "POST", body: { code: code.trim() } })
      .then(onSignedIn)
      .catch((err: unknown) => {
        const status = err instanceof ApiError ? err.status : 0;
        setError(status === 429 ? "gate.limited" : status === 401 ? "gate.wrong" : "gate.offline");
      })
      .finally(() => setBusy(false));
  };
  return (
    <Screen style={styles.center} testID="access-gate">
      <Panel style={styles.panel}>
        <Stack gap="lg">
          <Wordmark name={t("app.name")} />
          <Stack gap="xs">
            <Text variant="heading" weight="semibold" accessibilityRole="header">
              {t("gate.title")}
            </Text>
            <Text variant="body" tone="muted">
              {t("gate.body")}
            </Text>
          </Stack>
          <TextField
            label={t("gate.code")}
            value={code}
            onChangeText={setCode}
            onSubmitEditing={submit}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            testID="gate-code"
          />
          {error ? (
            <Text variant="label" tone="danger" accessibilityLiveRegion="polite">
              {t(error)}
            </Text>
          ) : null}
          <Button
            label={t("gate.submit")}
            onPress={submit}
            disabled={busy || code.trim() === ""}
            testID="gate-submit"
          />
        </Stack>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: "center", alignItems: "center" },
  panel: { width: "100%", maxWidth: 420, padding: space.xl },
});
