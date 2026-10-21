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
import { TeamPanel, useTeam } from "../features/team/TeamPanel";
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

export default function AccountScreen() {
  const { t, locale } = useI18n();
  const cloud = useCloud();
  const [devices, setDevices] = useState<Device[]>([]);
  const me = cloud.status === "signed_in" ? cloud.me : null;
  const role = me?.user.role;
  const load = useCallback(() => {
    cloudApi<{ devices: Device[] }>("/api/v1/devices")
      .then((r) => setDevices(r.devices))
      .catch(() => {});
  }, []);
  const { team, reload } = useTeam(role);
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
        <TeamPanel team={team} canInvite={role === "admin"} onChange={reload} />
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
