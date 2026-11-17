/**
 * Thin adapter over the design-system header (T-092): the implementation moved to
 * `@sotto/ui` `PageHeader` (`packages/ui/src/components/chrome.tsx`). This file keeps the
 * app's old props (`subtitle`, `icon`, responsive title) and the page spacing (`marginBottom`)
 * so existing screens need no change. New screens import `PageHeader` from `@sotto/ui`
 * directly; deleting this adapter and updating the imports is the T-092 follow-up.
 */
import { type IconName, PageHeader as UiPageHeader, space } from "@sotto/ui";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useIsWide } from "../lib/responsive";

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: string;
  /** Sotto's own icon before the title (owner, 22 Oct). */
  icon?: IconName;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const wide = useIsWide();
  return (
    <View style={styles.wrap}>
      <UiPageHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        compact={!wide}
        actions={actions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.xxl },
});
