/** Admin › Connections › Attachments (INT-14b): files agents may attach to follow-up emails. */
import { EmptyState } from "@sotto/ui";
import { AttachmentsSettings } from "../../features/email/AttachmentsSettings";
import { useEmailText } from "../../features/email/strings";
import { useCloud } from "../../lib/useCloud";

export default function AttachmentsScreen() {
  const t = useEmailText();
  const cloud = useCloud();
  if (cloud.status !== "signed_in")
    return <EmptyState testID="admin-attachments-none" title={t("att.title")} />;
  return <AttachmentsSettings />;
}
