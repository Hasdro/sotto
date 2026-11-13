/** Admin: company settings (R2 AI answers and backup provider, R4 agent context) and app language. */
import {
  Button,
  Divider,
  Icon,
  type IconName,
  Panel,
  SegmentedControl,
  Stack,
  space,
  Text,
  TextField,
  ToggleRow,
  useTheme,
} from "@sotto/ui";
import { type ReactNode, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { type CardLanguage, useCompanySettings } from "../../features/admin/settings";
import { configInWebOnly, openWebAdmin, webAdminUrl } from "../../features/webadmin/webAdmin";
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
      <Section icon="call" title={t("admin.settings.calls")}>
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
      {configInWebOnly() && webAdminUrl() ? (
        <Section icon="cards" title={t("admin.settings.models")}>
          <View style={styles.field}>
            <Button
              testID="settings-open-web-admin"
              label={t("admin.settings.models.open")}
              variant="secondary"
              accessibilityHint={webAdminUrl() ?? undefined}
              onPress={openWebAdmin}
            />
          </View>
        </Section>
      ) : null}
      <Section icon="mail" title={t("admin.settings.email")}>
        <ManagerEmail
          value={settings.manager_email ?? ""}
          onSave={(v) => change({ manager_email: v })}
        />
      </Section>
      <Section icon="screen" title={t("admin.settings.display")}>
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

function ManagerEmail({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = text.trim() === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text.trim());
  return (
    <View style={styles.field}>
      <TextField
        label={t("admin.settings.managerEmail")}
        placeholder="sales.manager@yourcompany.com"
        value={text}
        onChangeText={setText}
        keyboardType="email-address"
        autoCapitalize="none"
        testID="manager-email"
      />
      <Text variant="label" tone={valid ? "muted" : "danger"}>
        {valid ? t("admin.settings.managerEmailHint") : t("admin.settings.managerEmailBad")}
      </Text>
      <Button
        label={t("settings.knowledge.save")}
        disabled={!valid || text.trim() === value.trim()}
        onPress={() => onSave(text.trim())}
        testID="manager-email-save"
      />
    </View>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: IconName;
  children: ReactNode;
}) {
  const { color } = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        {icon ? <Icon name={icon} size={20} color={color.textMuted} /> : null}
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {title}
        </Text>
      </View>
      <Panel style={styles.panel}>{children}</Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md, maxWidth: 760 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  panel: { paddingVertical: space.sm },
  field: { gap: space.sm, paddingVertical: space.md },
});
