/** Connect or disconnect one's own Zoho account (R10): Admin → Integrations and the call rail. */
import { Badge, Button, Stack, Text } from "@sotto/ui";
import { useI18n } from "../../lib/locale";
import type { ZohoConn } from "./useZoho";

export function ZohoConnect({ zoho, compact = false }: { zoho: ZohoConn; compact?: boolean }) {
  const { t, locale } = useI18n();
  const s = zoho.status;
  if (s?.connected) {
    return (
      <Stack gap="sm" align="flex-start" testID="zoho-connected">
        {zoho.justConnected ? (
          <Text
            variant="body"
            weight="semibold"
            aria-live="polite"
            accessibilityLiveRegion="polite"
            testID="zoho-just-connected"
          >
            {t("crm.connected.now")}
          </Text>
        ) : null}
        {s.needs_reconnect ? (
          <Stack gap="xs" align="flex-start" testID="zoho-needs-reconnect">
            <Text variant="label" tone="muted">
              {t("crm.reconnect.body")}
            </Text>
            <Button
              variant="secondary"
              label={t("crm.reconnect.button")}
              onPress={zoho.connect}
              testID="zoho-reconnect"
            />
            {zoho.waiting ? (
              <Text
                variant="label"
                tone="muted"
                aria-live="polite"
                accessibilityLiveRegion="polite"
              >
                {t("crm.connect.waiting")}
              </Text>
            ) : null}
          </Stack>
        ) : null}
        <Stack direction="row" gap="sm" align="center" wrap>
          <Badge label={t("crm.connected")} tone="answer" dot />
          {s.connected_at ? (
            <Text variant="label" tone="muted">
              {t("crm.connectedSince", {
                date: new Date(s.connected_at).toLocaleDateString(locale),
              })}
            </Text>
          ) : null}
        </Stack>
        {compact ? null : (
          <Button
            variant="secondary"
            label={t("crm.disconnect")}
            onPress={zoho.disconnect}
            testID="zoho-disconnect"
          />
        )}
      </Stack>
    );
  }
  const noClient = zoho.error === "no_client" || (s !== null && s.client === null);
  return (
    <Stack gap="sm" align="flex-start" testID="zoho-connect">
      <Text variant="body" tone="muted">
        {noClient ? t("crm.noClient") : t("crm.connect.body")}
      </Text>
      {noClient ? null : (
        <Button label={t("crm.connect")} onPress={zoho.connect} testID="zoho-connect-button" />
      )}
      {zoho.waiting ? (
        <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
          {t("crm.connect.waiting")}
        </Text>
      ) : null}
      {zoho.error === "failed" ? (
        <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
          {t("crm.connect.failed")}
        </Text>
      ) : null}
    </Stack>
  );
}
