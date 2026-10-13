/**
 * The skill cards on the Subjects tab: how they sort, which ones show, the
 * weekly trend drawn on each, and the three insights a picked card brings up.
 *
 * Everything here reads finished tasks and the cards `skillCards` already
 * built. Nothing is advice: advice lives on the Recommendations tab, and these
 * are things the record shows about one subject, said plainly.
 */
import type { Task } from '@/types';
import type { SkillCard } from './growthSkills';

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
    .sort((a, b) => dayOf(a).localeCompare(dayOf(b)));
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
// Three insights
// --------------------------------------------------------------------------
export interface SubjectInsight {
  key: string;
  tone: 'up' | 'down' | 'note';
  head: string;
  detail: string;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ORDINAL = ['', '', '2nd', '3rd'];
const ordinal = (n: number) => ORDINAL[n] ?? `${n}th`;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Mean of a rating over the tasks that have one, or null under `floor` of them. */
function meanRating(tasks: Task[], field: 'difficulty' | 'execution', floor = 3): number | null {
  const rated = tasks.map((task) => task[field]).filter((value): value is number => typeof value === 'number');
  if (rated.length < floor) return null;
  return rated.reduce((sum, value) => sum + value, 0) / rated.length;
}

/** Morning, afternoon, evening or night, from the time on `completed_at`. */
function partOfDay(task: Task): string | null {
  const hour = Number((task.completed_at || '').slice(11, 13));
  if (!task.completed_at || task.completed_at.length < 13 || Number.isNaN(hour)) return null;
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/**
 * The three most telling things the record shows about one subject.
 *
 * Every candidate gets a weight and the top three win, so a subject that's gone
 * quiet leads with that and a busy one leads with its momentum. Two candidates
 * (where it ranks, and how much work is behind it) always exist once there's a
 * card at all, which is what makes "three" a promise rather than a hope.
 */
export function subjectInsights(
  card: SkillCard,
  cards: SkillCard[],
  tasks: Task[],
  todayIso: string,
): SubjectInsight[] {
  const mine = doneIn(tasks, card.key);
  const candidates: Array<SubjectInsight & { weight: number }> = [];
  const add = (weight: number, insight: SubjectInsight) => candidates.push({ ...insight, weight });

  // ---- Momentum: the last 30 days against the 30 before -------------------
  const days = [...new Set(mine.map(dayOf))];
  if (card.growth30 !== null && card.growth30 !== 0) {
    const up = card.growth30 > 0;
    add(30 + Math.min(50, Math.abs(card.growth30) / 2), {
      key: 'momentum',
      tone: up ? 'up' : 'down',
      head: `${up ? 'Up' : 'Down'} ${Math.abs(card.growth30)}% on last month`,
      detail: `${plural(Math.round(card.xp30), 'XP', 'XP')} in the last 30 days, against ${Math.round(
        card.xp30Before,
      ).toLocaleString()} in the 30 before.`,
    });
  } else if (card.growth30 === null && card.xp30 > 0) {
    const brandNew = card.xp30 >= card.xp;
    add(brandNew ? 45 : 55, {
      key: 'momentum',
      tone: 'up',
      head: brandNew ? 'New this month' : 'Back after a break',
      detail: brandNew
        ? `All ${plural(Math.round(card.xp), 'XP', 'XP')} here came in the last 30 days.`
        : `Nothing in the 30 days before, then ${Math.round(card.xp30).toLocaleString()} XP in the last 30.`,
    });
  }

  // ---- Rhythm: how often you come back, and whether you're late -----------
  const gaps = days.slice(1).map((day, index) => daysBetween(days[index]!, day));
  const usual = gaps.length >= 2 ? Math.max(1, Math.round(median(gaps))) : null;
  if (card.daysSince !== null && card.daysSince >= COOLING_DAYS) {
    add(90, {
      key: 'rhythm',
      tone: 'down',
      head: `Quiet for ${card.daysSince} days`,
      detail:
        usual !== null
          ? `You usually come back every ${plural(usual, 'day')}. The last task was on ${shortDate(card.lastOn!)}.`
          : `The last task was on ${shortDate(card.lastOn!)}.`,
    });
  } else if (usual !== null) {
    const late = card.daysSince !== null && card.daysSince > usual * 2 && card.daysSince >= 3;
    add(late ? 60 : 30, {
      key: 'rhythm',
      tone: late ? 'down' : 'note',
      head: late ? `Overdue by your usual rhythm` : `You come back every ${plural(usual, 'day')} or so`,
      detail: late
        ? `It's been ${card.daysSince} days. Your usual gap here is ${plural(usual, 'day')}.`
        : `That's the typical gap between days with work here. The last one was ${
            card.daysSince === 0 ? 'today' : card.daysSince === 1 ? 'yesterday' : `${card.daysSince} days ago`
          }.`,
    });
  }

  // ---- How it goes, against everything else -------------------------------
  const others = tasks.filter((task) => task.status === 'done' && task.subject !== card.key);
  const execHere = meanRating(mine, 'execution');
  const execElse = meanRating(others, 'execution');
  const hardHere = meanRating(mine, 'difficulty');
  const hardElse = meanRating(others, 'difficulty');
  const execGap = execHere !== null && execElse !== null ? execHere - execElse : 0;
  const hardGap = hardHere !== null && hardElse !== null ? hardHere - hardElse : 0;
  if (Math.abs(execGap) >= 0.4 && Math.abs(execGap) >= Math.abs(hardGap)) {
    add(55 + Math.abs(execGap) * 20, {
      key: 'ratings',
      tone: execGap > 0 ? 'up' : 'down',
      head: execGap > 0 ? 'It goes better than your other work' : 'It goes worse than your other work',
      detail: `You rate how it went ${execHere!.toFixed(1)} out of 5 here, against ${execElse!.toFixed(1)} everywhere else.`,
    });
  } else if (Math.abs(hardGap) >= 0.4) {
    add(50 + Math.abs(hardGap) * 20, {
      key: 'ratings',
      tone: 'note',
      head: hardGap > 0 ? 'Harder than the rest' : 'Easier than the rest',
      detail: `You rate it ${hardHere!.toFixed(1)} out of 5 for difficulty, against ${hardElse!.toFixed(1)} for your other subjects.`,
    });
  }

  // ---- When it gets done ---------------------------------------------------
  if (mine.length >= 5) {
    const byDay = new Array<number>(7).fill(0);
    mine.forEach((task) => {
      byDay[new Date(`${dayOf(task)}T00:00:00`).getDay()]! += 1;
    });
    const top = byDay.indexOf(Math.max(...byDay));
    const share = byDay[top]! / mine.length;
    if (share >= 0.3) {
      add(35 + share * 30, {
        key: 'weekday',
        tone: 'note',
        head: `${WEEKDAYS[top]} is your day for it`,
        detail: `${byDay[top]} of your ${mine.length} tasks here were finished on a ${WEEKDAYS[top]}.`,
      });
    }

    const parts = new Map<string, number>();
    mine.forEach((task) => {
      const part = partOfDay(task);
      if (part) parts.set(part, (parts.get(part) ?? 0) + 1);
    });
    const [part, count] = [...parts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    if (part && count / mine.length >= 0.5) {
      add(32 + (count / mine.length) * 30, {
        key: 'time',
        tone: 'note',
        head: part === 'night' ? 'Mostly done late at night' : `Mostly a${part === 'afternoon' || part === 'evening' ? 'n' : ''} ${part} subject`,
        detail: `${count} of your ${mine.length} tasks here were finished in the ${part === 'night' ? 'small hours' : part}.`,
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
    if (ratio >= 1.25 || ratio <= 0.8) {
      add(42, {
        key: 'size',
        tone: 'note',
        head: ratio > 1 ? 'Bigger tasks than usual' : 'Smaller tasks than usual',
        detail: `${Math.round(card.perTask)} XP a task here, against ${Math.round(elsewhere)} across your other subjects.`,
      });
    }
  }

  // ---- The next level, at the current pace ---------------------------------
  if (!card.level.maxed && card.xp30 > 0) {
    const perDay = card.xp30 / 30;
    const inDays = Math.max(1, Math.ceil(card.level.toNext / perDay));
    add(inDays <= 14 ? 52 : 38, {
      key: 'next',
      tone: 'up',
      head: `Level ${card.level.tier + 1} in about ${plural(inDays, 'day')}`,
      detail: `${Math.round(card.level.toNext).toLocaleString()} XP to go at your recent pace of ${Math.max(
        1,
        Math.round(perDay),
      )} XP a day.`,
    });
  }

  // ---- Always there: where it ranks, and what's behind it ------------------
  const ranked = [...cards].sort((a, b) => b.xp - a.xp);
  const place = ranked.findIndex((other) => other.key === card.key) + 1;
  const total = cards.reduce((sum, other) => sum + other.xp, 0);
  const share = total > 0 ? Math.round((card.xp / total) * 100) : 0;
  add(place === 1 && cards.length > 1 ? 40 : 25, {
    key: 'rank',
    tone: 'note',
    head:
      cards.length === 1
        ? 'Your only subject so far'
        : place === 1
          ? 'Your biggest subject'
          : `Your ${ordinal(place)} biggest subject`,
    detail: `${share}% of all the XP you've filed under a subject, out of ${plural(cards.length, 'subject')}.`,
  });

  const firstDay = days[0];
  add(10, {
    key: 'history',
    tone: 'note',
    head: `${plural(card.tasks, 'task')} on ${plural(days.length, 'day')}`,
    detail: firstDay
      ? `Your first one here was on ${shortDate(firstDay)}${
          todayIso && daysBetween(firstDay, todayIso) > 0 ? `, ${plural(daysBetween(firstDay, todayIso), 'day')} ago` : ''
        }.`
      : `${plural(Math.round(card.xp), 'XP', 'XP')} in all.`,
  });

  return candidates
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(({ weight: _weight, ...insight }) => insight);
}
