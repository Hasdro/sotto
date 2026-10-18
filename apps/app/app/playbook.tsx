/** Playbook, searchable (R2 step 1: approved answers come first; R3: managers edit it). Mock data. */
import {
  Badge,
  EmptyState,
  layout,
  Panel,
  Screen,
  space,
  Text,
  TextField,
  useTheme,
} from "@sotto/ui";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { PageHeader } from "../components/PageHeader";
import { PLAYBOOK, searchPlaybook } from "../features/playbook/mock";
import { formatDate } from "../lib/format";
import { useI18n } from "../lib/locale";

export default function PlaybookScreen() {
  const { t, locale } = useI18n();
  const { color } = useTheme();
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchPlaybook(PLAYBOOK, query), [query]);
  return (
    <Screen scroll maxWidth={layout.readableMaxWidth + 160} testID="playbook" style={styles.page}>
      <PageHeader title={t("playbook.title")} subtitle={t("playbook.subtitle")} />
      <View style={styles.search}>
        <TextField
          accessibilityLabel={t("playbook.search")}
          placeholder={t("playbook.searchPlaceholder")}
          value={query}
          onChangeText={setQuery}
          testID="playbook-search"
        />
        <Text variant="label" tone="muted" accessibilityLiveRegion="polite">
          {t("playbook.count", { count: results.length })}
        </Text>
      </View>
      {results.length === 0 ? (
        <EmptyState title={t("playbook.empty.title")} body={t("playbook.empty.body")} />
      ) : (
        <Panel padded={false}>
          {results.map((e, i) => (
            <View
              key={e.id}
              style={[
                styles.row,
                i > 0 ? { borderTopColor: color.border, borderTopWidth: 1 } : null,
              ]}
            >
              <Text variant="body" weight="semibold">
                {e.question}
              </Text>
              <Text variant="body">{e.answer}</Text>
              <View style={styles.tags}>
                {e.tags.map((tag) => (
                  <Badge key={tag} label={tag} />
                ))}
                <Text variant="label" tone="muted">
                  {t("playbook.updated", { date: formatDate(e.updated, locale) })}
                </Text>
              </View>
            </View>
          ))}
        </Panel>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: space.xl },
  search: { gap: space.sm, marginBottom: space.lg },
  row: { padding: space.lg, gap: space.xs },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.xs,
  },
});
