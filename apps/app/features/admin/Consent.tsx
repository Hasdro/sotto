/**
 * "Who processes your calls" (DD-4, D-063): the sub-processor list, a "primary vendors only"
 * switch and one save that records the admin's choice with a timestamp (audited on the server).
 * "Primary vendors only" writes the allow-list without the backups and turns backups off (R2).
 * The wording comes from consentText.ts and carries the DRAFT marker until the owner's text lands.
 */
import { Badge, Button, Divider, Stack, space, Text, ToggleRow } from "@sotto/ui";
import { type ReactNode, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useI18n } from "../../lib/locale";
import {
  CONSENT_IS_DRAFT,
  CONSENT_TEXT_VERSION,
  consentText,
  PRIMARY_VENDORS,
  SUBPROCESSORS,
} from "./consentText";
import type { ConsentChoice, DefaultsState } from "./defaults";
import { useCompanySettings } from "./settings";

export function DraftMarker() {
  const { locale } = useI18n();
  if (!CONSENT_IS_DRAFT) return null;
  return <Badge testID="consent-draft" label={consentText("draftMarker", locale)} tone="notice" />;
}

export function ConsentPanel({
  state,
  onSaved,
  extra,
  hideTitle,
}: {
  state: DefaultsState;
  onSaved?: () => void;
  extra?: ReactNode;
  /** Inside a sheet that already shows the title. */
  hideTitle?: boolean;
}) {
  const { t, locale } = useI18n();
  const { change: changeSettings } = useCompanySettings();
  const record = state.defaults.consent ?? null;
  const [choice, setChoice] = useState<ConsentChoice>(record?.choice ?? "all");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (record?.choice) setChoice(record.choice);
  }, [record?.choice]);
  const current =
    record && record.text_version === CONSENT_TEXT_VERSION && record.choice === choice;
  const shown = SUBPROCESSORS.filter((v) => choice === "all" || !v.backup);

  const save = async () => {
    setBusy(true);
    const ok = await state.save({
      consent: { choice, text_version: CONSENT_TEXT_VERSION },
      vendor_allow_list: choice === "primary_only" ? [...PRIMARY_VENDORS] : [],
    });
    if (ok) {
      changeSettings({ backup_allowed: choice !== "primary_only" });
      onSaved?.();
    }
    setBusy(false);
  };

  return (
    <Stack gap="md" testID="consent">
      <View style={styles.row}>
        {hideTitle ? null : (
          <Text variant="heading" weight="semibold" accessibilityRole="header">
            {consentText("title", locale)}
          </Text>
        )}
        <DraftMarker />
      </View>
      <Text tone="muted">{consentText("intro", locale)}</Text>
      <View accessibilityRole="list" testID="consent-vendors">
        {shown.map((v, i) => (
          <View key={v.id} accessibilityRole="none">
            {i > 0 ? <Divider /> : null}
            <View style={styles.vendor} testID={`vendor-${v.id}`}>
              <View style={styles.row}>
                <Text weight="semibold">{v.name}</Text>
                {v.backup ? <Badge label={t("admin.consent.backup")} tone="neutral" /> : null}
              </View>
              <Text variant="label" tone="muted">
                {`${locale === "ar" ? v.purpose.ar : v.purpose.en} · ${
                  locale === "ar" ? v.region.ar : v.region.en
                }`}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <ToggleRow
        testID="consent-primary-only"
        label={consentText("primaryOnly", locale)}
        description={consentText("primaryOnlyHint", locale)}
        value={choice === "primary_only"}
        onValueChange={(on) => setChoice(on ? "primary_only" : "all")}
      />
      <Text variant="label">{consentText("agree", locale)}</Text>
      {record ? (
        <Text variant="label" tone="muted" testID="consent-record">
          {t("admin.consent.recorded", {
            date: new Date(record.accepted_at).toLocaleString(locale),
            version: record.text_version,
          })}
        </Text>
      ) : null}
      {state.error ? (
        <Text variant="label" tone="danger" accessibilityLiveRegion="polite">
          {t("admin.consent.error")}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button
          testID="consent-save"
          label={record ? t("admin.consent.update") : t("admin.consent.agree")}
          disabled={busy || !!current}
          onPress={() => void save()}
        />
        {extra}
      </View>
    </Stack>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm },
  vendor: { gap: space.xs, paddingVertical: space.sm },
});
