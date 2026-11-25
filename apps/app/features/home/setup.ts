/**
 * First-run steps on Home (UX-10, ZC-09) and the full Setup Guide (L2):
 * what each role still has to do before the product works, each with plain-language guidance
 * ("what this does" + recommended default), live status, a Test it check, and a Fix it link.
 */
import type { StringKey } from "../../lib/i18n";
import { canOpen, type ViewRole } from "../../lib/role";
import type { HomeTextKey } from "./strings";

export type SetupFacts = {
  role: ViewRole;
  /** null while the Zoho status is still loading, or Zoho is not offered to this company. */
  zohoConnected: boolean | null;
  zohoOffered: boolean;
  audioChecked: boolean;
  playbookEntries: number;
  seatsUsed: number;
  messagingConnected: boolean;
  /** D-073: the server's bundle carries the practice script. */
  practiceOffered: boolean;
  markedDone: readonly string[];
};

export type SetupStep = {
  id: string;
  roles: readonly ViewRole[];
  /** An i18n key, or a Home-local one (features/home/strings.ts, D-058). */
  label: StringKey | HomeTextKey;
  /** Plain-language title for the Setup Guide screen (L2). */
  title?: string;
  /** One-line "what this does" description (L2). */
  whatItDoes?: string;
  /** Recommended default shown beside the setting/step (L2). */
  recommendedDefault?: string;
  href: string;
  /** Hidden from the list entirely (not offered, still loading). */
  hidden?: (f: SetupFacts) => boolean;
  done: (f: SetupFacts) => boolean;
  /** Live status line shown in the Setup Guide (e.g. "Zoho: connected ✓"). */
  statusLine?: (f: SetupFacts) => string;
};

export const SETUP_STEPS: readonly SetupStep[] = [
  {
    id: "zoho",
    roles: ["agent", "manager", "admin"],
    label: "setup.zoho",
    title: "Zoho CRM",
    whatItDoes: "Pulls customer context before each call and logs approved notes after.",
    recommendedDefault: "Connected per agent",
    href: "/settings#zoho",
    hidden: (f) => !f.zohoOffered || f.zohoConnected === null,
    done: (f) => f.zohoConnected === true,
    statusLine: (f) => (f.zohoConnected ? "Zoho: connected ✓" : "Zoho: not set up"),
  },
  {
    id: "audio",
    roles: ["agent", "manager", "admin"],
    label: "setup.audio",
    title: "Microphone & call audio",
    whatItDoes: "Verifies customer audio is captured separately from your microphone (R4).",
    recommendedDefault: "Separate customer & agent tracks",
    href: "/call?check=audio",
    done: (f) => f.audioChecked,
    statusLine: (f) => (f.audioChecked ? "Audio: ready ✓" : "Audio: not tested yet"),
  },
  {
    id: "practice",
    roles: ["agent", "manager", "admin"],
    label: "setup.practice",
    title: "Practice call",
    whatItDoes:
      "Runs a 60-second simulated call so you can see live cards before calling a customer.",
    recommendedDefault: "Recommended once before first live call",
    href: "/call?practice=1",
    hidden: (f) => !f.practiceOffered,
    done: (f) => f.markedDone.includes("practice"),
    statusLine: (f) =>
      f.markedDone.includes("practice") ? "Practice: completed ✓" : "Practice: not tried yet",
  },
  {
    id: "playbook",
    roles: ["manager", "admin"],
    label: "setup.playbook",
    title: "Sales playbook",
    whatItDoes: "Gives instant, company-approved answers to pricing and objection questions.",
    recommendedDefault: "At least 5 top FAQ & objection entries",
    href: "/playbook",
    done: (f) => f.playbookEntries > 0,
    statusLine: (f) =>
      f.playbookEntries > 0 ? `Playbook: ${f.playbookEntries} entries ready ✓` : "Playbook: empty",
  },
  {
    id: "invite",
    roles: ["admin"],
    label: "setup.invite",
    title: "Team seats",
    whatItDoes: "Invites your sales agents and managers with role-scoped access (R3).",
    recommendedDefault: "Invite active reps before rollout",
    href: "/admin",
    done: (f) => f.seatsUsed > 1,
    statusLine: (f) =>
      f.seatsUsed > 1 ? `Team: ${f.seatsUsed} seats active ✓` : "Team: only 1 seat so far",
  },
  {
    id: "messaging",
    roles: ["admin"],
    label: "setup.messaging",
    title: "Email & WhatsApp",
    whatItDoes: "Connects your approved sender and WhatsApp templates for post-call follow-ups.",
    recommendedDefault: "Connected with approved templates",
    href: "/admin/integrations",
    done: (f) => f.messagingConnected,
    statusLine: (f) =>
      f.messagingConnected ? "WhatsApp / Email: connected ✓" : "WhatsApp / Email: not set up",
  },
];

/** All visible steps for this role (both done and pending), used by the Setup Guide (L2). */
export function guideStepsFor(
  facts: SetupFacts,
  steps: readonly SetupStep[] = SETUP_STEPS,
): SetupStep[] {
  return steps.filter(
    (s) =>
      s.roles.includes(facts.role) &&
      canOpen(facts.role, s.href.split(/[?#]/)[0] ?? s.href) &&
      !s.hidden?.(facts),
  );
}

/** This role's steps (and how many there are in all), with the done ones left out. */
export function setupFor(
  facts: SetupFacts,
  steps: readonly SetupStep[] = SETUP_STEPS,
): { pending: SetupStep[]; total: number } {
  // Keep Home checklist scoped to the original concise per-role steps while full guide shows all.
  const mine = guideStepsFor(facts, steps).filter((s) =>
    facts.role === "agent" ? true : s.id !== "zoho" && s.id !== "audio",
  );
  const pending = mine.filter((s) => !s.done(facts) && !facts.markedDone.includes(s.id));
  return { pending, total: mine.length };
}
