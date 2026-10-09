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
import { throughLens, type GoalLens } from './goalLens';

/** A lens as the server sends it — see backend/tracking/next_actions.py. */
const lens = (priorities: GoalLens['priorities']): GoalLens => ({
  goalId: 'g-1',
  goalTitle: 'Get 24 on the AMC 8',
  id: 'accuracy',
  label: 'Accuracy and control',
  priorities,
  watch: [],
  because: '',
  difficulty: 2.5,
  rated: 10,
  weights: {},
});

describe('reordering through it', () => {
  const rows = [
    { key: 'productivity' as const },
    { key: 'quality' as const },
    { key: 'consistency' as const },
    { key: 'focus' as const },
  ];

  it('leads with what the lens prioritizes', () => {
    const out = throughLens(rows, (row) => row.key, lens(['quality', 'consistency', 'productivity', 'focus']));
    expect(out[0]!.key).toBe('quality');
  });

  it('leaves the order alone when there is no lens', () => {
    // The behaviour every account without goals gets, and the one that must
    // not change: same array, same order.
    expect(throughLens(rows, (row) => row.key, null)).toEqual(rows);
  });

  it('does not drop or duplicate anything', () => {
    const out = throughLens(rows, (row) => row.key, lens(['consistency', 'focus', 'productivity', 'quality']));
    expect(out).toHaveLength(rows.length);
    expect(new Set(out.map((row) => row.key))).toEqual(new Set(rows.map((row) => row.key)));
  });
});
