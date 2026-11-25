/**
 * User settings panel for Local / Offline Models (L6, D-096):
 * URL field (localhost or company network), Test button (reachability + short benchmark),
 * live status ("Local model: connected ✓" / "Local model: unreachable"), and D-096 opt-in
 * warning when measured latency exceeds 1.5 s.
 */
import { Badge, Button, Card, Stack, Text, TextField, useTheme } from "@sotto/ui";
import { useState } from "react";
import { StyleSheet, Switch, View } from "react-native";

export type LocalEndpointStatus = {
  reachable: boolean;
  measuredMs: number | null;
  meetsR1: boolean;
  statusLabel: string;
};

export type LocalModelsSettingsProps = {
  initialUrl?: string;
  initialOptIn?: boolean;
  onTest: (url: string) => Promise<LocalEndpointStatus>;
  onSave: (cfg: { url: string; liveOptIn: boolean }) => Promise<void> | void;
};

export function LocalModelsSettings({
  initialUrl = "http://127.0.0.1:11434/v1",
  initialOptIn = false,
  onTest,
  onSave,
}: LocalModelsSettingsProps) {
  const { color } = useTheme();
  const [url, setUrl] = useState(initialUrl);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<LocalEndpointStatus | null>(null);
  const [liveOptIn, setLiveOptIn] = useState(initialOptIn);

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await onTest(url.trim());
      setStatus(res);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card testID="local-models-settings">
      <Stack gap="md">
        <Text variant="title" weight="semibold">
          Local &amp; offline model
        </Text>
        <Text variant="caption" color={color.muted}>
          What this does: routes AI requests to your localhost or company-network model server.
          Recommended default: off unless enabled by your platform owner.
        </Text>
        <TextField
          label="Model endpoint URL"
          placeholder="http://127.0.0.1:11434/v1"
          value={url}
          onChangeText={setUrl}
          testID="local-model-url"
        />
        <View style={styles.row}>
          <Button
            label={testing ? "Testing…" : "Test"}
            onPress={() => void runTest()}
            disabled={testing || url.trim().length === 0}
            testID="local-model-test"
          />
          {status ? (
            <Badge
              tone={status.reachable ? "success" : "danger"}
              label={status.statusLabel}
              testID="local-model-status"
            />
          ) : null}
        </View>
        {status?.reachable && status.measuredMs !== null ? (
          <Text variant="caption" color={color.muted} testID="local-model-bench">
            {status.meetsR1
              ? `Measured delay: ${status.measuredMs} ms — fast enough for live cards.`
              : `Measured delay: ${status.measuredMs} ms — slower than 1.5 s. Used for slow jobs only unless you opt in below.`}
          </Text>
        ) : null}
        {status?.reachable && !status.meetsR1 ? (
          <View style={styles.optRow} testID="local-model-slow-warning">
            <View style={styles.optText}>
              <Text variant="label" weight="medium">
                Use it for live cards anyway
              </Text>
              <Text variant="caption" color={color.muted}>
                A holding line appears at 1.5 s and the local card replaces it with a
                &ldquo;local model – slower&rdquo; badge.
              </Text>
            </View>
            <Switch
              value={liveOptIn}
              onValueChange={(next) => {
                setLiveOptIn(next);
                void onSave({ url: url.trim(), liveOptIn: next });
              }}
              testID="local-model-optin"
            />
          </View>
        ) : null}
      </Stack>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  optRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  optText: { flex: 1 },
});
