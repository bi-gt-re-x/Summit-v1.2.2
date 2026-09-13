/**
 * What the tasks page shows, decided here rather than while rendering.
 *
 * Everything in this file is a pure function of the task list and the reader's
 * controls. Nothing fetches, nothing holds state, and nothing knows what a
 * `<div>` is — which is what makes the page's behaviour testable without a
 * browser and what keeps the components to markup and handlers.
 *
 * ## Why a page, when the dashboard already lists tasks
 *
 * The dashboard answers *what should I do right now*, so its list is short,
 * ordered for today, and deliberately hard to get lost in. This page answers
 * *what have I got on*, which is a different question and needs the things the
 * dashboard refuses to grow: a search, filters that stack, a sort the reader
 * chooses, and selection so a dozen tasks can be dealt with at once. The two
 * read the same tasks through the same service; only the questions differ.
 */
import { timeText } from '@/utils/clock';
import type { Task, TaskPriority } from '@/types';
import { isoDate } from '@/utils/dates';
import { XP_BANDS, xpToBand, type XpBand } from '@/utils/priority';

const DAY = 86_400_000;

// --------------------------------------------------------------------------
// The controls
// --------------------------------------------------------------------------
/** Which tasks are on the page at all. */
export type StatusFilter = 'open' | 'done' | 'all';

/** How the list inside each group is ordered. */
export type SortKey = 'due' | 'priority' | 'xp' | 'created' | 'title';

export interface TaskQuery {
  status: StatusFilter;
  /** Matched against the title, case-insensitively. Empty means everything. */
  search: string;
  /** Subject ids to keep. Empty means every subject, and untagged tasks too. */
  subjects: string[];
  /** Priorities to keep. Empty means all three. */
  priorities: TaskPriority[];
  /**
   * Difficulty bands to keep, by name. Empty means all six.
   *
   * A separate cut from `priorities` rather than a finer spelling of it. The
   * stored priority is three values and the bands are six, so "Hard" and
   * "Very Challenging" are both `high` and no priority filter can tell them
   * apart — which is the whole reason a reader would reach for this one.
   * See utils/priority.ts for where the two scales meet.
   */
  bands: XpBand[];
  sort: SortKey;
  /** Sorts run ascending unless this says otherwise. */
  descending: boolean;
  /**
   * How far ahead the list reaches.
   *
   * `week` is the default and the page is built around it: a list of everything
   * an account has ever agreed to is a list nobody reads to the bottom of, and
   * on a real account it is four hundred rows deep. What a reader can act on is
   * what is late, what is today, and what is coming — so that is what the page
   * shows, and the rest is one menu item away rather than gone.
   *
   * Undated tasks are inside the horizon. A task with no date is not far away;
   * it is not on the axis at all, and hiding it behind a *time* filter would be
   * the one way to lose a task in this app completely.
   */
  horizon: 'week' | 'all';
}

export const EMPTY_QUERY: TaskQuery = {
  status: 'open',
  search: '',
  subjects: [],
  priorities: [],
  bands: [],
  sort: 'due',
  descending: false,
  horizon: 'week',
};

/**
 * The sorts, with the words each one describes its own direction in.
 *
 * Spelled out per key rather than assembled from "ascending" and "descending",
 * because those words mean nothing to a reader and are actively wrong for
 * priority: sorting it ascending puts *high* at the top, since high is rank
 * zero, so a generic "lowest first" would describe the list backwards.
 */
export const SORTS: Array<{
  key: SortKey;
  label: string;
  /** How the section heading names it: "Ordered by due date, …". */
  noun: string;
  /** What ascending and descending actually do to this field. */
  asc: string;
  desc: string;
}> = [
  { key: 'due', label: 'Due date', noun: 'due date', asc: 'soonest first', desc: 'latest first' },
  { key: 'priority', label: 'Priority', noun: 'priority', asc: 'highest first', desc: 'lowest first' },
  { key: 'xp', label: 'XP', noun: 'XP', asc: 'lowest first', desc: 'highest first' },
  { key: 'created', label: 'Added', noun: 'when it was added', asc: 'oldest first', desc: 'newest first' },
  { key: 'title', label: 'Name', noun: 'name', asc: 'A to Z', desc: 'Z to A' },
];

export const PRIORITIES: TaskPriority[] = ['high', 'medium', 'low'];

/** High sorts before medium before low, whatever the words happen to be. */
const RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

// --------------------------------------------------------------------------
// When a task is due
// --------------------------------------------------------------------------
/**
 * The buckets the open list is cut into.
 *
 * Deliberately about *time to act* rather than the calendar: "this week" is the
 * next seven days rather than the days before Sunday, because a task due on
 * Monday is not more urgent on Sunday night than it was on Saturday morning.
 * `none` is last and is not a failure state — a task with no date is not late.
 */
export type Bucket =
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'soon'
  | 'later'
  | 'none'
  | 'done'
  | 'all';

/**
 * What the list is cut into headings by.
 *
 * This was a boolean — headings by due date, or one flat list — and it had a
 * hole in it that the note on `groupTasks` used to describe as a feature: the
 * buckets are themselves an ordering by date, so grouping had to stand aside
 * whenever the reader sorted by anything else. The result was a control that
 * silently did nothing on four of the five sorts.
 *
 * A key rather than a flag closes it. Grouping by priority and sorting by XP
 * are two different questions and the answers compose: three headings, each
 * ordered by XP. The only pairing that still collapses is due-date grouping
 * under a non-date sort, and that one collapses honestly — see `groupTasks`.
 */
export type GroupKey = 'due' | 'priority' | 'band' | 'subject' | 'status' | 'none';

export const GROUPS: Array<{ key: GroupKey; label: string; hint: string }> = [
  { key: 'due', label: 'Due date', hint: 'Late, today, this week, later.' },
  { key: 'priority', label: 'Priority', hint: 'High, medium, low.' },
  { key: 'band', label: 'Difficulty', hint: 'Easy through Very Challenging.' },
  { key: 'subject', label: 'Subject', hint: 'What the work is about.' },
  { key: 'status', label: 'Status', hint: 'Still open, or finished.' },
  { key: 'none', label: 'No headings', hint: 'One flat list.' },
];

export const BUCKETS: Array<{ key: Bucket; label: string; hint: string }> = [
  { key: 'overdue', label: 'Overdue', hint: 'Past its date. Move it or finish it.' },
  { key: 'today', label: 'Due Today', hint: 'Due before the day is out.' },
  // Tomorrow is its own heading rather than the first day of "this week",
  // because it is the only future day a reader plans in the same breath as
  // today — everything past it is a week, not a day.
  { key: 'tomorrow', label: 'Tomorrow', hint: 'The next day up.' },
  { key: 'soon', label: 'This Week', hint: 'The week in front of you.' },
  { key: 'later', label: 'Later', hint: 'Dated, but not yet.' },
  { key: 'none', label: 'No date', hint: 'Real work, just not scheduled.' },
  { key: 'done', label: 'Completed', hint: 'Already behind you.' },
];

/** Midnight local, as a number — the day a stamp falls on, not the instant. */
function dayOf(value: string | undefined | null): number | null {
  if (!value) return null;
  const at = new Date(`${String(value).slice(0, 10)}T00:00:00`).getTime();
  return Number.isNaN(at) ? null : at;
}

/**
 * The stamp itself, to the minute — what `dayOf` throws away.
 *
 * Buckets, streaks and the sparklines all want the *day*: a task due at 9am and
 * one due at 6pm are both due today, and rounding them to the same midnight is
 * the whole point. Sorting wants the opposite. Ordered by due date, those two
 * tasks have an order, and `dayOf` collapsed it — every task sharing a date
 * tied, fell through to the id tiebreak, and came out alphabetical by database
 * key. On an account whose work is dated to the day rather than the hour that
 * is invisible; on one that blocks out its calendar it meant the Sort menu
 * printed "soonest first" over a list in no order at all, and the direction
 * toggle moved nothing.
 *
 * A bare `YYYY-MM-DD` is read as local midnight rather than handed to
 * `new Date`, which would read it as UTC and drag it onto the wrong day for
 * anyone west of Greenwich — the same reason `dayOf` builds the string it does.
 */
function instantOf(value: string | undefined | null): number | null {
  if (!value) return null;
  const raw = String(value);
  const at = new Date(raw.includes('T') ? raw : `${raw.slice(0, 10)}T00:00:00`).getTime();
  return Number.isNaN(at) ? null : at;
}

export function bucketOf(task: Task, today = new Date()): Bucket {
  if (task.status === 'done') return 'done';
  const due = dayOf(task.due_date);
  if (due === null) return 'none';
  const midnight = dayOf(isoDate(today)) ?? today.getTime();
  const days = Math.round((due - midnight) / DAY);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return days <= 7 ? 'soon' : 'later';
}

/** "3 days late", "today", "in 5 days" — the phrase a row prints for its date. */
export function dueLabel(task: Task, today = new Date()): string | null {
  const due = dayOf(task.due_date);
  if (due === null) return null;
  const midnight = dayOf(isoDate(today)) ?? today.getTime();
  const days = Math.round((due - midnight) / DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return '1 day late';
  if (days < 0) return `${Math.abs(days)} days late`;
  if (days <= 7) return `In ${days} days`;
  return new Date(due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// --------------------------------------------------------------------------
// Filtering and sorting
// --------------------------------------------------------------------------
/**
 * The reader's controls, applied in the order they think about them.
 *
 * Status first because it is the biggest cut, then the text, then the two
 * facet lists. An empty facet means "every one of these" rather than "none",
 * which is the only reading that lets a filter row start switched off.
 */
export function filterTasks(tasks: Task[], query: TaskQuery, today = new Date()): Task[] {
  const needle = query.search.trim().toLowerCase();

  return tasks.filter((task) => {
    if (query.status === 'open' && task.status === 'done') return false;
    if (query.status === 'done' && task.status !== 'done') return false;

    if (needle) {
      const haystack = `${task.title} ${task.description ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    if (query.subjects.length > 0 && !query.subjects.includes(task.subject ?? '')) {
      return false;
    }
    if (query.priorities.length > 0 && !query.priorities.includes(task.priority)) {
      return false;
    }
    if (query.bands.length > 0 && !query.bands.includes(xpToBand(Number(task.xp_value) || 0))) {
      return false;
    }

    if (query.horizon === 'week') {
      const bucket = bucketOf(task, today);
      // Everything a reader can act on this week, plus the undated — see the
      // note on `horizon`.
      if (bucket === 'later') return false;

      // Completed work is bounded by the week *behind* rather than let through
      // whole. `bucketOf` answers 'done' for anything finished, whenever it was
      // finished, so the horizon used to skip past every completed task in the
      // account — the reasoning being that a horizon which also hid them would
      // make "Completed" show nothing.
      //
      // It would not have; it would have shown the last week of them. What the
      // exemption actually did was make "Show completed" mean "show the whole
      // archive": on a real account that is four thousand rows and five years
      // of history mounted at once, and every subsequent click on Filter,
      // Group or Sort rebuilt all of them. The controls were wired correctly
      // and did nothing you could see, because the page spent seconds
      // reconciling a list nobody asked to read to the bottom of.
      //
      // A week forward for what is coming, a week back for what is done. The
      // rest of the archive is one menu item away — the same place the rest of
      // the future is — rather than in the way.
      if (bucket === 'done') {
        const finished = dayOf(task.completed_at);
        // No completion date means it cannot be placed in time, and a task
        // that cannot be dated is not one to drop silently.
        if (finished !== null && midnight(today) - finished > HORIZON_DAYS * DAY) {
          return false;
        }
      }
    }
    return true;
  });
}

/**
 * One comparison per sort key, with a stable fallback.
 *
 * Dates compare as instants rather than as days — see `instantOf`. Two tasks
 * due the same afternoon have an order and the list shows it.
 *
 * Undated tasks sort to the end of a due-date sort in both directions. They are
 * not "the furthest away" — they are not on the axis at all — and letting them
 * lead a descending sort would put the least urgent work at the top of a list
 * the reader asked to be ordered by urgency.
 */
export function sortTasks(tasks: Task[], sort: SortKey, descending = false): Task[] {
  const direction = descending ? -1 : 1;

  return [...tasks].sort((a, b) => {
    switch (sort) {
      case 'due': {
        const left = instantOf(a.due_date);
        const right = instantOf(b.due_date);
        if (left === null && right === null) break;
        if (left === null) return 1;
        if (right === null) return -1;
        if (left !== right) return (left - right) * direction;
        break;
      }
      case 'priority': {
        const gap = RANK[a.priority] - RANK[b.priority];
        if (gap !== 0) return gap * direction;
        break;
      }
      case 'xp': {
        const gap = (Number(a.xp_value) || 0) - (Number(b.xp_value) || 0);
        if (gap !== 0) return gap * direction;
        break;
      }
      case 'created': {
        const gap = (instantOf(a.created_at) ?? 0) - (instantOf(b.created_at) ?? 0);
        if (gap !== 0) return gap * direction;
        break;
      }
      case 'title': {
        const gap = a.title.localeCompare(b.title);
        if (gap !== 0) return gap * direction;
        break;
      }
    }
    // Ties break on the id, so a re-render cannot shuffle two equal rows past
    // each other and make the list appear to move on its own.
    return String(a.id).localeCompare(String(b.id));
  });
}

export interface TaskGroup {
  /** Stable per heading — the bucket, the priority, the subject id. */
  key: string;
  label: string;
  hint: string;
  tasks: Task[];
}

/**
 * The filtered, sorted list, cut into the sections the page draws.
 *
 * The sort orders the rows; the grouping decides where the headings fall. They
 * are separate questions and they compose — "by priority, ordered by XP" is
 * three headings with the biggest task at the top of each — which is what the
 * boolean this replaced could not express. See `GroupKey`.
 *
 * **Due-date grouping still steps aside for a non-date sort**, and that one is
 * deliberate rather than a leftover. The buckets *are* an ordering by date, so
 * "group by due date, sort by XP" can only order rows inside sections the
 * reader did not ask to be in date order: a 10 XP task sits above a 50 XP one
 * because one is due sooner. Rather than do less than it says, the grouping
 * drops to a flat list and the heading says what the ordering actually is.
 * Every other grouping has no such quarrel with any sort.
 *
 * Empty groups are dropped — a heading over nothing is a heading about nothing.
 */
export function groupTasks(
  tasks: Task[],
  query: TaskQuery,
  today = new Date(),
  group: GroupKey = 'due',
  /** Subject id → label, for `group: 'subject'`. Missing ids read as unfiled. */
  subjectLabel: (id: string | undefined) => string | null = () => null,
): TaskGroup[] {
  const sorted = sortTasks(filterTasks(tasks, query, today), query.sort, query.descending);
  if (sorted.length === 0) return [];

  const entry = SORTS.find((sort) => sort.key === query.sort);
  const ordering = entry
    ? `Ordered by ${entry.noun}, ${query.descending ? entry.desc : entry.asc}.`
    : '';

  const flat = (label: string): TaskGroup[] => [
    { key: 'all', label, hint: ordering, tasks: sorted },
  ];

  if (group === 'none') return flat('All tasks');
  if (group === 'due' && query.sort !== 'due') return flat('All tasks');

  if (group === 'due') {
    return BUCKETS.map((bucket) => ({
      ...bucket,
      tasks: sorted.filter((task) => bucketOf(task, today) === bucket.key),
    })).filter((entry) => entry.tasks.length > 0);
  }

  if (group === 'priority') {
    return PRIORITIES.map((priority) => ({
      key: priority,
      label: `${priority[0]!.toUpperCase()}${priority.slice(1)} priority`,
      hint: ordering,
      tasks: sorted.filter((task) => task.priority === priority),
    })).filter((entry) => entry.tasks.length > 0);
  }

  if (group === 'band') {
    // Hardest first, which is the order the headings are useful in: the reader
    // opening this wants to see what the big rocks are, not scroll past the
    // ten-XP errands to reach them.
    return [...XP_BANDS]
      .reverse()
      .map((band) => ({
        key: band.label,
        label: band.label,
        hint: ordering,
        tasks: sorted.filter(
          (task) => xpToBand(Number(task.xp_value) || 0) === band.label,
        ),
      }))
      .filter((entry) => entry.tasks.length > 0);
  }

  if (group === 'status') {
    return [
      { key: 'open', label: 'Open', hint: ordering },
      { key: 'done', label: 'Completed', hint: 'Already behind you.' },
    ]
      .map((entry) => ({
        ...entry,
        tasks: sorted.filter((task) =>
          entry.key === 'done' ? task.status === 'done' : task.status !== 'done',
        ),
      }))
      .filter((entry) => entry.tasks.length > 0);
  }

  // By subject. The headings follow the order the tasks are already in rather
  // than the alphabet, so the sort decides which subject leads — a list sorted
  // by due date opens on whatever is due soonest, which is the point of having
  // sorted it. Unfiled work is last for the same reason "No date" is: it is not
  // a subject that came out badly, it is the absence of one.
  const seen = new Map<string, TaskGroup>();
  const unfiled: Task[] = [];
  sorted.forEach((task) => {
    const id = task.subject;
    if (!id) {
      unfiled.push(task);
      return;
    }
    const found = seen.get(id);
    if (found) {
      found.tasks.push(task);
      return;
    }
    seen.set(id, {
      key: id,
      // The id rather than a generic word, so a subject list that has not
      // arrived yet gives four distinguishable headings instead of four
      // identical ones reading "Subject".
      label: subjectLabel(id) ?? id,
      hint: ordering,
      tasks: [task],
    });
  });

  const groups = [...seen.values()];
  if (unfiled.length > 0) {
    groups.push({ key: 'unfiled', label: 'No subject', hint: 'Real work, just not filed.', tasks: unfiled });
  }
  return groups;
}

// --------------------------------------------------------------------------
// The figures across the top
// --------------------------------------------------------------------------
export interface TaskCounts {
  open: number;
  done: number;
  overdue: number;
  today: number;
  /** XP sitting in the open list — what finishing all of it would be worth. */
  openXp: number;
  /** XP already banked from tasks completed today. */
  todayXp: number;
  /** How many of today's are high priority — the card's second line. */
  todayHigh: number;
  /**
   * Of the work due in the last week, the share that got finished.
   *
   * Measured on the *due* date rather than the completion date, so a task
   * finished three days late still counts against the week it was owed in
   * rather than quietly improving the week it was finished in.
   */
  completionRate: number;
}

/**
 * Counted off the whole list rather than the filtered one.
 *
 * A summary that moved when a filter was typed into would be measuring the
 * filter, not the account: "3 overdue" has to mean three overdue tasks exist,
 * not three survived the current search.
 */
export function taskCounts(tasks: Task[], today = new Date()): TaskCounts {
  const stamp = isoDate(today);
  const counts: TaskCounts = {
    open: 0, done: 0, overdue: 0, today: 0, openXp: 0, todayXp: 0, todayHigh: 0, completionRate: 0,
  };

  const midnightToday = dayOf(stamp) ?? today.getTime();
  let dueInWeek = 0;
  let closedInWeek = 0;

  tasks.forEach((task) => {
    const due = dayOf(task.due_date);
    if (due !== null && due <= midnightToday && due > midnightToday - 7 * DAY) {
      dueInWeek += 1;
      if (task.status === 'done') closedInWeek += 1;
    }
    const xp = Number(task.xp_value) || 0;
    if (task.status === 'done') {
      counts.done += 1;
      if (String(task.completed_at ?? '').slice(0, 10) === stamp) counts.todayXp += xp;
      return;
    }
    counts.open += 1;
    counts.openXp += xp;
    const bucket = bucketOf(task, today);
    if (bucket === 'overdue') counts.overdue += 1;
    if (bucket === 'today') {
      counts.today += 1;
      if (task.priority === 'high') counts.todayHigh += 1;
    }
  });

  counts.completionRate = dueInWeek > 0 ? Math.round((closedInWeek / dueInWeek) * 100) : 0;
  return counts;
}

/** Whether anything is narrowing the list — what the Clear button is for. */
/**
 * How many cuts the reader has made, as a number for the Filter button.
 *
 * The search is not counted: it has its own box, in view, with what was typed
 * still in it, so adding it to a badge on a menu that does not contain it
 * would point at the wrong control. Each facet counts once however many values
 * it holds — "2" on the button means two kinds of filter, which is what a
 * reader wanting to know what is hiding rows needs; the menu shows the rest.
 */
export function activeFilters(query: TaskQuery): number {
  return (
    Number(query.status !== EMPTY_QUERY.status) +
    Number(query.horizon !== EMPTY_QUERY.horizon) +
    Number(query.subjects.length > 0) +
    Number(query.priorities.length > 0) +
    Number(query.bands.length > 0)
  );
}

export function isFiltered(query: TaskQuery): boolean {
  return (
    query.status !== EMPTY_QUERY.status ||
    query.horizon !== EMPTY_QUERY.horizon ||
    query.search.trim() !== '' ||
    query.subjects.length > 0 ||
    query.priorities.length > 0 ||
    query.bands.length > 0
  );
}

// --------------------------------------------------------------------------
// The sparkline under each stat card
// --------------------------------------------------------------------------
/**
 * The last fortnight of each headline figure, recomputed from the task list.
 *
 * **Nothing here is recorded history.** The account stores no daily snapshot of
 * how many tasks were open, so a card that wanted a trend had two options:
 * invent one, or reconstruct it. This reconstructs it — every task carries
 * `created_at` and, once finished, `completed_at`, and those two dates are
 * enough to answer "was this task open at the end of that day" for any day in
 * range. Walk the days, ask that question of every task, and the series falls
 * out.
 *
 * The reconstruction is honest but it is not a recording, and the difference
 * shows in one place: a task deleted last week was never open on any of these
 * days, because it is not in the list to be asked about. The line is the shape
 * of the work that still exists, which is the only past the data supports.
 *
 * **`created_at` is clamped, because it is not always a creation time.** A task
 * with `show_on_calendar` uses the field as the start of its block — see
 * `plannedSeconds` — so a session scheduled for next Tuesday carries a
 * `created_at` of next Tuesday. Read literally, every one of those counts as
 * "not made yet" on every day of the window, and the first cut of this drew an
 * Open line that fell to zero at today's edge while the card above it read 56.
 * A task is therefore treated as existing from the earliest of its stated
 * creation, its completion, and today: whatever the field says, a task that has
 * been finished existed by the day it was finished, and one sitting open on the
 * list exists now.
 */
export interface StatSeries {
  open: number[];
  dueToday: number[];
  overdue: number[];
  completion: number[];
  openXp: number[];
}

/** How far ahead `horizon: 'week'` reaches, in days. */
export const HORIZON_DAYS = 7;

/** How many days of history each sparkline draws. */
export const TREND_DAYS = 14;

/** The window the completion rate is measured over, in days. */
const RATE_WINDOW = 7;

/**
 * Local midnight today — and `isoDate` rather than `toISOString`, deliberately.
 *
 * All four places in this file that ask what day it is used to slice
 * `today.toISOString()`, which is the *UTC* date. West of Greenwich those
 * disagree for the last hours of every evening: at 8pm in UTC-5 it is already
 * tomorrow in UTC, so "today" jumped a day and took the whole page with it —
 * the Due Today group emptied and filled with tomorrow's work, everything
 * actually due today moved to Overdue, the row labels read "Today" against the
 * wrong date, and the today count on the stat card followed. It came back on
 * its own overnight, which is the worst shape a bug can have.
 *
 * `instantOf` below already carries the warning for the other half of this trap
 * — reading a bare `YYYY-MM-DD` through `new Date` treats it as UTC — and the
 * same mistake was sitting on the writing side the whole time. utils/dates
 * `isoDate` builds the stamp from `getFullYear`/`getMonth`/`getDate`, so it is
 * the local day by construction.
 */
function midnight(today: Date): number {
  return dayOf(isoDate(today)) ?? today.getTime();
}

export function statSeries(tasks: Task[], today = new Date(), days = TREND_DAYS): StatSeries {
  const end = midnight(today);
  const series: StatSeries = { open: [], dueToday: [], overdue: [], completion: [], openXp: [] };

  // Parsed once rather than per day — this runs over every task in the account
  // for every day drawn, and the date parsing is the whole cost.
  const parsed = tasks.map((task) => {
    const done = task.status === 'done' ? dayOf(task.completed_at) ?? -Infinity : null;
    const stated = dayOf(task.created_at);
    // See the clamp note above. `end` is today, so an open task always exists by
    // the last day drawn and the line cannot disagree with the card over it.
    const made =
      stated === null ? null : Math.min(stated, done === null ? end : Math.min(done, end));
    return { made, due: dayOf(task.due_date), done, xp: Number(task.xp_value) || 0 };
  });

  for (let step = days - 1; step >= 0; step--) {
    const day = end - step * DAY;
    let open = 0;
    let openXp = 0;
    let overdue = 0;
    let dueToday = 0;
    let closedInWindow = 0;
    let dueInWindow = 0;

    parsed.forEach((task) => {
      // Not yet made on this day: it did not exist to be counted.
      if (task.made !== null && task.made > day) return;
      const wasOpen = task.done === null || task.done > day;
      if (wasOpen) {
        open += 1;
        openXp += task.xp;
        if (task.due !== null && task.due < day) overdue += 1;
      }
      if (task.due === day) dueToday += 1;

      // The rolling rate: of the work due in the week up to this day, how much
      // of it was finished. Measured on the *due* date rather than the
      // completion date, so a task finished late still counts against the week
      // it was owed in.
      if (task.due !== null && task.due <= day && task.due > day - RATE_WINDOW * DAY) {
        dueInWindow += 1;
        if (task.done !== null && task.done <= day) closedInWindow += 1;
      }
    });

    series.open.push(open);
    series.openXp.push(openXp);
    series.overdue.push(overdue);
    series.dueToday.push(dueToday);
    series.completion.push(dueInWindow > 0 ? Math.round((closedInWindow / dueInWindow) * 100) : 0);
  }

  return series;
}

/**
 * Where a series has got to against where it started, as a percentage.
 *
 * `null` when there is no honest percentage to give, and a baseline of two is
 * as dishonest as a baseline of zero. This card read **"+271950% from last
 * week"** — a real screenshot — because the week started with a couple of open
 * tasks and ended with five thousand. The arithmetic is right and the sentence
 * is noise: nobody reads 271950% as a quantity, and a figure the reader has to
 * discount is worse than a blank.
 *
 * Below the floor the caller says something else instead, which is the honest
 * version — "Everything still on your list" is true and useful where
 * "+271950%" is neither.
 */
const TREND_FLOOR = 5;

export function trendPct(series: number[]): number | null {
  const first = series[0];
  const last = series[series.length - 1];
  if (first === undefined || last === undefined) return null;
  if (first < TREND_FLOOR) return null;
  return Math.round(((last - first) / first) * 100);
}

// --------------------------------------------------------------------------
// How long it takes
// --------------------------------------------------------------------------
/**
 * How long a task has been set aside for, in seconds, or null.
 *
 * **This is the block on the calendar, not a guess and not a measurement.** A
 * task with `show_on_calendar` carries its slot in two fields it would
 * otherwise use for something else: `created_at` is where the block starts and
 * `due_date` is where it ends, which is how hooks/useCalendarTasks lays them
 * out on the grid. The distance between them is time the reader themselves put
 * aside, so a row can print it without claiming to know anything the account
 * does not.
 *
 * The two obvious alternatives are both worse. `timer_duration` is the field
 * this should read and nothing has ever written it — it is null on every task
 * in every account. `completion_seconds` looks like a duration and is not one:
 * backend/api/tasks.py records it as `now - created_at`, so it measures how
 * long a task sat before being finished. On a task created three weeks before
 * its deadline that is three weeks, and a row printing "Est. 21d" beside it
 * would be stating a lead time as an estimate of the work.
 *
 * Undated tasks, tasks not on the calendar, and blocks longer than `MAX_BLOCK`
 * get nothing. The cap is what keeps a genuine deadline — created today, due
 * next month — from being read as a month-long sitting on the rare task that
 * has `show_on_calendar` set without a real slot behind it.
 */
const MAX_BLOCK = 12 * 3600;

export function plannedSeconds(task: Task): number | null {
  if (!task.show_on_calendar || !task.created_at || !task.due_date) return null;
  const from = new Date(task.created_at).getTime();
  const to = new Date(task.due_date).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  const span = (to - from) / 1000;
  return span > 0 && span <= MAX_BLOCK ? span : null;
}

/** "1h 30m", "45m" — a span in the words a row prints it in. */
export function spellDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "6:00 PM", or null when the date carries no time of day. */
export function timeLabel(value: string | undefined | null): string | null {
  if (!value) return null;
  const raw = String(value);
  if (!raw.includes('T')) return null;
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return null;
  if (at.getHours() === 0 && at.getMinutes() === 0) return null;
  // Was toLocaleTimeString('en-US', …), which wrote AM and PM at a reader
  // whose device had already said otherwise. utils/clock is the account's
  // answer instead.
  return timeText(at);
}

/** "Due Today, 6:00 PM" — the whole date line on a row, or null. */
export function dueLine(task: Task, today = new Date()): string | null {
  const day = dueLabel(task, today);
  if (!day) return null;
  const time = timeLabel(task.due_date);
  return time ? `Due ${day}, ${time}` : `Due ${day}`;
}

// --------------------------------------------------------------------------
// The sidebar
// --------------------------------------------------------------------------
/** The next dated open tasks, soonest first. */
export function upcoming(tasks: Task[], limit = 3, today = new Date()): Task[] {
  const from = midnight(today);
  return tasks
    .filter((task) => {
      if (task.status === 'done') return false;
      const due = dayOf(task.due_date);
      return due !== null && due >= from;
    })
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
    .slice(0, limit);
}

export interface Streak {
  title: string;
  /** Consecutive days, counting back from the most recent completion. */
  days: number;
}

/**
 * How many days running each repeated task has been kept up.
 *
 * Grouped by title, for the same reason the estimates are: a task the reader
 * does every morning arrives as one row per morning, and the streak is a fact
 * about the habit rather than about any one of those rows.
 *
 * Counted back from the **most recent completion rather than from today**, and
 * only kept if that completion was today or yesterday. A run that ended a month
 * ago is not a streak the panel should be printing a flame next to, but a run
 * finished yesterday is still alive — the day is not over, and a panel that
 * blanked every streak at midnight would be wrong for most of the morning.
 */
export function streaks(tasks: Task[], limit = 3, today = new Date()): Streak[] {
  const byTitle = new Map<string, { title: string; days: Set<number> }>();

  tasks.forEach((task) => {
    if (task.status !== 'done') return;
    const done = dayOf(task.completed_at);
    if (done === null) return;
    const key = task.title.trim().toLowerCase();
    const entry = byTitle.get(key);
    if (entry) entry.days.add(done);
    else byTitle.set(key, { title: task.title.trim(), days: new Set([done]) });
  });

  const now = midnight(today);
  const out: Streak[] = [];

  byTitle.forEach(({ title, days }) => {
    const last = Math.max(...days);
    // Alive only if it reaches today or yesterday. See the note above.
    if (now - last > DAY) return;
    let run = 0;
    let cursor = last;
    while (days.has(cursor)) {
      run += 1;
      cursor -= DAY;
    }
    if (run > 1) out.push({ title, days: run });
  });

  return out.sort((a, b) => b.days - a.days || a.title.localeCompare(b.title)).slice(0, limit);
}

/**
 * How many more rows dropping the week horizon would put on the page.
 *
 * Asked of the query rather than of the tasks alone, because the answer
 * depends on the rest of the filters: with "Open tasks" showing, lifting the
 * horizon reveals work dated further out and nothing else; with "Everything"
 * showing it also reveals the completed archive behind the last seven days.
 * A fixed count of far-dated open tasks would have understated the second case
 * by about four thousand, under a line whose whole job is to say what is not
 * being shown.
 *
 * Measured by running the filter both ways and taking the difference, so the
 * number cannot drift from what the horizon actually does.
 */
export function beyondHorizon(
  tasks: Task[],
  query: TaskQuery,
  today = new Date(),
): number {
  if (query.horizon !== 'week') return 0;
  const within = filterTasks(tasks, query, today).length;
  const without = filterTasks(tasks, { ...query, horizon: 'all' }, today).length;
  return Math.max(0, without - within);
}
