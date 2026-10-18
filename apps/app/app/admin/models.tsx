/**
 * Admin: model per pipeline step with its last benchmark (R6, R1). A live-path step shows its
 * p95 next to its budget; a model whose p95 misses the budget may not be used. Mock data.
 */
import { Badge, type BadgeTone, Stack, Table, Text } from "@sotto/ui";
import { View } from "react-native";
import { type BenchmarkVerdict, STAGE_MODELS, verdict } from "../../features/admin/mock";
import { useI18n } from "../../lib/locale";
import { useIsWide } from "../../lib/responsive";

const VERDICT: Record<
  BenchmarkVerdict,
  { tone: BadgeTone; key: "admin.models.meets" | "admin.models.misses" | "admin.models.notTimed" }
> = {
  meets: { tone: "answer", key: "admin.models.meets" },
  misses: { tone: "warning", key: "admin.models.misses" },
  offline: { tone: "neutral", key: "admin.models.notTimed" },
};

export default function ModelsScreen() {
  const { t } = useI18n();
  const wide = useIsWide();
  return (
    <Stack gap="lg" testID="admin-models">
      <Text variant="body" tone="muted">
        {t("admin.models.subtitle")}
      </Text>
      <Table
        accessibilityLabel={t("admin.models")}
        stacked={!wide}
        columns={[
          { key: "stage", title: t("admin.models.stage"), flex: 1.4 },
          { key: "provider", title: t("admin.models.provider"), flex: 1.6 },
          { key: "model", title: t("admin.models.model"), flex: 1.2 },
          { key: "bench", title: t("admin.models.benchmark"), flex: 1.8 },
        ]}
        rows={STAGE_MODELS.map((m) => {
          const v = VERDICT[verdict(m)];
          return {
            id: m.stage,
            cells: {
              stage: (
                <Text variant="body" weight="medium">
                  {t(`stage.${m.stage}`)}
                </Text>
              ),
              provider: m.provider,
              model: m.model,
              bench: (
                <View style={{ gap: 4, alignItems: "flex-start" }}>
                  {m.p95Ms !== null && m.budgetMs !== null ? (
                    <Text
                      variant="body"
                      weight="medium"
                      tone={verdict(m) === "meets" ? "positive" : "negative"}
                    >
                      {t("admin.models.ms", { ms: m.p95Ms })}
                      <Text variant="label" tone="muted">
                        {"  "}
                        {t("admin.models.budget", { ms: m.budgetMs })}
                      </Text>
                    </Text>
                  ) : null}
                  <Badge tone={v.tone} label={t(v.key)} />
                </View>
              ),
            },
          };
        })}
      />
    </Stack>
  );
}
