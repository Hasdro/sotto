/** Admin › Company › Company activity (UX-29, ZC B16): recordings, signed-in devices and the
 * activity log on one page instead of three tabs. Each section is the page it replaces. */
import { Stack, Text } from "@sotto/ui";
import { useI18n } from "../../lib/locale";
import ActivityScreen from "./activity";
import DevicesScreen from "./devices";
import RecordingsScreen from "./recordings";

export default function CompanyActivityScreen() {
  const { t } = useI18n();
  return (
    <Stack gap="xl" testID="admin-company">
      {(
        [
          ["recordings", "admin.recordings", RecordingsScreen],
          ["devices", "admin.devices", DevicesScreen],
          ["activity", "admin.activity", ActivityScreen],
        ] as const
      ).map(([id, title, Section]) => (
        <Stack key={id} gap="md" testID={`admin-company-${id}`}>
          <Text variant="heading" weight="semibold" accessibilityRole="header">
            {t(title)}
          </Text>
          <Section />
        </Stack>
      ))}
    </Stack>
  );
}
