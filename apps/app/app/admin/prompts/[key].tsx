/**
 * Admin → Prompt editor, removed in round 2 (D-078): prompts are configured per organisation on
 * the vendor panel now, never in the client. This file stays as a short notice until
 * Mac-Claude deletes it (R-005).
 */
import { ComingLater } from "../../../components/ComingLater";

export default function PromptScreen() {
  return <ComingLater title="admin.modelsMoved.title" body="admin.modelsMoved.body" />;
}
