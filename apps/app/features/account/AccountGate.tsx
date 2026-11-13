/**
 * Sign in, Create a company, Forgot password and the first-password change for the management
 * server (D-022, UX-39). Shown before anything else when the build names a server and this device
 * has no session. Sessions last (R9): the sign-in screen says so under the button.
 */
import { Button, Panel, Screen, Stack, space, Text, TextField, Wordmark } from "@sotto/ui";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import {
  CloudError,
  changePassword,
  requestPasswordReset,
  signIn,
  signUp,
  startCloud,
} from "../../lib/cloud";
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

function Frame({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <Screen style={styles.centerBox} testID={testID ?? "account-gate"}>
      <Panel style={styles.panel}>
        <Stack gap="lg">{children}</Stack>
      </Panel>
    </Screen>
  );
}

type Mode = "signin" | "signup" | "forgot";

/** UX-39: Sign in, Create a company and Forgot password are three separate screens. */
function AuthForm({ initialError }: { initialError: string | null }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  if (mode === "forgot")
    return <ForgotPassword email={email} onEmail={setEmail} onBack={() => setMode("signin")} />;
  if (mode === "signup") return <CreateCompany onBack={() => setMode("signin")} />;
  return (
    <SignInForm
      initialError={initialError}
      email={email}
      onEmail={setEmail}
      onForgot={() => setMode("forgot")}
      onCreate={() => setMode("signup")}
    />
  );
}

function SwitchLink({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} testID={testID} style={styles.linkHit}>
      <Text variant="label" tone="primary" style={styles.link}>
        {label}
      </Text>
    </Pressable>
  );
}

function Heading({ title, body }: { title: string; body: string }) {
  return (
    <Stack gap="xs">
      <Text variant="heading" weight="semibold" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="body" tone="muted">
        {body}
      </Text>
    </Stack>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <Text variant="label" tone="danger" accessibilityLiveRegion="polite" testID="acct-error">
      {error}
    </Text>
  ) : null;
}

function SignInForm({
  initialError,
  email,
  onEmail,
  onForgot,
  onCreate,
}: {
  initialError: string | null;
  email: string;
  onEmail: (v: string) => void;
  onForgot: () => void;
  onCreate: () => void;
}) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const ready = email.trim() !== "" && password !== "";
  const submit = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    signIn(email.trim(), password)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "error"))
      .finally(() => setBusy(false));
  };
  return (
    <Frame>
      <Wordmark name={t("app.name")} />
      <Heading title={t("account.signin.title")} body={t("account.signin.body")} />
      <EmailField value={email} onChange={onEmail} />
      <TextField
        label={t("account.password")}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        testID="acct-password"
      />
      <ErrorLine error={error} />
      <Stack gap="xs">
        <Button
          label={t("account.signin")}
          onPress={submit}
          disabled={busy || !ready}
          testID="acct-submit"
        />
        <Text variant="label" tone="muted" style={styles.center} testID="acct-stay">
          {t("account.staySignedIn")}
        </Text>
      </Stack>
      <SwitchLink label={t("account.forgot")} onPress={onForgot} testID="acct-forgot" />
      <SwitchLink label={t("account.toCreate")} onPress={onCreate} testID="acct-switch" />
    </Frame>
  );
}

function EmailField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <TextField
      label={t("account.email")}
      value={value}
      onChangeText={onChange}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="email-address"
      autoComplete="email"
      testID="acct-email"
    />
  );
}

/** The existing sign-up, unchanged in what it asks and allows (no new self-signup path). */
function CreateCompany({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready =
    email.trim() !== "" && password !== "" && company.trim() !== "" && name.trim() !== "";
  const submit = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    signUp({ company: company.trim(), name: name.trim(), email: email.trim(), password })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "error"))
      .finally(() => setBusy(false));
  };
  return (
    <Frame testID="account-create">
      <Wordmark name={t("app.name")} />
      <Heading title={t("account.signup.title")} body={t("account.signup.body")} />
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
      <EmailField value={email} onChange={setEmail} />
      <TextField
        label={t("account.newPassword")}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        testID="acct-password"
      />
      <ErrorLine error={error} />
      <Button
        label={t("account.signup")}
        onPress={submit}
        disabled={busy || !ready}
        testID="acct-submit"
      />
      <SwitchLink label={t("account.toSignin")} onPress={onBack} testID="acct-switch" />
    </Frame>
  );
}

function ForgotPassword({
  email,
  onEmail,
  onBack,
}: {
  email: string;
  onEmail: (v: string) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const address = email.trim();
    if (!address || busy) return;
    setBusy(true);
    setError(null);
    requestPasswordReset(address)
      .then(() => setSent(address))
      .catch((err: unknown) =>
        setError(
          err instanceof CloudError && err.status === 429
            ? t("reset.limited")
            : t("reset.failed"),
        ),
      )
      .finally(() => setBusy(false));
  };
  return (
    <Frame testID="account-forgot">
      <Wordmark name={t("app.name")} />
      <Heading title={t("account.reset.title")} body={t("account.reset.body")} />
      {sent ? (
        <Text variant="body" weight="medium" accessibilityLiveRegion="polite" testID="acct-reset-sent">
          {t("account.reset.sent", { email: sent })}
        </Text>
      ) : (
        <>
          <EmailField value={email} onChange={onEmail} />
          <ErrorLine error={error} />
          <Button
            label={t("account.reset.send")}
            onPress={submit}
            disabled={busy || email.trim() === ""}
            testID="acct-reset-send"
          />
        </>
      )}
      <SwitchLink label={t("account.reset.back")} onPress={onBack} testID="acct-back" />
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
  centerBox: { justifyContent: "center", alignItems: "center" },
  center: { textAlign: "center" },
  linkHit: { minHeight: 44, justifyContent: "center" },
  panel: { width: "100%", maxWidth: 440, padding: space.xl },
  link: { textAlign: "center", paddingVertical: space.sm },
});
