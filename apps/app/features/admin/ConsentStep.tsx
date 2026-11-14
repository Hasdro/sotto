/**
 * Admin first run (DD-4, D-063): until the company has a consent record, a signed-in admin sees
 * "Who processes your calls" once per visit. "Later" closes it; the same panel stays on
 * Admin › Company defaults.
 */
import { Button, Sheet } from "@sotto/ui";
import { useState } from "react";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";
import { ConsentPanel } from "./Consent";
import { consentText } from "./consentText";
import { useCompanyDefaults } from "./defaults";

let closedThisVisit = false;

/** Tests: a new visit. */
export function resetConsentStep(): void {
  closedThisVisit = false;
}

export function ConsentStep() {
  const cloud = useCloud();
  const admin = cloud.status === "signed_in" && cloud.me.user.role === "admin" && !cloud.offline;
  return admin ? <Step /> : null;
}

function Step() {
  const { t, locale } = useI18n();
  const state = useCompanyDefaults();
  const [closed, setClosed] = useState(closedThisVisit);
  // Only once the server answered (admins always get `manager`) and there is no record yet.
  const open = !closed && state.defaults.manager !== undefined && !state.defaults.consent;
  const close = () => {
    closedThisVisit = true;
    setClosed(true);
  };
  return (
    <Sheet
      open={open}
      title={consentText("title", locale)}
      onClose={close}
      closeLabel={t("admin.consent.later")}
      testID="consent-step"
    >
      <ConsentPanel
        state={state}
        hideTitle
        onSaved={close}
        extra={
          <Button
            testID="consent-later"
            label={t("admin.consent.later")}
            variant="ghost"
            onPress={close}
          />
        }
      />
    </Sheet>
  );
}
