/**
 * "Note for after the call" (owner, 22 Oct; UX-19): the one field of the live rail. Kept with the
 * call in History; the after-call checklist reads it (lib/callNotes.ts) to prefill updates.
 */
import { TextField } from "@sotto/ui";
import { setCallNotes, useCallNotes } from "../../../lib/callNotes";
import { useCallText } from "../strings";

export function CallNotes() {
  const tc = useCallText();
  const notes = useCallNotes();
  return (
    <TextField
      label={tc("notes.after")}
      placeholder={tc("notes.afterPlaceholder")}
      multiline
      height={88}
      value={notes}
      onChangeText={setCallNotes}
      testID="call-notes"
    />
  );
}
