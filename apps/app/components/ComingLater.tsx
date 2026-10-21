import { EmptyState } from "@sotto/ui";
import type { StringKey } from "../lib/i18n";
import { useI18n } from "../lib/locale";

/** A screen whose real version is not built yet: say so instead of showing sample data or an
 * editor whose changes go nowhere (T-040, T-041). */
export function ComingLater({ title, body }: { title: StringKey; body: StringKey }) {
  const { t } = useI18n();
  return <EmptyState testID="coming-later" title={t(title)} body={t(body)} />;
}
