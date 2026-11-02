/**
 * An account with no goals, and goals with nothing to measure against.
 *
 * Every tab reads the goal list, so an empty one and a goal whose target is 0
 * have to draw like any other account. A division by that 0 is the kind of
 * mistake that only shows up on the one account it happens to.
 */
import { describe, expect, it } from 'vitest';
import { goalHealth } from '@/utils/goalHealth';
import { goalActions, goalNotes, goalsOverview } from '@/utils/goalAnalytics';
import { goalLimiters } from '@/utils/goalLimiter';
import { goalWork, linkCoverage } from '@/utils/goalWork';
import {
  checkpointsByMonth,
  effortAgainstPriority,
  goalHeadline,
  paceMap,
  suggestGoals,
} from '@/utils/goalSuggest';
import type { Goal } from '@/types';

const zero = (measure: string, extra: Partial<Goal> = {}): Goal =>
  ({
    id: `g-${measure}`,
    title: `Zero ${measure}`,
    status: 'active',
    measure,
    target_number: 0,
    current_value: 0,
    target_xp: 0,
    current_xp: 0,
    target_tasks: 0,
    current_tasks: 0,
    target_streak: 0,
    current_streak: 0,
    target_focus: 0,
    current_focus: 0,
    progress: 0,
    milestones: [],
    deadline: '2026-12-01',
    created_at: '2026-10-01',
    ...extra,
  }) as unknown as Goal;

const shapes: Array<[string, Goal[]]> = [
  ['no goals at all', []],
  ['a target of 0', ['number', 'xp', 'tasks', 'streak', 'focus', 'milestones'].map((one) => zero(one))],
  ['a target of 0, due today', [zero('number', { deadline: new Date().toISOString().slice(0, 10) })]],
  ['a target of 0 and no date', [zero('number', { deadline: null } as unknown as Partial<Goal>)]],
];

describe.each(shapes)('goal readings with %s', (_name, goals) => {
  const finite = (value: unknown) =>
    JSON.stringify(value, (_key, seen) => {
      if (typeof seen === 'number' && !Number.isFinite(seen)) throw new Error(`not finite: ${seen}`);
      return seen;
    });

  it('work out without throwing, and with no Infinity or NaN', () => {
    finite(goalsOverview(goals));
    finite(goalNotes(goals, []));
    finite(goals.flatMap((goal) => goalActions(goal, [])));
    finite(goalLimiters(goals, [], (id) => id, () => undefined));
    finite(goals.map((goal) => goalHealth(goal)));
    finite(paceMap(goals, (goal) => goalHealth(goal).state));
    finite(effortAgainstPriority(goals, []));
    finite(checkpointsByMonth(goals));
    finite(goalWork(goals, []));
    finite(linkCoverage([]));
    finite(suggestGoals({ goals, tasks: [], days: [], subjects: [], currentStreak: 0 }));
    expect(
      goalHeadline({
        active: goals.length,
        behind: 0,
        completed: 0,
        focusSubject: null,
        aimedShare: null,
        leadWithStrength: false,
      }),
    ).toBeTruthy();
  });
});
