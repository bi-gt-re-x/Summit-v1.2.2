/**
 * Everything the dashboard's cards are counted from, in one place.
 *
 * These are pure functions over the task list the page already has, and that
 * is deliberate: the dashboard makes one call (`/api/get_user_data`) and every
 * panel on it — today's ring, the tabs, the weekly numbers, the priorities,
 * the activity feed — is a different question asked of that one answer. No
 * panel fetches for itself, so none of them can disagree about what a task is.
 *
 * The one rule running through all of it: **days are local ISO dates, compared
 * as strings.** A stored stamp is `2026-07-30T09:26:31`, so `.slice(0, 10)` is
 * its day and `'2026-07-28' <= day` is a date comparison that never builds a
 * Date and therefore never drifts a timezone. See utils/dates.ts for why
 * `toISOString()` is not allowed near a day key.
 */
import { isCalendarPlaced } from '@/utils/calendarGrid';
import type { Task, TaskPriority } from '@/types';
import type { Spanned } from '@/utils/dayShape';

/** The day part of a stored timestamp, or '' when there is not one. */
function dayOf(stamp: string | undefined): string {
  return (stamp || '').slice(0, 10);
}

function xpOf(task: Task): number {
  return Number(task.xp_value) || 0;
}

// --------------------------------------------------------------------------
// Priority
// --------------------------------------------------------------------------
export interface PriorityMeta {
  /** 'High' | 'Medium' | 'Low' */
  label: string;
  /** The modifier the stylesheet colours the dot and the badge from. */
  tone: 'high' | 'med' | 'low';
}

/**
 * How a task's priority is written and coloured.
 *
 * This is what fills the coloured line under a task's title. The design it
 * came from showed a *category* there — Personal, Math, Coding — but tasks
 * have no category: the columns are title, description, priority, status,
 * xp_value, due_date and the timer pair (data/sql/tasks.sql). Priority is the
 * field that is actually there, so priority is what is shown.
 */
export function priorityMeta(priority: TaskPriority | string): PriorityMeta {
  const value = String(priority || '').toLowerCase();
  if (value === 'high') return { label: 'High', tone: 'high' };
  if (value === 'medium') return { label: 'Medium', tone: 'med' };
  return { label: 'Low', tone: 'low' };
}

// --------------------------------------------------------------------------
// The tabs
// --------------------------------------------------------------------------
export interface TaskBuckets {
  /** Open and wanted now: due today, overdue, or carrying no date at all. */
  today: Task[];
  /** Open and dated after today. */
  upcoming: Task[];
  /** Finished, most recently first. */
  completed: Task[];
}

/**
 * Split the task list into the three tabs.
 *
 * "Today" means *on today's plate*, not *dated today* — an overdue task is
 * still today's problem, and an undated one has never been anything else. The
 * alternative reading, tasks whose due date is literally today, would hide
 * five overdue tasks behind a tab nobody would think to open.
 *
 * The split matters here more than it would on a smaller account: of 244 open
 * tasks, six are on today's plate and 238 are scheduled out to December. A
 * single undivided list is not a list anyone can read.
 */
export function bucketTasks(tasks: Task[], todayIso: string): TaskBuckets {
  const buckets: TaskBuckets = { today: [], upcoming: [], completed: [] };

  tasks.forEach((task) => {
    if (task.status === 'done') {
      buckets.completed.push(task);
      return;
    }
    if (task.status !== 'todo') return; // 'expired' belongs to no tab
    const due = dayOf(task.due_date);
    if (!due || due <= todayIso) buckets.today.push(task);
    else buckets.upcoming.push(task);
  });

  buckets.today.sort(byDueDate);
  buckets.upcoming.sort(byDueDate);
  // Completions have no order of their own in the table, and a task finished
  // before completion times were recorded has no stamp at all — those sort to
  // the bottom rather than jumbling the ones that do.
  buckets.completed.sort(
    (a, b) => dayStampValue(b.completed_at) - dayStampValue(a.completed_at),
  );

  return buckets;
}

/** Undated tasks lead: nothing is holding them to a later day. */
function byDueDate(a: Task, b: Task): number {
  const left = a.due_date || '';
  const right = b.due_date || '';
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function dayStampValue(stamp: string | undefined): number {
  if (!stamp) return 0;
  const time = new Date(stamp).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * A task belongs to the calendar half of a tab when it is scheduled.
 *
 * The same test the page has always used — `show_on_calendar` *and* a due
 * date — but no longer a second copy of it. It is the calendar's own predicate
 * now, so a task filed under this page's "Calendar Tasks" heading is exactly a
 * task the calendar will draw, and a to-do is exactly one it will not. Two
 * spellings of one rule is how the heading ends up disagreeing with the grid.
 */
export function isCalendarTask(task: Task): boolean {
  return isCalendarPlaced(task);
}

// --------------------------------------------------------------------------
// Today's Progress
// --------------------------------------------------------------------------
export interface DaySummary {
  /** On today's plate: open and due-or-undated, plus whatever was finished. */
  total: number;
  done: number;
  xp: number;
  /** 0-100, rounded. */
  percent: number;
}

/**
 * Today, honestly.
 *
 * The design this card came from showed 13 / 9 / 69% / 546 XP under the
 * heading "Today's Progress" — but those are the *week's* figures, the same
 * four the Weekly Overview card below shows, and the two cards read
 * identically because of it. Only one of them can be about today, so this one
 * is: today's plate against what has actually been finished today.
 *
 * That means the card reads 0% on a day nothing has been completed, which is
 * the point of it.
 */
export function daySummary(tasks: Task[], todayIso: string): DaySummary {
  let open = 0;
  let done = 0;
  let xp = 0;

  tasks.forEach((task) => {
    if (task.status === 'done') {
      if (dayOf(task.completed_at) !== todayIso) return;
      done += 1;
      xp += xpOf(task);
      return;
    }
    if (task.status !== 'todo') return;
    const due = dayOf(task.due_date);
    if (!due || due <= todayIso) open += 1;
  });

  const total = open + done;
  return {
    total,
    done,
    xp,
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}

// --------------------------------------------------------------------------
// Weekly Overview
// --------------------------------------------------------------------------
export interface WeekSummary {
  total: number;
  done: number;
  /** 0-100, rounded. */
  rate: number;
  xp: number;
}

/**
 * The week's four numbers — `daySummary` above, over seven days.
 *
 * **Completed and XP Earned are counted from completion stamps**, so they say
 * what was done between Monday and Sunday, whenever the task was scheduled.
 * That is the whole correction here. This card used to count the *cohort* of
 * tasks scheduled inside the week and report how many of those were finished,
 * which is a different question and read as a much smaller answer: a week in
 * which six tasks were completed for 241 XP showed "Completed 1" and "XP
 * Earned 72", because five of the six had been scheduled in earlier weeks.
 * Nothing on the card said so, and a figure headed XP Earned that is not the XP
 * you earned is simply wrong.
 *
 * `total` is the week's plate, on the same principle: what is still open and
 * due inside it, plus what has been finished in it. A task that is both is
 * counted once, as done. Overdue and undated tasks are *not* pulled in — the
 * day card does that because an overdue task is genuinely today's problem, but
 * on a seven-day view it would put 47 undated tasks into a total that is meant
 * to describe one week.
 *
 * This is what makes the two cards on the page agree. It also means the figures
 * here no longer match the Week sidebar in the calendar (pages/Calendar/Week),
 * which still counts the cohort and is right to: it is scoped to whichever week
 * is on screen, past ones included, where "what has been completed since" is
 * not a question the view can ask. Same words, two honest answers, because the
 * two views are asking about different things.
 */
/**
 * @param mondayIso The week's first day.
 * @param sundayIso Its last. Pass an earlier day to stop the count short —
 *                  which is what the previous-week comparison does, so that
 *                  three days of this week are held against three of last
 *                  rather than against seven. See `weekBefore`.
 */
export function weekSummary(
  tasks: Task[],
  mondayIso: string,
  sundayIso: string,
): WeekSummary {
  let open = 0;
  let done = 0;
  let xp = 0;

  tasks.forEach((task) => {
    if (task.status === 'done') {
      // A completion with no stamp — the column was added partway through this
      // account's history — cannot be placed in a week, and '' fails this test
      // rather than needing a case of its own.
      const at = dayOf(task.completed_at);
      if (at < mondayIso || at > sundayIso) return;
      done += 1;
      xp += xpOf(task);
      return;
    }
    if (task.status !== 'todo') return;
    const due = dayOf(task.due_date);
    if (due >= mondayIso && due <= sundayIso) open += 1;
  });

  const total = open + done;
  return {
    total,
    done,
    rate: total ? Math.round((done / total) * 100) : 0,
    xp,
  };
}

/* `topPriorities` stood here — the day's open tasks, hardest first, for a
   dashboard card that turned out to be the task list re-sorted. Both are gone;
   the note where the card was, in ./InsightCards, says why. */

// --------------------------------------------------------------------------
// Recent Activity
// --------------------------------------------------------------------------
export interface Activity {
  id: string;
  title: string;
  xp: number;
  /** The completion stamp, already parsed. */
  at: Date;
}

/**
 * The last few things finished.
 *
 * Only completions carrying a `completed_at` can appear: the column was added
 * partway through this account's history, so 60 of its 99 finished tasks have
 * no stamp. Guessing a time for those would put invented entries at the top of
 * a feed whose whole job is to say when — so they are simply not in it.
 */
export function recentActivity(tasks: Task[], limit = 3): Activity[] {
  return tasks
    .filter((task) => task.status === 'done' && task.completed_at)
    .map((task) => ({
      id: task.id,
      title: task.title || 'Untitled',
      xp: xpOf(task),
      at: new Date(task.completed_at as string),
    }))
    .filter((entry) => !Number.isNaN(entry.at.getTime()))
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}

// --------------------------------------------------------------------------
// The day's shape
// --------------------------------------------------------------------------
/**
 * Today's work as spans, so `dayShape` can be asked about it.
 *
 * The dashboard has the same tasks the calendar draws and had no way to ask
 * the questions a day poses — what is next, how much of the day is spoken for,
 * what finishing the rest is worth. `utils/dayShape` answers all three and
 * takes a structural type, so this is the whole of the adapter.
 *
 * Only work with a **time** takes part. A to-do nobody gave an hour to has no
 * place in a day's shape: it is a list item, which is exactly the distinction
 * `taskCalendarDay` draws for the calendar (utils/calendarIntensity). What is
 * left over is still counted — see `left` and `xp` below, which are about
 * every unfinished task on the day rather than the timed ones.
 *
 * Start comes from `created_at` and end from `due_date`, the same pair
 * `dayEntries` reads for a card in the month panel (components/Calendar/entries).
 * A task whose two ends land on the same minute is given a nominal half hour,
 * so it is a span rather than a point the merge can never see.
 */
export interface DayPlan {
  /** The timed work, for `dayShape`. Empty on a day with no times on it. */
  spans: Spanned[];
  /** Every unfinished task on today's plate, timed or not. */
  left: number;
  /** What finishing all of them is worth. */
  xp: number;
}

/** A stamp as a grid hour, or null when it carries no usable time. */
function gridHour(stamp: string | undefined): number | null {
  if (!stamp) return null;
  const at = new Date(stamp);
  if (Number.isNaN(at.getTime())) return null;
  const hours = at.getHours() + at.getMinutes() / 60;
  // The grid's day runs 6 AM to 5 AM, so the small hours belong to the night
  // before — the same wrap `minutesInGrid` applies in utils/calendarGrid.
  return hours < 6 ? hours + 24 : hours;
}

/** The nominal length of a task whose start and end are the same moment. */
const NOMINAL = 0.5;

export function dayPlan(tasks: Task[], todayIso: string): DayPlan {
  const spans: Spanned[] = [];
  let left = 0;
  let xp = 0;

  tasks.forEach((task) => {
    const due = dayOf(task.due_date);
    if (task.status === 'done') {
      if (dayOf(task.completed_at) !== todayIso) return;
    } else if (task.status !== 'todo' || (due && due > todayIso)) {
      return;
    }

    if (task.status !== 'done') {
      left += 1;
      xp += xpOf(task);
    }

    // Timed work only, and only where the time is actually today's.
    if (due !== todayIso) return;
    const end = gridHour(task.due_date);
    if (end === null) return;
    const started = dayOf(task.created_at) === todayIso ? gridHour(task.created_at) : null;
    const start = started !== null && started < end ? started : end - NOMINAL;

    spans.push({
      kind: 'task',
      start,
      end,
      done: task.status === 'done',
      xp: xpOf(task),
      title: task.title,
    });
  });

  return { spans, left, xp };
}

// --------------------------------------------------------------------------
// What a usual day looks like
// --------------------------------------------------------------------------
/**
 * The account's own average day, so today has something to be measured against.
 *
 * The four stat cards were bare numbers: `6 days`, `Level 10`, `60 XP`. None of
 * them said whether that was a good day or a bad one, which is the only thing
 * a figure about today is actually for — nobody knows off-hand whether 60 XP is
 * a lot for them. The month view has made this comparison for a while
 * (`percentChange` in utils/monthSummary); the dashboard had no baseline to
 * make it against.
 *
 * **Every calendar day in the window counts, including the empty ones.** A mean
 * over "days you did something" is a mean over your good days, and measuring
 * today against it tells almost everybody that they are behind. The honest
 * baseline is the one that includes the days off.
 *
 * **Today is excluded.** A day half-lived would otherwise drag its own
 * baseline down and read as a slump at nine in the morning.
 *
 * A window shorter than the account is old is left alone: the mean is over the
 * days actually in the record, so a three-day-old account is compared against
 * its own three days rather than against eleven days of zero it never lived.
 */
export interface Typical {
  /** Tasks finished on an average day. */
  tasks: number;
  /** XP banked on an average day. */
  xp: number;
  /** How many days went into it. Zero means there is nothing to compare to. */
  days: number;
}

/** The default window: two weeks is two of every weekday. */
export const TYPICAL_DAYS = 14;

export function typicalDay(
  tasks: Task[],
  todayIso: string,
  window = TYPICAL_DAYS,
): Typical {
  /* The earliest day the window reaches, as a string — every comparison in
     this module is string-on-string so nothing here can drift a timezone. */
  const from = new Date(`${todayIso}T00:00:00`);
  from.setDate(from.getDate() - window);
  const fromIso = from.toISOString().slice(0, 10);

  let count = 0;
  let xp = 0;
  let earliest = todayIso;

  tasks.forEach((task) => {
    if (task.status !== 'done') return;
    const day = dayOf(task.completed_at);
    if (!day || day >= todayIso || day < fromIso) return;
    count += 1;
    xp += xpOf(task);
    if (day < earliest) earliest = day;
  });

  if (count === 0) return { tasks: 0, xp: 0, days: 0 };

  /* Days actually covered: the window, or the account's own history if that is
     shorter. `earliest` is the first day with anything on it, which is the
     closest this module can get to "when they started" without another read. */
  const start = new Date(`${earliest}T00:00:00`).getTime();
  const end = new Date(`${todayIso}T00:00:00`).getTime();
  const days = Math.max(1, Math.round((end - start) / 86_400_000));

  return { tasks: count / days, xp: xp / days, days };
}

/**
 * The same week, one week earlier, counted to the same depth.
 *
 * The card said "10 Total Tasks" and left the reader to decide whether ten was
 * a lot. It is a comparison now — but only an honest one if both sides cover
 * the same stretch: on a Wednesday, three days of this week against a full
 * seven of last is not a fall in output, it is a fall in *days*, and every
 * figure would read as a collapse until Sunday. The month view solved this
 * for months (`throughDay` in utils/monthSummary); this is the week's version.
 *
 * `daysIn` is how far into the week the reader has actually got, 1-7. A week
 * already behind them is compared in full.
 */
export function weekBefore(
  tasks: Task[],
  mondayIso: string,
  daysIn: number,
): WeekSummary {
  const monday = new Date(`${mondayIso}T00:00:00`);
  const from = new Date(monday);
  from.setDate(from.getDate() - 7);
  const until = new Date(from);
  until.setDate(until.getDate() + Math.max(0, Math.min(6, daysIn - 1)));

  return weekSummary(
    tasks,
    from.toISOString().slice(0, 10),
    until.toISOString().slice(0, 10),
  );
}

/**
 * How far into the week `todayIso` is, 1-7 — or 7 for a week already over.
 *
 * Counted from the week's own Monday rather than from a weekday number, so it
 * is right for an account whose week opens on Sunday.
 */
export function daysIntoWeek(mondayIso: string, todayIso: string): number {
  const monday = new Date(`${mondayIso}T00:00:00`).getTime();
  const today = new Date(`${todayIso}T00:00:00`).getTime();
  const gap = Math.round((today - monday) / 86_400_000);
  return Math.max(1, Math.min(7, gap + 1));
}
