/**
 * Admin → Integrations (R10, UX-30): the admin's own Zoho connection first, then inviting the
 * team from Zoho (ZC-13), Email (SMTP presets, UX-32) and WhatsApp (Gallabox pick lists, ZC-07).
 * The per-org Zoho OAuth client is an owner-console override now (D-064): when AGN set one,
 * this page only says so ("Client ID ends …") and lets the admin go back to AGN's client.
 */
import { Button, EmptyState, Panel, Stack, Text } from "@sotto/ui";
import { useEffect, useState } from "react";
import { AgnFieldsPanel } from "../../features/crm/AgnFieldsPanel";
import { type ClientStatus, orgClient, removeOrgClient } from "../../features/crm/api";
import { useZoho } from "../../features/crm/useZoho";
import { WeeklyExport } from "../../features/crm/WeeklyExport";
import { ZohoConnect } from "../../features/crm/ZohoConnect";
import { SmtpSettings } from "../../features/email/SmtpSettings";
import { useIntegrationsText } from "../../features/integrations/strings";
import { ZohoInvite } from "../../features/team/ZohoInvite";
import { GallaboxSettings } from "../../features/whatsapp/GallaboxSettings";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";

export default function IntegrationsScreen() {
  const { t } = useI18n();
  const cloud = useCloud();
  if (cloud.status !== "signed_in") {
    return <EmptyState testID="admin-integrations-none" title={t("crm.title")} />;
  }
  return (
    <Stack gap="xl" testID="admin-integrations">
      <ConnectionPanel />
      <AgnPart />
      <WeeklyExport />
      <SmtpSettings />
      <GallaboxSettings />
    </Stack>
  );
}

function AgnPart() {
  const zoho = useZoho();
  return <AgnFieldsPanel zoho={zoho} />;
}

type OrgClient = ClientStatus["org"] & { client_id_tail?: string };

function ConnectionPanel() {
  const { t } = useI18n();
  const zoho = useZoho();
  const connected = Boolean(zoho.status?.connected && !zoho.status.needs_reconnect);
  return (
    <Panel testID="zoho-connection">
      <Stack gap="md">
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {t("crm.connection.title")}
        </Text>
        <ZohoConnect zoho={zoho} />
        <ClientOverride />
        <ZohoInvite connected={connected} />
      </Stack>
    </Panel>
  );
}

/** D-064: read-only unless AGN set an org client; then one clear way back to AGN's. */
function ClientOverride() {
  const ti = useIntegrationsText();
  const [org, setOrg] = useState<OrgClient | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    orgClient()
      .then((s) => setOrg(s.org))
      .catch(() => {});
  }, []);
  if (!org?.configured) {
    return note ? (
      <Text variant="label" tone="muted" aria-live="polite" testID="zoho-override-note">
        {note}
      </Text>
    ) : null;
  }
  const remove = () =>
    removeOrgClient()
      .then((s) => {
        setOrg(s.org);
        setConfirming(false);
        setNote(ti("zoho.override.removed"));
      })
      .catch((e: unknown) => setNote(e instanceof Error ? e.message : String(e)));
  return (
    <Stack gap="sm" testID="zoho-override">
      <Text variant="body" weight="semibold">
        {ti("zoho.override.title")}
      </Text>
      <Text variant="label" tone="muted">
        {org.client_id_tail
          ? ti("zoho.override.tail", { tail: org.client_id_tail })
          : ti("zoho.override.body")}
      </Text>
      {confirming ? (
        <Stack gap="sm">
          <Text variant="label" tone="danger" testID="zoho-override-confirm">
            {ti("zoho.override.confirm")}
          </Text>
          <Stack direction="row" gap="sm" wrap>
            <Button
              variant="secondary"
              label={ti("zoho.override.yes")}
              onPress={remove}
              testID="zoho-override-yes"
            />
            <Button
              variant="ghost"
              label={ti("zoho.override.no")}
              onPress={() => setConfirming(false)}
              testID="zoho-override-no"
            />
          </Stack>
        </Stack>
      ) : (
        <Button
          variant="ghost"
          label={ti("zoho.override.remove")}
          onPress={() => setConfirming(true)}
          testID="zoho-override-remove"
        />
      )}
    </Stack>
  );
}
