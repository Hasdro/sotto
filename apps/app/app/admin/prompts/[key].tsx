/** Admin: one prompt's versions (R6). Hidden with the studio until prompts persist (T-040). */
import { ComingLater } from "../../../components/ComingLater";
import { configInWebOnly, WebAdminNotice } from "../../../features/webadmin/webAdmin";

/** D-038: on the desktop app this screen is replaced by a link to the web admin panel. */
export default function PromptDetailScreen() {
  return configInWebOnly() ? <WebAdminNotice /> : <PromptDetailScreenBody />;
}

function PromptDetailScreenBody() {
  return <ComingLater title="admin.later.prompts.title" body="admin.later.prompts.body" />;
}
