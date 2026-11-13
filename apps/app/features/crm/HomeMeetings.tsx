/**
 * Home / pre-call: the connected user's upcoming Zoho meetings (owner request, 14 Nov 2026;
 * UX-03h). Shown only when Zoho is connected; the next three, each with "Prepare" (binds the
 * meeting's brief to the next call and opens the call screen on the brief editor) and "Start
 * call with this meeting" (binds it and opens the call). The brief is carried into that call
 * (features/crm/attached.ts).
 */
import { Panel, Stack, Text } from "@sotto/ui";
import { router } from "expo-router";
import { useState } from "react";
import { useFeature } from "../../components/FeatureGate";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";
import { type MeetingCandidate, zohoMeetingBrief } from "./api";
import { attachForNextCall } from "./attached";
import { mockLookup, mockMeetings } from "./mock";
import { type MeetingSource, UpcomingMeetings } from "./UpcomingMeetings";

/** How many meetings Home lists before "Show more" (UX-03: today's, up to 3). */
export const HOME_MEETINGS = 3;

export function HomeMeetings({
  source,
  brief = zohoMeetingBrief,
  onLoaded,
}: {
  source?: MeetingSource;
  brief?: typeof zohoMeetingBrief;
  onLoaded?: (meetings: MeetingCandidate[]) => void;
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
  /** Binds the meeting's brief to the next call, then opens the call screen at `href`. */
  const bindCall = (m: MeetingCandidate, href: "/call" | "/call?prepare=1") => {
    setBusy(true);
    setProblem(false);
    pull(m.id)
      .then((r) => {
        attachForNextCall(r.brief);
        router.push(href);
      })
      .catch(() => setProblem(true))
      .finally(() => setBusy(false));
  };
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
          limit={HOME_MEETINGS}
          {...(onLoaded ? { onLoaded } : {})}
          actions={[
            {
              id: "prepare",
              label: t("meetings.prepare"),
              variant: "secondary",
              busy,
              onPress: (m) => bindCall(m, "/call?prepare=1"),
            },
            {
              id: "start",
              label: t("meetings.startWith"),
              variant: "primary",
              busy,
              onPress: (m) => bindCall(m, "/call"),
            },
          ]}
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
