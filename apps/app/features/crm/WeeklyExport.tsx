/**
 * INT-12 (D-072): Admin › Integrations › the weekly CSV for Zoho Analytics (last full ISO week,
 * this company only, no call text). Web and desktop download it; phones are told where to.
 */
import { Button, Panel, Stack, Text } from "@sotto/ui";
import { useState } from "react";
import { Platform } from "react-native";
import { cloudBlob } from "../../lib/cloud";
import { weeklyExportPath } from "./api";
import { useCrmText } from "./strings";

export type Save = (blob: Blob, name: string) => void;

function saveInBrowser(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function WeeklyExport({
  fetchBlob = cloudBlob,
  save = saveInBrowser,
  web = Platform.OS === "web",
}: {
  fetchBlob?: (path: string) => Promise<Blob | null>;
  save?: Save;
  web?: boolean;
}) {
  const ct = useCrmText();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const download = async () => {
    setBusy(true);
    setFailed(false);
    const blob = await fetchBlob(weeklyExportPath());
    setBusy(false);
    if (!blob) {
      setFailed(true);
      return;
    }
    save(blob, "agn-calls-last-week.csv");
  };
  return (
    <Panel testID="weekly-export">
      <Stack gap="md">
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {ct("export.title")}
        </Text>
        <Text tone="muted">{ct("export.body")}</Text>
        {web ? (
          <Stack direction="row" gap="sm" wrap>
            <Button
              variant="secondary"
              label={ct("export.download")}
              disabled={busy}
              onPress={() => void download()}
              testID="export-download"
            />
          </Stack>
        ) : (
          <Text variant="label" tone="muted">
            {ct("export.webOnly")}
          </Text>
        )}
        {failed ? (
          <Text variant="label" tone="danger" aria-live="polite" testID="export-failed">
            {ct("export.failed")}
          </Text>
        ) : null}
      </Stack>
    </Panel>
  );
}
