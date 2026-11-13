/**
 * First-run steps on Home (UX-10, ZC-09): what this role still has to do before the product
 * works, each with the page that does it. Data, not layout: a new step (e.g. the practice call,
 * owner Q15) is one more entry. A step leaves the list once it is done, or once the person
 * marks it done by hand; the whole checklist hides when nothing is left.
 */
import type { StringKey } from "../../lib/i18n";
import { canOpen, type ViewRole } from "../../lib/role";

export type SetupFacts = {
  role: ViewRole;
  /** null while the Zoho status is still loading, or Zoho is not offered to this company. */
  zohoConnected: boolean | null;
  zohoOffered: boolean;
  audioChecked: boolean;
  playbookEntries: number;
  seatsUsed: number;
  messagingConnected: boolean;
  markedDone: readonly string[];
};

export type SetupStep = {
  id: string;
  roles: readonly ViewRole[];
  label: StringKey;
  href: string;
  /** Hidden from the list entirely (not offered, still loading). */
  hidden?: (f: SetupFacts) => boolean;
  done: (f: SetupFacts) => boolean;
};

export const SETUP_STEPS: readonly SetupStep[] = [
  {
    id: "zoho",
    roles: ["agent"],
    label: "setup.zoho",
    href: "/settings#zoho",
    hidden: (f) => !f.zohoOffered || f.zohoConnected === null,
    done: (f) => f.zohoConnected === true,
  },
  {
    id: "audio",
    roles: ["agent"],
    label: "setup.audio",
    href: "/call?check=audio",
    done: (f) => f.audioChecked,
  },
  // Owner Q15: "Try a practice call" goes here once practice in real accounts is decided.
  {
    id: "playbook",
    roles: ["manager", "admin"],
    label: "setup.playbook",
    href: "/playbook",
    done: (f) => f.playbookEntries > 0,
  },
  {
    id: "invite",
    roles: ["admin"],
    label: "setup.invite",
    href: "/admin",
    done: (f) => f.seatsUsed > 1,
  },
  {
    id: "messaging",
    roles: ["admin"],
    label: "setup.messaging",
    href: "/admin/integrations",
    done: (f) => f.messagingConnected,
  },
];

/** This role's steps (and how many there are in all), with the done ones left out. */
export function setupFor(
  facts: SetupFacts,
  steps: readonly SetupStep[] = SETUP_STEPS,
): { pending: SetupStep[]; total: number } {
  const mine = steps.filter(
    (s) =>
      s.roles.includes(facts.role) &&
      canOpen(facts.role, s.href.split(/[?#]/)[0] ?? s.href) &&
      !s.hidden?.(facts),
  );
  const pending = mine.filter((s) => !s.done(facts) && !facts.markedDone.includes(s.id));
  return { pending, total: mine.length };
}
