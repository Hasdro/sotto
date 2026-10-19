/** Admin: company settings (R2 AI answers and backup provider, R4 agent context) and app language. */
import { Divider, Panel, SegmentedControl, Stack, space, Text, ToggleRow } from "@sotto/ui";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { type CardLanguage, useCompanySettings } from "../../features/admin/settings";
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

export default function SettingsScreen() {
  const { t, locale, setLocale } = useI18n();
  // Saved on the Sotto server when there is one (the next call uses them); local otherwise.
  const { settings, change } = useCompanySettings();
  return (
    <Stack gap="xl" testID="admin-settings">
      <Text variant="body" tone="muted">
        {t("admin.settings.subtitle")}
      </Text>
      <Section title={t("admin.settings.calls")}>
        <ToggleRow
          label={t("admin.settings.aiAnswers")}
          description={t("admin.settings.aiAnswersHint")}
          value={settings.ai_answers_allowed}
          onValueChange={(v) => change({ ai_answers_allowed: v })}
          testID="toggle-ai"
        />
        <Divider />
        <ToggleRow
          label={t("admin.settings.backup")}
          description={t("admin.settings.backupHint")}
          value={settings.backup_allowed}
          onValueChange={(v) => change({ backup_allowed: v })}
          testID="toggle-backup"
        />
        <Divider />
        <ToggleRow
          label={t("admin.settings.agentContext")}
          description={t("admin.settings.agentContextHint")}
          value={settings.agent_context}
          onValueChange={(v) => change({ agent_context: v })}
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
            value={settings.card_language}
            onChange={(v) => change({ card_language: v })}
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
