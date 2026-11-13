/** Admin: models per stage (R6). The real choice and its measured speed live in Keys &
 * providers ("Measure speed"); a second table of sample numbers would contradict it (T-041). */
import { ComingLater } from "../../components/ComingLater";
import { configInWebOnly, WebAdminNotice } from "../../features/webadmin/webAdmin";

/** D-038: on the desktop app this screen is replaced by a link to the web admin panel. */
export default function ModelsScreen() {
  return configInWebOnly() ? <WebAdminNotice /> : <ModelsScreenBody />;
}

function ModelsScreenBody() {
  return <ComingLater title="admin.later.models.title" body="admin.later.models.body" />;
}
