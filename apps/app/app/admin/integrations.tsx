/**
 * Admin → Integrations (R10, D-031): the organisation's optional Zoho OAuth client (it overrides
 * AGN's platform client; write-only, encrypted on the server) and the admin's own Zoho
 * connection. Agents connect from the call's context rail.
 */
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  SegmentedControl,
  Stack,
  Text,
  TextField,
} from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import {
  type ClientStatus,
  orgClient,
  removeOrgClient,
  saveOrgClient,
} from "../../features/crm/api";
import { useZoho } from "../../features/crm/useZoho";
import { ZohoConnect } from "../../features/crm/ZohoConnect";
import { SmtpSettings } from "../../features/email/SmtpSettings";
import { GallaboxSettings } from "../../features/whatsapp/GallaboxSettings";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";

const DCS = [
  { value: "us", label: "zoho.com" },
  { value: "eu", label: "zoho.eu" },
  { value: "in", label: "zoho.in" },
  { value: "au", label: "zoho.com.au" },
] as const;
type Dc = (typeof DCS)[number]["value"];

export default function IntegrationsScreen() {
  const { t } = useI18n();
  const cloud = useCloud();
  if (cloud.status !== "signed_in") {
    return <EmptyState testID="admin-integrations-none" title={t("crm.title")} />;
  }
  return (
    <Stack gap="xl" testID="admin-integrations">
      <ClientPanel />
      <ConnectionPanel />
      <SmtpSettings />
      <GallaboxSettings />
    </Stack>
  );
}

function ClientPanel() {
  const { t } = useI18n();
  const [status, setStatus] = useState<ClientStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [dc, setDc] = useState<Dc>("us");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    orgClient()
      .then(setStatus)
      .catch(() => {});
  }, []);

  const done = useCallback(
    (p: Promise<ClientStatus>) => {
      setBusy(true);
      setNote(null);
      p.then((s) => {
        setStatus(s);
        setClientId("");
        setSecret("");
        setNote(t("crm.client.saved"));
      })
        .catch(() => setNote(t("crm.client.failed")))
        .finally(() => setBusy(false));
    },
    [t],
  );

  const active = status?.active;
  return (
    <Panel testID="zoho-client">
      <Stack gap="md">
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {t("crm.client.title")}
        </Text>
        <Text variant="body" tone="muted">
          {t("crm.client.body")}
        </Text>
        <Stack direction="row" gap="sm" wrap>
          <Badge
            testID="zoho-client-active"
            dot
            tone={active ? "answer" : "neutral"}
            label={t(
              active === "org"
                ? "crm.client.active.org"
                : active === "platform"
                  ? "crm.client.active.platform"
                  : "crm.client.active.none",
            )}
          />
        </Stack>
        <TextField
          label={t("crm.client.id")}
          value={clientId}
          onChangeText={setClientId}
          autoCapitalize="none"
          autoCorrect={false}
          testID="zoho-client-id"
        />
        <TextField
          label={t("crm.client.secret")}
          value={secret}
          onChangeText={setSecret}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          testID="zoho-client-secret"
        />
        <Stack gap="xs">
          <Text variant="label" weight="medium" tone="muted">
            {t("crm.client.dc")}
          </Text>
          <SegmentedControl
            options={DCS}
            value={dc}
            onChange={setDc}
            accessibilityLabel={t("crm.client.dc")}
            testID="zoho-client-dc"
          />
        </Stack>
        <Stack direction="row" gap="sm" wrap>
          <Button
            label={t("crm.client.save")}
            disabled={busy || !clientId.trim() || !secret.trim()}
            onPress={() => done(saveOrgClient({ client_id: clientId, client_secret: secret, dc }))}
            testID="zoho-client-save"
          />
          {status?.org.configured ? (
            <Button
              variant="ghost"
              label={t("crm.client.remove")}
              disabled={busy}
              onPress={() => done(removeOrgClient())}
              testID="zoho-client-remove"
            />
          ) : null}
        </Stack>
        {note ? (
          <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
            {note}
          </Text>
        ) : null}
      </Stack>
    </Panel>
  );
}

function ConnectionPanel() {
  const { t } = useI18n();
  const zoho = useZoho();
  return (
    <Panel testID="zoho-connection">
      <Stack gap="md">
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {t("crm.connection.title")}
        </Text>
        <ZohoConnect zoho={zoho} />
      </Stack>
    </Panel>
  );
}
