/** Admin: prompt studio list (R6). Each prompt opens its versions, editor and rollback. Mock data. */
import { Badge, Panel, Stack, space, Text, useTheme } from "@sotto/ui";
import { Link } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { usePrompts } from "../../../features/prompts/store";
import { draftOf, publishedOf } from "../../../features/prompts/studio";
import { useI18n } from "../../../lib/locale";

export default function PromptsScreen() {
  const { t } = useI18n();
  const { color } = useTheme();
  const { prompts } = usePrompts();
  return (
    <Stack gap="lg" testID="admin-prompts">
      <Text variant="body" tone="muted">
        {t("admin.prompts.subtitle")}
      </Text>
      <Panel padded={false}>
        {prompts.map((p, i) => {
          const live = publishedOf(p);
          const draft = draftOf(p);
          return (
            <Link key={p.key} href={`/admin/prompts/${p.key}`} asChild>
              <Pressable
                accessibilityRole="link"
                style={StyleSheet.flatten([
                  styles.row,
                  i > 0 ? { borderTopColor: color.border, borderTopWidth: 1 } : null,
                ])}
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
                  {live ? (
                    <Badge
                      tone="answer"
                      label={`${t("admin.prompts.published")} v${live.version}`}
                    />
                  ) : null}
                  {draft ? (
                    <Badge tone="notice" label={`${t("admin.prompts.draft")} v${draft.version}`} />
                  ) : null}
                  <Badge
                    label={t("admin.prompts.scope", { scope: t(`prompts.scope.${p.scope}`) })}
                  />
                  <Text variant="label" tone="muted">
                    {t("admin.prompts.versions", { count: p.versions.length })}
                  </Text>
                  <Text variant="label" tone="muted">
                    {t("admin.prompts.score", { score: p.score })}
                  </Text>
                </View>
              </Pressable>
            </Link>
          );
        })}
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
