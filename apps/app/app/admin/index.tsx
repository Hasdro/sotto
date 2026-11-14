/** Admin home: what AGN learned (ZC-B10) and the company's team on the management server (R3, T-039); invite people with a role. */
import { EmptyState, Stack, Text } from "@sotto/ui";
import { LearnedCard } from "../../features/learning/LearnedCard";
import { TeamPanel, useTeam } from "../../features/team/TeamPanel";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";

export default function TeamScreen() {
  const { t } = useI18n();
  const cloud = useCloud();
  const role = cloud.status === "signed_in" ? cloud.me.user.role : undefined;
  const { team, reload } = useTeam(role);
  if (cloud.status !== "signed_in") {
    return (
      <EmptyState
        testID="admin-team-none"
        title={t("admin.team.noServer.title")}
        body={t("admin.team.noServer.body")}
      />
    );
  }
  return (
    <Stack gap="lg" testID="admin-team">
      <LearnedCard />
      <Text variant="body" tone="muted">
        {t("admin.team.subtitle")}
      </Text>
      <TeamPanel team={team} canInvite={role === "admin"} onChange={reload} />
    </Stack>
  );
}
