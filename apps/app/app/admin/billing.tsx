/**
 * Admin › Company › Billing (Round 3, D-090): the plan, its monthly price, what was paid
 * (the current plan's price plus paid_until — there is no payment history in the repo; the
 * Zoho Billing payment side is the owner's), and the upgrade page. The upgrade button only
 * appears once the real hosted page URL is pasted in; until then the screen says online
 * upgrade is being set up, so nobody follows a dead link.
 */
import { Badge, Button, layout, Panel, Screen, space, Stack, StatTile, Text } from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { PageHeader } from "../../components/PageHeader";
import { billingInfo, type BillingInfo } from "../../features/support/api";
import { formatNumber } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

function formatDate(ms: number, locale: "en" | "ar"): string {
  return new Date(ms).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function BillingScreen() {
  const { t, locale } = useI18n();
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    billingInfo()
      .then(setInfo)
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);
  return (
    <Screen scroll maxWidth={layout.readableMaxWidth} testID="billing" style={styles.page}>
      <PageHeader icon="cards" title={t("billing.title")} />
      {failed && !info ? (
        <Panel>
          <Stack gap="md">
            <Text>{t("billing.loadFailed")}</Text>
            <Button
              variant="secondary"
              label={t("billing.retry")}
              onPress={load}
              testID="billing-retry"
            />
          </Stack>
        </Panel>
      ) : null}
      {info ? <BillingPanel info={info} /> : null}
    </Screen>
  );
}

function BillingPanel({ info }: { info: BillingInfo }) {
  const { t, locale } = useI18n();
  const statusText =
    info.status === "trial"
      ? t("account.trial", { n: info.days_left ?? 0 })
      : t(
          info.status === "active"
            ? "account.status.active"
            : info.status === "expired"
              ? "account.status.expired"
              : "account.status.suspended",
        );
  const statusTone =
    info.status === "active"
      ? ("primary" as const)
      : info.status === "trial"
        ? ("notice" as const)
        : ("warning" as const);
  const upgradeReady =
    info.upgrade_url !== null && !info.upgrade_url.startsWith("TODO-");
  const nextCharge =
    info.ends_at === null
      ? null
      : info.status === "trial"
        ? t("billing.trialEnds", { date: formatDate(info.ends_at, locale) })
        : t("billing.paidUntil", { date: formatDate(info.ends_at, locale) });
  return (
    <Stack gap="lg">
      <Panel testID="billing-plan">
        <Stack gap="sm">
          <View style={styles.row}>
            <Text variant="heading" weight="semibold" style={styles.shrink}>
              {info.plan_name}
            </Text>
            <Badge label={statusText} tone={statusTone} />
          </View>
          <Text variant="body" tone="muted">
            {info.price_aed === null
              ? t("billing.noPrice")
              : info.price_aed === 0
                ? t("billing.priceFree")
                : t("billing.price", { price: formatNumber(info.price_aed, locale) })}
          </Text>
          {nextCharge ? (
            <Text variant="body" tone="muted">
              {t("billing.nextCharge")}: {nextCharge}
            </Text>
          ) : null}
        </Stack>
      </Panel>
      <View style={styles.tiles}>
        <StatTile
          label={t("billing.seats")}
          value={`${info.seats_used} / ${info.seats}`}
          testID="billing-seats"
        />
        <StatTile
          label={t("billing.minutes")}
          value={`${formatNumber(info.minutes_used, locale)} / ${formatNumber(info.minutes_month, locale)}`}
          testID="billing-minutes"
        />
      </View>
      {upgradeReady && info.upgrade_url ? (
        <Button
          label={t("billing.upgrade")}
          onPress={() => void Linking.openURL(info.upgrade_url as string)}
          testID="billing-upgrade"
        />
      ) : info.upgrade_url === null ? (
        <Text variant="label" tone="muted">
          {t("billing.topPlan")}
        </Text>
      ) : (
        <Text variant="label" tone="muted">
          {t("billing.upgradeSoon")}
        </Text>
      )}
    </Stack>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  shrink: { flexShrink: 1 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
});
