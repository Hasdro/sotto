/** Admin: team members, roles and devices (R3). Mock data until Phase 5. */
import { Badge, type BadgeTone, Button, Stack, Table, Text } from "@sotto/ui";
import { View } from "react-native";
import { type Role, TEAM } from "../../features/admin/mock";
import { useI18n } from "../../lib/locale";
import { useIsWide } from "../../lib/responsive";

const ROLE_TONE: Record<Role, BadgeTone> = {
  owner: "primary",
  admin: "question",
  manager: "answer",
  agent: "neutral",
};

export default function TeamScreen() {
  const { t } = useI18n();
  const wide = useIsWide();
  return (
    <Stack gap="lg" testID="admin-team">
      <Stack direction="row" align="center" justify="space-between" gap="md" wrap>
        <Text variant="body" tone="muted" style={{ flexShrink: 1 }}>
          {t("admin.team.subtitle")}
        </Text>
        <Button label={t("admin.team.invite")} />
      </Stack>
      <Table
        accessibilityLabel={t("admin.team")}
        stacked={!wide}
        columns={[
          { key: "name", title: t("admin.team.name"), flex: 2.2 },
          { key: "role", title: t("admin.team.role"), flex: 1.2 },
          { key: "devices", title: t("admin.team.devices"), flex: 0.8 },
          { key: "last", title: t("admin.team.lastActive"), flex: 1 },
        ]}
        rows={TEAM.map((m) => ({
          id: m.id,
          cells: {
            name: (
              <View>
                <Text variant="body" weight="medium">
                  {m.name}
                </Text>
                <Text variant="label" tone="muted">
                  {m.email}
                </Text>
              </View>
            ),
            role: <Badge tone={ROLE_TONE[m.role]} label={t(`role.${m.role}`)} />,
            devices: String(m.devices),
            last: m.lastActive,
          },
        }))}
      />
    </Stack>
  );
}
