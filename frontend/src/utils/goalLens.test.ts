/**
 * The lens: which reading of one record a goal calls for.
 *
 * Two things are worth pinning, and the second is the one that would be silent.
 *
 * **It tells the two outcome goals apart on evidence.** "Reach 24 on the AMC 8"
 * and "Reach 7 on the AIME" are the same shape of goal — a number, by a date,
 * in mathematics — and they want opposite things read out of the same tasks.
 * What separates them here is the difficulty the reader themselves put on the
 * work they aimed at each, which is the only signal in this record that is
 * actually about how hard the goal is.
 *
 * **It refuses before it guesses.** A lens reorders somebody's analytics page,
 * and they cannot see that it happened except by the line the page prints. One
 * chosen off three ratings would be a coin flip with a confident label on it,
 * so below the floor the answer is `null` and the page keeps the order it has
 * always had. Most of the cases below are that.
 *
 * Nothing here tests a title. Deliberately, and see the module note: a rule
 * that matched "AMC" in a string would fire on "stop doing AMC problems" and
 * miss every goal not written in English.
 */
import { describe, expect, it } from 'vitest';
import { goalLens, leadingLens, throughLens } from './goalLens';
import type { Goal, Task } from '@/types';

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g-1',
    title: 'Get 24 on the AMC 8',
    status: 'active',
    measure: 'number',
    unit: 'points',
    target_number: 24,
    current_value: 12,
    progress: 50,
    priority: 5,
    subject_ids: 'mathematics',
    start_date: '2026-07-01',
    created_at: '2026-07-01T09:00:00',
    deadline: '2026-11-01',
    milestones: [],
    ...over,
  } as Goal;
}

/** Finished work pointed at the goal, carrying the reader's own difficulty. */
function rated(id: string, difficulty: number, goalId = 'g-1'): Task {
  return {
    id,
    title: 'Practice set',
    subject: 'mathematics',
    goal_id: goalId,
    status: 'done',
    priority: 'medium',
    xp_value: 30,
    difficulty,
    execution: 3,
    created_at: '2026-08-30T09:00:00',
    completed_at: '2026-08-31T10:00:00',
  } as Task;
}

const many = (difficulty: number, count = 10, goalId = 'g-1') =>
  Array.from({ length: count }, (_, at) => rated(`t${goalId}${at}`, difficulty, goalId));

describe('what a goal makes worth reading', () => {
  it('reads ordinary work as a goal about getting it right', () => {
    // The AMC 8 case: a lot of problems a competent reader can mostly do.
    const lens = goalLens(goal(), many(2.5))!;

    expect(lens.id).toBe('accuracy');
    expect(lens.priorities[0]).toBe('quality');
    expect(lens.because).toContain('2.5 out of 5');
  });

  it('reads hard work as a goal about depth', () => {
    // The AIME case: the same shape of goal, fed much harder problems.
    const lens = goalLens(goal({ title: 'Reach 7 on the AIME' }), many(4.6))!;

    expect(lens.id).toBe('depth');
    // Unbroken time leads, because that is what hard problems need.
    expect(lens.priorities[0]).toBe('focus');
  });

  it('puts the same two goals under different lenses off the same record shape', () => {
    // The whole claim of the module, in one assertion: nothing differs between
    // these but the difficulty of the work, and the page reads differently.
    const amc = goalLens(goal(), many(2.5))!;
    const aime = goalLens(goal({ id: 'g-2', title: 'Reach 7 on the AIME' }), many(4.6, 10, 'g-2'))!;

    expect(amc.id).not.toBe(aime.id);
    expect(amc.priorities[0]).not.toBe(aime.priorities[0]);
  });

  it('does not read a title', () => {
    // An AIME goal fed easy work is an accuracy goal, whatever it is called.
    expect(goalLens(goal({ title: 'Reach 7 on the AIME' }), many(2))!.id).toBe('accuracy');
  });

  it('reads a streak goal as being about turning up', () => {
    const lens = goalLens(goal({ measure: 'streak' }), [])!;
    expect(lens.id).toBe('consistency');
    expect(lens.priorities[0]).toBe('consistency');
  });

  it('reads a counter as being about the rate it fills at', () => {
    const lens = goalLens(goal({ measure: 'xp' }), [])!;
    expect(lens.id).toBe('volume');
    expect(lens.priorities[0]).toBe('productivity');
  });

  it('says nothing about an outcome goal with too little rated work', () => {
    // Three ratings is not a reading of how hard this goal is.
    expect(goalLens(goal(), many(4.8, 3))).toBeNull();
  });

  it('ignores work that carries no difficulty at all', () => {
    const unrated = many(3).map((task) => ({ ...task, difficulty: undefined }));
    expect(goalLens(goal(), unrated)).toBeNull();
  });

  it('says nothing about a goal that is already done', () => {
    expect(goalLens(goal({ status: 'completed' }), many(4.5))).toBeNull();
  });

  it('carries the count it was chosen on', () => {
    const lens = goalLens(goal(), many(4.5, 12))!;
    expect(lens.rated).toBe(12);
    expect(lens.difficulty).toBeCloseTo(4.5);
  });
});

describe('one lens for one page', () => {
  it('follows the goal with the most work pointed at it', () => {
    // Not the one marked most important: what somebody flagged and what they
    // are actually doing are different facts, and this reads the record.
    const busy = goal({ id: 'g-2', title: 'The one being worked', priority: 1 });
    const idle = goal({ id: 'g-3', title: 'The one marked urgent', priority: 10 });
    const tasks = [...many(4.6, 12, 'g-2'), ...many(2, 9, 'g-3')];

    expect(leadingLens([idle, busy], tasks)!.goalTitle).toBe('The one being worked');
  });

  it('returns nothing when no goal has enough behind it', () => {
    expect(leadingLens([goal()], many(4, 2))).toBeNull();
    expect(leadingLens([], [])).toBeNull();
  });
});

describe('reordering through it', () => {
  const rows = [
    { key: 'productivity' as const },
    { key: 'quality' as const },
    { key: 'consistency' as const },
    { key: 'focus' as const },
  ];

  it('leads with what the lens prioritises', () => {
    const lens = goalLens(goal(), many(2.5))!;
    const out = throughLens(rows, (row) => row.key, lens);
    expect(out[0]!.key).toBe('quality');
  });

  it('leaves the order alone when there is no lens', () => {
    // The behaviour every account without goals gets, and the one that must
    // not change: same array, same order.
    expect(throughLens(rows, (row) => row.key, null)).toEqual(rows);
  });

  it('does not drop or duplicate anything', () => {
    const lens = goalLens(goal({ measure: 'streak' }), [])!;
    const out = throughLens(rows, (row) => row.key, lens);
    expect(out).toHaveLength(rows.length);
    expect(new Set(out.map((row) => row.key))).toEqual(new Set(rows.map((row) => row.key)));
  });
});
