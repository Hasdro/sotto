/**
 * The admin tour (Round 3, D-091): the same dialog as the call tutorial, with five steps
 * over the admin area — People, Connections, AI, Company, bug reports. It auto-plays the
 * first time a person opens the admin area, until they tick "Don't show this again", and
 * replays from Settings › Advanced. Mounted in the admin layout, so it only ever shows
 * inside /admin (behind the RoleGate there). Desktop inherits it: the desktop app shows
 * the same web build.
 */
import { useState } from "react";
import { setPrefs, usePrefs } from "../lib/prefs";
import { type Step, TutorialDialog } from "./Tutorial";

const ADMIN_STEPS: readonly Step[] = [
  { mascot: "idle", title: "tutorial.admin.1.title", body: "tutorial.admin.1.body" },
  { mascot: "listening", title: "tutorial.admin.2.title", body: "tutorial.admin.2.body" },
  { mascot: "thinking", title: "tutorial.admin.3.title", body: "tutorial.admin.3.body" },
  { mascot: "suggesting", title: "tutorial.admin.4.title", body: "tutorial.admin.4.body" },
  { mascot: "reviewing", title: "tutorial.admin.5.title", body: "tutorial.admin.5.body" },
];

export function AdminTour() {
  const { adminTourRequested, adminTourDone } = usePrefs();
  const [dismissed, setDismissed] = useState(false);
  // The tour mounts with the admin layout, so leaving /admin unmounts it and the next visit
  // starts fresh: the tour plays again unless "Don't show this again" was ticked.
  // An explicit request (Settings › Advanced) replays it even after a close; auto-play
  // still respects a close until the next visit to /admin.
  const show = adminTourRequested || (!dismissed && !adminTourDone);
  if (!show) return null;
  return (
    <TutorialDialog
      steps={ADMIN_STEPS}
      testID="admin-tour"
      onClose={(never) => {
        setDismissed(true);
        setPrefs({ adminTourRequested: false, ...(never ? { adminTourDone: true } : {}) });
      }}
    />
  );
}
