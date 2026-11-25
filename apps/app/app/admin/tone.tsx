/**
 * Admin › AI › Card tone (C3, D-094): company default tone preset, allowed presets for agents,
 * free-text "How we talk" (<= 200 chars), and company banned openers (English & Arabic).
 * Platform banned phrases are shown read-only underneath.
 */
import {
  Button,
  EmptyState,
  Panel,
  SegmentedControl,
  Stack,
  Text,
  TextField,
  ToggleRow,
} from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { FeatureGate } from "../../components/FeatureGate";
import { SafeBoundary } from "../../components/SafeBoundary";
import {
  getToneSettings,
  HOW_WE_TALK_MAX,
  saveCompanyTone,
  TONE_PRESETS,
  type TonePreset,
} from "../../lib/cards";
import { refreshCloud } from "../../lib/cloud";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";

const COPY = {
  en: {
    title: "Card tone & banned phrases",
    subtitle: "Set how live cards sound for your team. Agents can pick from the presets you allow.",
    defaultTone: "Company default tone",
    allowed: "Presets agents may pick",
    howWeTalk: "How we talk (optional, max 200 chars)",
    howWeTalkPlaceholder: "e.g. Short, warm, numbers-first, never pushy.",
    bannedEn: "Company banned openers (English, one per line)",
    bannedAr: "Company banned openers (Arabic, one per line)",
    platformBanned: "Platform banned openers (always active)",
    save: "Save tone settings",
    saved: "Saved. Next call will use these settings.",
    failed: "Could not save tone settings.",
    loadFailed: "Could not load tone settings.",
    signedOut: "Sign in to manage card tone.",
    presets: { casual: "Casual", direct: "Direct", warm: "Warm", formal: "Formal" },
  },
  ar: {
    title: "نبرة البطاقات والعبارات الممنوعة",
    subtitle: "حدّد أسلوب البطاقات لفريقك. يمكن للمندوبين الاختيار من الأنماط المسموح بها.",
    defaultTone: "النبرة الافتراضية للشركة",
    allowed: "الأنماط المسموح بها للمندوبين",
    howWeTalk: "كيف نتحدث (اختياري، حتى 200 حرف)",
    howWeTalkPlaceholder: "مثال: أسلوب مختصر وودود وواضح بالأرقام.",
    bannedEn: "عبارات افتتاحية ممنوعة للشركة (إنجليزي، سطر لكل عبارة)",
    bannedAr: "عبارات افتتاحية ممنوعة للشركة (عربي، سطر لكل عبارة)",
    platformBanned: "عبارات المنصة الممنوعة (مفعّلة دائماً)",
    save: "حفظ إعدادات النبرة",
    saved: "تم الحفظ. ستُطبّق على المكالمة القادمة.",
    failed: "تعذّر حفظ إعدادات النبرة.",
    loadFailed: "تعذّر تحميل إعدادات النبرة.",
    signedOut: "سجّل الدخول لإدارة نبرة البطاقات.",
    presets: { casual: "ودي", direct: "مباشر", warm: "دافئ", formal: "رسمي" },
  },
} as const;

export default function AdminToneRoute() {
  return (
    <SafeBoundary name="admin.tone">
      <FeatureGate feature="card_style_v2">
        <AdminToneScreen />
      </FeatureGate>
    </SafeBoundary>
  );
}

function parseLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function AdminToneScreen() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const cloud = useCloud();
  const [defaultTone, setDefaultTone] = useState<TonePreset>("casual");
  const [allowed, setAllowed] = useState<TonePreset[]>([...TONE_PRESETS]);
  const [howWeTalk, setHowWeTalk] = useState("");
  const [bannedEn, setBannedEn] = useState("");
  const [bannedAr, setBannedAr] = useState("");
  const [platformEn, setPlatformEn] = useState<string[]>([]);
  const [platformAr, setPlatformAr] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(() => {
    if (cloud.status !== "signed_in") return;
    getToneSettings()
      .then((res) => {
        setDefaultTone(res.company_default);
        setAllowed(res.allowed_presets);
        setHowWeTalk(res.how_we_talk);
        setBannedEn(res.company_banned_en.join("\n"));
        setBannedAr(res.company_banned_ar.join("\n"));
        setPlatformEn(res.platform_banned_en);
        setPlatformAr(res.platform_banned_ar);
      })
      .catch(() => setStatus(copy.loadFailed));
  }, [cloud.status, copy.loadFailed]);

  useEffect(load, [load]);

  if (cloud.status !== "signed_in") {
    return <EmptyState testID="admin-tone-none" title={copy.title} body={copy.signedOut} />;
  }

  const toggleAllowed = (preset: TonePreset, on: boolean) => {
    setAllowed((prev) => {
      if (on) return prev.includes(preset) ? prev : [...prev, preset];
      if (preset === defaultTone) return prev; // default tone must remain allowed
      const next = prev.filter((p) => p !== preset);
      return next.length > 0 ? next : [defaultTone];
    });
  };

  const onSave = () => {
    setBusy(true);
    setStatus(null);
    saveCompanyTone({
      default_tone: defaultTone,
      allowed_presets: allowed.includes(defaultTone) ? allowed : [defaultTone, ...allowed],
      how_we_talk: howWeTalk.slice(0, HOW_WE_TALK_MAX),
      banned_en: parseLines(bannedEn),
      banned_ar: parseLines(bannedAr),
    })
      .then(() => {
        setStatus(copy.saved);
        return refreshCloud();
      })
      .catch(() => setStatus(copy.failed))
      .finally(() => setBusy(false));
  };

  return (
    <Stack gap="lg" testID="admin-tone">
      <Text variant="heading" weight="semibold" accessibilityRole="header">
        {copy.title}
      </Text>
      <Text variant="body" tone="muted">
        {copy.subtitle}
      </Text>

      <Panel>
        <Stack gap="md">
          <Text variant="label" tone="muted">
            {copy.defaultTone}
          </Text>
          <SegmentedControl
            accessibilityLabel={copy.defaultTone}
            testID="admin-tone-default"
            value={defaultTone}
            onChange={(v) => {
              setDefaultTone(v);
              if (!allowed.includes(v)) setAllowed((prev) => [...prev, v]);
            }}
            options={TONE_PRESETS.map((p) => ({ value: p, label: copy.presets[p] }))}
          />
          <Text variant="label" tone="muted">
            {copy.allowed}
          </Text>
          {TONE_PRESETS.map((preset) => (
            <ToggleRow
              key={preset}
              label={copy.presets[preset]}
              value={allowed.includes(preset)}
              onValueChange={(v) => toggleAllowed(preset, v)}
              testID={`admin-tone-allow-${preset}`}
            />
          ))}
          <TextField
            label={copy.howWeTalk}
            placeholder={copy.howWeTalkPlaceholder}
            value={howWeTalk}
            onChangeText={(t) => setHowWeTalk(t.slice(0, HOW_WE_TALK_MAX))}
            testID="admin-tone-how-we-talk"
          />
        </Stack>
      </Panel>

      <Panel>
        <Stack gap="md">
          <TextField
            label={copy.bannedEn}
            value={bannedEn}
            onChangeText={setBannedEn}
            multiline
            height={96}
            testID="admin-tone-banned-en"
          />
          <TextField
            label={copy.bannedAr}
            value={bannedAr}
            onChangeText={setBannedAr}
            multiline
            height={96}
            testID="admin-tone-banned-ar"
          />
          <Text variant="label" tone="muted">
            {copy.platformBanned}
          </Text>
          <Text variant="body" tone="muted" testID="admin-tone-platform-banned">
            {(locale === "ar" ? platformAr : platformEn).join(" · ")}
          </Text>
        </Stack>
      </Panel>

      {status ? (
        <Text variant="label" tone="muted" accessibilityLiveRegion="polite">
          {status}
        </Text>
      ) : null}

      <Button label={copy.save} onPress={onSave} disabled={busy} testID="admin-tone-save" />
    </Stack>
  );
}
