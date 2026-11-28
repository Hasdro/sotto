/** Rich-text field (D-080): a plain multiline field plus a small formatting toolbar — bold,
 * italic, bullet list, link — that edits Markdown in place. The value stays plain text with
 * Markdown markers; the server renders it into the HTML part of the sent email and strips the
 * markers for the plain-text part, so old formats keep working. UI-016: a form with several of
 * these shows one toolbar, under the field the person was last in (`toolbar`, `onFocus`). */
import { Button, Stack, TextField } from "@sotto/ui";
import { useState } from "react";
import type { TextInputSelectionChangeEvent } from "react-native";
import {
  applyBold,
  applyItalic,
  applyLink,
  applyList,
  type Edit,
  type Selection,
} from "./richText";
import { useEmailText } from "./strings";

export function RichTextField({
  label,
  value,
  onChangeText,
  testID,
  height,
  toolbar = true,
  toolbarTestID = testID,
  onFocus,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  testID: string;
  height?: number;
  /** Show the formatting buttons under this field. */
  toolbar?: boolean;
  /** Prefix of the buttons' test ids (`<id>-bold`…). */
  toolbarTestID?: string;
  onFocus?: () => void;
}) {
  const t = useEmailText();
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const apply = (fn: (text: string, sel: Selection) => Edit) => {
    const r = fn(value, selection);
    onChangeText(r.text);
    setSelection(r.selection);
  };
  const tools = [
    { id: "bold", label: "B", name: t("integrations.smtp.formats.bold"), fn: applyBold },
    { id: "italic", label: "I", name: t("integrations.smtp.formats.italic"), fn: applyItalic },
    {
      id: "list",
      label: `• ${t("integrations.smtp.formats.list")}`,
      name: t("integrations.smtp.formats.list"),
      fn: applyList,
    },
    {
      id: "link",
      label: t("integrations.smtp.formats.link"),
      name: t("integrations.smtp.formats.link"),
      fn: applyLink,
    },
  ] as const;
  return (
    <Stack gap="xs">
      <TextField
        label={label}
        value={value}
        onChangeText={onChangeText}
        onSelectionChange={(e: TextInputSelectionChangeEvent) =>
          setSelection(e.nativeEvent.selection)
        }
        onFocus={onFocus}
        selection={selection}
        multiline
        height={height}
        testID={testID}
      />
      {toolbar ? (
        <Stack direction="row" gap="xs" wrap accessibilityRole="toolbar" aria-label={label}>
          {tools.map((x) => (
            <Button
              key={x.id}
              variant="outline"
              label={x.label}
              accessibilityLabel={x.name}
              onPress={() => apply(x.fn)}
              testID={`${toolbarTestID}-${x.id}`}
            />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
