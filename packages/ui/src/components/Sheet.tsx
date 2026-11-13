/**
 * A sheet (UX-01/UX-04 enabler): a bottom sheet below 768 px, a centred dialog from 768 px up.
 * `Modal` gives Escape and Android back (onRequestClose) and, on web, a focus trap; the panel is
 * marked modal so VoiceOver stays inside it. The scrim and the close button also close it.
 */
import type { ReactNode } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useDirection, useTheme } from "../theme.tsx";
import { layout, radius, scrimOpacity, space } from "../tokens.ts";
import { IconButton } from "./IconButton.tsx";
import { Text } from "./Text.tsx";

export type SheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Accessible name of the close button and the scrim, e.g. "Close". */
  closeLabel: string;
  children?: ReactNode | undefined;
  /** Pinned under the body, e.g. Save / Cancel. */
  footer?: ReactNode | undefined;
  /** Window width override (tests, gallery); defaults to the real window. */
  width?: number | undefined;
  testID?: string | undefined;
};

export function Sheet({
  open,
  title,
  onClose,
  closeLabel,
  children,
  footer,
  width,
  testID,
}: SheetProps) {
  const { color } = useTheme();
  const dir = useDirection();
  const window = useWindowDimensions();
  if (!open) return null;
  const bottom = (width ?? window.width) < layout.sheetBreakpoint;
  const id = (s: string) => (testID ? `${testID}-${s}` : undefined);
  return (
    <Modal
      testID={testID}
      transparent
      visible
      animationType={bottom ? "slide" : "fade"}
      onRequestClose={onClose}
    >
      <View
        testID={id("root")}
        {...(Platform.OS === "web" ? { dir } : {})}
        style={[styles.root, bottom ? null : styles.rootCentre, { direction: dir }]}
      >
        <Pressable
          testID={id("scrim")}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim, opacity: scrimOpacity }]}
        />
        <View
          testID={id("panel")}
          accessibilityViewIsModal
          role="dialog"
          aria-label={title}
          style={[
            styles.panel,
            bottom ? styles.panelBottom : styles.panelCentre,
            { backgroundColor: color.surfaceRaised, borderColor: color.border },
          ]}
        >
          <View style={styles.head}>
            <Text
              variant="heading"
              weight="semibold"
              accessibilityRole="header"
              style={styles.grow}
            >
              {title}
            </Text>
            <IconButton icon="close" label={closeLabel} onPress={onClose} testID={id("close")} />
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  rootCentre: { alignItems: "center", justifyContent: "center", padding: space.lg },
  panel: { borderWidth: 1, gap: space.md, paddingVertical: space.lg },
  panelBottom: {
    position: "absolute",
    bottom: 0,
    start: 0,
    end: 0,
    maxHeight: "90%",
    borderTopStartRadius: radius.xl,
    borderTopEndRadius: radius.xl,
  },
  panelCentre: {
    width: "100%",
    maxWidth: layout.sheetMaxWidth,
    maxHeight: "85%",
    borderRadius: radius.xl,
  },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg },
  grow: { flex: 1 },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: space.lg, gap: space.md },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
});
