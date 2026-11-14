/**
 * Checks on a follow-up before it is sent (UX-22): the text promises an attachment that the
 * email does not have (none of the admin's files is attached, INT-14b), or still holds a
 * [placeholder] the model or the default format left for the agent or admin to fill in.
 */
const ATTACHED = /\b(attach(ed|ment|ments|ing)?|enclosed)\b|مرفق/i;
const PLACEHOLDER = /\[[^\]\n]{1,80}\]/g;

export type FollowUpWarnings = { attached: boolean; placeholders: string[] };

export function followUpWarnings(text: string, attachments = 0): FollowUpWarnings {
  return {
    attached: attachments === 0 && ATTACHED.test(text),
    placeholders: [...new Set(text.match(PLACEHOLDER) ?? [])],
  };
}
