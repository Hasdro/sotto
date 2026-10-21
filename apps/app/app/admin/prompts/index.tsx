/** Admin: prompt studio (R6). Hidden until prompt versions are stored on the server and reach
 * calls (T-040): an editor whose edits were dropped would mislead. Logic lives in
 * features/prompts for that phase. */
import { ComingLater } from "../../../components/ComingLater";

export default function PromptsScreen() {
  return <ComingLater title="admin.later.prompts.title" body="admin.later.prompts.body" />;
}
