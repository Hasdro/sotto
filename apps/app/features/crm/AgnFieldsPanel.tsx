/**
 * INT-06 (D-069): Admin › Integrations › "Create AGN fields in Zoho". A read-only preview first
 * (which of the four fields exist), then one confirmed create for the missing ones only; an
 * existing field is never changed. Stage and Amount are not among them and cannot be written.
 */
import { Badge, Button, Panel, Stack, Text, ToggleRow } from "@sotto/ui";
import { useState } from "react";
import { View } from "react-native";
import { CloudError } from "../../lib/cloud";
import { type AgnField, agnFields, createAgnFields } from "./api";
import { useCrmText } from "./strings";
import type { ZohoConn } from "./useZoho";

type Api = { preview: typeof agnFields; create: typeof createAgnFields };

export function AgnFieldsPanel({
  zoho,
  api = { preview: agnFields, create: createAgnFields },
}: {
  zoho: ZohoConn;
  api?: Api;
}) {
  const ct = useCrmText();
  const [fields, setFields] = useState<AgnField[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"failed" | "reconnect" | null>(null);
  const st = zoho.status;
  // Before the D-069 reconnect the panel stays hidden: the one reconnect prompt is ZohoConnect.
  if (!st?.connected || !st.features?.agn_fields) return null;
  const run = async (fn: () => Promise<{ fields: AgnField[] }>) => {
    setBusy(true);
    setError(null);
    try {
      setFields((await fn()).fields);
      setConfirmed(false);
    } catch (e) {
      setError(e instanceof CloudError && e.code === "zoho_reconnect" ? "reconnect" : "failed");
    } finally {
      setBusy(false);
    }
  };
  const missing = (fields ?? []).filter((f) => !f.exists);
  return (
    <Panel testID="agn-fields">
      <Stack gap="md">
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {ct("agn.title")}
        </Text>
        <Text tone="muted">{ct("agn.body")}</Text>
        {fields === null ? (
          <Stack direction="row" gap="sm" wrap>
            <Button
              variant="secondary"
              label={ct("agn.preview")}
              disabled={busy}
              onPress={() => void run(api.preview)}
              testID="agn-preview"
            />
          </Stack>
        ) : (
          <Stack gap="sm">
            {fields.map((f) => (
              <View key={f.api_name} testID={`agn-field-${f.api_name}`}>
                <Stack direction="row" gap="sm" wrap align="center">
                  <Text weight="medium">{f.label}</Text>
                  <Badge
                    label={
                      !f.exists
                        ? ct("agn.missing")
                        : f.writable
                          ? ct("agn.exists")
                          : ct("agn.notWritable")
                    }
                    tone={f.exists ? (f.writable ? "neutral" : "notice") : "primary"}
                  />
                </Stack>
                <Text variant="label" tone="muted">
                  {`${f.api_name} · ${f.type}`}
                </Text>
              </View>
            ))}
            {missing.length === 0 ? (
              <Text testID="agn-done">{ct("agn.done")}</Text>
            ) : (
              <>
                <ToggleRow
                  label={ct("agn.confirm")}
                  value={confirmed}
                  onValueChange={setConfirmed}
                  testID="agn-confirm"
                />
                <Stack direction="row" gap="sm" wrap>
                  <Button
                    label={ct("agn.create", { n: missing.length })}
                    disabled={!confirmed || busy}
                    onPress={() => void run(api.create)}
                    testID="agn-create"
                  />
                </Stack>
              </>
            )}
          </Stack>
        )}
        {error ? (
          <Text variant="label" tone="danger" aria-live="polite" testID="agn-error">
            {error === "reconnect" ? ct("agn.reconnect") : ct("agn.failed")}
          </Text>
        ) : null}
      </Stack>
    </Panel>
  );
}
