/**
 * Agent's personal card tone picker (C3, D-094).
 * Mounted with one line in `apps/app/app/settings.tsx`.
 * Shows only the presets the company admin allows (plus "Company default").
 */
import { Panel, SegmentedControl, Stack, Text } from "@sotto/ui";
import { useEffect, useState } from "react";
import {
  getToneSettings,
  saveAgentTone,
  TONE_PRESETS,
  type TonePreset,
} from "../../../lib/cards";
import { useI18n } from "../../../lib/locale";
import { useCloud } from "../../../lib/useCloud";

const COPY = {
  en: {
    title: "Live card tone",
    subtitle: "Pick how your suggestion cards sound during a call.",
    companyDefault: "Default",
    presets: { casual: "Casual", direct: "Direct", warm: "Warm", formal: "Formal" },
  },
  ar: {
    title: "نبرة البطاقات المباشرة",
    subtitle: "اختر أسلوب بطاقات الاقتراح أثناء المكالمة.",
    companyDefault: "الافتراضي",
    presets: { casual: "ودي", direct: "مباشر", warm: "دافئ", formal: "رسمي" },
  },
} as const;

export function AgentTonePicker() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const cloud = useCloud();
  const [allowed, setAllowed] = useState<readonly TonePreset[]>(TONE_PRESETS);
  const [selected, setSelected] = useState<TonePreset | "default">("default");

  useEffect(() => {
    if (cloud.status !== "signed_in") return;
    getToneSettings()
      .then((res) => {
        setAllowed(res.allowed_presets);
        setSelected(res.source === "agent" ? res.tone : "default");
      })
      .catch(() => undefined);
  }, [cloud.status]);

  if (cloud.status !== "signed_in") return null;

  const options: { value: TonePreset | "default"; label: string }[] = [
    { value: "default", label: copy.companyDefault },
    ...allowed.map((p) => ({ value: p, label: copy.presets[p] })),
  ];

  const onPick = (val: TonePreset | "default") => {
    setSelected(val);
    void saveAgentTone(val === "default" ? null : val).catch(() => undefined);
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
      </Stack>
    </Panel>
  );
}
