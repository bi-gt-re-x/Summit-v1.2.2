/**
 * The subject page's counted insights and moves toward its goal.
 */
import { describe, expect, it } from 'vitest';
import { goalRead } from './goalRead';
import type { SubjectGoal, SubjectModel } from './model';
import type { SubjectState } from './state';

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
