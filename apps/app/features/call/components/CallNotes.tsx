/** Quick notes during the call (owner, 22 Oct): kept with the call in History. */
import { TextField } from "@sotto/ui";
import { setCallNotes, useCallNotes } from "../../../lib/callNotes";
import { useI18n } from "../../../lib/locale";

export function CallNotes() {
  const { t } = useI18n();
  const notes = useCallNotes();
  return (
    <TextField
      label={`📝 ${t("call.notes")}`}
      placeholder={t("call.notes.placeholder")}
      multiline
      height={88}
      value={notes}
      onChangeText={setCallNotes}
      testID="call-notes"
    />
  );
}
