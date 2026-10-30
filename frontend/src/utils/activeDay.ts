/**
 * What makes a day count. One definition, for the whole app.
 *
 * ## The question this settles
 *
 * Half the figures on the analytics page are "days you worked" over "days
 * there were" — the consistency tile, the rate on the heatmap panel, the
 * baseline's days-a-week row, the gaps a recommendation is priced off, and
 * every gate on the page. All of them were counting, and none of them agreed
 * about what counting meant. There were five definitions in the client:
 *
 *     dataMaturity      XP, or a finished task, or focus minutes
 *     behaviour         XP only  (the rhythm, the gaps, the week shape)
 *     Analytics/data    XP only  (the consistency tile and panel)
 *     diagnosis         XP, or a finished task
 *     growthSummary     XP only  (the Active Days line)
 *
 * Nothing about any of those is wrong on its own, and the difference is
 * invisible until you meet the reader it is wrong for. **Focus sessions earn
 * no XP** — there is no ledger event behind a timer, by design — so somebody
 * who sits down for two hours and logs it, without ticking a task off, has
 * done a day's work that four of those five definitions cannot see. The gates
 * counted their day; the consistency tile beside the gates did not. The page
 * was telling one person two different things about the same Tuesday.
 *
 * So: **a day is active when any one of three things happened on it.**
 *
 *     a task was finished
 *     a focus session was logged
 *     any XP was earned
 *
 * Any one. Not all three, not two, and no minimum on the size of it — one
 * task, one session, one point. They are three ways of doing the same thing,
 * and an account that logs focus without finishing tasks is telling us about
 * itself just as clearly as one that does the reverse.
 *
 * ## What is deliberately not in the list
 *
 * `rated_tasks`. The rating prompt is optional and skipping it is a supported
 * answer, so requiring it would make a gate out of a question the reader is
 * allowed to ignore.
 *
 * Opening the app. Reading a page is not work, and a definition that counted
 * it would turn every gate on the analytics page into a measure of how often
 * somebody checked their analytics.
 *
 * ## Where the count is used
 *
 * The five stages in utils/dataMaturity are floors on this count, and that is
 * the whole point of them: 3, 7, 14 and 30 are **days of your work**, never
 * days on the calendar. An account opened five weeks ago and used twice has
 * two, not thirty-five. See the note at the top of that file for the bug that
 * came from reading the wrong one.
 */
import type { GrowthDay } from '@/types';

/** The three things, as the reader is told them. Kept beside the predicate so
 *  the sentence on screen and the rule behind it cannot drift apart. */
export const ACTIVE_DAY_MEANS = 'finish a task, log focus time or earn XP';

/**
 * Whether anything at all was recorded on this day.
 *
 * Every count of "days worked" in the app goes through here. A day the series
 * padded with zeros — `series` in backend/tracking/growth.py emits a row for
 * every calendar day, worked or not — answers false, which is what keeps a
 * quiet month from inflating any of the figures above.
 */
export function isActiveDay(day: GrowthDay): boolean {
  return (
    (Number(day.tasks_completed) || 0) > 0 ||
    (Number(day.focus_minutes) || 0) > 0 ||
    (Number(day.xp_earned) || 0) > 0
  );
}

/** How many of these days had work on them. */
export function countActiveDays(days: GrowthDay[]): number {
  return days.reduce((count, day) => count + (isActiveDay(day) ? 1 : 0), 0);
}

/**
 * Share of the days given that were worked, 0-100.
 *
 * The denominator is every day in the range, worked or not — that is what
 * makes it consistency rather than a count. An empty range is 0 rather than a
 * division nobody did.
 */
export function activeRate(days: GrowthDay[]): number {
  if (days.length === 0) return 0;
  return (countActiveDays(days) / days.length) * 100;
}
