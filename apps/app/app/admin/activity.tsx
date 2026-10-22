/** Admin → Activity (owner, 22 Oct; R3 audit): who changed what in the company, newest first. */
import { EmptyState, Icon, type IconName, Panel, Stack, space, Text, useTheme } from "@sotto/ui";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { cloudApi } from "../../lib/cloud";
import { formatDateTime } from "../../lib/format";
import { useI18n } from "../../lib/locale";

type Item = {
  id: number;
  at: number;
  action: string;
  detail: string;
  actor: string | null;
  actor_name: string | null;
};

const ICON: [RegExp, IconName][] = [
  [/^key/, "key"],
  [/^playbook/, "playbook"],
  [/^settings/, "settings"],
  [/^route/, "globe"],
  [/^user|^team|^member/, "users"],
  [/^device/, "screen"],
  [/^escalation/, "inbox"],
  [/^company/, "home"],
];

export default function ActivityScreen() {
  const { t, locale } = useI18n();
  const { color } = useTheme();
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    cloudApi<{ items: Item[] }>("/api/v1/audit")
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);
  if (items === null) return null;
  if (!items.length) return <EmptyState title={t("admin.activity.none")} />;
  return (
    <Stack gap="md" testID="admin-activity">
      <Text variant="body" tone="muted">
        {t("admin.activity.subtitle")}
      </Text>
      <Panel>
        {items.map((it, i) => (
          <View
            key={it.id}
            style={[styles.row, i > 0 ? { borderTopColor: color.border, borderTopWidth: 1 } : null]}
          >
            <Icon
              name={ICON.find(([re]) => re.test(it.action))?.[1] ?? "list"}
              size={22}
              color={color.textMuted}
            />
            <View style={styles.grow}>
              <Text weight="medium" numberOfLines={2}>
                {`${it.action} · ${it.detail}`}
              </Text>
              <View style={styles.facts}>
                <Icon name="account" size={13} color={color.textMuted} />
                <Text variant="label" tone="muted">
                  {it.actor_name || it.actor || t("admin.activity.system")}
                </Text>
                <Icon name="clock" size={13} color={color.textMuted} />
                <Text variant="label" tone="muted">
                  {formatDateTime(new Date(it.at).toISOString(), locale)}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </Panel>
    </Stack>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  grow: { flex: 1, minWidth: 0 },
  facts: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
});
