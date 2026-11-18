/**
 * Admin → Integrations › WhatsApp (round 2, D-078): status only. The Gallabox keys, channel,
 * templates and delivery webhook are configured per organisation on the vendor panel now;
 * inside the client the admin only sees whether WhatsApp is connected, and which number.
 */
import { Badge, Panel, Stack, Text } from "@sotto/ui";
import { useEffect, useState } from "react";
import { gallaboxStatus, type GallaboxStatus as Status } from "./api";
import { useWhatsAppText } from "./strings";

export function GallaboxStatus() {
  const t = useWhatsAppText();
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    gallaboxStatus()
      .then(setStatus)
      .catch(() => {});
  }, []);
  const configured = status?.configured === true;
  return (
    <Panel testID="gallabox-settings">
      <Stack gap="md">
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {t("integrations.gallabox.title")}
        </Text>
        <Stack direction="row" gap="sm" wrap>
          <Badge
            testID="gallabox-state"
            dot
            tone={configured ? "answer" : "neutral"}
            label={t(
              configured ? "integrations.gallabox.connected" : "integrations.gallabox.none",
            )}
          />
        </Stack>
        {configured && status?.channel?.set && status.channel.label ? (
          <Text variant="label" tone="muted">
            {status.channel.label}
          </Text>
        ) : null}
      </Stack>
    </Panel>
  );
}
