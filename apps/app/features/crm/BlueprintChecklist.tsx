/**
 * INT-04 (D-056): "to move to X you still need …" for the linked Deal, read from Zoho's
 * Blueprint. Read only: it never executes a transition (R12, D-031); it can add the missing
 * items to the agent's prep notes, which become the Deal note after the call (each write still
 * needs the agent's approval).
 */
import { Badge, Button, LRI, PDI, Stack, Text } from "@sotto/ui";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { type Blueprint, zohoBlueprint } from "./api";
import { setPrep, useAttachedState } from "./attached";
import { useCrmText } from "./strings";

type Load = { kind: "loading" } | { kind: "ok"; bp: Blueprint } | { kind: "failed" };

export function BlueprintChecklist({
  dealId,
  read = zohoBlueprint,
}: {
  dealId: string;
  read?: (id: string) => Promise<Blueprint>;
}) {
  const ct = useCrmText();
  const { prep } = useAttachedState();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [added, setAdded] = useState(false);
  useEffect(() => {
    let live = true;
    setLoad({ kind: "loading" });
    read(dealId).then(
      (bp) => live && setLoad({ kind: "ok", bp }),
      () => live && setLoad({ kind: "failed" }),
    );
    return () => {
      live = false;
    };
  }, [dealId, read]);
  if (load.kind === "loading") return null;
  if (load.kind === "failed") {
    return (
      <Text variant="label" tone="muted" testID="bp-failed">
        {ct("bp.failed")}
      </Text>
    );
  }
  const bp = load.bp;
  if (bp.transitions.length === 0) {
    return (
      <Text variant="label" tone="muted" testID="bp-none">
        {ct("bp.none")}
      </Text>
    );
  }
  const addNote = () => {
    const now = prep.next_step.trim();
    setPrep("next_step", now ? `${now}\n${bp.note}` : bp.note);
    setAdded(true);
  };
  return (
    <View testID="bp-checklist">
      <Stack gap="xs">
        <Text variant="label" weight="semibold" accessibilityRole="header">
          {ct("bp.title")}
        </Text>
        {bp.current ? (
          <Text variant="label" tone="muted">
            {ct("bp.current", { state: `${LRI}${bp.current}${PDI}` })}
          </Text>
        ) : null}
        {bp.transitions.map((tr) => {
          const to = `${LRI}${tr.to || tr.name}${PDI}`;
          return (
            <View key={`${tr.name}-${tr.to}`} testID="bp-transition">
              {tr.ready ? (
                <Text variant="label">{ct("bp.ready", { to })}</Text>
              ) : (
                <Stack gap="xs">
                  <Text variant="label">{ct("bp.need", { to })}</Text>
                  <Stack direction="row" gap="xs" wrap>
                    {tr.missing.map((m) => (
                      <Badge key={m.api_name} label={m.label || m.api_name} tone="notice" />
                    ))}
                  </Stack>
                </Stack>
              )}
            </View>
          );
        })}
        <Text variant="label" tone="muted">
          {ct("bp.readOnly")}
        </Text>
        {bp.note ? (
          added ? (
            <Text variant="label" tone="muted" testID="bp-added" accessibilityLiveRegion="polite">
              {ct("bp.suggested")}
            </Text>
          ) : (
            <Button
              variant="secondary"
              label={ct("bp.suggest")}
              onPress={addNote}
              testID="bp-suggest"
            />
          )
        ) : null}
      </Stack>
    </View>
  );
}
