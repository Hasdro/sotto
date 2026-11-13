/**
 * After the call (R12, T-061): one card per suggested Zoho write, each approved on its own, and
 * the follow-up slot for email and WhatsApp (built by the `messaging` stream in
 * `features/{email,whatsapp}`; until they land the slot shows a placeholder).
 *
 * Also `QuickActions`, the during-call side panel: only a Lead and a Contact update (phase 9
 * § 6), collapsed by default so it never takes the agent's eyes off the card.
 */
import { Button, Panel, Stack, Text } from "@sotto/ui";
import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { useFeature } from "../../components/FeatureGate";
import { useI18n } from "../../lib/locale";
import { PREP_FIELDS, useAttachedState } from "../crm/attached";
import { useZoho } from "../crm/useZoho";
import type { Perform } from "./ActionCard";
import { contactCard, dealNoteCard, leadCard, meetingCard } from "./cards";

function ZohoGate({ children }: { children: ReactNode }) {
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

export function PostCallPanel({ perform, slot }: { perform?: Perform; slot?: ReactNode }) {
  const { t } = useI18n();
  const { crm, prep } = useAttachedState();
  const brief = crm.kind === "attached" ? crm.brief : null;
  const noteText = PREP_FIELDS.filter((f) => f !== "attendees" && prep[f].trim())
    .map((f) => `${t(`prep.${f}`)}: ${prep[f].trim()}`)
    .join("\n");
  return (
    <Panel testID="post-call-panel">
      <Stack gap="md">
        <View>
          <Text variant="heading" weight="semibold" accessibilityRole="header">
            {t("actions.title")}
          </Text>
          <Text variant="label" tone="muted">
            {t("actions.subtitle")}
          </Text>
        </View>
        <ZohoGate>
          <Stack gap="md">
            {meetingCard(t, brief, perform)}
            {brief?.person?.module === "Contacts"
              ? contactCard(t, brief, perform)
              : leadCard(t, perform)}
            {brief ? dealNoteCard(t, brief, noteText, perform) : null}
          </Stack>
        </ZohoGate>
        {/* Follow-up slot (T-063/T-064, `messaging` stream): the email and WhatsApp action
            components from features/email and features/whatsapp mount here. */}
        <View testID="actions-slot">
          {slot ?? (
            <Text variant="label" tone="muted">
              {t("actions.slot")}
            </Text>
          )}
        </View>
      </Stack>
    </Panel>
  );
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
