/** Rich-text field (D-080): a plain multiline field plus a small formatting toolbar — bold,
 * italic, bullet list, link — that edits Markdown in place. The value stays plain text with
 * Markdown markers; the server renders it into the HTML part of the sent email and strips the
 * markers for the plain-text part, so old formats keep working. */
import { Button, Stack, TextField } from "@sotto/ui";
import { useState } from "react";
import type {
  NativeSyntheticEvent,
  TextInputSelectionChangeEventData,
} from "react-native";
import {
  applyBold,
  applyItalic,
  applyLink,
  applyList,
  type Edit,
  type Selection,
} from "./richText";

export function RichTextField({
  label,
  value,
  onChangeText,
  testID,
  height,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  testID: string;
  height?: number;
}) {
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const apply = (fn: (text: string, sel: Selection) => Edit) => {
    const r = fn(value, selection);
    onChangeText(r.text);
    setSelection(r.selection);
  };
  return (
    <Stack gap="xs">
      <TextField
        label={label}
        value={value}
        onChangeText={onChangeText}
        onSelectionChange={(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) =>
          setSelection(e.nativeEvent.selection)
        }
        selection={selection}
        multiline
        height={height}
        testID={testID}
      />
      <Stack direction="row" gap="xs" wrap>
        <Button
          variant="secondary"
          label="B"
          onPress={() => apply(applyBold)}
          testID={`${testID}-bold`}
        />
        <Button
          variant="secondary"
          label="I"
          onPress={() => apply(applyItalic)}
          testID={`${testID}-italic`}
        />
        <Button
          variant="secondary"
          label="• List"
          onPress={() => apply(applyList)}
          testID={`${testID}-list`}
        />
        <Button
          variant="secondary"
          label="Link"
          onPress={() => apply(applyLink)}
          testID={`${testID}-link`}
        />
      </Stack>
    </Stack>
  );
}
