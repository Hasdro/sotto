/**
 * Admin › Company defaults (ZC-11c, D-049, D-063): one page for what a company decides once —
 * tone and call goal (prefilled), the recording policy (agents see it read-only), AI answers
 * outside the playbook (R2), who gets unanswered questions (derived from roles, changeable) and
 * who processes the calls (consent, DD-4). Every change is audited on the server (R3). The agent
 * track as context is AGN's platform default, not a company choice (D-062). Card and app language
 * sit under Advanced.
 */
import {
  Button,
  Disclosure,
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
import { ConsentPanel } from "../../features/admin/Consent";
import { type RecordCalls, useCompanyDefaults } from "../../features/admin/defaults";
import { type CardLanguage, useCompanySettings } from "../../features/admin/settings";
import { configInWebOnly, openWebAdmin, webAdminUrl } from "../../features/webadmin/webAdmin";
import type { Locale, StringKey } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const RECORD_HINT: Record<RecordCalls, StringKey> = {
  agent_choice: "admin.defaults.record.agent_choice.hint",
  on: "admin.defaults.record.on.hint",
  off: "admin.defaults.record.off.hint",
};
const MANAGER_LINE: Record<"setting" | "managers" | "admins", StringKey> = {
  setting: "admin.defaults.manager.setting",
  managers: "admin.defaults.manager.managers",
  admins: "admin.defaults.manager.admins",
};
const TONE_MAX = 200;
const GOAL_MAX = 200;

export default function SettingsScreen() {
  const { t, locale, setLocale } = useI18n();
  // Saved on the Sotto server when there is one (the next call uses them); local otherwise.
  const { settings, change } = useCompanySettings();
  const defaults = useCompanyDefaults();
  const d = defaults.defaults;
  return (
    <Stack gap="xl" testID="admin-settings">
      <Text variant="body" tone="muted">
        {t("admin.defaults.subtitle")}
      </Text>
      <Section icon="call" title={t("admin.defaults.calls")}>
        <TextLine
          testID="defaults-tone"
          label={t("admin.defaults.tone")}
          hint={t("admin.defaults.toneHint")}
          value={d.tone ?? ""}
          max={TONE_MAX}
          onSave={(tone) => defaults.save({ tone })}
        />
        <Divider />
        <TextLine
          testID="defaults-goal"
          label={t("admin.defaults.goal")}
          hint={t("admin.defaults.goalHint")}
          value={d.call_goal ?? ""}
          max={GOAL_MAX}
          onSave={(call_goal) => defaults.save({ call_goal })}
        />
        <Divider />
        <View style={styles.field}>
          <Text variant="body" weight="medium">
            {t("admin.defaults.record")}
          </Text>
          <SegmentedControl<RecordCalls>
            testID="defaults-record"
            accessibilityLabel={t("admin.defaults.record")}
            options={[
              { value: "agent_choice", label: t("admin.defaults.record.agent_choice") },
              { value: "on", label: t("admin.defaults.record.on") },
              { value: "off", label: t("admin.defaults.record.off") },
            ]}
            value={d.record_calls}
            onChange={(record_calls) => void defaults.save({ record_calls })}
          />
          <Text variant="label" tone="muted">
            {t(RECORD_HINT[d.record_calls])}
          </Text>
        </View>
        <Divider />
        <ToggleRow
          label={t("admin.settings.aiAnswers")}
          description={t("admin.settings.aiAnswersHint")}
          value={settings.ai_answers_allowed}
          onValueChange={(v) => change({ ai_answers_allowed: v })}
          testID="toggle-ai"
        />
      </Section>
      <Section icon="mail" title={t("admin.defaults.manager")}>
        <View style={styles.field}>
          <Text variant="label" tone="muted" testID="defaults-manager">
            {managerLine(t, d.manager)}
          </Text>
        </View>
        <ManagerEmail
          value={settings.manager_email ?? ""}
          onSave={(v) => change({ manager_email: v })}
        />
      </Section>
      <Section icon="shield" title={t("admin.defaults.vendors")}>
        <View style={styles.field}>
          <ConsentPanel state={defaults} hideTitle />
        </View>
      </Section>
      {defaults.error ? (
        <Text
          variant="label"
          tone="danger"
          accessibilityLiveRegion="polite"
          testID="defaults-error"
        >
          {t("admin.defaults.error")}
        </Text>
      ) : null}
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
      <Section icon="screen" title={t("admin.defaults.display")}>
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
      <View style={styles.section}>
        <Disclosure title={t("settings.advanced")} testID="defaults-advanced">
          <Panel style={styles.panel}>
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
          </Panel>
        </Disclosure>
      </View>
    </Stack>
  );
}

type T = ReturnType<typeof useI18n>["t"];
function managerLine(
  t: T,
  m: { emails: string[]; source: "setting" | "managers" | "admins" | "none" } | undefined,
): string {
  if (!m || m.source === "none" || m.emails.length === 0) return t("admin.defaults.manager.none");
  return t(MANAGER_LINE[m.source], { emails: m.emails.join(", ") });
}

function TextLine(props: {
  testID: string;
  label: string;
  hint: string;
  value: string;
  max: number;
  onSave: (v: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(props.value);
  const [saved, setSaved] = useState(false);
  useEffect(() => setText(props.value), [props.value]);
  const clean = text.replace(/\s+/g, " ").trim();
  const valid = clean.length > 0 && clean.length <= props.max;
  return (
    <View style={styles.field}>
      <TextField
        testID={props.testID}
        label={props.label}
        value={text}
        onChangeText={(v) => {
          setText(v);
          setSaved(false);
        }}
        maxLength={props.max}
      />
      <Text variant="label" tone="muted">
        {saved ? t("admin.defaults.saved") : props.hint}
      </Text>
      <Button
        testID={`${props.testID}-save`}
        label={t("settings.knowledge.save")}
        variant="secondary"
        disabled={!valid || clean === props.value.trim()}
        onPress={() => void props.onSave(clean).then(setSaved)}
      />
    </View>
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
