/**
 * Sign in, sign up and the first-password change for the management server (D-022). Shown
 * before anything else when the build names a server and this device has no session.
 */
import { Button, Panel, Screen, Stack, space, Text, TextField, Wordmark } from "@sotto/ui";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { changePassword, signIn, signUp, startCloud } from "../../lib/cloud";
import { useI18n } from "../../lib/locale";
import { useRole } from "../../lib/role";
import { useCloud } from "../../lib/useCloud";

export function AccountGate({ children }: { children: ReactNode }) {
  const cloud = useCloud();
  const { setRole } = useRole();
  useEffect(() => {
    void startCloud();
  }, []);
  const role = cloud.status === "signed_in" ? cloud.me.user.role : null;
  useEffect(() => {
    if (role) setRole(role); // the signed-in member's role gates the screens (R3)
  }, [role, setRole]);
  if (cloud.status === "loading") return null;
  if (cloud.status === "signed_out") return <AuthForm initialError={cloud.error ?? null} />;
  if (cloud.status === "signed_in" && cloud.me.user.must_change_password) return <FirstPassword />;
  return children;
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <Screen style={styles.center} testID="account-gate">
      <Panel style={styles.panel}>
        <Stack gap="lg">{children}</Stack>
      </Panel>
    </Screen>
  );
}

function AuthForm({ initialError }: { initialError: string | null }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const ready =
    email.trim() !== "" &&
    password !== "" &&
    (mode === "signin" || (company.trim() !== "" && name.trim() !== ""));
  const submit = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const done =
      mode === "signin"
        ? signIn(email.trim(), password)
        : signUp({ company: company.trim(), name: name.trim(), email: email.trim(), password });
    done
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "error"))
      .finally(() => setBusy(false));
  };
  return (
    <Frame>
      <Wordmark name={t("app.name")} />
      <Stack gap="xs">
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {t(mode === "signin" ? "account.signin.title" : "account.signup.title")}
        </Text>
        <Text variant="body" tone="muted">
          {t(mode === "signin" ? "account.signin.body" : "account.signup.body")}
        </Text>
      </Stack>
      {mode === "signup" ? (
        <>
          <TextField
            label={t("account.company")}
            value={company}
            onChangeText={setCompany}
            testID="acct-company"
          />
          <TextField
            label={t("account.name")}
            value={name}
            onChangeText={setName}
            autoComplete="name"
            testID="acct-name"
          />
        </>
      ) : null}
      <TextField
        label={t("account.email")}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        testID="acct-email"
      />
      <TextField
        label={t(mode === "signin" ? "account.password" : "account.newPassword")}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        testID="acct-password"
      />
      {error ? (
        <Text variant="label" tone="danger" accessibilityLiveRegion="polite" testID="acct-error">
          {error}
        </Text>
      ) : null}
      <Button
        label={t(mode === "signin" ? "account.signin" : "account.signup")}
        onPress={submit}
        disabled={busy || !ready}
        testID="acct-submit"
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
        }}
        testID="acct-switch"
      >
        <Text variant="label" tone="primary" style={styles.link}>
          {t(mode === "signin" ? "account.toSignup" : "account.toSignin")}
        </Text>
      </Pressable>
    </Frame>
  );
}

function FirstPassword() {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (!current || !next || busy) return;
    setBusy(true);
    setError(null);
    changePassword(current, next)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "error"))
      .finally(() => setBusy(false));
  };
  return (
    <Frame>
      <Wordmark name={t("app.name")} />
      <Stack gap="xs">
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {t("account.change.title")}
        </Text>
        <Text variant="body" tone="muted">
          {t("account.change.body")}
        </Text>
      </Stack>
      <TextField
        label={t("account.current")}
        value={current}
        onChangeText={setCurrent}
        secureTextEntry
        autoComplete="current-password"
      />
      <TextField
        label={t("account.newPassword")}
        value={next}
        onChangeText={setNext}
        secureTextEntry
        autoComplete="new-password"
        onSubmitEditing={submit}
      />
      {error ? (
        <Text variant="label" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button label={t("account.change")} onPress={submit} disabled={busy || !current || !next} />
    </Frame>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: "center", alignItems: "center" },
  panel: { width: "100%", maxWidth: 440, padding: space.xl },
  link: { textAlign: "center", paddingVertical: space.sm },
});
