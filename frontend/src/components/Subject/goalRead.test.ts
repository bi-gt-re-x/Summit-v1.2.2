/**
 * The subject page's counted insights and moves toward its goal.
 */
import { describe, expect, it } from 'vitest';
import { goalRead } from './goalRead';
import type { SubjectGoal, SubjectModel } from './model';
import type { SubjectState } from './state';
import type { GoalTopicPlan } from '@/services/topics';

function goal(over: Partial<SubjectGoal> = {}): SubjectGoal {
  return {
    id: 'g1', title: 'Qualify for AIME', progress: 30, deadline: '2026-12-01',
    need: 2, have: 1, drift: 20, unit: 'problems', current: 30, target: 100, numeric: true,
    remaining: 70, daysLeft: 38, lands: 'Dec 21', expected: 55, factor: 2,
    stagesDone: 0, stagesTotal: 0, aimed: 2, ofFinished: 20, recentDays: 1, sinceWork: 9,
    levers: [{ id: 'quiet', title: 'Get back to this goal', fact: 'No work on it in 9 days.', weight: 'blocking' }],
    ...over,
  };
}

function model(over: Partial<SubjectModel> = {}): SubjectModel {
  return { goals: [goal()], struggles: [], wentWell: [], streak: 0, ...over } as unknown as SubjectModel;
}

const state = {
  momentum: { known: true, change: -12, earlier: 70, later: 58, direction: 'slipping' },
  curve: {
    any: true,
    best: { level: 2, label: 'Easy', execution: 82 },
    threshold: { level: 4, label: 'Hard', execution: 41 },
  },
} as unknown as SubjectState;

describe('goalRead', () => {
  it('reads every insight against the goal, worst news first', () => {
    const read = goalRead({ subject: 'Mathematics', model: model(), state, total: { now: 20, before: 30 } });
    expect(read.goal).toBe('Qualify for AIME');
    const ids = read.insights.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(['pace', 'lands', 'cadence', 'aim', 'momentum', 'threshold', 'volume']));
    expect(read.insights[0]!.tone).toBe('bad');
    expect(read.insights.every((item) => item.means.length > 0)).toBe(true);
    expect(read.insights.find((item) => item.id === 'pace')!.figure).toContain('calendar says 55%');
    expect(read.insights.find((item) => item.id === 'threshold')!.means).toContain('"Qualify for AIME"');
  });

  it("puts the goal's blocking lever first in what to do", () => {
    const read = goalRead({ subject: 'Mathematics', model: model(), state, total: { now: 20, before: 0 } });
    expect(read.moves[0]!.title).toBe('Get back to this goal');
    expect(read.moves[0]!.weight).toBe('now');
    expect(read.moves.map((move) => move.id)).toContain('threshold');
  });

  it('asks for a goal when the subject has none', () => {
    const read = goalRead({
      subject: 'Mathematics', model: model({ goals: [] }), state, total: { now: 5, before: 5 },
    });
    expect(read.goal).toBe('');
    expect(read.moves[0]!.id).toBe('set-goal');
    expect(read.insights.some((item) => item.id === 'pace')).toBe(false);
  });
});

describe('goalRead on easy work going worse than hard work', () => {
  it('calls it rushing rather than a ceiling', () => {
    const careless = {
      ...state,
      curve: { any: true, best: { level: 4, label: 'Hard', execution: 70 }, threshold: { level: 2, label: 'Easy', execution: 47 } },
    } as unknown as SubjectState;
    const read = goalRead({ subject: 'Mathematics', model: model(), state: careless, total: { now: 1, before: 0 } });
    expect(read.insights.find((item) => item.id === 'threshold')!.title).toBe('Easy work goes worse than Hard work');
    expect(read.moves.find((move) => move.id === 'threshold')!.title).toBe('Slow down on Easy work');
  });
});

describe('goalRead with the topic library', () => {
  const topics: GoalTopicPlan = {
    goal_id: 'g1', title: 'Qualify for AIME', contexts: ['AIME'], position: [], covered: 3, unnamed: 0,
    moves: [
      {
        id: 'weak-competition-math:recursive-counting', weight: 'now',
        title: 'Do 10 AMC 10 recursive counting problems, then 3 AIME ones',
        why: 'Your recursive counting work rates 2.0 out of 5, against 3.5 across Mathematics.',
        topic: 'competition-math:recursive-counting', context: 'amc10',
        resource: { name: 'AoPS Wiki contest problems', url: 'https://artofproblemsolving.com/wiki/' },
      },
      {
        id: 'start-competition-math:polynomials', weight: 'next', title: 'Try 5 AIME polynomials problems',
        why: 'AIME tests polynomials, and none of your tasks name it yet.', topic: 'competition-math:polynomials',
        context: 'aime', resource: null,
      },
    ],
    insights: [{ id: 'topic-weak', tone: 'bad', title: 'Weakest topic: Recursive counting', figure: '2.0 out of 5.', means: 'Gains the most per hour.' }],
  };

  it('leads with the moves that name real work, and drops the general advice', () => {
    const read = goalRead({ subject: 'Mathematics', model: model(), state, total: { now: 20, before: 0 }, topics });
    expect(read.moves[0]!.title).toBe('Do 10 AMC 10 recursive counting problems, then 3 AIME ones');
    expect(read.moves[0]!.resource?.name).toBe('AoPS Wiki contest problems');
    // The goal's own blocking lever stays, right after.
    expect(read.moves[1]!.title).toBe('Get back to this goal');
    expect(read.moves.map((move) => move.id)).not.toContain('threshold');
    expect(read.insights[0]!.title).toBe('Weakest topic: Recursive counting');
  });

  it('reads as before until the library has loaded', () => {
    const read = goalRead({ subject: 'Mathematics', model: model(), state, total: { now: 20, before: 0 }, topics: null });
    expect(read.moves.map((move) => move.id)).toContain('threshold');
    expect(read.moves.some((move) => move.topical)).toBe(false);
  });
});
