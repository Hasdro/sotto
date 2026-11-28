/**
 * The company's people (R3): who is on the team, and (admins) invite someone with a role. Used by
 * Account and Admin → Team, both on the management server's /api/v1/team (T-039).
 */
import {
  Badge,
  Button,
  Divider,
  Panel,
  SegmentedControl,
  Stack,
  space,
  Text,
  TextField,
} from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { cloudApi, refreshCloud } from "../../lib/cloud";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";

export type Role = "admin" | "manager" | "agent";
export type Member = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  created_at?: number;
};

/** The team list for admins and managers (agents get none). */
export function useTeam(role: Role | undefined) {
  const [team, setTeam] = useState<Member[]>([]);
  const reload = useCallback(() => {
    if (role !== "admin" && role !== "manager") return;
    cloudApi<{ users: Member[] }>("/api/v1/team")
      .then((r) => setTeam([...r.users].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))))
      .catch(() => {});
  }, [role]);
  useEffect(reload, [reload]);
  return { team, reload };
}

export function TeamPanel({
  team,
  canInvite,
  onChange,
}: {
  team: Member[];
  canInvite: boolean;
  onChange: () => void;
}) {
  const { t } = useI18n();
  const cloud = useCloud();
  const company = cloud.status === "signed_in" ? cloud.me.company : null;
  // UX-014: with every seat taken, say so instead of offering an invite the server refuses.
  const full = company ? company.seats_used >= company.seats : false;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("agent");
  const [note, setNote] = useState<string | null>(null);
  const invite = () => {
    setNote(null);
    cloudApi<{ temporary_password: string }>("/api/v1/team", {
      method: "POST",
      body: { email: email.trim(), name: name.trim(), role },
    })
      .then((r) => {
        setNote(t("account.inviteDone", { email: email.trim(), password: r.temporary_password }));
        setEmail("");
        setName("");
        onChange();
        void refreshCloud(); // the seat count on this page comes from the plan
      })
      .catch((err: unknown) => setNote(err instanceof Error ? err.message : "error"));
  };
  return (
    <Stack gap="sm">
      <Text variant="label" weight="medium" tone="muted" accessibilityRole="header">
        {t("account.team")}
      </Text>
      <Panel>
        <Stack gap="sm">
          {canInvite ? (
            <>
              <Text variant="body" weight="medium">
                {t("account.invite")}
              </Text>
              {full && company ? (
                <Stack gap="xs" align="flex-start">
                  <Text variant="label" tone="notice" testID="team-seats-full">
                    {t("team.seatsFull", { total: company.seats })}
                  </Text>
                  <Button
                    variant="ghost"
                    label={t("team.seatsCheck")}
                    onPress={() => void refreshCloud()}
                    testID="team-seats-check"
                  />
                </Stack>
              ) : null}
              <TextField
                label={t("account.inviteName")}
                value={name}
                onChangeText={setName}
                testID="team-invite-name"
              />
              <TextField
                label={t("account.email")}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                testID="team-invite-email"
              />
              <SegmentedControl<Role>
                accessibilityLabel={t("account.inviteRole")}
                options={[
                  { value: "agent", label: t("account.role.agent") },
                  { value: "manager", label: t("account.role.manager") },
                  { value: "admin", label: t("account.role.admin") },
                ]}
                value={role}
                onChange={setRole}
              />
              <Button
                label={t("account.invite")}
                onPress={invite}
                disabled={full || !email.trim() || !name.trim()}
                testID="team-invite"
              />
              {note ? (
                <Text variant="body" selectable accessibilityLiveRegion="polite">
                  {note}
                </Text>
              ) : null}
            </>
          ) : null}
          {canInvite && team.length > 0 ? <Divider /> : null}
          {team.map((m, i) => (
            <View key={m.id}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.row}>
                <Stack gap="xs" style={styles.grow}>
                  <Text variant="body" weight="medium">
                    {m.name}
                  </Text>
                  <Text variant="label" tone="muted">
                    {m.email}
                  </Text>
                </Stack>
                <Badge label={t(`account.role.${m.role}`)} tone={m.active ? "neutral" : "notice"} />
              </View>
            </View>
          ))}
        </Stack>
      </Panel>
    </Stack>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  grow: { flex: 1 },
});
