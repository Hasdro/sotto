/**
 * Agent's personal card tone picker (C3, D-094).
 * Mounted inside `<FeatureGate feature="card_style_v2">` in `apps/app/app/settings.tsx`.
 * Shows only the presets the company admin allows (plus "Default").
 */
import { Panel, SegmentedControl, Stack, Text } from "@sotto/ui";
import { useEffect, useState } from "react";
import { useFeature } from "../../../components/FeatureGate";
import { getToneSettings, saveAgentTone, TONE_PRESETS, type TonePreset } from "../../../lib/cards";
import { refreshCloud } from "../../../lib/cloud";
import { useI18n } from "../../../lib/locale";
import { useCloud } from "../../../lib/useCloud";

const COPY = {
  en: {
    title: "Live card tone",
    subtitle: "Pick how your suggestion cards sound during a call.",
    companyDefault: "Default",
    error: "Could not update card tone. Try again.",
    presets: { casual: "Casual", direct: "Direct", warm: "Warm", formal: "Formal" },
  },
  ar: {
    title: "نبرة البطاقات المباشرة",
    subtitle: "اختر أسلوب بطاقات الاقتراح أثناء المكالمة.",
    companyDefault: "الافتراضي",
    error: "تعذّر تحديث نبرة البطاقات. حاول مرة أخرى.",
    presets: { casual: "ودي", direct: "مباشر", warm: "دافئ", formal: "رسمي" },
  },
} as const;

export function AgentTonePicker() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const cloud = useCloud();
  const gate = useFeature("card_style_v2");
  const [allowed, setAllowed] = useState<readonly TonePreset[]>(TONE_PRESETS);
  const [selected, setSelected] = useState<TonePreset | "default">("default");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cloud.status !== "signed_in" || gate.state !== "available") return;
    getToneSettings()
      .then((res) => {
        setAllowed(res.allowed_presets);
        setSelected(res.source === "agent" ? res.tone : "default");
      })
      .catch(() => setError(copy.error));
  }, [cloud.status, gate.state, copy.error]);

  if (cloud.status !== "signed_in" || gate.state !== "available") return null;

  const options: { value: TonePreset | "default"; label: string }[] = [
    { value: "default", label: copy.companyDefault },
    ...allowed.map((p) => ({ value: p, label: copy.presets[p] })),
  ];

  const onPick = (val: TonePreset | "default") => {
    const previous = selected;
    setError(null);
    setSelected(val);
    void saveAgentTone(val === "default" ? null : val)
      .then(() => refreshCloud())
      .catch(() => {
        setSelected(previous);
        setError(copy.error);
      });
  };

  return (
    <Panel testID="agent-tone-picker">
      <Stack gap="sm">
        <Text variant="heading" weight="semibold">
          {copy.title}
        </Text>
        <Text variant="label" tone="muted">
          {copy.subtitle}
        </Text>
        <SegmentedControl
          accessibilityLabel={copy.title}
          testID="agent-tone-control"
          value={selected}
          onChange={onPick}
          options={options}
        />
        {error ? (
          <Text variant="label" tone="notice" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </Stack>
    </Panel>
  );
}
