/**
 * Read-only Game Plan card shown in the context rail during a live call (B2).
 */

import { Disclosure, Panel, Stack, Text } from "@sotto/ui";
import type { GamePlan } from "./api";
import { useCoachText } from "./strings";

export function GamePlanCard({ plan }: { plan: GamePlan | null }) {
  const tc = useCoachText();
  if (!plan) return null;
  return (
    <Disclosure title={tc("plan.title")} testID="live-game-plan">
      <Panel sunken>
        <Stack gap="sm">
          {plan.goals.length > 0 ? (
            <Stack gap="xs">
              <Text variant="label" weight="semibold" tone="muted">
                {tc("plan.goals")}
              </Text>
              {plan.goals.map((g, i) => (
                <Text key={`g-${i}`} variant="label">
                  {`• ${g}`}
                </Text>
              ))}
            </Stack>
          ) : null}
          {plan.objections.length > 0 ? (
            <Stack gap="xs">
              <Text variant="label" weight="semibold" tone="muted">
                {tc("plan.objections")}
              </Text>
              {plan.objections.map((o, i) => (
                <Text key={`o-${i}`} variant="label">
                  {`• ${o.objection}: ${o.answer}`}
                </Text>
              ))}
            </Stack>
          ) : null}
          {plan.questions.length > 0 ? (
            <Stack gap="xs">
              <Text variant="label" weight="semibold" tone="muted">
                {tc("plan.questions")}
              </Text>
              {plan.questions.map((q, i) => (
                <Text key={`q-${i}`} variant="label">
                  {`• ${q}`}
                </Text>
              ))}
            </Stack>
          ) : null}
          {plan.avoid.length > 0 ? (
            <Stack gap="xs">
              <Text variant="label" weight="semibold" tone="muted">
                {tc("plan.avoid")}
              </Text>
              {plan.avoid.map((a, i) => (
                <Text key={`a-${i}`} variant="label">
                  {`• ${a}`}
                </Text>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </Panel>
    </Disclosure>
  );
}
