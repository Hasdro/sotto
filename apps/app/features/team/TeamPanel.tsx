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
import { cloudApi } from "../../lib/cloud";
import { useI18n } from "../../lib/locale";

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
      .then((r) =>
        setTeam(
          [...r.users].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0)),
        ),
      )
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
              <TextField label={t("account.inviteName")} value={name} onChangeText={setName} />
              <TextField
                label={t("account.email")}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
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
                disabled={!email.trim() || !name.trim()}
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
