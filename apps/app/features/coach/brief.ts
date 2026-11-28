/**
 * UX-002: the Morning brief's lines, built from its parts. The server's sentence named every
 * upcoming meeting "Today's meetings", so Monday's meetings read as Friday's. Days are Dubai days,
 * like every date in the app (lib/format.ts).
 */
import { daysFromToday, formatWeekday } from "../../lib/format";
import type { Locale } from "../../lib/i18n";
import type { MorningBrief } from "./api";
import type { CoachText } from "./strings";

/** How many of today's meetings the line names. */
const NAMED = 4;

export function briefLines(
  content: MorningBrief["content"],
  tc: CoachText,
  locale: Locale,
  now: Date = new Date(),
): string[] {
  // A brief saved before it had parts: only its sentence.
  if (!Array.isArray(content.meetings)) return [content.summary_text];
  const dated = content.meetings.flatMap((m) => {
    if (!m.start) return [];
    const days = daysFromToday(m.start, now);
    return days === null ? [] : [{ title: m.title, start: m.start, days }];
  });
  const lines: string[] = [];
  const today = dated.filter((m) => m.days === 0);
  const later = dated
    .filter((m) => m.days > 0)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (today.length > 0) {
    // Titles are often Latin inside an Arabic line: isolate each (FSI … PDI, UX-41).
    const titles = today
      .slice(0, NAMED)
      .map((m) => `⁨${m.title}⁩`)
      .join(locale === "ar" ? "، " : ", ");
    lines.push(tc("brief.today", { count: today.length, titles }));
  } else if (later[0]) {
    lines.push(tc("brief.noneToday", { day: formatWeekday(later[0].start, locale) }));
  }
  if (content.tip) lines.push(tc("brief.tip", { tip: content.tip }));
  return lines;
}
