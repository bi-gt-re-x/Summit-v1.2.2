/**
 * The skill cards on the Subjects tab: how they sort, which ones show, the
 * weekly trend drawn on each, and the insights a picked card brings up.
 *
 * Everything here reads finished tasks and the cards `skillCards` already
 * built. Nothing is advice: advice lives on the Recommendations tab, and these
 * are things the record shows about one subject, said plainly.
 */
import type { Task } from '@/types';
import type { SkillCard } from './growthSkills';
import { secondsSpent } from './timeSpent';

/** Days without a finished task before a subject reads as cooling off. */
export const COOLING_DAYS = 14;

export const isCooling = (card: SkillCard): boolean =>
  card.daysSince !== null && card.daysSince >= COOLING_DAYS;

// --------------------------------------------------------------------------
// Sort and filter
// --------------------------------------------------------------------------
export type CardSort = 'xp' | 'change' | 'quiet' | 'next';
export type CardFilter = 'all' | 'active' | 'cooling';

export const CARD_SORTS: Array<{ key: CardSort; label: string }> = [
  { key: 'xp', label: 'Most XP' },
  { key: 'change', label: 'Biggest change' },
  { key: 'next', label: 'Next level' },
  { key: 'quiet', label: 'Quietest' },
];

export const CARD_FILTERS: Array<{ key: CardFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'cooling', label: 'Cooling off' },
];

/** How far a subject moved, in XP, between the last 30 days and the 30 before. */
const swingOf = (card: SkillCard): number => Math.abs(card.xp30 - card.xp30Before);

export function sortCards(cards: SkillCard[], by: CardSort): SkillCard[] {
  const byXp = (a: SkillCard, b: SkillCard) => b.xp - a.xp || a.label.localeCompare(b.label);
  const rule: Record<CardSort, (a: SkillCard, b: SkillCard) => number> = {
    xp: byXp,
    // The biggest swing in XP either way, rather than in percent: a subject
    // that went from 10 XP to nothing is "down 100%" and not much of a story.
    change: (a, b) => swingOf(b) - swingOf(a) || byXp(a, b),
    // Maxed ladders have nothing to reach, so they go last.
    next: (a, b) =>
      Number(a.level.maxed) - Number(b.level.maxed) || a.level.toNext - b.level.toNext || byXp(a, b),
    quiet: (a, b) => (b.daysSince ?? -1) - (a.daysSince ?? -1) || byXp(a, b),
  };
  return [...cards].sort(rule[by]);
}

export function filterCards(cards: SkillCard[], by: CardFilter): SkillCard[] {
  if (by === 'active') return cards.filter((card) => !isCooling(card));
  if (by === 'cooling') return cards.filter(isCooling);
  return cards;
}

// --------------------------------------------------------------------------
// Weekly trend
// --------------------------------------------------------------------------
/** How many weeks the little trend on each card covers. */
export const TREND_WEEKS = 8;

function shiftDay(iso: string, n: number): string {
  const at = new Date(`${iso}T00:00:00`);
  at.setDate(at.getDate() + n);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(
    at.getDate(),
  ).padStart(2, '0')}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00`).getTime();
  const to = new Date(`${toIso}T00:00:00`).getTime();
  return Math.round((to - from) / 86_400_000);
}

const dayOf = (task: Task): string => (task.completed_at || '').slice(0, 10);

/** Finished tasks in one subject, oldest first. */
function doneIn(tasks: Task[], key: string): Task[] {
  return tasks
    .filter((task) => task.status === 'done' && task.subject === key && dayOf(task))
    .sort((a, b) => (a.completed_at || '').localeCompare(b.completed_at || ''));
}

/**
 * XP per subject in each of the last `weeks` seven-day blocks, oldest first.
 * The last block ends today, so this week is always the right-hand bar.
 */
export function weeklyTrends(
  tasks: Task[],
  todayIso: string,
  weeks: number = TREND_WEEKS,
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  if (!todayIso) return out;
  const first = shiftDay(todayIso, -(weeks * 7 - 1));
  tasks.forEach((task) => {
    if (task.status !== 'done' || !task.subject) return;
    const day = dayOf(task);
    if (!day || day < first || day > todayIso) return;
    const slot = Math.floor(daysBetween(first, day) / 7);
    const row = out.get(task.subject) ?? new Array<number>(weeks).fill(0);
    row[slot]! += Number(task.xp_value) || 0;
    out.set(task.subject, row);
  });
  return out;
}


// --------------------------------------------------------------------------
// Insights
// --------------------------------------------------------------------------
/** One small figure under an insight, like "Usual gap" and "1 day". */
export interface InsightFigure {
  label: string;
  value: string;
}

/**
 * One bar in the little chart some insights carry. Two bars compare this
 * subject with something (last month, your other work). More than two are a
 * spread, like the days of the week.
 */
export interface InsightBar {
  label: string;
  value: number;
  text: string;
  /** The bar the insight is about. */
  lit?: boolean;
}

export interface SubjectInsight {
  key: string;
  tone: 'up' | 'down' | 'note';
  head: string;
  detail: string;
  figures: InsightFigure[];
  bars?: InsightBar[];
}

/** How many insights a picked card shows before the reader asks for more. */
export const INSIGHTS_SHOWN = 3;

/** How many of the latest breaks between work days make up "lately". */
const RECENT_GAPS = 6;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const xpText = (n: number) => `${Math.round(n).toLocaleString()} XP`;
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const outOf5 = (n: number) => n.toFixed(1);

/** "Oct 7", or "Mar 3, 2025" when it isn't this year. */
function dateText(iso: string, todayIso: string): string {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (iso.slice(0, 4) !== todayIso.slice(0, 4)) options.year = 'numeric';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', options);
}

/** "March 2026" from "2026-03". */
function monthText(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function agoText(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

const every = (days: number) => (days === 1 ? 'every day' : `every ${days} days`);

/** "2, 6 and 6". */
function listText(values: number[]): string {
  const words = values.map((value) => value.toLocaleString());
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

function minutesText(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `${hours} hr ${rest} min` : plural(hours, 'hour');
}

function clip(text: string, max = 44): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}...` : clean;
}

/** A title with its numbers stripped, so "Set #3" and "Set #4" count as one. */
const titleKey = (title: string) => title.toLowerCase().replace(/[^a-z]+/g, ' ').trim();

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const xpOf = (task: Task) => Number(task.xp_value) || 0;

const ratingOf = (task: Task, field: 'difficulty' | 'execution'): number | null =>
  typeof task[field] === 'number' ? (task[field] as number) : null;

/** Mean of a rating over the tasks that have one, or null under `floor` of them. */
function meanRating(tasks: Task[], field: 'difficulty' | 'execution', floor = 3): number | null {
  const rated = tasks.map((task) => ratingOf(task, field)).filter((value): value is number => value !== null);
  if (rated.length < floor) return null;
  return mean(rated);
}

type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';
const PART_PHRASE: Record<DayPart, string> = {
  morning: 'in the morning',
  afternoon: 'in the afternoon',
  evening: 'in the evening',
  night: 'late at night',
};

/** Morning, afternoon, evening or night, from the time on `completed_at`. */
function partOfDay(task: Task): DayPart | null {
  const hour = Number((task.completed_at || '').slice(11, 13));
  if (!task.completed_at || task.completed_at.length < 13 || Number.isNaN(hour)) return null;
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/** Tasks, distinct days and XP between two days, both included. */
function windowOf(tasks: Task[], fromIso: string, toIso: string) {
  const inside = tasks.filter((task) => dayOf(task) >= fromIso && dayOf(task) <= toIso);
  return {
    tasks: inside.length,
    days: new Set(inside.map(dayOf)).size,
    xp: inside.reduce((sum, task) => sum + xpOf(task), 0),
  };
}

/**
 * Everything the record shows about one subject, most telling first.
 *
 * Every candidate gets a weight, so a subject that's gone quiet leads with that
 * and a busy one leads with its momentum. The card shows the first
 * INSIGHTS_SHOWN and the rest sit behind "Show more". Two candidates (where it
 * ranks, and how much work is behind it) always exist once there's a card at
 * all, and the time-of-week and size ones usually do, which is what makes
 * "three" a promise rather than a hope.
 *
 * Each one says what happened, puts a number on it, and backs it with the
 * figures it came from: a task by name, a date, the thing it's measured
 * against. Nothing here is advice. That lives on the Recommendations tab.
 */
export function subjectInsights(
  card: SkillCard,
  cards: SkillCard[],
  tasks: Task[],
  todayIso: string,
): SubjectInsight[] {
  const mine = doneIn(tasks, card.key);
  const others = tasks.filter((task) => task.status === 'done' && task.subject !== card.key && dayOf(task));
  const candidates: Array<SubjectInsight & { weight: number }> = [];
  const add = (weight: number, insight: SubjectInsight) => candidates.push({ ...insight, weight });
  const when = (iso: string) => dateText(iso, todayIso);

  const last = mine[mine.length - 1];
  const days = [...new Set(mine.map(dayOf))];
  const since = card.daysSince;

  const from30 = shiftDay(todayIso, -29);
  const recent = windowOf(mine, from30, todayIso);
  const before = windowOf(mine, shiftDay(todayIso, -59), shiftDay(todayIso, -30));

  // ---- Rhythm: how often you come back, and how long it's been ------------
  const gaps = days.slice(1).map((day, index) => ({
    from: days[index]!,
    to: day,
    size: daysBetween(days[index]!, day),
  }));
  // Two readings of "usual": over the whole record, and over the last few
  // breaks. A subject you did daily for years and weekly since September is
  // weekly now, and being five days late against "every day" says nothing.
  const sizes = gaps.map((gap) => gap.size);
  const usual = sizes.length >= 2 ? Math.max(1, Math.round(median(sizes))) : null;
  const lately = sizes.length >= RECENT_GAPS ? Math.max(1, Math.round(median(sizes.slice(-RECENT_GAPS)))) : usual;
  const longest = gaps.reduce<(typeof gaps)[number] | null>(
    (best, gap) => (!best || gap.size >= best.size ? gap : best),
    null,
  );
  const longestFigure: InsightFigure[] = longest
    ? [{ label: 'Longest break', value: `${plural(longest.size, 'day')}, to ${when(longest.to)}` }]
    : [];
  const lastFigure: InsightFigure[] = last ? [{ label: 'Last task', value: clip(last.title) }] : [];

  // Runs of back-to-back days.
  let bestRun = { length: days.length ? 1 : 0, from: days[0] ?? '', to: days[0] ?? '' };
  let run = { length: days.length ? 1 : 0, from: days[0] ?? '' };
  gaps.forEach((gap) => {
    run = gap.size === 1 ? { length: run.length + 1, from: run.from } : { length: 1, from: gap.to };
    if (run.length >= bestRun.length) bestRun = { length: run.length, from: run.from, to: gap.to };
  });
  const liveRun = since !== null && since <= 1 ? run : null;

  if (since !== null && since >= 3) {
    // The last time a break was at least this long, so "5 days" has a size.
    const asLong = [...gaps].reverse().find((gap) => gap.size >= since);
    const breakLine = asLong
      ? `The last break this long ended on ${when(asLong.to)}.`
      : `It's your longest break here yet.`;

    if (since >= COOLING_DAYS) {
      add(90, {
        key: 'rhythm',
        tone: 'down',
        head: `Quiet for ${since} days`,
        detail: `${lately !== null ? `Lately you came back ${every(lately)}. ` : ''}${breakLine}`,
        figures: [...lastFigure, { label: 'Last worked', value: when(card.lastOn!) }, ...longestFigure],
      });
    } else if (lately !== null && since > lately * 2) {
      const times = Math.round(since / lately);
      add(60, {
        key: 'rhythm',
        tone: 'down',
        head: `${since} days since your last task`,
        detail: `Lately you come back ${every(lately)}, so this is ${
          times === 2 ? 'twice' : `${times} times`
        } your normal gap. ${breakLine}`,
        figures: [
          ...lastFigure,
          { label: 'Worked on it', value: `${recent.days} of 30 days` },
          ...longestFigure,
        ],
      });
    }
  }
  const recentBreaks = sizes.slice(-4);
  const breaksLine = `Your last ${recentBreaks.length} breaks here were ${listText(recentBreaks)} days.`;
  if (
    usual !== null &&
    lately !== null &&
    !candidates.some((entry) => entry.key === 'rhythm') &&
    (lately >= Math.max(3, usual * 2) || (usual >= 3 && lately * 2 <= usual))
  ) {
    const slower = lately > usual;
    add(slower ? 58 : 50, {
      key: 'rhythm',
      tone: slower ? 'down' : 'up',
      head: slower ? 'Coming back less often' : 'Coming back more often',
      detail: `Lately it's ${every(lately)}. Over your whole record it's ${every(usual)}. ${breaksLine}`,
      figures: [
        ...lastFigure,
        { label: 'Worked on it', value: `${recent.days} of 30 days` },
        { label: 'Last worked', value: agoText(since ?? 0) },
      ],
    });
  }
  if (lately !== null && !candidates.some((entry) => entry.key === 'rhythm')) {
    add(30, {
      key: 'rhythm',
      tone: 'note',
      head: lately === 1 ? 'Back almost every day' : `Back ${every(lately)} or so`,
      detail: `You worked on it ${plural(recent.days, 'day')} of the last 30. The last time was ${agoText(
        since ?? 0,
      )}.`,
      figures: [
        { label: 'Usual gap', value: plural(lately, 'day') },
        ...longestFigure,
        ...(bestRun.length >= 2 ? [{ label: 'Best run', value: plural(bestRun.length, 'day') }] : []),
      ],
    });
  }

  if (liveRun && liveRun.length >= 3) {
    const isBest = liveRun.length >= bestRun.length;
    const inRun = mine.filter((task) => dayOf(task) >= liveRun.from).length;
    add(45 + Math.min(25, liveRun.length), {
      key: 'run',
      tone: 'up',
      head: `${liveRun.length} days in a row`,
      detail: isBest
        ? `That's your best run here. It started on ${when(liveRun.from)}.`
        : `Your best here is ${plural(bestRun.length, 'day')}, from ${when(bestRun.from)} to ${when(bestRun.to)}.`,
      figures: [
        { label: 'Started', value: when(liveRun.from) },
        { label: 'Tasks in this run', value: inRun.toLocaleString() },
        { label: 'Best run', value: plural(bestRun.length, 'day') },
      ],
    });
  }

  // ---- Momentum: the last 30 days against the 30 before -------------------
  const perRecent = recent.tasks ? recent.xp / recent.tasks : 0;
  const perBefore = before.tasks ? before.xp / before.tasks : 0;
  if (card.growth30 !== null && card.growth30 !== 0) {
    const up = card.growth30 > 0;
    const moved = (now: number, then: number, by: number) => then > 0 && Math.abs(now / then - 1) >= by;
    const why: string[] = [];
    if (recent.tasks === 0) {
      why.push(`Nothing's been finished here in the last 30 days.`);
    } else {
      if (moved(recent.days, before.days, 0.25)) {
        why.push(`You worked on it ${plural(recent.days, 'day')}, ${recent.days > before.days ? 'up' : 'down'} from ${before.days}.`);
      }
      if (moved(recent.tasks, before.tasks, 0.15)) {
        why.push(`You finished ${recent.tasks} tasks against ${before.tasks}.`);
      }
      if (moved(perRecent, perBefore, 0.15)) {
        why.push(
          `Each task was worth ${perRecent > perBefore ? 'more' : 'less'}: ${Math.round(perRecent)} XP against ${Math.round(perBefore)}.`,
        );
      } else if (why.length) {
        why.push(`Task size held at about ${Math.round(perRecent)} XP.`);
      }
      if (!why.length) why.push(`You finished ${recent.tasks} tasks against ${before.tasks}.`);
    }
    add(30 + Math.min(50, Math.abs(card.growth30) / 2), {
      key: 'momentum',
      tone: up ? 'up' : 'down',
      head: `${up ? 'Up' : 'Down'} ${Math.abs(card.growth30)}% on last month`,
      detail: `${xpText(card.xp30)} in the last 30 days, against ${xpText(card.xp30Before)} in the 30 before. ${why.join(' ')}`,
      bars: [
        { label: 'Last 30 days', value: card.xp30, text: xpText(card.xp30), lit: true },
        { label: 'The 30 before', value: card.xp30Before, text: xpText(card.xp30Before) },
      ],
      figures: [
        { label: 'Tasks', value: `${recent.tasks} (was ${before.tasks})` },
        { label: 'Days worked', value: `${recent.days} (was ${before.days})` },
        { label: 'XP a task', value: `${Math.round(perRecent)} (was ${Math.round(perBefore)})` },
      ],
    });
  } else if (card.growth30 === null && card.xp30 > 0) {
    const brandNew = card.xp30 >= card.xp;
    add(brandNew ? 45 : 55, {
      key: 'momentum',
      tone: 'up',
      head: brandNew ? 'New this month' : 'Back after a break',
      detail: brandNew
        ? `All ${xpText(card.xp)} here came in the last 30 days, over ${plural(recent.tasks, 'task')}.`
        : `Nothing in the 30 days before, then ${xpText(card.xp30)} in the last 30 over ${plural(
            recent.tasks,
            'task',
          )}.`,
      figures: [
        { label: 'Tasks', value: recent.tasks.toLocaleString() },
        { label: 'Days worked', value: recent.days.toLocaleString() },
        { label: 'XP a task', value: Math.round(perRecent).toLocaleString() },
      ],
    });
  }

  // ---- How it goes, against everything else -------------------------------
  const execHere = meanRating(mine, 'execution');
  const execElse = meanRating(others, 'execution');
  const hardHere = meanRating(mine, 'difficulty');
  const hardElse = meanRating(others, 'difficulty');
  const execGap = execHere !== null && execElse !== null ? execHere - execElse : 0;
  const hardGap = hardHere !== null && hardElse !== null ? hardHere - hardElse : 0;
  const ratedHere = mine.filter((task) => ratingOf(task, 'execution') !== null);
  const hardShare = (list: Task[]) => {
    const rated = list.filter((task) => ratingOf(task, 'difficulty') !== null);
    return share(rated.filter((task) => ratingOf(task, 'difficulty')! >= 4).length, rated.length);
  };
  const strongShare = share(ratedHere.filter((task) => ratingOf(task, 'execution')! >= 4).length, ratedHere.length);

  if (Math.abs(execGap) >= 0.4 && Math.abs(execGap) >= Math.abs(hardGap)) {
    add(55 + Math.abs(execGap) * 20, {
      key: 'ratings',
      tone: execGap > 0 ? 'up' : 'down',
      head: execGap > 0 ? 'It goes better than your other work' : 'It goes worse than your other work',
      detail: `You rate how it went ${outOf5(execHere!)} out of 5 here, against ${outOf5(
        execElse!,
      )} everywhere else. That's across ${plural(ratedHere.length, 'rated task')}.`,
      bars: [
        { label: 'Here', value: execHere!, text: `${outOf5(execHere!)} / 5`, lit: true },
        { label: 'Elsewhere', value: execElse!, text: `${outOf5(execElse!)} / 5` },
      ],
      figures: [
        { label: 'Went Strong or better', value: `${strongShare}%` },
        { label: 'Rated Hard or Brutal', value: `${hardShare(mine)}% (others ${hardShare(others)}%)` },
      ],
    });
  } else if (Math.abs(hardGap) >= 0.4) {
    add(50 + Math.abs(hardGap) * 20, {
      key: 'ratings',
      tone: 'note',
      head: hardGap > 0 ? 'Harder than the rest' : 'Easier than the rest',
      detail: `You rate it ${outOf5(hardHere!)} out of 5 for difficulty, against ${outOf5(
        hardElse!,
      )} for your other work. How it went is ${
        Math.abs(execGap) < 0.2 ? 'about the same' : execGap > 0 ? 'a bit better here' : 'a bit worse here'
      }.`,
      bars: [
        { label: 'Here', value: hardHere!, text: `${outOf5(hardHere!)} / 5`, lit: true },
        { label: 'Elsewhere', value: hardElse!, text: `${outOf5(hardElse!)} / 5` },
      ],
      figures: [
        { label: 'Rated Hard or Brutal', value: `${hardShare(mine)}% (others ${hardShare(others)}%)` },
        { label: 'Went Strong or better', value: `${strongShare}%` },
      ],
    });
  }

  // Whether the ratings here are moving: the latest stretch against the one before.
  if (ratedHere.length >= 16) {
    const stretch = Math.min(20, Math.floor(ratedHere.length / 2));
    const latest = ratedHere.slice(-stretch).map((task) => ratingOf(task, 'execution')!);
    const earlier = ratedHere.slice(-stretch * 2, -stretch).map((task) => ratingOf(task, 'execution')!);
    const now = mean(latest);
    const then = mean(earlier);
    if (Math.abs(now - then) >= 0.4) {
      const rising = now > then;
      add(50 + Math.abs(now - then) * 20, {
        key: 'trend',
        tone: rising ? 'up' : 'down',
        head: rising ? 'Your ratings here are climbing' : 'Your ratings here are slipping',
        detail: `Your last ${stretch} rated tasks average ${outOf5(now)} out of 5 for how they went. The ${stretch} before that averaged ${outOf5(
          then,
        )}.`,
        bars: [
          { label: `Last ${stretch}`, value: now, text: `${outOf5(now)} / 5`, lit: true },
          { label: `${stretch} before`, value: then, text: `${outOf5(then)} / 5` },
        ],
        figures: [
          { label: 'Strong or better lately', value: `${share(latest.filter((n) => n >= 4).length, latest.length)}%` },
          { label: 'Before that', value: `${share(earlier.filter((n) => n >= 4).length, earlier.length)}%` },
          { label: 'Last rated', value: clip(ratedHere[ratedHere.length - 1]!.title) },
        ],
      });
    }
  }

  // How the hard ones go against the easier ones.
  const bothRated = mine.filter(
    (task) => ratingOf(task, 'difficulty') !== null && ratingOf(task, 'execution') !== null,
  );
  const hardOnes = bothRated.filter((task) => ratingOf(task, 'difficulty')! >= 4);
  const easyOnes = bothRated.filter((task) => ratingOf(task, 'difficulty')! <= 3);
  if (hardOnes.length >= 5 && easyOnes.length >= 5) {
    const hardGoes = mean(hardOnes.map((task) => ratingOf(task, 'execution')!));
    const easyGoes = mean(easyOnes.map((task) => ratingOf(task, 'execution')!));
    const drop = easyGoes - hardGoes;
    const holds = drop <= 0.2 && hardOnes.length / bothRated.length >= 0.2;
    if (drop >= 0.7 || holds) {
      add(holds ? 40 : 48 + drop * 10, {
        key: 'pressure',
        tone: holds ? 'up' : 'down',
        head: !holds
          ? 'Hard tasks go a lot worse here'
          : drop <= -0.3
            ? 'Hard tasks go better here'
            : 'Hard tasks go just as well here',
        detail: `When you rate a task Hard or Brutal, it goes ${outOf5(hardGoes)} out of 5. Easier ones go ${outOf5(
          easyGoes,
        )}. ${share(hardOnes.length, bothRated.length)}% of your rated tasks here were Hard or Brutal.`,
        bars: [
          { label: 'Hard or Brutal', value: hardGoes, text: `${outOf5(hardGoes)} / 5`, lit: true },
          { label: 'Easier', value: easyGoes, text: `${outOf5(easyGoes)} / 5` },
        ],
        figures: [
          { label: 'Hard or Brutal tasks', value: hardOnes.length.toLocaleString() },
          { label: 'Easier tasks', value: easyOnes.length.toLocaleString() },
        ],
      });
    }
  }

  // ---- Task size -----------------------------------------------------------
  const otherCards = cards.filter((other) => other.key !== card.key);
  const otherXp = otherCards.reduce((sum, other) => sum + other.xp, 0);
  const otherTasks = otherCards.reduce((sum, other) => sum + other.tasks, 0);
  if (card.tasks >= 3 && otherTasks >= 3) {
    const elsewhere = otherXp / otherTasks;
    const ratio = card.perTask / Math.max(1, elsewhere);
    const biggest = mine.reduce<Task | null>((top, task) => (!top || xpOf(task) >= xpOf(top) ? task : top), null);
    const typical = Math.round(median(mine.map(xpOf)));
    const sizeFigures: InsightFigure[] = [
      ...(biggest ? [{ label: `Biggest (${xpText(xpOf(biggest))})`, value: clip(biggest.title) }] : []),
      { label: 'Typical task', value: xpText(typical) },
    ];
    const sizeBars: InsightBar[] = [
      { label: 'Here', value: card.perTask, text: `${Math.round(card.perTask)} XP`, lit: true },
      { label: 'Elsewhere', value: elsewhere, text: `${Math.round(elsewhere)} XP` },
    ];
    if (ratio >= 1.25 || ratio <= 0.8) {
      add(42, {
        key: 'size',
        tone: 'note',
        head: ratio > 1 ? 'Bigger tasks than usual' : 'Smaller tasks than usual',
        detail: `${Math.round(card.perTask)} XP a task here, against ${Math.round(
          elsewhere,
        )} across your other subjects. That's about ${
          ratio > 1 ? `${ratio.toFixed(1)} times the size` : `${Math.round(ratio * 100)}% of the size`
        }.${biggest ? ` Your biggest here was worth ${xpText(xpOf(biggest))} on ${when(dayOf(biggest))}.` : ''}`,
        bars: sizeBars,
        figures: sizeFigures,
      });
    } else {
      add(15, {
        key: 'size',
        tone: 'note',
        head: 'Tasks about your usual size',
        detail: `${Math.round(card.perTask)} XP a task here, against ${Math.round(
          elsewhere,
        )} across your other subjects.${biggest ? ` Your biggest here was worth ${xpText(xpOf(biggest))} on ${when(dayOf(biggest))}.` : ''}`,
        bars: sizeBars,
        figures: sizeFigures,
      });
    }
  }

  // ---- Time on it ------------------------------------------------------------
  const timed = (list: Task[]) =>
    list
      .map((task) => ({ task, seconds: secondsSpent(task) }))
      .filter((entry): entry is { task: Task; seconds: number } => entry.seconds !== null);
  const timedHere = timed(mine);
  if (timedHere.length >= 5) {
    const minutes = timedHere.map((entry) => entry.seconds / 60);
    const perHour = (list: Array<{ task: Task; seconds: number }>) =>
      list.reduce((sum, entry) => sum + xpOf(entry.task), 0) /
      Math.max(1 / 60, list.reduce((sum, entry) => sum + entry.seconds, 0) / 3600);
    const hereRate = perHour(timedHere);
    const timedElse = timed(others);
    const elseRate = timedElse.length >= 5 ? perHour(timedElse) : null;
    const rateGap = elseRate ? hereRate / elseRate - 1 : 0;
    const hours30 =
      timedHere.filter((entry) => dayOf(entry.task) >= from30).reduce((sum, entry) => sum + entry.seconds, 0) / 3600;
    add(Math.abs(rateGap) >= 0.2 ? 46 : 28, {
      key: 'time',
      tone: 'note',
      head: `About ${minutesText(median(minutes))} a task`,
      detail: `That's from ${plural(timedHere.length, 'task')} here with a time on them. They earn ${Math.round(
        hereRate,
      )} XP an hour${elseRate ? `, against ${Math.round(elseRate)} in the rest of your work` : ''}.`,
      ...(elseRate
        ? {
            bars: [
              { label: 'Here', value: hereRate, text: `${Math.round(hereRate)} XP/hr`, lit: true },
              { label: 'Elsewhere', value: elseRate, text: `${Math.round(elseRate)} XP/hr` },
            ],
          }
        : {}),
      figures: [
        { label: 'Longest', value: minutesText(Math.max(...minutes)) },
        { label: 'Hours, last 30 days', value: hours30 >= 10 || hours30 === 0 ? Math.round(hours30).toString() : hours30.toFixed(1) },
      ],
    });
  }

  // ---- Deadlines -------------------------------------------------------------
  const dated = (list: Task[]) => list.filter((task) => typeof task.met_deadline === 'boolean');
  const datedHere = dated(mine);
  const datedElse = dated(others);
  if (datedHere.length >= 5 && datedElse.length >= 5) {
    const lateHere = datedHere.filter((task) => !task.met_deadline);
    const rateHere = share(datedHere.length - lateHere.length, datedHere.length);
    const rateElse = share(datedElse.filter((task) => task.met_deadline).length, datedElse.length);
    const recentDated = datedHere.filter((task) => dayOf(task) >= from30);
    const recentLate = recentDated.filter((task) => !task.met_deadline).length;
    if (Math.abs(rateHere - rateElse) >= 8 || rateHere <= 75) {
      const better = rateHere >= rateElse;
      const lastLate = lateHere[lateHere.length - 1];
      add(40 + Math.min(20, Math.abs(rateHere - rateElse)), {
        key: 'deadlines',
        tone: better ? 'up' : 'down',
        head: better ? `You beat ${rateHere}% of deadlines here` : 'Deadlines slip more here',
        detail: `${lateHere.length.toLocaleString()} of ${plural(
          datedHere.length,
          'task',
        )} with a deadline finished late. Elsewhere you beat ${rateElse}%.${
          recentDated.length ? ` In the last 30 days, ${recentLate} of ${recentDated.length} were late.` : ''
        }`,
        bars: [
          { label: 'Here', value: rateHere, text: `${rateHere}%`, lit: true },
          { label: 'Elsewhere', value: rateElse, text: `${rateElse}%` },
        ],
        figures: lastLate
          ? [{ label: `Last late (${when(dayOf(lastLate))})`, value: clip(lastLate.title) }]
          : [],
      });
    }
  }

  // ---- When it gets done ---------------------------------------------------
  if (mine.length >= 5) {
    const byDay = new Array<number>(7).fill(0);
    const rateByDay: number[][] = Array.from({ length: 7 }, () => []);
    mine.forEach((task) => {
      const weekday = new Date(`${dayOf(task)}T00:00:00`).getDay();
      byDay[weekday]! += 1;
      const rating = ratingOf(task, 'execution');
      if (rating !== null) rateByDay[weekday]!.push(rating);
    });
    const top = byDay.indexOf(Math.max(...byDay));
    const low = byDay.indexOf(Math.min(...byDay));
    const topShare = byDay[top]! / mine.length;
    const ratedDays = rateByDay
      .map((list, weekday) => ({ weekday, avg: list.length >= 3 ? mean(list) : null }))
      .filter((entry): entry is { weekday: number; avg: number } => entry.avg !== null)
      .sort((a, b) => b.avg - a.avg);
    const bestDay = ratedDays.length >= 3 && ratedDays[0]!.avg - ratedDays[ratedDays.length - 1]!.avg >= 0.4
      ? ratedDays[0]!
      : null;
    // Monday first, the way a week reads on the calendar.
    const order = [1, 2, 3, 4, 5, 6, 0];
    const standsOut = topShare >= 0.22;
    add(standsOut ? 35 + topShare * 30 : 20, {
      key: 'weekday',
      tone: 'note',
      head: standsOut ? `${WEEKDAYS[top]} is your day for it` : 'Spread across the week',
      detail: `${share(byDay[top]!, mine.length)}% of your tasks here land on a ${WEEKDAYS[top]}. ${
        WEEKDAYS[low]
      } is the quietest at ${share(byDay[low]!, mine.length)}%.${
        bestDay ? ` They go best on ${WEEKDAYS[bestDay.weekday]}s, at ${outOf5(bestDay.avg)} out of 5.` : ''
      }`,
      bars: order.map((weekday) => ({
        label: WEEKDAYS[weekday]!.slice(0, 3),
        value: byDay[weekday]!,
        text: `${byDay[weekday]}`,
        lit: weekday === top,
      })),
      figures: [],
    });

    const parts = new Map<DayPart, { count: number; ratings: number[] }>();
    mine.forEach((task) => {
      const part = partOfDay(task);
      if (!part) return;
      const entry = parts.get(part) ?? { count: 0, ratings: [] };
      entry.count += 1;
      const rating = ratingOf(task, 'execution');
      if (rating !== null) entry.ratings.push(rating);
      parts.set(part, entry);
    });
    const [part, info] = [...parts].sort((a, b) => b[1].count - a[1].count)[0] ?? [null, null];
    if (part && info && info.count / mine.length >= 0.5) {
      const ratedParts = [...parts]
        .filter(([, entry]) => entry.ratings.length >= 3)
        .map(([name, entry]) => ({ name, avg: mean(entry.ratings) }))
        .sort((a, b) => b.avg - a.avg);
      const spread =
        ratedParts.length >= 2 && ratedParts[0]!.avg - ratedParts[ratedParts.length - 1]!.avg >= 0.4
          ? { best: ratedParts[0]!, worst: ratedParts[ratedParts.length - 1]! }
          : null;
      const allParts: DayPart[] = ['morning', 'afternoon', 'evening', 'night'];
      add(32 + (info.count / mine.length) * 30, {
        key: 'time-of-day',
        tone: 'note',
        head:
          part === 'night'
            ? 'Mostly done late at night'
            : `Mostly a${part === 'afternoon' || part === 'evening' ? 'n' : ''} ${part} subject`,
        detail: `${share(info.count, mine.length)}% of your tasks here get finished ${PART_PHRASE[part]}.${
          spread
            ? ` They go best ${PART_PHRASE[spread.best.name]} (${outOf5(spread.best.avg)} out of 5) and worst ${
                PART_PHRASE[spread.worst.name]
              } (${outOf5(spread.worst.avg)}).`
            : ''
        }`,
        bars: allParts.map((name) => ({
          label: name === 'afternoon' ? 'Aft' : name === 'morning' ? 'Morn' : name === 'evening' ? 'Eve' : 'Night',
          value: parts.get(name)?.count ?? 0,
          text: `${parts.get(name)?.count ?? 0}`,
          lit: name === part,
        })),
        figures: [],
      });
    }
  }

  // ---- The work itself: what you keep coming back to -----------------------
  if (mine.length >= 8) {
    const groups = new Map<string, { count: number; title: string; lastOn: string }>();
    mine.forEach((task) => {
      const key = titleKey(task.title);
      if (!key) return;
      const entry = groups.get(key) ?? { count: 0, title: task.title, lastOn: dayOf(task) };
      entry.count += 1;
      entry.title = task.title;
      entry.lastOn = dayOf(task);
      groups.set(key, entry);
    });
    const ranked = [...groups.values()].sort((a, b) => b.count - a.count);
    const topTask = ranked[0];
    if (topTask && topTask.count >= 5 && topTask.count / mine.length >= 0.08) {
      const runnersUp = ranked.slice(1, 3).filter((entry) => entry.count >= 3);
      add(36 + (topTask.count / mine.length) * 20, {
        key: 'repeat',
        tone: 'note',
        head: 'Your most repeated task',
        detail: `${clip(topTask.title, 60)} makes up ${topTask.count.toLocaleString()} of your ${mine.length.toLocaleString()} tasks here, about ${share(
          topTask.count,
          mine.length,
        )}%. You last did it ${agoText(daysBetween(topTask.lastOn, todayIso))}.`,
        figures: [topTask, ...runnersUp].map((entry) => ({
          label: plural(entry.count, 'time'),
          value: clip(entry.title),
        })),
      });
    }
  }

  // ---- The next level, at the current pace ---------------------------------
  if (!card.level.maxed && card.xp30 > 0) {
    const perDay = card.xp30 / 30;
    const inDays = Math.max(1, Math.ceil(card.level.toNext / perDay));
    const tasksToGo = Math.max(1, Math.ceil(card.level.toNext / Math.max(1, card.perTask)));
    add(inDays <= 14 ? 52 : 38, {
      key: 'next',
      tone: 'up',
      head: `Level ${card.level.tier + 1} in about ${plural(inDays, 'day')}`,
      detail: `${xpText(card.level.toNext)} to go at your recent pace of ${Math.max(
        1,
        Math.round(perDay),
      )} XP a day. That's about ${plural(tasksToGo, 'task')} at your usual size.`,
      figures: [
        { label: 'Level now', value: `${card.level.tier}` },
        { label: 'XP to go', value: Math.round(card.level.toNext).toLocaleString() },
        { label: 'Tasks to go', value: `About ${tasksToGo}` },
      ],
    });
  }

  // ---- Always there: where it ranks, and what's behind it ------------------
  const ranked = [...cards].sort((a, b) => b.xp - a.xp);
  const place = ranked.findIndex((other) => other.key === card.key) + 1;
  const total = cards.reduce((sum, other) => sum + other.xp, 0);
  const above = place > 1 ? ranked[place - 2] : undefined;
  const below = ranked[place];
  const neighbor = above
    ? ` You're ${xpText(above.xp - card.xp)} behind ${above.name} in ${ordinal(place - 1)}.`
    : below
      ? ` You're ${xpText(card.xp - below.xp)} ahead of ${below.name} in 2nd.`
      : '';
  add(place === 1 && cards.length > 1 ? 40 : 25, {
    key: 'rank',
    tone: 'note',
    head:
      cards.length === 1
        ? 'Your only subject so far'
        : place === 1
          ? 'Your biggest subject'
          : `Your ${ordinal(place)} biggest subject`,
    detail: `${share(card.xp, total)}% of all the XP you've filed under a subject, out of ${plural(
      cards.length,
      'subject',
    )}.${neighbor}`,
    figures: [
      { label: 'XP here', value: Math.round(card.xp).toLocaleString() },
      { label: 'Share', value: `${share(card.xp, total)}%` },
      ...(above ? [{ label: 'Next up', value: above.name }] : []),
    ],
  });

  const firstDay = days[0];
  const byMonth = new Map<string, number>();
  mine.forEach((task) => {
    const month = dayOf(task).slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + xpOf(task));
  });
  const bestMonth = [...byMonth].sort((a, b) => b[1] - a[1])[0];
  add(10, {
    key: 'history',
    tone: 'note',
    head: `${plural(card.tasks, 'task')} on ${plural(days.length, 'day')}`,
    detail: firstDay
      ? `Your first one here was on ${when(firstDay)}${
          todayIso && daysBetween(firstDay, todayIso) > 0 ? `, ${plural(daysBetween(firstDay, todayIso), 'day')} ago` : ''
        }.${bestMonth && byMonth.size > 1 ? ` Your best month was ${monthText(bestMonth[0])} with ${xpText(bestMonth[1])}.` : ''}`
      : `${xpText(card.xp)} in all.`,
    figures: [
      ...(firstDay ? [{ label: 'First task', value: when(firstDay) }] : []),
      ...(bestMonth ? [{ label: 'Best month', value: `${monthText(bestMonth[0])}, ${xpText(bestMonth[1])}` }] : []),
    ],
  });

  return candidates.sort((a, b) => b.weight - a.weight).map(({ weight: _weight, ...insight }) => insight);
}
