import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";
import { minTouchTarget, radius, space } from "../tokens.ts";
import { Text } from "./Text.tsx";

export type TableColumn = { key: string; title: string; flex?: number };
export type TableRow = { id: string; cells: Record<string, ReactNode> };

export type TableProps = {
  columns: readonly TableColumn[];
  rows: readonly TableRow[];
  /** Phone width: each row becomes a block of label/value lines instead of columns. */
  stacked?: boolean;
  accessibilityLabel: string;
  testID?: string;
};

/** Dense admin table (DESIGN.md §6, admin density). Cells may be text or small components. */
export function Table({ columns, rows, stacked = false, accessibilityLabel, testID }: TableProps) {
  const { color } = useTheme();
  const frame = [styles.frame, { borderColor: color.border, backgroundColor: color.surface }];
  if (stacked) {
    return (
      <View testID={testID} accessibilityLabel={accessibilityLabel} style={frame}>
        {rows.map((row, i) => (
          <View
            key={row.id}
            style={[
              styles.block,
              i > 0 ? { borderTopColor: color.border, borderTopWidth: 1 } : null,
            ]}
          >
            {columns.map((col, c) => (
              <View key={col.key} style={c === 0 ? styles.blockHead : styles.blockLine}>
                {c === 0 ? null : (
                  <Text variant="label" tone="muted" style={styles.blockLabel}>
                    {col.title}
                  </Text>
                )}
                <Cell>{row.cells[col.key]}</Cell>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }
  return (
    <View testID={testID} accessibilityLabel={accessibilityLabel} style={frame}>
      <View style={[styles.row, styles.headRow]}>
        {columns.map((col) => (
          <View key={col.key} style={{ flex: col.flex ?? 1 }}>
            <Text variant="label" weight="medium" tone="muted">
              {col.title}
            </Text>
          </View>
        ))}
      </View>
      {rows.map((row) => (
        <View
          key={row.id}
          style={[styles.row, { borderTopColor: color.border, borderTopWidth: 1 }]}
        >
          {columns.map((col) => (
            <View key={col.key} style={[styles.cell, { flex: col.flex ?? 1 }]}>
              <Cell>{row.cells[col.key]}</Cell>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Cell({ children }: { children: ReactNode }) {
  return typeof children === "string" || typeof children === "number" ? (
    <Text variant="body">{children}</Text>
  ) : (
    children
  );
}

const styles = StyleSheet.create({
  // Reference adaptation for dense data: hairline rules, no zebra, no filled header.
  frame: { borderWidth: 1, borderRadius: radius.xl, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    minHeight: minTouchTarget + space.sm,
  },
  headRow: { minHeight: 36 },
  cell: { paddingVertical: space.sm, minWidth: 0 },
  block: { padding: space.lg, gap: space.xs },
  blockHead: { marginBottom: space.xs },
  blockLine: { flexDirection: "row", alignItems: "center", gap: space.md },
  blockLabel: { width: 120 },
});
