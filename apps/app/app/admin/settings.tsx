/** Admin: company settings (R2 AI answers and backup provider, R4 agent context) and app language. */
import { Divider, Panel, SegmentedControl, Stack, space, Text, ToggleRow } from "@sotto/ui";
import { type ReactNode, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

type CardLanguage = "auto" | "en" | "ar";

export default function SettingsScreen() {
  const { t, locale, setLocale } = useI18n();
  // Mock company settings: local state until Phase 5 stores them per company.
  const [aiAnswers, setAiAnswers] = useState(true);
  const [backup, setBackup] = useState(true);
  const [agentContext, setAgentContext] = useState(true);
  const [cardLanguage, setCardLanguage] = useState<CardLanguage>("auto");
  return (
    <Stack gap="xl" testID="admin-settings">
      <Text variant="body" tone="muted">
        {t("admin.settings.subtitle")}
      </Text>
      <Section title={t("admin.settings.calls")}>
        <ToggleRow
          label={t("admin.settings.aiAnswers")}
          description={t("admin.settings.aiAnswersHint")}
          value={aiAnswers}
          onValueChange={setAiAnswers}
          testID="toggle-ai"
        />
        <Divider />
        <ToggleRow
          label={t("admin.settings.backup")}
          description={t("admin.settings.backupHint")}
          value={backup}
          onValueChange={setBackup}
          testID="toggle-backup"
        />
        <Divider />
        <ToggleRow
          label={t("admin.settings.agentContext")}
          description={t("admin.settings.agentContextHint")}
          value={agentContext}
          onValueChange={setAgentContext}
        />
        <Divider />
        <View style={styles.field}>
          <Text variant="body" weight="medium">
            {t("admin.settings.cardLanguage")}
          </Text>
          <SegmentedControl<CardLanguage>
            accessibilityLabel={t("admin.settings.cardLanguage")}
            options={[
              { value: "auto", label: t("admin.settings.cardLanguage.auto") },
              { value: "en", label: t("admin.settings.cardLanguage.en") },
              { value: "ar", label: t("admin.settings.cardLanguage.ar") },
            ]}
            value={cardLanguage}
            onChange={setCardLanguage}
          />
        </View>
      </Section>
      <Section title={t("admin.settings.display")}>
        <View style={styles.field}>
          <Text variant="body" weight="medium">
            {t("admin.settings.appLanguage")}
          </Text>
          <SegmentedControl<Locale>
            accessibilityLabel={t("admin.settings.appLanguage")}
            options={[
              { value: "en", label: t("lang.en") },
              { value: "ar", label: t("lang.ar") },
            ]}
            value={locale}
            onChange={setLocale}
            testID="app-language"
          />
        </View>
      </Section>
    </Stack>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading" weight="semibold" accessibilityRole="header">
        {title}
      </Text>
      <Panel style={styles.panel}>{children}</Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md, maxWidth: 760 },
  panel: { paddingVertical: space.sm },
  field: { gap: space.sm, paddingVertical: space.md },
});
