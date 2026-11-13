/**
 * A left-to-right run inside right-to-left text (UX-41 enabler): a Latin name such as a deal,
 * an email or a product code. Unicode isolates (LRI … PDI, the plain-text form of <bdi>) keep
 * the run from reordering the Arabic around it, on every platform; the run itself is written
 * left to right.
 */
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { Text, type TextProps } from "./Text.tsx";

/** U+2066 LEFT-TO-RIGHT ISOLATE and U+2069 POP DIRECTIONAL ISOLATE. */
export const LRI = "⁦";
export const PDI = "⁩";

export function LtrRun({ children, style, ...rest }: TextProps & { children: ReactNode }) {
  return (
    <Text {...rest} style={[styles.ltr, style]}>
      {LRI}
      {children}
      {PDI}
    </Text>
  );
}

const styles = StyleSheet.create({ ltr: { writingDirection: "ltr" } });
