/**
 * The work itself, as a short list the model can read.
 *
 * ## What this fixes
 *
 * Everything else the reading is built from is a *measurement*: execution is
 * 47, the curve falls off at Hard, 88 tasks were finished quickly and rated
 * poorly. All of it true, none of it about anything. A model handed only that
 * knows the shape of the record and nothing whatsoever about the work, so the
 * best next step it can write is the shape said back as an instruction:
 *
 *     Focused Easy Execution Practice
 *     Solve 10 Easy algorithm problems
 *
 * That is not advice. It is the difficulty curve with a verb in front of it,
 * and it is what "recommend something specific" has been asking for. The
 * missing input is not a cleverer prompt — it is that nothing in the brief
 * ever said what the reader is actually doing. The titles say. Twelve rows of
 * "MATHCOUNTS Sprint 21-30", "AMC10 2019 #14", "Mock test, 75 min" are what
 * turn the same curve into "stop drilling Sprint-round arithmetic and start
 * on intermediate AMC10, timed".
 *
 * ## Why a sample, and why the recent end of it
 *
 * The aggregates already cover the window. This is not here to be counted
 * again — `state.ts` has done that, and done it over every task rather than
 * over forty. It is here to say what the work *is*, and the question the
 * panel answers is "what should I do next", which is a question about what is
 * being done now. So: the most recent `SAMPLE`, newest first.
 *
 * Cheap, too, and deliberately: this is a slice of a list the page already
 * holds, computed only when the reader presses the button. Nothing is
 * fetched, nothing is stored, and a subject with four tasks sends four rows.
 */
import { qualityOf, reasonOf } from '@/utils/ratings';
import { spanFor } from './model';
import type { WindowKey } from '@/components/Analytics/data';
import type { AnalyticsTask, WorkGroup } from '@/services/analytics';
import { secondsSpent } from '@/utils/timeSpent';

/**
 * How many rows go up.
 *
 * Forty is about six hundred tokens against a sixteen-thousand budget, which
 * is not the constraint. The constraint is that a long list is a list the
 * model starts summarising instead of reading, and forty recent tasks is
 * already several weeks of work for an ordinary account — enough to see what
 * the material is, what got rated badly, and whether the level has moved.
 */
export const SAMPLE = 40;

/** One finished task, as the brief prints it. */
export interface WorkSample {
  /** So the server can look up the note without the client sending one. */
  id: string;
  title: string;
  /** ISO day it was finished. */
  on: string;
  /** 1-5, or null when that row of the prompt went unanswered. */
  difficulty: number | null;
  execution: number | null;
  /** Whole minutes it took, or null when nothing was timed against it. */
  minutes: number | null;
  /**
   * What the reader said made the difference, in the words the page shows —
   * "Kept getting interrupted", not `interrupted`. The same spelling
   * `<mistake_patterns>` uses, so the model reads one vocabulary rather than
   * having to match a key against a label. Empty when they were not asked.
   */
  reason: string;
}

function dayOf(stamp: string | undefined): string {
  return (stamp ?? '').slice(0, 10);
}

function within(day: string, from: string, to: string): boolean {
  if (!day) return false;
  if (from && day < from) return false;
  return !to || day <= to;
}

function levelOf(value: number | undefined): number | null {
  const level = Number(value);
  if (!Number.isFinite(level) || level < 1 || level > 5) return null;
  return Math.round(level);
}

/**
 * The most recently finished tasks in this subject's window, newest first.
 *
 * `today` is passed rather than read from the clock, for the reason
 * `subjectState` gives: a pure function of its inputs is one a test can pin a
 * window against without a calendar around it.
 */
export function recentWork(
  all: AnalyticsTask[],
  subjectId: string,
  key: WindowKey,
  today: string,
  most: number = SAMPLE,
): WorkSample[] {
  const span = spanFor(key, today);

  return all
    .filter(
      (task) =>
        task.subject === subjectId &&
        task.status === 'done' &&
        within(dayOf(task.completed_at), span.from, span.to),
    )
    /* Newest first. `/api/analytics/tasks` already sends them in this order
       and nothing here should depend on that — the page slices the window in
       the browser and several panels re-sort. */
    .sort((a, b) => dayOf(b.completed_at).localeCompare(dayOf(a.completed_at)))
    .slice(0, Math.max(0, most))
    .map((task) => {
      // Time spent, not `completion_seconds` raw — see utils/timeSpent.
      const seconds = secondsSpent(task) ?? 0;
      return {
        id: task.id,
        title: task.title ?? '',
        on: dayOf(task.completed_at),
        /* Both rows or neither, the same rule `qualityOf` keeps: half an
           answer is a real answer to the row it was given for, but it is not
           a rating, and a brief that prints one alongside a blank invites the
           model to read the blank as a low score. */
        difficulty: qualityOf(task as never) === null ? null : levelOf(task.difficulty),
        execution: qualityOf(task as never) === null ? null : levelOf(task.execution),
        minutes:
          Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds / 60) : null,
        reason: reasonOf(task.reason)?.reason.label ?? '',
      };
    });
}

// --------------------------------------------------------------------------
// Everything, grouped by name
// --------------------------------------------------------------------------
/**
 * How many name groups go up. The page sends the largest; a subject with more
 * distinct kinds of task than this has a long tail of one-offs, and the model
 * is better served by the material the reader keeps returning to.
 */
export const GROUPS = 25;

/**
 * A title with its numbers blanked, so ranges and years of the same material
 * fold into one group: "MATHCOUNTS Sprint 21-30" and "MATHCOUNTS Sprint 1-10"
 * are both "MATHCOUNTS Sprint #", and "AMC10 2019 #14" is "AMC10 #".
 *
 * A word with a letter in it is kept whole, so AMC8, AMC10 and AMC12 stay
 * three groups — they are three different papers, not one with a number on
 * it. Only the tokens that are nothing but numbers and punctuation become `#`.
 */
export function nameFamily(title: string): string {
  const words = title
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (/[A-Za-z]/.test(word) ? word : '#'));
  return words.filter((word, at) => !(word === '#' && words[at - 1] === '#')).join(' ');
}

/** One decimal, or null over nothing. */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

/**
 * Every finished task in this subject's window, grouped by name and counted.
 *
 * The sample above is the newest forty, which says what the work is now. This
 * is all of it, so the model can see which material has stopped teaching the
 * reader anything (done often, filed easy, rated 5), which is going badly
 * (filed hard, rated 2), which takes longest, and which ranges and papers are
 * already done — the last of which is what lets a step name the *next* range
 * rather than one the reader has finished.
 *
 * Largest groups first. The brief orders them again by how they went and how
 * long they took; see `work_groups` in backend/tracking/subject_ai.py.
 */
export function workGroups(
  all: AnalyticsTask[],
  subjectId: string,
  key: WindowKey,
  today: string,
  most: number = GROUPS,
): WorkGroup[] {
  const span = spanFor(key, today);
  const groups = new Map<string, { name: string; rows: AnalyticsTask[] }>();

  const finished = all
    .filter(
      (task) =>
        task.subject === subjectId &&
        task.status === 'done' &&
        (task.title ?? '').trim() !== '' &&
        within(dayOf(task.completed_at), span.from, span.to),
    )
    .sort((a, b) => dayOf(b.completed_at).localeCompare(dayOf(a.completed_at)));

  for (const task of finished) {
    const name = nameFamily(task.title ?? '');
    const id = name.toLowerCase();
    const group = groups.get(id) ?? { name, rows: [] };
    group.rows.push(task);
    groups.set(id, group);
  }

  return [...groups.values()]
    .sort((a, b) => b.rows.length - a.rows.length)
    .slice(0, Math.max(0, most))
    .map(({ name, rows }) => {
      const rated = rows.filter((task) => qualityOf(task as never) !== null);
      const execution = rated.map((task) => levelOf(task.execution)).filter((v): v is number => v !== null);
      const difficulty = rated.map((task) => levelOf(task.difficulty)).filter((v): v is number => v !== null);
      const minutes = rows
        .map((task) => secondsSpent(task))
        .filter((seconds): seconds is number => seconds !== null)
        .map((seconds) => seconds / 60);

      const reasons = new Map<string, number>();
      for (const task of rows) {
        const label = reasonOf(task.reason)?.reason.label;
        if (label) reasons.set(label, (reasons.get(label) ?? 0) + 1);
      }

      const averageMinutes = mean(minutes);
      return {
        name,
        count: rows.length,
        examples: [...new Set(rows.map((task) => (task.title ?? '').trim()))].slice(0, 4),
        rated: rated.length,
        difficulty: mean(difficulty),
        execution: mean(execution),
        minutes: averageMinutes === null ? null : Math.round(averageMinutes),
        well: execution.filter((value) => value >= 4).length,
        badly: execution.filter((value) => value <= 2).length,
        reasons: [...reasons]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([label, count]) => `${label} ×${count}`),
        last: dayOf(rows[0]?.completed_at),
      };
    });
}
