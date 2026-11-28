/**
 * First-run steps on Home (UX-10, ZC-09) and the full Setup Guide (L2):
 * what each role still has to do before the product works, each with plain-language guidance
 * ("what this does" + recommended default), live status, a Test it check, and a Fix it link.
 * Every text is a Home string key (features/home/strings.ts), in English and Arabic.
 */
import { countKey, type StringKey } from "../../lib/i18n";
import { canOpen, type ViewRole } from "../../lib/role";
import { HOME_TEXT, type HomePhrase, type HomeTextKey } from "./strings";

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
  title?: HomeTextKey;
  /** One-line "what this does" description (L2). */
  whatItDoes?: HomeTextKey;
  /** Recommended default shown beside the setting/step (L2). */
  recommendedDefault?: HomeTextKey;
  href: string;
  /** Hidden from the list entirely (not offered, still loading). */
  hidden?: (f: SetupFacts) => boolean;
  done: (f: SetupFacts) => boolean;
  /** Live status line shown in the Setup Guide (e.g. "Zoho: connected ✓"). */
  statusLine?: (f: SetupFacts) => HomePhrase;
};

/** A count line, in its ".one" form for exactly one where the table has it. */
const counted = (key: HomeTextKey, n: number): HomePhrase => ({
  key: countKey(key, n, HOME_TEXT.en),
  vars: { n },
});

export const SETUP_STEPS: readonly SetupStep[] = [
  {
    id: "zoho",
    roles: ["agent", "manager", "admin"],
    label: "setup.zoho",
    title: "guide.zoho.title",
    whatItDoes: "guide.zoho.what",
    recommendedDefault: "guide.zoho.default",
    href: "/settings#zoho",
    hidden: (f) => !f.zohoOffered || f.zohoConnected === null,
    done: (f) => f.zohoConnected === true,
    statusLine: (f) => ({ key: f.zohoConnected ? "guide.zoho.on" : "guide.zoho.off" }),
  },
  {
    id: "audio",
    roles: ["agent", "manager", "admin"],
    label: "setup.audio",
    title: "guide.audio.title",
    whatItDoes: "guide.audio.what",
    recommendedDefault: "guide.audio.default",
    href: "/call?check=audio",
    done: (f) => f.audioChecked,
    statusLine: (f) => ({ key: f.audioChecked ? "guide.audio.on" : "guide.audio.off" }),
  },
  {
    id: "practice",
    roles: ["agent", "manager", "admin"],
    label: "setup.practice",
    title: "guide.practice.title",
    whatItDoes: "guide.practice.what",
    recommendedDefault: "guide.practice.default",
    href: "/call?practice=1",
    hidden: (f) => !f.practiceOffered,
    done: (f) => f.markedDone.includes("practice"),
    statusLine: (f) => ({
      key: f.markedDone.includes("practice") ? "guide.practice.on" : "guide.practice.off",
    }),
  },
  {
    id: "playbook",
    roles: ["manager", "admin"],
    label: "setup.playbook",
    title: "guide.playbook.title",
    whatItDoes: "guide.playbook.what",
    recommendedDefault: "guide.playbook.default",
    href: "/playbook",
    done: (f) => f.playbookEntries > 0,
    statusLine: (f) =>
      f.playbookEntries > 0
        ? counted("guide.playbook.on", f.playbookEntries)
        : { key: "guide.playbook.off" },
  },
  {
    id: "invite",
    roles: ["admin"],
    label: "setup.invite",
    title: "guide.invite.title",
    whatItDoes: "guide.invite.what",
    recommendedDefault: "guide.invite.default",
    href: "/admin",
    done: (f) => f.seatsUsed > 1,
    statusLine: (f) =>
      f.seatsUsed > 1 ? counted("guide.invite.on", f.seatsUsed) : { key: "guide.invite.off" },
  },
  {
    id: "messaging",
    roles: ["admin"],
    label: "setup.messaging",
    title: "guide.messaging.title",
    whatItDoes: "guide.messaging.what",
    recommendedDefault: "guide.messaging.default",
    href: "/admin/integrations",
    done: (f) => f.messagingConnected,
    statusLine: (f) => ({
      key: f.messagingConnected ? "guide.messaging.on" : "guide.messaging.off",
    }),
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
