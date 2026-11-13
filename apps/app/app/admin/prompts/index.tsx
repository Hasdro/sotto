/** Admin: prompt studio (R6). Hidden until prompt versions are stored on the server and reach
 * calls (T-040): an editor whose edits were dropped would mislead. Logic lives in
 * features/prompts for that phase. */
import { ComingLater } from "../../../components/ComingLater";
import { configInWebOnly, WebAdminNotice } from "../../../features/webadmin/webAdmin";

/** D-038: on the desktop app this screen is replaced by a link to the web admin panel. */
export default function PromptsScreen() {
  return configInWebOnly() ? <WebAdminNotice /> : <PromptsScreenBody />;
}

function PromptsScreenBody() {
  return <ComingLater title="admin.later.prompts.title" body="admin.later.prompts.body" />;
}
