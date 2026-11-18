/**
 * Admin → Keys & providers, removed in round 2 (D-078): keys, providers, models and prompts are
 * configured per organisation on the vendor panel now, never in the client. This file stays as
 * a short notice until Mac-Claude deletes it (R-005); the route must not render any model
 * configuration in the meantime.
 */
import { ComingLater } from "../../components/ComingLater";

export default function KeysScreen() {
  return <ComingLater title="admin.modelsMoved.title" body="admin.modelsMoved.body" />;
}
