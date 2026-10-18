/** Admin: prompt studio shell (R6). Versions list only; editing and testing arrive in Phase 6. */
import { Badge, Panel, Stack, space, Text, useTheme } from "@sotto/ui";
import { StyleSheet, View } from "react-native";
import { PROMPTS } from "../../features/admin/mock";
import { useI18n } from "../../lib/locale";

export default function PromptsScreen() {
  const { t } = useI18n();
  const { color } = useTheme();
  return (
    <Stack gap="lg" testID="admin-prompts">
      <Text variant="body" tone="muted">
        {t("admin.prompts.subtitle")}
      </Text>
      <Panel padded={false}>
        {PROMPTS.map((p, i) => (
          <View
            key={p.key}
            style={[styles.row, i > 0 ? { borderTopColor: color.border, borderTopWidth: 1 } : null]}
          >
            <View style={styles.main}>
              <Text variant="body" weight="semibold">
                {p.key}
              </Text>
              <Text variant="label" tone="muted">
                {p.description}
              </Text>
            </View>
            <View style={styles.badges}>
              <Badge tone="answer" label={`${t("admin.prompts.published")} v${p.published}`} />
              {p.draft ? (
                <Badge tone="notice" label={`${t("admin.prompts.draft")} v${p.versions}`} />
              ) : null}
              <Badge label={t("admin.prompts.scope", { scope: p.scope })} />
              <Text variant="label" tone="muted">
                {t("admin.prompts.versions", { count: p.versions })}
              </Text>
              <Text variant="label" tone="muted">
                {t("admin.prompts.score", { score: p.score })}
              </Text>
            </View>
          </View>
        ))}
      </Panel>
    </Stack>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
  },
  main: { flexGrow: 1, flexBasis: 220, gap: 2 },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
});
