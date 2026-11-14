/** Admin: prompt studio (R6, DD-2). D-059: AGN runs prompts in the owner console; a company
 * sees its own versions here only while AGN allows BYO. */
import { Badge, Button, EmptyState, Panel, Stack, Text } from "@sotto/ui";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ByoGate } from "../../../features/keys/byo";
import { useByoText } from "../../../features/keys/strings";
import { liveOf, promptsApi, type StudioKey } from "../../../features/prompts/api";
import { configInWebOnly, WebAdminNotice } from "../../../features/webadmin/webAdmin";

/** D-038: on the desktop app this screen is replaced by a link to the web admin panel. */
export default function PromptsScreen() {
  return configInWebOnly() ? (
    <WebAdminNotice />
  ) : (
    <ByoGate>
      <PromptsScreenBody />
    </ByoGate>
  );
}

function PromptsScreenBody() {
  const t = useByoText();
  const [rows, setRows] = useState<StudioKey[] | null | "offline">(null);
  const load = useCallback(() => {
    promptsApi
      .list()
      .then((r) => setRows(r.prompts))
      .catch(() => setRows("offline"));
  }, []);
  useEffect(load, [load]);
  if (rows === "offline") return <EmptyState title={t("prompts.offline")} />;
  if (rows === null) return null;
  return (
    <Stack gap="md" testID="prompts-list">
      <Text variant="title" accessibilityRole="header">
        {t("prompts.title")}
      </Text>
      <Text tone="muted">{t("prompts.body")}</Text>
      {rows.map((p) => {
        const live = liveOf(p);
        return (
          <Panel key={p.key}>
            <Stack gap="sm">
              <Text weight="semibold">{p.key}</Text>
              <Badge
                tone={live ? "primary" : "neutral"}
                label={
                  live
                    ? t("prompts.version", { version: String(live.version) })
                    : t("prompts.seed", { version: String(p.seed.version) })
                }
              />
              <Button
                variant="secondary"
                label={t("prompts.new")}
                testID={`prompt-open-${p.key}`}
                onPress={() => router.push(`/admin/prompts/${p.key}`)}
              />
            </Stack>
          </Panel>
        );
      })}
    </Stack>
  );
}
