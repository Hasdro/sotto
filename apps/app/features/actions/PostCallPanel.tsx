/**
 * `ZohoGate` (Zoho writes available, or what is missing) and `QuickActions`, the during-call
 * side panel: only a Lead and a Contact update (phase 9 § 6), collapsed by default so it never
 * takes the agent's eyes off the card. After the call the checklist takes over
 * (`AfterCallChecklist`, UX-04).
 */
import { Button, Stack, Text } from "@sotto/ui";
import { type ReactNode, useState } from "react";
import { useFeature } from "../../components/FeatureGate";
import { useI18n } from "../../lib/locale";
import { useAttachedState } from "../crm/attached";
import { useZoho } from "../crm/useZoho";
import type { Perform } from "./ActionCard";
import { contactCard, leadCard } from "./cards";

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

export function QuickActions({ perform }: { perform?: Perform }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { crm } = useAttachedState();
  const brief = crm.kind === "attached" ? crm.brief : null;
  return (
    <Stack gap="sm" testID="quick-actions">
      <Button
        variant="ghost"
        label={t(open ? "actions.hide" : "actions.show")}
        onPress={() => setOpen((o) => !o)}
        testID="quick-actions-toggle"
      />
      {open ? (
        <ZohoGate>
          {brief?.person?.module === "Contacts"
            ? contactCard(t, brief, perform)
            : leadCard(t, perform)}
        </ZohoGate>
      ) : null}
    </Stack>
  );
}
