/** Unanswered-questions inbox (R2 steps 4–5): open / answered / added to playbook. Mock data. */
import {
  Badge,
  type BadgeTone,
  EmptyState,
  layout,
  Panel,
  radius,
  Screen,
  SegmentedControl,
  space,
  Text,
  useTheme,
} from "@sotto/ui";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { PageHeader } from "../components/PageHeader";
import { RoleGate } from "../components/RoleGate";
import { byStatus, countByStatus, INBOX, type InboxStatus } from "../features/inbox/mock";
import { formatDateTime } from "../lib/format";
import { useI18n } from "../lib/locale";

const STATUSES: readonly InboxStatus[] = ["open", "answered", "added"];
const TONE: Record<InboxStatus, BadgeTone> = {
  open: "objection",
  answered: "question",
  added: "answer",
};

export default function InboxRoute() {
  return (
    <RoleGate area="/inbox">
      <InboxScreen />
    </RoleGate>
  );
}

function InboxScreen() {
  const { t, locale } = useI18n();
  const { color } = useTheme();
  const [status, setStatus] = useState<InboxStatus>("open");
  const counts = countByStatus(INBOX);
  const items = byStatus(INBOX, status);
  return (
    <Screen scroll maxWidth={layout.readableMaxWidth + 160} testID="inbox" style={styles.page}>
      <PageHeader title={t("inbox.title")} subtitle={t("inbox.subtitle")} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterWrap}
        contentContainerStyle={styles.filter}
      >
        <SegmentedControl
          accessibilityLabel={t("inbox.filter")}
          options={STATUSES.map((s) => ({
            value: s,
            label: `${t(`inbox.status.${s}`)}  ${counts[s]}`,
          }))}
          value={status}
          onChange={setStatus}
          testID="inbox-filter"
        />
      </ScrollView>
      {items.length === 0 ? (
        <EmptyState title={t("inbox.empty.title")} body={t("inbox.empty.body")} />
      ) : (
        <Panel padded={false}>
          {items.map((item, i) => (
            <View
              key={item.id}
              style={[
                styles.row,
                i > 0 ? { borderTopColor: color.border, borderTopWidth: 1 } : null,
              ]}
            >
              <View style={styles.top}>
                <Text variant="heading" weight="semibold" style={styles.grow}>
                  {item.question}
                </Text>
                <Badge tone={TONE[item.status]} label={t(`inbox.status.${item.status}`)} />
              </View>
              <Text variant="label" tone="muted">
                {t("inbox.askedBy", { customer: item.customer, agent: item.agent })}
              </Text>
              <Text variant="label" tone="muted">
                {formatDateTime(item.askedAt, locale)}
              </Text>
              {item.answer ? (
                <View
                  style={[
                    styles.answer,
                    { backgroundColor: color.surfaceSunken, borderStartColor: color.primary },
                  ]}
                >
                  <Text variant="label" weight="medium" tone="muted">
                    {t("inbox.answer")}
                  </Text>
                  <Text variant="body">{item.answer}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </Panel>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: space.xl },
  filterWrap: { flexGrow: 0 },
  filter: { marginBottom: space.lg },
  row: { padding: space.lg, gap: space.xs },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  grow: { flex: 1 },
  answer: {
    marginTop: space.sm,
    padding: space.md,
    borderStartWidth: 3,
    borderRadius: radius.sm,
    gap: 2,
  },
});
