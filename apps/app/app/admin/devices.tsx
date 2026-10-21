/** Admin → Devices (owner, 22 Oct): every signed-in computer and phone in the company, with
 * who uses it and when it was last seen; sign any of them out. */
import { Button, EmptyState, Panel, Stack, space, Text, useTheme } from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { cloudApi } from "../../lib/cloud";
import { formatDateTime } from "../../lib/format";
import { useI18n } from "../../lib/locale";

type Device = {
  id: string;
  platform: string;
  label: string;
  last_seen: number;
  revoked: boolean;
  this_device: boolean;
  name?: string;
  email?: string;
};

const PLATFORM_ICON: Record<string, string> = {
  mac: "🍎",
  windows: "🪟",
  linux: "🐧",
  web: "🌐",
  ios: "📱",
  android: "🤖",
  extension: "🧩",
};

export default function DevicesScreen() {
  const { t, locale } = useI18n();
  const { color } = useTheme();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const load = useCallback(() => {
    cloudApi<{ devices: Device[] }>("/api/v1/devices?all=1")
      .then((r) => setDevices(r.devices.filter((d) => !d.revoked)))
      .catch(() => setDevices([]));
  }, []);
  useEffect(load, [load]);
  if (devices === null) return null;
  if (!devices.length) return <EmptyState title={t("admin.devices.none")} />;
  return (
    <Stack gap="md" testID="admin-devices">
      <Text variant="body" tone="muted">
        {t("admin.devices.subtitle")}
      </Text>
      <Panel>
        {devices.map((d, i) => (
          <View
            key={d.id}
            style={[styles.row, i > 0 ? { borderTopColor: color.border, borderTopWidth: 1 } : null]}
          >
            <Text variant="heading">{PLATFORM_ICON[d.platform] ?? "💻"}</Text>
            <View style={styles.grow}>
              <Text weight="semibold" numberOfLines={1}>
                {`${d.label}${d.this_device ? ` · ${t("account.thisDevice")}` : ""}`}
              </Text>
              <Text variant="label" tone="muted" numberOfLines={1}>
                {`👤 ${d.name || d.email || ""}  ·  ${t("account.lastSeen", {
                  when: formatDateTime(new Date(d.last_seen).toISOString(), locale),
                })}`}
              </Text>
            </View>
            {d.this_device ? null : (
              <Button
                variant="ghost"
                label={t("account.signoutDevice")}
                onPress={() =>
                  cloudApi(`/api/v1/devices/${encodeURIComponent(d.id)}`, {
                    method: "DELETE",
                  }).then(load)
                }
              />
            )}
          </View>
        ))}
      </Panel>
    </Stack>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  grow: { flex: 1, minWidth: 0 },
});
