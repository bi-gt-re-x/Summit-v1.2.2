/**
 * What Summit has worked out about this account, said as facts about a person.
 *
 * ## Why a page of charts needs this
 *
 * Everything else on the analytics page is a reading of a *period*: this
 * window against the last, this week's tasks, this month's score. All of it is
 * true and none of it accumulates into a picture of anybody. A reader can look
 * at eleven panels and still not be able to say what Summit thinks they are
 * like — which is the difference between a dashboard and a model of the user,
 * and it is the whole reason a product like this is worth returning to.
 *
 * So these are statements about the reader rather than about the window. Four
 * of them at most, each one sentence, each second person, each counted off
 * something already on the page. Nothing here is new evidence; it is the
 * evidence already gathered, said in the first person plural about somebody
 * rather than in the third person about a chart.
 *
 * ## Every one of them has a floor, and the floors are not decorative
 *
 * "You average 4.2 tasks per active day" over a single active day is not an
 * average, it is that day. "Mathematics is 100% of your recorded work" on an
 * account with one subject is a tautology dressed as a finding. Each fact
 * below states what it needs, and a fact that cannot clear its floor is simply
 * absent — the section shrinks rather than padding itself out, and on a very
 * new account it does not draw at all.
 *
 * ## Current focus only when it is news
 *
 * The most-worked subject overall and the most-worked subject lately are
 * usually the same one, and printing both is a section that repeats itself
 * with a different heading. The focus line appears only when the recent answer
 * differs from the all-time one — at which point it is the most interesting
 * sentence here, because it is the only one that says something has changed.
 */

export interface Knowledge {
  key: string;
  /** The quiet heading above it: "Workload", "Consistency". */
  heading: string;
  /** The fact itself. One sentence, about the reader. */
  text: string;
}

export interface KnowsInput {
  /** Tasks finished in the window. */
  finished: number;
  /** Days in the window with work on them. */
  activeDays: number;
  /**
   * Calendar days from the first day with work on it to the last row of the
   * series — how long this account has been going, as opposed to how much of
   * it was worked.
   *
   * `dataMaturity` computes this and then uses it for nothing: it is context
   * and never a gate, which was the right call and left it unsaid anywhere a
   * reader could see it. It is the most useful sentence on a young account —
   * it is the one that says a record is being kept at all, and that the days
   * in between were not held against them.
   */
  spanDays: number;
  /** Every day in the window, worked or not. The consistency denominator. */
  windowDays: number;
  /**
   * Subjects by finished tasks, biggest first. `name` is what the reader
   * called it, never an id.
   */
  subjects: Array<{ name: string; count: number }>;
  /** The most-worked subject over the recent stretch, when that is known. */
  recentTop: string | null;
}

/** An average needs more than the one day it would otherwise be. */
export const WORKLOAD_FLOOR = 2;

/**
 * Days on the calendar before "how long you have been here" is worth saying.
 *
 * Five. Under that the sentence is telling somebody something they learned
 * this week and remember perfectly well.
 */
export const RECORD_FLOOR = 5;

/** Below this the rate is a fortnight's mood rather than a habit. */
export const CONSISTENCY_FLOOR = 7;

/**
 * A share is only a finding when there was something to share it with. One
 * subject at 100% says nothing about the reader and everything about the fact
 * that they have one subject.
 */
export const SUBJECT_FLOOR = 2;

export function whatSummitKnows(input: KnowsInput): Knowledge[] {
  const { finished, activeDays, spanDays, windowDays, subjects, recentTop } = input;
  const found: Knowledge[] = [];

  /* First, because it frames every figure under it: the others are rates and
     shares, and this is the length of the record they are rates of. */
  if (spanDays >= RECORD_FLOOR && activeDays > 0) {
    found.push({
      key: 'record',
      heading: 'Record',
      text:
        activeDays >= spanDays
          ? `You have worked on every one of your ${spanDays} days with Summit.`
          : `You have been using Summit for ${spanDays} days, and worked on ${activeDays} of them.`,
    });
  }

  if (activeDays >= WORKLOAD_FLOOR && finished > 0) {
    const perDay = finished / activeDays;
    found.push({
      key: 'workload',
      heading: 'Workload',
      /* Against active days, not calendar days — the same denominator every
         gate on this page uses, so a reader who skips a week does not appear
         to have got slower. See utils/activeDay. */
      text: `You average ${perDay.toFixed(1)} tasks on the days you work.`,
    });
  }

  if (windowDays >= CONSISTENCY_FLOOR && activeDays > 0) {
    found.push({
      key: 'consistency',
      heading: 'Consistency',
      text: `You have worked on ${activeDays} of the last ${windowDays} days.`,
    });
  }

  const named = subjects.filter((row) => row.count > 0);
  const total = named.reduce((sum, row) => sum + row.count, 0);
  const top = named[0];

  if (top && named.length >= SUBJECT_FLOOR && total > 0) {
    const share = Math.round((top.count / total) * 100);
    found.push({
      key: 'subjects',
      heading: 'Subjects',
      text: `${top.name} is ${share}% of your recorded work.`,
    });
  }

  /* Only when it is not the sentence above with a different heading. */
  if (recentTop && top && recentTop !== top.name) {
    found.push({
      key: 'focus',
      heading: 'Current focus',
      text: `Lately you have been working on ${recentTop} most.`,
    });
  }

  return found;
}
