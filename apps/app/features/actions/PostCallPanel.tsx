/**
 * `ZohoGate`: shows its children only when Zoho writes are available, or says what is missing.
 * After the call the checklist (`AfterCallChecklist`, UX-04) uses it.
 */
import { Button, Stack, Text } from "@sotto/ui";
import type { ReactNode } from "react";
import { useFeature } from "../../components/FeatureGate";
import { useI18n } from "../../lib/locale";
import { useZoho } from "../crm/useZoho";

/** Shows its children only when Zoho writes can work for this person (or says what is missing). */
export function ZohoGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const zoho = useFeature("zoho");
  const conn = useZoho();
  if (
    zoho.state === "no_permission" ||
    zoho.state === "off_by_platform" ||
    zoho.state === "off_by_org"
  )
    return null;
  if (zoho.state !== "available") {
    return (
      <Text variant="label" tone="muted" testID="actions-no-zoho">
        {t("actions.noZoho")}
      </Text>
    );
  }
  if (conn.status?.needs_reconnect) {
    return (
      <Stack gap="sm" align="flex-start" testID="actions-reconnect">
        <Text variant="label" tone="muted">
          {t("crm.reconnect.body")}
        </Text>
        <Button variant="secondary" label={t("crm.reconnect.button")} onPress={conn.connect} />
      </Stack>
    );
  }
  return children;
}
