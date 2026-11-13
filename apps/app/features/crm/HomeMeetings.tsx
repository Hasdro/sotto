/**
 * Home / pre-call: the connected user's upcoming Zoho meetings (owner request, 14 Nov 2026).
 * Shown only when Zoho is connected; "Use for my next call" attaches the meeting's brief and
 * opens the call screen (the brief is carried into that call, features/crm/attached.ts).
 */
import { Panel, Stack, Text } from "@sotto/ui";
import { router } from "expo-router";
import { useState } from "react";
import { useFeature } from "../../components/FeatureGate";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";
import { zohoMeetingBrief } from "./api";
import { attachForNextCall } from "./attached";
import { mockLookup, mockMeetings } from "./mock";
import { type MeetingSource, UpcomingMeetings } from "./UpcomingMeetings";

export function HomeMeetings({
  source,
  brief = zohoMeetingBrief,
}: {
  source?: MeetingSource;
  brief?: typeof zohoMeetingBrief;
}) {
  const { t } = useI18n();
  const zoho = useFeature("zoho");
  const cloud = useCloud();
  // Development only: `/?mock=1` shows canned meetings for screenshots (never in a release).
  const mock =
    __DEV__ &&
    typeof globalThis.location?.search === "string" &&
    globalThis.location.search.includes("mock=1");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);
  if (!mock && (cloud.status !== "signed_in" || zoho.state !== "available")) return null;
  const from = source ?? (mock ? mockMeetings : undefined);
  const pull = mock ? mockLookup.meetingBrief : brief;
  return (
    <Panel testID="home-meetings">
      <Stack gap="md">
        <Stack gap="xs">
          <Text variant="heading" weight="semibold" accessibilityRole="header">
            {t("meetings.title")}
          </Text>
          <Text variant="label" tone="muted">
            {t("meetings.subtitle")}
          </Text>
        </Stack>
        <UpcomingMeetings
          source={from}
          action={{
            label: t("meetings.useNext"),
            busy,
            onPress: (m) => {
              setBusy(true);
              setProblem(false);
              pull(m.id)
                .then((r) => {
                  attachForNextCall(r.brief);
                  router.push("/call");
                })
                .catch(() => setProblem(true))
                .finally(() => setBusy(false));
            },
          }}
        />
        {problem ? (
          <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
            {t("crm.error")}
          </Text>
        ) : null}
      </Stack>
    </Panel>
  );
}
