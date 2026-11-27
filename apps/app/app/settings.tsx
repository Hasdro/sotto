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
import { SafeBoundary } from "../components/SafeBoundary";
import { useCompanyDefaults } from "../features/admin/defaults";
import { AgentTonePicker } from "../features/call/components/AgentTonePicker";
import { computerAudioAvailable } from "../features/call/mic";
import { useZoho } from "../features/crm/useZoho";
import { ZohoConnect } from "../features/crm/ZohoConnect";
import { Health } from "../features/settings/Health";
import { Knowledge } from "../features/settings/Knowledge";
import { LocalModelsSettings } from "../features/settings/LocalModelsSettings";
import { BugReportSheet } from "../features/support/BugReport";
import { APP_VERSION, cloudOrigin, refreshCloud } from "../lib/cloud";
import { useI18n } from "../lib/locale";
import {
  fetchLocalModels,
  type LocalEndpointRow,
  saveLocalEndpoint,
  testLocalEndpoint,
} from "../lib/localModels";
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
  const [bugOpen, setBugOpen] = useState(false);
  // ⌘K "Report a bug" (CommandPalette) opens the form here.
  useEffect(() => {
    if (p.bugReportRequested) {
      setBugOpen(true);
      setPrefs({ bugReportRequested: false });
    }
  }, [p.bugReportRequested]);
  const toggle = (key: keyof Prefs) => (v: boolean) => setPrefs({ [key]: v });
  const recordPolicy = useCompanyDefaults().defaults.record_calls;

  return (
    <ScrollView
      style={{ backgroundColor: color.background }}
      contentContainerStyle={styles.page}
      testID="settings"
    >
      <PageHeader icon="settings" title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <Group icon="palette" title={t("settings.appearance")} nativeID="appearance">
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

      <Group icon="mic" title={t("settings.audio")} testID="settings-audio" nativeID="audio">
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

      {signedIn ? (
        <SafeBoundary name="settings.agentTone">
          <FeatureGate feature="card_style_v2">
            <AgentTonePicker />
          </FeatureGate>
        </SafeBoundary>
      ) : null}
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
            {/* D-049: when the company set a recording policy, it is a read-only line here. */}
            {recordPolicy === "agent_choice" ? (
              <ToggleRow
                label={t("settings.record")}
                description={t("settings.record.body")}
                value={p.record}
                onValueChange={toggle("record")}
                testID="settings-record"
              />
            ) : (
              <Row
                label={t("settings.record")}
                body={t(
                  recordPolicy === "on" ? "settings.record.policyOn" : "settings.record.policyOff",
                )}
              >
                <Text variant="label" weight="medium" testID="settings-record-policy">
                  {t(recordPolicy === "on" ? "settings.record.on" : "settings.record.off")}
                </Text>
              </Row>
            )}
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
              <Row label={t("settings.adminTour")} body={t("settings.adminTour.body")}>
                <Button
                  variant="secondary"
                  label={t("settings.adminTour.play")}
                  onPress={() => {
                    setPrefs({ adminTourDone: false, adminTourRequested: true });
                    router.push("/admin");
                  }}
                  testID="settings-admin-tour"
                />
              </Row>
            ) : null}
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

      <LocalModelsGroup />

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
        <Row label={t("settings.bugReport")} body={t("settings.bugReport.body")}>
          <Button
            variant="secondary"
            label={t("settings.bugReport")}
            onPress={() => setBugOpen(true)}
            testID="settings-bug-report"
          />
        </Row>
        <BugReportSheet open={bugOpen} onClose={() => setBugOpen(false)} />
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

/** L6 / D-095 / D-096: Local or offline model server settings when enabled for this person. */
function LocalModelsGroup() {
  const textFeat = useFeature("local_models_text").state;
  const voiceFeat = useFeature("local_models_voice").state;
  if (textFeat !== "available" && voiceFeat !== "available") return null;
  return (
    <LocalModelsPanel showText={textFeat === "available"} showVoice={voiceFeat === "available"} />
  );
}

function LocalModelsPanel({ showText, showVoice }: { showText: boolean; showVoice: boolean }) {
  const [endpoints, setEndpoints] = useState<LocalEndpointRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchLocalModels()
      .then((res) => {
        if (!cancelled) setEndpoints(Array.isArray(res?.endpoints) ? res.endpoints : []);
      })
      .catch(() => {
        if (!cancelled) setEndpoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (endpoints === null) return null;
  const textEp = endpoints.find((e) => e.kind === "text");
  const sttEp = endpoints.find((e) => e.kind === "stt");
  const ttsEp = endpoints.find((e) => e.kind === "tts");

  return (
    <Group icon="spark" title="Local & offline models" testID="settings-local-models">
      {showText ? (
        <LocalModelsSettings
          initialUrl={textEp?.base_url || "http://127.0.0.1:11434/v1"}
          initialOptIn={textEp?.live_opt_in ?? false}
          onTest={async (url) => {
            const res = await testLocalEndpoint("text", url, textEp?.live_opt_in ?? false);
            await refreshCloud();
            return res;
          }}
          onSave={async (cfg) => {
            await saveLocalEndpoint("text", cfg.url, cfg.liveOptIn);
            await refreshCloud();
          }}
        />
      ) : null}
      {showVoice ? (
        <LocalModelsSettings
          initialUrl={sttEp?.base_url || "http://127.0.0.1:8000"}
          initialOptIn={sttEp?.live_opt_in ?? false}
          onTest={async (url) => {
            const res = await testLocalEndpoint("stt", url, sttEp?.live_opt_in ?? false);
            await refreshCloud();
            return res;
          }}
          onSave={async (cfg) => {
            await saveLocalEndpoint("stt", cfg.url, cfg.liveOptIn);
            await refreshCloud();
          }}
        />
      ) : null}
      {showVoice ? (
        <LocalModelsSettings
          initialUrl={ttsEp?.base_url || "http://127.0.0.1:8001"}
          initialOptIn={ttsEp?.live_opt_in ?? false}
          onTest={async (url) => {
            const res = await testLocalEndpoint("tts", url, ttsEp?.live_opt_in ?? false);
            await refreshCloud();
            return res;
          }}
          onSave={async (cfg) => {
            await saveLocalEndpoint("tts", cfg.url, cfg.liveOptIn);
            await refreshCloud();
          }}
        />
      ) : null}
    </Group>
  );
}

/** `/settings#zoho` (health fix, first-run step, ⌘K search): bring that group into view on the
 * web. `#appearance` and `#audio` work the same way. */
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
