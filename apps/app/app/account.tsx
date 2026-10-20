/** Account (D-022): who is signed in, the company's plan and usage, this person's devices, the
 * team (admins add people here), and sign out. Only in builds connected to a management server. */
import {
  Badge,
  Button,
  Divider,
  layout,
  Panel,
  Screen,
  SegmentedControl,
  Stack,
  space,
  Text,
  TextField,
} from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { PageHeader } from "../components/PageHeader";
import { cloudApi, cloudOrigin, signOut } from "../lib/cloud";
import { formatDateTime } from "../lib/format";
import type { StringKey } from "../lib/i18n";
import { useI18n } from "../lib/locale";
import { useCloud } from "../lib/useCloud";

type Device = {
  id: string;
  platform: string;
  label: string;
  last_seen: number;
  revoked: boolean;
  this_device: boolean;
};
type Member = { id: string; email: string; name: string; role: Role; active: boolean };
type Role = "admin" | "manager" | "agent";

export default function AccountScreen() {
  const { t, locale } = useI18n();
  const cloud = useCloud();
  const [devices, setDevices] = useState<Device[]>([]);
  const [team, setTeam] = useState<Member[]>([]);
  const me = cloud.status === "signed_in" ? cloud.me : null;
  const role = me?.user.role;
  const load = useCallback(() => {
    cloudApi<{ devices: Device[] }>("/api/v1/devices")
      .then((r) => setDevices(r.devices))
      .catch(() => {});
    if (role === "admin" || role === "manager") {
      cloudApi<{ users: Member[] }>("/api/v1/team")
        .then((r) => setTeam(r.users))
        .catch(() => {});
    }
  }, [role]);
  useEffect(load, [load]);
  if (!me) {
    return (
      <Screen testID="account">
        <PageHeader title={t("account.title")} />
      </Screen>
    );
  }
  const c = me.company;
  const status: StringKey | null =
    c?.status === "active"
      ? "account.status.active"
      : c?.status === "expired"
        ? "account.status.expired"
        : c?.status === "suspended"
          ? "account.status.suspended"
          : null;
  return (
    <Screen scroll maxWidth={layout.readableMaxWidth} testID="account" style={styles.page}>
      <PageHeader
        title={t("account.title")}
        subtitle={t("account.you", { name: me.user.name, role: t(`account.role.${me.user.role}`) })}
      />
      {c ? (
        <Panel>
          <Stack gap="sm">
            <View style={styles.row}>
              <Text variant="heading" weight="semibold" style={styles.shrink}>
                {c.name}
              </Text>
              <Badge
                label={
                  c.status === "trial"
                    ? t("account.trial", { n: c.days_left ?? 0 })
                    : t(status ?? "account.plan")
                }
                tone={c.can_call ? "primary" : "notice"}
              />
            </View>
            <Text variant="body" tone="muted">
              {t("account.minutes", { used: c.minutes_used, total: c.minutes_month })}
            </Text>
            <Text variant="body" tone="muted">
              {t("account.seats", { used: c.seats_used, total: c.seats })}
            </Text>
          </Stack>
        </Panel>
      ) : null}
      <Stack gap="sm">
        <Text variant="label" weight="medium" tone="muted" accessibilityRole="header">
          {t("account.devices")}
        </Text>
        <Panel>
          <Stack gap="sm">
            {devices
              .filter((d) => !d.revoked)
              .map((d, i) => (
                <View key={d.id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={styles.row}>
                    <Stack gap="xs" style={styles.grow}>
                      <Text variant="body" weight="medium">
                        {d.label}
                        {d.this_device ? ` · ${t("account.thisDevice")}` : ""}
                      </Text>
                      <Text variant="label" tone="muted">
                        {t("account.lastSeen", {
                          when: formatDateTime(new Date(d.last_seen).toISOString(), locale),
                        })}
                      </Text>
                    </Stack>
                    {d.this_device ? null : (
                      <Button
                        variant="ghost"
                        label={t("account.signoutDevice")}
                        onPress={() =>
                          cloudApi(`/api/v1/devices/${encodeURIComponent(d.id)}`, {
                            method: "DELETE",
                          }).then(load)
                        }
                      />
                    )}
                  </View>
                </View>
              ))}
          </Stack>
        </Panel>
      </Stack>
      {role === "admin" || role === "manager" ? (
        <Team team={team} canInvite={role === "admin"} onChange={load} />
      ) : null}
      {cloudOrigin() ? (
        <Button
          variant="ghost"
          label={t("account.apps")}
          onPress={() => void Linking.openURL(`${cloudOrigin()}/downloads/`)}
          testID="get-apps"
        />
      ) : null}
      <Button
        variant="secondary"
        label={t("account.signout")}
        onPress={() => void signOut()}
        testID="sign-out"
      />
    </Screen>
  );
}

function Team({
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
          {canInvite ? (
            <>
              <Divider />
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
        </Stack>
      </Panel>
    </Stack>
  );
}

const styles = StyleSheet.create({
  // PageHeader brings its own bottom margin, so sections are spaced by lg, not xl.
  page: { gap: space.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
});
