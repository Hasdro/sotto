/**
 * D-038: models, providers, keys, router and the prompt studio are configured only in the web
 * admin panel (the server's web app; the owner console for the platform). The desktop app keeps
 * the screens' code and tests but hides them, and shows this link instead.
 */
import { Button, EmptyState, Stack } from "@sotto/ui";
import { Linking } from "react-native";
import { cloudOrigin } from "../../lib/cloud";
import { desktop } from "../../lib/desktop";
import { useI18n } from "../../lib/locale";

/** True in the desktop build: model and prompt configuration is not shown there. */
export function configInWebOnly(): boolean {
  return desktop() !== null;
}

/** Where the admin manages models: the same server's web admin, Keys & providers. */
export function webAdminUrl(): string | null {
  const origin = cloudOrigin();
  return origin ? `${origin}/admin/keys` : null;
}

export function openWebAdmin(): void {
  const url = webAdminUrl();
  if (url) void Linking.openURL(url);
}

export function WebAdminNotice() {
  const { t } = useI18n();
  return (
    <Stack gap="md" testID="web-admin-notice">
      <EmptyState title={t("admin.webPanel.title")} body={t("admin.webPanel.body")} />
      {webAdminUrl() ? (
        <Button
          testID="web-admin-link"
          label={t("admin.webPanel.link")}
          variant="secondary"
          accessibilityHint={webAdminUrl() ?? undefined}
          onPress={openWebAdmin}
        />
      ) : null}
    </Stack>
  );
}
