/**
 * Settings for every person (owner, 21 Oct): appearance, calls, microphone, help, integrations and
 * About. Choices live on this device (lib/prefs); company-wide policy stays in Admin.
 */
import {
  Badge,
  Button,
  Mascot,
  radius,
  SegmentedControl,
  space,
  Text,
  ToggleRow,
  useTheme,
} from "@sotto/ui";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { PageHeader } from "../components/PageHeader";
import { computerAudioAvailable } from "../features/call/mic";
import { Knowledge } from "../features/settings/Knowledge";
import { APP_VERSION, cloudOrigin } from "../lib/cloud";
import { useI18n } from "../lib/locale";
import { type Prefs, setPrefs, usePrefs } from "../lib/prefs";
import { useCloud } from "../lib/useCloud";

type Mic = { id: string; label: string };

function useMicrophones(): Mic[] {
  const [mics, setMics] = useState<Mic[]>([]);
  useEffect(() => {
    const media = (globalThis as { navigator?: Navigator }).navigator?.mediaDevices;
    media
      ?.enumerateDevices?.()
      .then((all) =>
        setMics(
          all
            .filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default")
            .map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` })),
        ),
      )
      .catch(() => setMics([]));
  }, []);
  return mics;
}

export default function SettingsScreen() {
  const { t, locale, setLocale } = useI18n();
  const { color } = useTheme();
  const router = useRouter();
  const p = usePrefs();
  const mics = useMicrophones();
  const cloud = useCloud();
  const admin = cloud.status === "signed_in" && cloud.me.user.role === "admin";
  const toggle = (key: keyof Prefs) => (v: boolean) => setPrefs({ [key]: v });

  return (
    <ScrollView
      style={{ backgroundColor: color.background }}
      contentContainerStyle={styles.page}
      testID="settings"
    >
      <PageHeader icon="⚙️" title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <Group icon="🎨" title={t("settings.appearance")}>
        <Text variant="label" tone="muted">
          {t("settings.theme")}
        </Text>
        <SegmentedControl
          accessibilityLabel={t("settings.theme")}
          testID="settings-theme"
          value={p.theme}
          onChange={(theme) => setPrefs({ theme })}
          options={[
            { value: "system", label: t("settings.theme.system") },
            { value: "light", label: t("settings.theme.light") },
            { value: "dark", label: t("settings.theme.dark") },
          ]}
        />
        <Text variant="label" tone="muted">
          {t("settings.language")}
        </Text>
        <SegmentedControl
          accessibilityLabel={t("settings.language")}
          value={locale}
          onChange={setLocale}
          options={[
            { value: "en", label: "English" },
            { value: "ar", label: "العربية" },
          ]}
        />
      </Group>

      <Group icon="📞" title={t("settings.calls")}>
        <ToggleRow
          label={t("settings.autoPickup")}
          description={t("settings.autoPickup.body")}
          value={p.autoPickup}
          onValueChange={toggle("autoPickup")}
          testID="settings-autopickup"
        />
        {computerAudioAvailable() ? (
          <ToggleRow
            label={t("settings.mini")}
            description={t("settings.mini.body")}
            value={p.miniWindow}
            onValueChange={toggle("miniWindow")}
            testID="settings-mini"
          />
        ) : null}
        <ToggleRow
          label={t("settings.record")}
          description={t("settings.record.body")}
          value={p.record}
          onValueChange={toggle("record")}
          testID="settings-record"
        />
        <ToggleRow
          label={t("settings.sounds")}
          description={t("settings.sounds.body")}
          value={p.sounds}
          onValueChange={toggle("sounds")}
        />
      </Group>

      <Group icon="🎙️" title={t("settings.microphone")}>
        <Text variant="label" tone="muted">
          {t("settings.microphone.body")}
        </Text>
        {[{ id: "", label: t("settings.microphone.default") }, ...mics].map((m) => {
          const on = (p.micId ?? "") === m.id;
          return (
            <Pressable
              key={m.id || "default"}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => setPrefs({ micId: m.id || null })}
              style={[
                styles.choice,
                {
                  borderColor: on ? color.primary : color.border,
                  backgroundColor: on ? color.surfaceSunken : color.surface,
                },
              ]}
            >
              <View
                style={[styles.radio, { borderColor: on ? color.primary : color.borderStrong }]}
              >
                {on ? <View style={[styles.radioDot, { backgroundColor: color.primary }]} /> : null}
              </View>
              <Text numberOfLines={1} style={styles.flex}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </Group>

      <Group icon="❓" title={t("settings.help")}>
        <Row label={t("settings.tutorial")} body={t("settings.tutorial.body")}>
          <Button
            variant="secondary"
            label={t("settings.tutorial.play")}
            onPress={() => {
              setPrefs({ tutorialDone: false });
              router.push("/home");
            }}
            testID="settings-tutorial"
          />
        </Row>
        <Row label={t("settings.playbookGuide")} body={t("settings.playbookGuide.body")}>
          <Button
            variant="secondary"
            label={t("settings.open")}
            onPress={() => {
              setPrefs({ playbookHelpSeen: false });
              router.push("/playbook");
            }}
          />
        </Row>
      </Group>

      {admin ? (
        <Group icon="🧠" title={t("settings.knowledge")}>
          <Knowledge />
        </Group>
      ) : null}

      <Group icon="🔌" title={t("settings.integrations")} testID="settings-integrations">
        <Row label="Gallabox (WhatsApp)" body={t("settings.integrations.gallabox")}>
          <Badge label={t("settings.soon")} tone="question" />
        </Row>
        <Row label="Zoho CRM" body={t("settings.integrations.zoho")}>
          <Badge label={t("settings.soon")} tone="question" />
        </Row>
      </Group>

      <Group icon="ℹ️" title={t("settings.about")}>
        <View style={styles.about}>
          <Mascot state="idle" size={44} />
          <View style={styles.flex}>
            <Text weight="semibold">Sotto {APP_VERSION}</Text>
            <Text variant="label" tone="muted">
              {t("settings.about.body")}
            </Text>
            <Text variant="label" tone="muted">
              {t("settings.server", { server: cloudOrigin() ?? t("settings.local") })}
            </Text>
          </View>
        </View>
        <Text variant="label" weight="medium" tone="primary">
          {t("brand.poweredBy")}
        </Text>
      </Group>
    </ScrollView>
  );
}

function Group({
  title,
  icon,
  children,
  testID,
}: {
  title: string;
  icon?: string;
  children: ReactNode;
  testID?: string;
}) {
  const { color } = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.group, { backgroundColor: color.surface, borderColor: color.border }]}
    >
      <Text variant="heading" weight="semibold">
        {icon ? `${icon}  ${title}` : title}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, body, children }: { label: string; body: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Text weight="medium">{label}</Text>
        <Text variant="label" tone="muted">
          {body}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.xl, gap: space.lg, maxWidth: 760, width: "100%", alignSelf: "center" },
  group: {
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  flex: { flex: 1, minWidth: 0 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  about: { flexDirection: "row", alignItems: "center", gap: space.md },
});
