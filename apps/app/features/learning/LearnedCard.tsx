/**
 * ZC-B10 (D-034): learned instructions apply by themselves; admin home shows one small card,
 * "AGN learned 3 things from your last 5 calls", that links to the editor (edit, switch off,
 * revert). Nothing shows until something was learned.
 */
import { Badge, Panel, space, Text } from "@sotto/ui";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppLink } from "../../components/AppLink";
import { useFeature } from "../../components/FeatureGate";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";
import { type Learning, learningApi } from "./api";

export function learnedSummary(l: Learning): { things: number; calls: number; pending: number } {
  const on = l.items.filter((i) => i.enabled);
  const calls = new Set(on.map((i) => i.source_call).filter(Boolean));
  return { things: on.length, calls: calls.size, pending: l.pending.length };
}

export function LearnedCard() {
  const { t } = useI18n();
  const cloud = useCloud();
  const available =
    useFeature("learned_instructions").state === "available" && cloud.status === "signed_in";
  const [data, setData] = useState<Learning | null>(null);
  useEffect(() => {
    if (!available) return;
    learningApi.get().then(
      (l) => setData(Array.isArray(l?.items) ? l : null),
      () => {},
    );
  }, [available]);
  if (!data) return null;
  const s = learnedSummary(data);
  if (s.things === 0 && s.pending === 0) return null;
  return (
    <AppLink href="/admin/instructions" testID="learned-card">
      <Panel>
        <View style={styles.row}>
          <Text weight="semibold">
            {s.calls > 0
              ? t("learning.card", { count: s.things, calls: s.calls })
              : t("learning.cardNoCalls", { count: s.things })}
          </Text>
          {s.pending > 0 ? <Badge label={t("learning.pending")} tone="notice" /> : null}
        </View>
        <Text variant="label" tone="primary">
          {t("learning.cardLink")}
        </Text>
      </Panel>
    </AppLink>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm },
});
