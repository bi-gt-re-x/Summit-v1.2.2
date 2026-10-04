/**
 * The arithmetic behind Skills & Subjects — what the reader is becoming good at.
 *
 * ## Subjects are the skills
 *
 * There is one thing in this account that says what a piece of work was *about*
 * — the subject on a task — and everything in this file is counted off it.
 * There is no separate skill model: `backend/tracking/tree.py` is a stub, and a
 * page of levels invented on top of nothing would be the worst thing this tab
 * could be. So a subject the reader has finished tasks in is a skill, its XP is
 * the XP of those tasks, and every figure below follows from those two.
 *
 * ## The level is the mastery ladder, read continuously
 *
 * A hundred levels with twenty-one named bands, in utils/mastery. What is
 * different here is that this reads the *fraction*, because a page about
 * getting better at something has to be able to show a week's work, and a week
 * rarely finishes a level.
 *
 * This used to be the account's own ladder — level N costs N × 100 XP, the rule
 * in backend/tracking/xp.py — on the argument that a skill should not be a
 * second currency. That argument lost to two facts about the curve: it was
 * linear, so the levels a real subject actually reaches were the cheap ones and
 * everything past thirty was unreachable; and six rank names over an unbounded
 * ladder meant the last one arrived at level eleven. The account's level is
 * unchanged. See the note at the top of utils/mastery for why the two curves
 * are allowed to differ.
 *
 * ## The tree is a mastery track, and says so
 *
 * A skill tree with prerequisites — Python before Data Science before PyTorch —
 * needs a graph somebody wrote down, and nobody has. What the data does support
 * is a ladder per subject: the levels ahead of the one the reader is on, what
 * each costs, and when it lands at the pace they are actually going. That is a
 * real tree of one branch, every node of it measured, and it is the version
 * this file can defend.
 */
import type { GrowthDay, Task } from '@/types';
import type { Subject } from '@/services/subjects';
import { MAX_LEVEL, masteryLevel, rankFor, xpToReach } from './mastery';
import type { MasteryLevel as SkillLevel } from './mastery';
import { levelForTotalXp } from './format';

const num = (value: unknown): number => Number(value) || 0;

/** ISO date `n` days from `iso`. Local, no timezone arithmetic. */
function shiftDay(iso: string, n: number): string {
  const at = new Date(`${iso}T00:00:00`);
  at.setDate(at.getDate() + n);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(
    at.getDate(),
  ).padStart(2, '0')}`;
}

// --------------------------------------------------------------------------
// Levels
// --------------------------------------------------------------------------
/**
 * The ladder, re-exported.
 *
 * `SkillLevel` is `MasteryLevel` under the name the rest of this file and its
 * components already use, and the two helpers keep the names their callers know
 * them by. The arithmetic all lives in utils/mastery — the table is long enough
 * that it deserves its own file, and keeping it out of here is what stops a
 * hundred hard-coded numbers from sitting in the middle of the counting code.
 */
export { MAX_LEVEL, costOf, rankFor, tierFor, nextTier, xpToReach } from './mastery';
export type { MasteryLevel as SkillLevel, Tier } from './mastery';

/** Where a subject's lifetime XP lands on the mastery ladder. */
export const skillLevel = masteryLevel;

// --------------------------------------------------------------------------
// The cards
// --------------------------------------------------------------------------
export interface SkillCard {
  key: string;
  label: string;
  /** The subject's full name, where the catalogue has one. */
  name: string;
  /** The icon file under /static/icons, where the catalogue has one. */
  icon?: string;
  xp: number;
  tasks: number;
  level: SkillLevel;
  rank: string;
  /** XP earned in this subject over the last 30 days, and the 30 before it. */
  xp30: number;
  xp30Before: number;
  /** Percentage change between those two, or null with no earlier window. */
  growth30: number | null;
  /** XP over the last 182 days, as a share of the subject's lifetime total. */
  growth180: number;
  /** The last day a task in this subject was finished. */
  lastOn: string | null;
  /** Days since that, or null if nothing is finished. */
  daysSince: number | null;
  /** Distinct days with a finished task in the last 30. */
  activeDays: number;
  /** XP a task, which is the closest thing the data has to "how hard". */
  perTask: number;
}

/**
 * One card per subject the account has finished work in, biggest first.
 *
 * Unfiled tasks are deliberately not a card. They are XP with nothing to say
 * about what it was for, and a card called "Other" at the top of a skills page
 * would be the biggest skill on most accounts and the least meaningful.
 */
export function skillCards(
  tasks: Task[],
  subjects: Map<string, Subject>,
  todayIso: string,
): SkillCard[] {
  const from30 = shiftDay(todayIso, -29);
  const from60 = shiftDay(todayIso, -59);
  const from182 = shiftDay(todayIso, -181);

  interface Bucket {
    label: string;
    name: string;
    icon?: string;
    xp: number;
    tasks: number;
    xp30: number;
    xp30Before: number;
    xp182: number;
    days: Set<string>;
    recentDays: Set<string>;
    lastOn: string | null;
  }

  const buckets = new Map<string, Bucket>();

  tasks.forEach((task) => {
    if (task.status !== 'done') return;
    const day = (task.completed_at || '').slice(0, 10);
    if (!day) return;
    const subject = (task.subject && subjects.get(task.subject)) || null;
    if (!subject) return;

    const bucket = buckets.get(subject.id) ?? {
      label: subject.label,
      name: subject.name,
      ...(subject.icon ? { icon: subject.icon } : {}),
      xp: 0,
      tasks: 0,
      xp30: 0,
      xp30Before: 0,
      xp182: 0,
      days: new Set<string>(),
      recentDays: new Set<string>(),
      lastOn: null,
    };

    const xp = num(task.xp_value);
    bucket.xp += xp;
    bucket.tasks += 1;
    bucket.days.add(day);
    if (day >= from30) {
      bucket.xp30 += xp;
      bucket.recentDays.add(day);
    } else if (day >= from60) {
      bucket.xp30Before += xp;
    }
    if (day >= from182) bucket.xp182 += xp;
    if (!bucket.lastOn || day > bucket.lastOn) bucket.lastOn = day;

    buckets.set(subject.id, bucket);
  });

  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const level = skillLevel(bucket.xp);
      return {
        key,
        label: bucket.label,
        name: bucket.name,
        ...(bucket.icon ? { icon: bucket.icon } : {}),
        xp: bucket.xp,
        tasks: bucket.tasks,
        level,
        rank: rankFor(level.tier),
        xp30: bucket.xp30,
        xp30Before: bucket.xp30Before,
        growth30:
          bucket.xp30Before > 0
            ? Math.round(((bucket.xp30 - bucket.xp30Before) / bucket.xp30Before) * 100)
            : null,
        growth180: bucket.xp > 0 ? Math.round((bucket.xp182 / bucket.xp) * 100) : 0,
        lastOn: bucket.lastOn,
        daysSince: bucket.lastOn
          ? Math.round(
              (new Date(`${todayIso}T00:00:00`).getTime() -
                new Date(`${bucket.lastOn}T00:00:00`).getTime()) /
                86_400_000,
            )
          : null,
        activeDays: bucket.recentDays.size,
        perTask: bucket.tasks ? bucket.xp / bucket.tasks : 0,
      };
    })
    .sort((a, b) => b.xp - a.xp || a.label.localeCompare(b.label));
}

// --------------------------------------------------------------------------
// One skill over time
// --------------------------------------------------------------------------
export type CurveKey = '3m' | '6m' | '1y' | 'all';

export const CURVE_WINDOWS: Array<{ key: CurveKey; label: string; days: number }> = [
  { key: '3m', label: '3M', days: 90 },
  { key: '6m', label: '6M', days: 182 },
  { key: '1y', label: '1Y', days: 365 },
  { key: 'all', label: 'All', days: 0 },
];

export interface CurveMilestone {
  /** The whole level reached. */
  tier: number;
  /** Which point on the curve it lands on. */
  index: number;
  on: string;
}

export interface SkillCurve {
  /** Continuous level at each point, oldest first. */
  levels: number[];
  /** Cumulative XP at each point. */
  xp: number[];
  labels: string[];
  milestones: CurveMilestone[];
  /** The whole levels the axis is drawn against. */
  ticks: number[];
}

/** How many points the curve is drawn with, whatever the window holds. */
const CURVE_POINTS = 24;

/**
 * A subject's level over time, with its level-ups marked on it.
 *
 * Cumulative from the account's first day rather than from the window's, so the
 * line is the reader's actual level and not their level since March. The window
 * chooses which part of that line is drawn, which is a different thing from
 * choosing what it counts.
 */
export function skillCurve(
  tasks: Task[],
  subjectId: string,
  todayIso: string,
  window: CurveKey,
): SkillCurve {
  const earned = new Map<string, number>();
  let earliest = '';

  tasks.forEach((task) => {
    if (task.status !== 'done' || task.subject !== subjectId) return;
    const day = (task.completed_at || '').slice(0, 10);
    if (!day) return;
    earned.set(day, (earned.get(day) ?? 0) + num(task.xp_value));
    if (!earliest || day < earliest) earliest = day;
  });

  if (!earliest) return { levels: [], xp: [], labels: [], milestones: [], ticks: [1] };

  const shape = CURVE_WINDOWS.find((entry) => entry.key === window) ?? CURVE_WINDOWS[0]!;
  const from = shape.days > 0 ? shiftDay(todayIso, -(shape.days - 1)) : earliest;
  const start = from < earliest ? earliest : from;

  // Everything before the window still counts towards the level — the line is
  // where the reader stands, not what they earned lately.
  let running = 0;
  earned.forEach((xp, day) => {
    if (day < start) running += xp;
  });

  const span = Math.max(
    1,
    Math.round(
      (new Date(`${todayIso}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) /
        86_400_000,
    ),
  );
  const step = Math.max(1, Math.ceil((span + 1) / CURVE_POINTS));

  const levels: number[] = [];
  const xp: number[] = [];
  const labels: string[] = [];
  const milestones: CurveMilestone[] = [];
  let tier = skillLevel(running).tier;

  for (let offset = 0; offset <= span; offset += step) {
    const until = shiftDay(start, Math.min(offset + step - 1, span));
    for (let day = offset; day <= Math.min(offset + step - 1, span); day++) {
      running += earned.get(shiftDay(start, day)) ?? 0;
    }
    const level = skillLevel(running);
    if (level.tier > tier) {
      milestones.push({ tier: level.tier, index: levels.length, on: until });
      tier = level.tier;
    }
    levels.push(level.exact);
    xp.push(running);
    labels.push(
      new Date(`${until}T00:00:00`).toLocaleDateString('en-US', { month: 'short' }),
    );
  }

  const top = Math.max(...levels, 1);
  const floor = Math.max(1, Math.floor(Math.min(...levels)));
  const ticks: number[] = [];
  for (let value = floor; value <= Math.ceil(top); value++) ticks.push(value);
  if (ticks.length === 1) ticks.push(ticks[0]! + 1);

  return { levels, xp, labels, milestones, ticks };
}

// --------------------------------------------------------------------------
// The mastery track
// --------------------------------------------------------------------------
export interface TrackNode {
  tier: number;
  rank: string;
  /** Lifetime XP in this subject the node needs. */
  needs: number;
  state: 'done' | 'current' | 'locked';
  /** 0-100 through this node. 100 on a done one, 0 on a locked one. */
  percent: number;
  /** Days to reach it at the subject's own recent pace, or null with no pace. */
  inDays: number | null;
}

/**
 * The levels behind and ahead, as a track of nodes.
 *
 * Locked nodes are shown rather than hidden — a ladder you cannot see the top
 * of is not a ladder — and they carry an estimate, because "Expert is 2,400 XP
 * away" is a fact and "Expert is about four months away at your pace" is the
 * same fact in a unit anybody plans in. The pace is the subject's last 30 days,
 * stated on the panel.
 */
export function masteryTrack(card: SkillCard, ahead = 3): TrackNode[] {
  const perDay = card.xp30 / 30;
  const nodes: TrackNode[] = [];
  const from = Math.max(1, card.level.tier - 2);
  // The ladder ends at 100, so the rungs ahead do too — an Eternal subject
  // shows the last few behind it and nothing after, rather than three locked
  // nodes that can never be reached.
  const to = Math.min(MAX_LEVEL, card.level.tier + ahead);

  for (let tier = from; tier <= to; tier++) {
    const needs = xpToReach(tier);
    const state: TrackNode['state'] =
      tier < card.level.tier ? 'done' : tier === card.level.tier ? 'current' : 'locked';
    const remaining = Math.max(0, needs - card.xp);
    nodes.push({
      tier,
      rank: rankFor(tier),
      needs,
      state,
      percent: state === 'done' ? 100 : state === 'current' ? Math.round(card.level.percent) : 0,
      inDays: state === 'locked' && perDay > 0 ? Math.ceil(remaining / perDay) : null,
    });
  }

  return nodes;
}

// --------------------------------------------------------------------------
// Balance
// --------------------------------------------------------------------------
export interface BalanceAxis {
  key: string;
  label: string;
  /** 0-100 against the best of the account's own subjects. */
  value: number;
  /** What the axis is, in a sentence. The panel prints it. */
  note: string;
}

/**
 * Five readings of one subject, each against the best the account has.
 *
 * The axes are deliberately not five names for volume. Knowledge and Practice
 * are volume — total XP, total tasks — and would move together on any account;
 * the other three are the ones that separate "I have spent a lot of time on
 * this" from "I am actually getting better at it". A subject with high Practice
 * and low Difficulty is being drilled; high Difficulty and low Consistency is
 * being crammed.
 *
 * Everything is relative to the account's own strongest subject on that axis,
 * because there is no external scale and pretending otherwise would be the
 * cohort this page refuses to invent.
 */
export function skillBalance(card: SkillCard, peers: SkillCard[]): BalanceAxis[] {
  const best = (read: (row: SkillCard) => number) => Math.max(1, ...peers.map(read));
  const pct = (value: number, top: number) =>
    Math.max(0, Math.min(100, Math.round((value / top) * 100)));

  return [
    {
      key: 'knowledge',
      label: 'Knowledge',
      value: pct(card.xp, best((row) => row.xp)),
      note: 'Lifetime XP, against your biggest subject.',
    },
    {
      key: 'practice',
      label: 'Practice',
      value: pct(card.tasks, best((row) => row.tasks)),
      note: 'Finished tasks, against your most-worked subject.',
    },
    {
      key: 'consistency',
      label: 'Consistency',
      value: pct(card.activeDays, 30),
      note: 'Days in the last 30 with a finished task in it.',
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      value: pct(card.perTask, best((row) => row.perTask)),
      note: 'XP a task — how heavy the work in it tends to be.',
    },
    {
      key: 'mastery',
      label: 'Mastery',
      value: pct(card.level.exact, best((row) => row.level.exact)),
      note: 'Level reached, against your highest.',
    },
  ];
}

export interface Mover {
  key: string;
  label: string;
  /** The percentage the row is ranked on. */
  pct: number;
  /** The sentence under the name. */
  note: string;
}

/**
 * Which subjects are moving, and which are waiting.
 *
 * Both lists are the same figure sorted two ways — the last 30 days against the
 * 30 before — and neither is a verdict. A subject at the bottom of this list is
 * one the reader has not been near lately, which is a fact about a month and
 * not about them; the panel's own words are "needs attention" for exactly that
 * reason.
 */
export function movers(cards: SkillCard[]): { rising: Mover[]; waiting: Mover[] } {
  const rated = cards
    .filter((card) => card.growth30 !== null)
    .map((card) => ({
      key: card.key,
      label: card.label,
      pct: card.growth30 ?? 0,
      note: `${Math.round(card.xp30).toLocaleString()} XP in 30 days, against ${Math.round(
        card.xp30Before,
      ).toLocaleString()} before`,
    }));

  // Subjects with no earlier window cannot be ranked by change, but a subject
  // nothing has happened in for a month belongs in the second list on the
  // strength of that alone.
  const quiet = cards
    .filter((card) => card.growth30 === null && card.xp30 === 0)
    .map((card) => ({
      key: card.key,
      label: card.label,
      pct: 0,
      note:
        card.daysSince === null
          ? 'nothing finished in it yet'
          : `nothing finished in ${card.daysSince} days`,
    }));

  return {
    rising: [...rated].sort((a, b) => b.pct - a.pct).slice(0, 3),
    waiting: [...rated].sort((a, b) => a.pct - b.pct).concat(quiet).slice(0, 3),
  };
}

/** Lifetime XP that is not filed under any subject — the page states this. */
export function unfiledXp(tasks: Task[], subjects: Map<string, Subject>): { xp: number; count: number } {
  let xp = 0;
  let count = 0;
  tasks.forEach((task) => {
    if (task.status !== 'done') return;
    if (task.subject && subjects.get(task.subject)) return;
    xp += num(task.xp_value);
    count += 1;
  });
  return { xp, count };
}

export interface AccountLevel {
  tier: number;
  xpInLevel: number;
  xpRequired: number;
  percent: number;
  toNext: number;
}

/**
 * The account's own level, for the header of the mastery tab.
 *
 * **Deliberately not on the mastery ladder.** This is the number on the
 * profile, the dashboard and the rail, and it follows `level_for_total_xp` in
 * backend/tracking/xp.py — level N costs N × 100 XP, no cap, no names. Reading
 * it off the mastery table would put two different answers to "what level am I"
 * on two screens of the same app, which is worse than the two curves simply
 * being different things.
 *
 * The tab prints both, a card apart, and labels which is which: "Account level"
 * here, and a subject's own level with its band name on every skill card.
 */
export function accountLevel(all: GrowthDay[]): AccountLevel {
  const breakdown = levelForTotalXp(num(all[all.length - 1]?.cumulative_xp));
  return {
    tier: breakdown.level,
    xpInLevel: breakdown.xpInLevel,
    xpRequired: breakdown.xpRequired,
    percent: breakdown.percent,
    toNext: Math.max(0, breakdown.xpRequired - breakdown.xpInLevel),
  };
}
