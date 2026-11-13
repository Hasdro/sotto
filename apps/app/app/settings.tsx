/**
 * Settings for every person (owner, 21 Oct; ZC app map, ZC A1/A3/A5): language and theme, Audio
 * (re-run the check, microphone), the person's own Zoho connection, Advanced (mini window,
 * sounds, auto pick-up, recording, tutorial) and About. Admins also get company knowledge and the
 * health check. Choices live on this device (lib/prefs); company-wide policy stays in Admin.
 */
import {
  BrandSymbol,
  Button,
  Disclosure,
  Icon,
  type IconName,
  radius,
  SegmentedControl,
  space,
  Text,
  ToggleRow,
  useTheme,
} from "@sotto/ui";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { FeatureGate, useFeature } from "../components/FeatureGate";
import { PageHeader } from "../components/PageHeader";
import { computerAudioAvailable } from "../features/call/mic";
import { useZoho } from "../features/crm/useZoho";
import { ZohoConnect } from "../features/crm/ZohoConnect";
import { Health } from "../features/settings/Health";
import { Knowledge } from "../features/settings/Knowledge";
import { APP_VERSION, cloudOrigin } from "../lib/cloud";
import { useI18n } from "../lib/locale";
import { shortcutKeys } from "../lib/platform";
import { type Prefs, setPrefs, usePrefs } from "../lib/prefs";
import { useRole } from "../lib/role";
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
  const { role } = useRole();
  const signedIn = cloud.status === "signed_in";
  const admin = signedIn && cloud.me.user.role === "admin";
  const staff = role !== "agent"; // draft D-050 (backlog): agents have no playbook editor
  useScrollToHash();
  const toggle = (key: keyof Prefs) => (v: boolean) => setPrefs({ [key]: v });

  return (
    <ScrollView
      style={{ backgroundColor: color.background }}
      contentContainerStyle={styles.page}
      testID="settings"
    >
      <PageHeader icon="settings" title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <Group icon="palette" title={t("settings.appearance")}>
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

      <Group icon="mic" title={t("settings.audio")} testID="settings-audio">
        <Row label={t("settings.audio")} body={t("settings.audio.body")}>
          <Button
            variant="secondary"
            label={t("settings.audio.check")}
            onPress={() => router.push("/call?check=audio")}
            testID="settings-audio-check"
          />
        </Row>
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
              aria-checked={on}
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

      {signedIn ? <ZohoGroup /> : null}

      <View
        testID="settings-advanced"
        style={[styles.group, { backgroundColor: color.surface, borderColor: color.border }]}
      >
        <Disclosure title={t("settings.advanced")} testID="settings-advanced-toggle">
          <View style={styles.stack}>
            {computerAudioAvailable() ? (
              <ToggleRow
                label={t("settings.mini")}
                description={t("settings.mini.body", shortcutKeys())}
                value={p.miniWindow}
                onValueChange={toggle("miniWindow")}
                testID="settings-mini"
              />
            ) : null}
            <ToggleRow
              label={t("settings.sounds")}
              description={t("settings.sounds.body")}
              value={p.sounds}
              onValueChange={toggle("sounds")}
            />
            <ToggleRow
              label={t("settings.autoPickup")}
              description={t("settings.autoPickup.body")}
              value={p.autoPickup}
              onValueChange={toggle("autoPickup")}
              testID="settings-autopickup"
            />
            <ToggleRow
              label={t("settings.record")}
              description={t("settings.record.body")}
              value={p.record}
              onValueChange={toggle("record")}
              testID="settings-record"
            />
            <Row label={t("settings.tutorial")} body={t("settings.tutorial.body")}>
              <Button
                variant="secondary"
                label={t("settings.tutorial.play")}
                onPress={() => {
                  setPrefs({ tutorialDone: false, tutorialRequested: true });
                  router.push("/home");
                }}
                testID="settings-tutorial"
              />
            </Row>
            {staff ? (
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
            ) : null}
          </View>
        </Disclosure>
      </View>

      {admin ? (
        <Group icon="spark" title={t("settings.knowledge")}>
          <FeatureGate feature="ai_knowledge">
            <Knowledge />
          </FeatureGate>
        </Group>
      ) : null}

      {admin ? (
        <Group icon="shield" title={t("settings.health")} testID="settings-health">
          <Health />
        </Group>
      ) : null}

      <Group icon="info" title={t("settings.about")}>
        <View style={styles.about}>
          <BrandSymbol size={44} />
          <View style={styles.flex}>
            <Text weight="semibold">
              {t("app.name")} {APP_VERSION}
            </Text>
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

/** The person's own Zoho connection (R10); the health banner and the first-run step link here. */
function ZohoGroup() {
  const { t } = useI18n();
  const feature = useFeature("zoho");
  if (feature.state !== "available" && feature.state !== "needs_connection") return null;
  return <ZohoPanel title={t("settings.zoho")} />;
}

function ZohoPanel({ title }: { title: string }) {
  const zoho = useZoho();
  return (
    <Group icon="globe" title={title} testID="settings-zoho" nativeID="zoho">
      <ZohoConnect zoho={zoho} />
    </Group>
  );
}

/** `/settings#zoho` (health fix, first-run step): bring that group into view on the web. */
function useScrollToHash() {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const id = globalThis.location?.hash?.slice(1);
    if (!id) return;
    const timer = setTimeout(() => {
      (globalThis as { document?: Document }).document
        ?.getElementById(id)
        ?.scrollIntoView?.({ block: "start" });
    }, 300);
    return () => clearTimeout(timer);
  }, []);
}

function Group({
  title,
  icon,
  children,
  testID,
  nativeID,
}: {
  title: string;
  icon?: IconName;
  children: ReactNode;
  testID?: string;
  nativeID?: string;
}) {
  const { color } = useTheme();
  return (
    <View
      testID={testID}
      nativeID={nativeID}
      style={[styles.group, { backgroundColor: color.surface, borderColor: color.border }]}
    >
      <View style={styles.groupTitle}>
        {icon ? <Icon name={icon} size={20} color={color.textMuted} /> : null}
        <Text variant="heading" weight="semibold">
          {title}
        </Text>
      </View>
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
  groupTitle: { flexDirection: "row", alignItems: "center", gap: space.sm },
  // Outlined card (D-041): hairline, 22 px radius.
  group: {
    padding: space.xl,
    gap: space.md,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  flex: { flex: 1, minWidth: 0 },
  stack: { gap: space.md },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
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
