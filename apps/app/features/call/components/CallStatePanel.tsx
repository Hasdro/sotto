/**
 * Read-only running call-state panel ("What I know so far", C5).
 * Collapsed by default; uses `@sotto/ui` tokens/components only.
 *
 * NOTE FOR AGENT 3 / MERGER: Agent 1 does not edit `CrmRail.tsx`. Mount `<CallStatePanel state={callState} />`
 * inside the live rail in `CrmRail.tsx`.
 */
import { Disclosure, Panel, Text } from "@sotto/ui";
import { useI18n } from "../../../lib/locale";

const COPY = {
  en: {
    title: "What I know so far",
    empty: "Call summary will appear after the first few turns.",
  },
  ar: {
    title: "ما نعرفه حتى الآن",
    empty: "سيظهر ملخص المكالمة بعد أول بضع جمل.",
  },
} as const;

export function CallStatePanel({ state }: { state: string | null | undefined }) {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const body = state?.trim() ?? "";

  return (
    <Panel testID="call-state-panel">
      <Disclosure title={copy.title} testID="call-state-toggle">
        <Text variant="body" tone={body ? "default" : "muted"} testID="call-state-body">
          {body || copy.empty}
        </Text>
      </Disclosure>
    </Panel>
  );
}
