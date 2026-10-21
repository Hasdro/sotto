import { Button, radius, scrimOpacity, space, Text, useTheme } from "@sotto/ui";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useI18n } from "../../../lib/locale";

/** "End this call?" — one stray tap must not end a live call (T-025). */
export function ConfirmEnd({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { color } = useTheme();
  const { t, dir } = useI18n();
  if (!open) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      <View {...(Platform.OS === "web" ? { dir } : {})} style={[styles.root, { direction: dir }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("call.confirmEnd.keep")}
          onPress={onCancel}
          style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim, opacity: scrimOpacity }]}
        />
        <View
          testID="confirm-end"
          accessibilityViewIsModal
          style={[styles.box, { backgroundColor: color.surface, borderColor: color.border }]}
        >
          <Text variant="heading" weight="semibold" accessibilityRole="header">
            {t("call.confirmEnd.title")}
          </Text>
          <Text variant="body" tone="muted">
            {t("call.confirmEnd.body")}
          </Text>
          <View style={styles.actions}>
            <Button
              label={t("call.confirmEnd.keep")}
              variant="secondary"
              onPress={onCancel}
              testID="confirm-end-keep"
            />
            <Button
              label={t("call.end")}
              variant="danger"
              onPress={onConfirm}
              testID="confirm-end-yes"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg },
  box: {
    width: "100%",
    maxWidth: 420,
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: space.sm },
});
