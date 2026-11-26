/**
 * Read-only Game Plan card shown in the context rail during a live call (B2).
 */

import { Disclosure, Panel, Stack, Text } from "@sotto/ui";
import type { GamePlan } from "./api";
import { useCoachText } from "./strings";

function keyRows<T>(items: readonly T[], labelOf: (item: T) => string) {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = labelOf(item);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { key: n === 1 ? base : `${base}#${n}`, item };
  });
}

export function GamePlanCard({ plan }: { plan: GamePlan | null }) {
  const tc = useCoachText();
  if (!plan) return null;
  const hasAny =
    plan.goals.length > 0 ||
    plan.objections.length > 0 ||
    plan.questions.length > 0 ||
    plan.avoid.length > 0;
  if (!hasAny) return null;
  return (
    <Disclosure title={tc("plan.title")} testID="live-game-plan">
      <Panel sunken>
        <Stack gap="sm">
          {plan.goals.length > 0 ? (
            <Stack gap="xs">
              <Text variant="label" weight="semibold" tone="muted">
                {tc("plan.goals")}
              </Text>
              {keyRows(plan.goals, (g) => `g:${g}`).map(({ key, item }) => (
                <Text key={key} variant="label">
                  {`• ${item}`}
                </Text>
              ))}
            </Stack>
          ) : null}
          {plan.objections.length > 0 ? (
            <Stack gap="xs">
              <Text variant="label" weight="semibold" tone="muted">
                {tc("plan.objections")}
              </Text>
              {keyRows(plan.objections, (o) => `o:${o.objection}:${o.answer}`).map(
                ({ key, item }) => (
                  <Text key={key} variant="label">
                    {`• ${item.objection}: ${item.answer}`}
                  </Text>
                ),
              )}
            </Stack>
          ) : null}
          {plan.questions.length > 0 ? (
            <Stack gap="xs">
              <Text variant="label" weight="semibold" tone="muted">
                {tc("plan.questions")}
              </Text>
              {keyRows(plan.questions, (q) => `q:${q}`).map(({ key, item }) => (
                <Text key={key} variant="label">
                  {`• ${item}`}
                </Text>
              ))}
            </Stack>
          ) : null}
          {plan.avoid.length > 0 ? (
            <Stack gap="xs">
              <Text variant="label" weight="semibold" tone="muted">
                {tc("plan.avoid")}
              </Text>
              {keyRows(plan.avoid, (a) => `a:${a}`).map(({ key, item }) => (
                <Text key={key} variant="label">
                  {`• ${item}`}
                </Text>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </Panel>
    </Disclosure>
  );
}
