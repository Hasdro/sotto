/**
 * Admin → Integrations › Email (T-063, D-039): the org's SMTP mailbox (write-only: the login is
 * never sent back), "Send test email" to the admin's own address with the server's exact
 * error, and the formats whose opening and signature are sent verbatim (D-032).
 * UX-32 (D-052, D-065): the admin's domain picks a preset (Google, Microsoft 365, Hostinger,
 * Zoho Mail); for a known one only the password is asked, the rest sits under "Server
 * settings". Saving sends the test email and shows the result inline. The org's mailbox is the
 * default sender; AGN's stays the fallback.
 */
import {
  Badge,
  Button,
  Disclosure,
  Divider,
  Panel,
  SegmentedControl,
  Stack,
  Text,
  TextField,
} from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { type SmtpPreset, smtpPreset } from "../integrations/api";
import { useIntegrationsText } from "../integrations/strings";
import {
  type EmailFormat,
  emailFormats,
  removeSmtp,
  type SmtpStatus,
  saveFormats,
  saveSmtp,
  smtpStatus,
  type TestResult,
  testSmtp,
} from "./api";
import { useEmailText } from "./strings";

const PORTS = ["465", "587"] as const;
type Port = (typeof PORTS)[number];
const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function SmtpSettings() {
  const t = useEmailText();
  const ti = useIntegrationsText();
  const [status, setStatus] = useState<SmtpStatus | null>(null);
  const [preset, setPreset] = useState<SmtpPreset | null>(null);
  const [host, setHost] = useState("");
  const [port, setPort] = useState<Port>("465");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [test, setTest] = useState<TestResult | "testing" | null>(null);
  const [busy, setBusy] = useState(false);

  const fill = useCallback((s: SmtpStatus) => {
    setStatus(s);
    if (s.org.configured) {
      setHost(s.org.host);
      setPort(String(s.org.port) as Port);
      setFromName(s.org.from_name);
      setFromAddress(s.org.from_address);
    }
  }, []);

  useEffect(() => {
    smtpStatus()
      .then((s) => {
        fill(s);
        if (s.org.configured) return;
        // Nothing saved yet: pre-fill from the admin's own domain (UX-32).
        return smtpPreset().then((p) => {
          setPreset(p);
          if (p.preset.id === "other") return;
          setHost(p.preset.host);
          setPort(String(p.preset.port) as Port);
          setUsername(p.username);
          setFromAddress(p.from_address || p.username);
          setFromName(p.from_name);
        });
      })
      .catch(() => {});
  }, [fill]);

  const saved = status?.org.configured === true;
  const run = (p: Promise<SmtpStatus>, test = false) => {
    setBusy(true);
    setNote(null);
    p.then((s) => {
      fill(s);
      setUsername("");
      setPassword("");
      setNote(t("integrations.smtp.saved"));
      if (test && s.org.configured) sendTest(); // UX-32: every save is proven by a test email
    })
      .catch((e) => setNote(t("integrations.smtp.failed", { error: errorOf(e) })))
      .finally(() => setBusy(false));
  };
  const sendTest = () => {
    setTest("testing");
    testSmtp()
      .then(setTest)
      .catch((e) => setTest({ ok: false, to: "", error: errorOf(e) }));
  };
  const active = status?.active;
  const known = !saved && preset !== null && preset.preset.id !== "other";
  // UX-44c: a disabled Save says what is missing.
  const why = busy
    ? ti("smtp.why.busy")
    : !host.trim()
      ? ti("smtp.why.host")
      : !saved && !username.trim()
        ? ti("smtp.why.username")
        : !fromName.trim() || !fromAddress.trim()
          ? ti("smtp.why.from")
          : !saved && !password
            ? ti("smtp.why.password")
            : undefined;

  const passwordField = (
    <TextField
      label={t("integrations.smtp.password")}
      value={password}
      onChangeText={setPassword}
      placeholder={saved ? t("integrations.smtp.kept") : undefined}
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      testID="smtp-password"
    />
  );
  const serverFields = (
    <>
      <TextField
        label={t("integrations.smtp.host")}
        value={host}
        onChangeText={setHost}
        placeholder="smtp.hostinger.com"
        autoCapitalize="none"
        autoCorrect={false}
        testID="smtp-host"
      />
      <Stack gap="xs">
        <Text variant="label" weight="medium" tone="muted">
          {t("integrations.smtp.port")}
        </Text>
        <SegmentedControl
          options={PORTS.map((p) => ({ value: p, label: t(`integrations.smtp.port.${p}`) }))}
          value={port}
          onChange={setPort}
          accessibilityLabel={t("integrations.smtp.port")}
          testID="smtp-port"
        />
      </Stack>
      <TextField
        label={t("integrations.smtp.username")}
        value={username}
        onChangeText={setUsername}
        placeholder={saved ? t("integrations.smtp.kept") : undefined}
        autoCapitalize="none"
        autoCorrect={false}
        testID="smtp-username"
      />
      <TextField
        label={t("integrations.smtp.fromName")}
        value={fromName}
        onChangeText={setFromName}
        testID="smtp-from-name"
      />
      <TextField
        label={t("integrations.smtp.fromAddress")}
        value={fromAddress}
        onChangeText={setFromAddress}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        testID="smtp-from-address"
      />
    </>
  );
  return (
    <Panel testID="smtp-settings">
      <Stack gap="md">
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {t("integrations.smtp.title")}
        </Text>
        <Text variant="body" tone="muted">
          {t("integrations.smtp.body")}
        </Text>
        <Stack direction="row" gap="sm" wrap>
          <Badge
            testID="smtp-active"
            dot
            tone={active ? "answer" : "neutral"}
            label={t(
              active === "org"
                ? "integrations.smtp.active.org"
                : active === "platform"
                  ? "integrations.smtp.active.platform"
                  : "integrations.smtp.active.none",
            )}
          />
        </Stack>
        {preset ? (
          <Text variant="body" testID="smtp-preset">
            {preset.preset.id === "other"
              ? ti("smtp.preset.other", { domain: preset.domain || "—" })
              : ti("smtp.preset.found", {
                  provider: preset.preset.label,
                  domain: preset.domain,
                })}
          </Text>
        ) : null}
        {known ? (
          <>
            {passwordField}
            <Disclosure
              title={ti("smtp.preset.advanced")}
              testID="smtp-advanced"
            >
              <Stack gap="md">{serverFields}</Stack>
            </Disclosure>
          </>
        ) : (
          <>
            {serverFields}
            {passwordField}
          </>
        )}
        <Stack direction="row" gap="sm" wrap>
          <Button
            label={ti("smtp.saveAndTest")}
            disabled={Boolean(why)}
            helper={why}
            onPress={() =>
              run(
                saveSmtp({
                  host: host.trim(),
                  port: Number(port),
                  username: username.trim(),
                  password,
                  from_name: fromName.trim(),
                  from_address: fromAddress.trim(),
                }),
                true,
              )
            }
            testID="smtp-save"
          />
          <Button
            variant="secondary"
            label={t(test === "testing" ? "integrations.smtp.testing" : "integrations.smtp.test")}
            disabled={!active || test === "testing"}
            helper={active ? undefined : ti("smtp.why.test")}
            onPress={sendTest}
            testID="smtp-test"
          />
          {saved ? (
            <Button
              variant="ghost"
              label={t("integrations.smtp.remove")}
              disabled={busy}
              onPress={() => run(removeSmtp())}
              testID="smtp-remove"
            />
          ) : null}
        </Stack>
        {note ? (
          <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
            {note}
          </Text>
        ) : null}
        {test && test !== "testing" ? (
          <Text
            variant="label"
            tone={test.ok ? "muted" : "danger"}
            selectable
            aria-live="polite"
            accessibilityLiveRegion="polite"
            testID="smtp-test-result"
          >
            {test.ok
              ? t("integrations.smtp.testOk", { to: test.to })
              : t("integrations.smtp.testFailed", { error: test.error })}
          </Text>
        ) : null}
        <Divider />
        <FormatsEditor />
      </Stack>
    </Panel>
  );
}

function FormatsEditor() {
  const t = useEmailText();
  const [formats, setFormats] = useState<EmailFormat[]>([]);
  const [open, setOpen] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    emailFormats()
      .then((r) => setFormats(r.formats))
      .catch(() => {});
  }, []);
  if (!formats.length) return null;
  const f = formats[open] ?? formats[0];
  if (!f) return null;
  const edit = (patch: Partial<EmailFormat>) =>
    setFormats((all) => all.map((x, i) => (i === open ? { ...x, ...patch } : x)));
  return (
    <Stack gap="md" testID="email-formats">
      <Text variant="body" weight="semibold" accessibilityRole="header">
        {t("integrations.smtp.formats.title")}
      </Text>
      <Text variant="label" tone="muted">
        {t("integrations.smtp.formats.body")}
      </Text>
      <SegmentedControl
        options={formats.map((x, i) => ({ value: String(i), label: x.name }))}
        value={String(open)}
        onChange={(v) => setOpen(Number(v))}
        accessibilityLabel={t("integrations.smtp.formats.title")}
        testID="email-format-pick"
      />
      <TextField
        label={t("integrations.smtp.formats.name")}
        value={f.name}
        onChangeText={(name) => edit({ name })}
        testID="email-format-name"
      />
      <TextField
        label={t("integrations.smtp.formats.subject")}
        value={f.subject}
        onChangeText={(subject) => edit({ subject })}
        testID="email-format-subject"
      />
      <TextField
        label={t("integrations.smtp.formats.opening")}
        value={f.opening}
        onChangeText={(opening) => edit({ opening })}
        multiline
        height={64}
        testID="email-format-opening"
      />
      <TextField
        label={t("integrations.smtp.formats.example")}
        value={f.body}
        onChangeText={(body) => edit({ body })}
        multiline
        height={96}
        testID="email-format-body"
      />
      <TextField
        label={t("integrations.smtp.formats.signature")}
        value={f.signature}
        onChangeText={(signature) => edit({ signature })}
        multiline
        height={96}
        testID="email-format-signature"
      />
      <Stack direction="row" gap="sm" wrap align="center">
        <Button
          variant="secondary"
          label={t("integrations.smtp.formats.save")}
          onPress={() =>
            saveFormats(formats)
              .then((r) => {
                setFormats(r.formats);
                setNote(t("integrations.smtp.saved"));
              })
              .catch((e) => setNote(t("integrations.smtp.failed", { error: errorOf(e) })))
          }
          testID="email-formats-save"
        />
        {note ? (
          <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
            {note}
          </Text>
        ) : null}
      </Stack>
    </Stack>
  );
}
