/** A button that leaves the app (UI-014): the external-link mark after the label, a hint for
 * screen readers, and a short line once the browser has the page ("Opened in your browser."),
 * so a browser opening behind the desktop app never looks like a dead click. */
import { Button, type ButtonVariant, Icon, space, Text, useTheme } from "@sotto/ui";
import { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { useI18n } from "../lib/locale";

const SHOWN_MS = 5000;

export function ExternalLinkButton({
  label,
  url,
  variant = "primary",
  testID,
}: {
  label: string;
  url: string;
  variant?: ButtonVariant;
  testID?: string;
}) {
  const { t } = useI18n();
  const { color } = useTheme();
  const [state, setState] = useState<"idle" | "opened" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);
  const open = () => {
    Linking.openURL(url).then(
      () => setState("opened"),
      () => setState("failed"),
    );
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), SHOWN_MS);
  };
  // The mark takes the label's colour (Button's palette).
  const ink =
    variant === "primary"
      ? color.onPrimary
      : variant === "ghost"
        ? color.primary
        : variant === "danger"
          ? color.onDanger
          : variant === "dangerGhost"
            ? color.danger
            : color.text;
  return (
    <View style={styles.wrap}>
      <Button
        label={label}
        variant={variant}
        onPress={open}
        trailing={<Icon name="external" size={16} color={ink} />}
        accessibilityHint={t("link.hint")}
        {...(testID ? { testID } : {})}
      />
      {state === "idle" ? null : (
        <Text
          variant="label"
          tone={state === "failed" ? "danger" : "muted"}
          accessibilityLiveRegion="polite"
          aria-live="polite"
          {...(testID ? { testID: `${testID}-opened` } : {})}
        >
          {t(state === "failed" ? "link.failed" : "link.opened")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, alignItems: "flex-start" },
});
