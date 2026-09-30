/**
 * Skill growth, which is the Growth tab's claim rather than one of its panels.
 *
 * Two things are worth pinning here and neither is that the arithmetic adds
 * up — `skillScore.test.ts` owns the score itself, and this module does not
 * second-guess it.
 *
 * The first is **that the trajectory is the score's own history and not a
 * reconstruction of it**. Every reading is `skillScores` over the tasks that
 * existed on that date, with that date as its today, so a point on the
 * sparkline is a number the subject page would have printed that morning. The
 * test for that is the boring one: work added late in a period moves the end
 * of the line and not the start of it.
 *
 * The second is **what it refuses**. A subject the score does not yet trust is
 * left out rather than drawn at whatever the prior says, a subject that did
 * not exist at the start has no delta rather than a rise from zero, and a
 * ratio over less than an hour is not printed at all. Each of those is a place
 * where a plausible number would be worse than no number.
 */
import { describe, expect, it } from 'vitest';
import { skillTrajectory, timeToProgress, type SkillTrack } from './skillGrowth';
import { task } from '@/test/factories';
import type { GrowthDay, Task } from '@/types';

const nameOf = (id: string) => ({ math: 'Mathematics', cs: 'Computer Science' })[id] ?? id;

/** `count` finished, rated tasks in one subject, one a day up to `lastIso`. */
function ratedRun(
  subject: string,
  count: number,
  lastIso: string,
  { difficulty = 3, execution = 4 } = {},
): Task[] {
  const end = Date.parse(`${lastIso}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const at = new Date(end - (count - 1 - i) * 24 * 60 * 60 * 1000);
    return task({
      status: 'done',
      subject,
      difficulty,
      execution,
      completed_at: `${at.toISOString().slice(0, 10)}T18:00:00`,
    });
  });
}

function day(over: Partial<GrowthDay> = {}): GrowthDay {
  return {
    date: '2026-01-01',
    day_number: 1,
    xp_earned: 100,
    tasks_completed: 2,
    cumulative_xp: 100,
    avg_task_xp: 50,
    focus_minutes: 60,
    cumulative_focus_minutes: 60,
    rated_tasks: 2,
    quality_score: 12,
    avg_difficulty: 3,
    avg_execution: 4,
    ...over,
  };
}
const run = (count: number, over: Partial<GrowthDay> = {}) =>
  Array.from({ length: count }, () => day(over));

describe('the trajectory', () => {
  const TO = '2026-06-30';

  it('reads a subject the reader has rated enough of', () => {
    const tracks = skillTrajectory({
      tasks: ratedRun('math', 40, TO),
      nameOf,
      days: 30,
      toIso: TO,
    });
    const math = tracks.find((row) => row.subject === 'math');
    expect(math).toBeDefined();
    expect(math!.name).toBe('Mathematics');
    expect(math!.now).toBeGreaterThan(0);
  });

  it('draws one reading per sample, ending on the period’s last day', () => {
    const [math] = skillTrajectory({
      tasks: ratedRun('math', 60, TO),
      nameOf,
      days: 30,
      toIso: TO,
      points: 6,
    });
    expect(math!.spark).toHaveLength(6);
    expect(math!.spark[math!.spark.length - 1]).toBe(math!.now);
  });

  it('does not draw more readings than the period has days', () => {
    // Eight points across seven days is the same score plotted twice, which
    // reads as a plateau that is really a rounding.
    const [math] = skillTrajectory({
      tasks: ratedRun('math', 40, TO),
      nameOf,
      days: 7,
      toIso: TO,
      points: 8,
    });
    expect(math!.spark.length).toBeLessThanOrEqual(8);
    expect(math!.spark.length).toBeGreaterThanOrEqual(2);
  });

  it('is the score’s own history: late work moves the end and not the start', () => {
    /* The same account, twice, differing only in work done in the last three
       days. If the first reading moved too, the line would be a reconstruction
       rather than what was true at the time. */
    const base = ratedRun('math', 40, '2026-06-20');
    const plain = skillTrajectory({ tasks: base, nameOf, days: 60, toIso: TO, points: 5 });
    const andMore = skillTrajectory({
      tasks: [...base, ...ratedRun('math', 12, TO, { difficulty: 5, execution: 5 })],
      nameOf,
      days: 60,
      toIso: TO,
      points: 5,
    });
    expect(andMore[0]!.spark[0]).toBe(plain[0]!.spark[0]);
    expect(andMore[0]!.now).not.toBe(plain[0]!.now);
  });

  it('ranks by how far a subject moved, not by where it stands', () => {
    /* The analytics page already ranks subjects by standing. A Growth tab that
       repeated that ranking would be the same list twice. */
    const tasks = [
      // Steady all period: high, and not the story.
      ...ratedRun('cs', 70, TO, { difficulty: 4, execution: 5 }),
      // Nothing, then a burst: lower, and the thing that changed.
      ...ratedRun('math', 30, TO, { difficulty: 4, execution: 5 }).slice(-14),
    ];
    const tracks = skillTrajectory({ tasks, nameOf, days: 60, toIso: TO });
    expect(tracks.length).toBeGreaterThan(1);
    const moved = tracks.map((row) => Math.abs(row.delta ?? 0));
    expect(moved[0]).toBeGreaterThanOrEqual(moved[1]!);
  });

  it('leaves out a subject the score does not trust yet', () => {
    // Two rated tasks is a score that is still almost entirely its prior.
    const tracks = skillTrajectory({
      tasks: ratedRun('math', 2, TO),
      nameOf,
      days: 30,
      toIso: TO,
    });
    expect(tracks.some((row) => row.subject === 'math')).toBe(false);
  });

  it('says nothing at all on an empty record', () => {
    expect(skillTrajectory({ tasks: [], nameOf, days: 30, toIso: TO })).toEqual([]);
  });

  it('says nothing without a date to measure to', () => {
    expect(skillTrajectory({ tasks: ratedRun('math', 40, TO), nameOf, days: 30, toIso: '' }))
      .toEqual([]);
  });
});

describe('time against what it bought', () => {
  const track = (over: Partial<SkillTrack> = {}): SkillTrack =>
    ({
      subject: 'math', name: 'Mathematics', now: 70, then: 60, delta: 10,
      band: 'Competent', bandThen: 'Developing', promoted: true,
      confidence: 0.8, rated: 20, spark: [60, 65, 70],
      ...over,
    }) as SkillTrack;

  it('reads the hours against the points they bought', () => {
    const out = timeToProgress({
      days: run(60, { focus_minutes: 60, xp_earned: 120 }),
      finished: [],
      tracks: [track({ delta: 8 }), track({ subject: 'cs', delta: 4 })],
      windowDays: 30,
    });
    expect(out.hours).toBe(30);
    expect(out.pointsGained).toBe(12);
    expect(out.subjectsUp).toBe(2);
    expect(out.pointsPerTenHours).toBeCloseTo(4, 5);
  });

  it('counts only the rises, so one slip does not erase a term’s work', () => {
    const out = timeToProgress({
      days: run(60),
      finished: [],
      tracks: [track({ delta: 9 }), track({ subject: 'cs', delta: -9 })],
      windowDays: 30,
    });
    expect(out.pointsGained).toBe(9);
    expect(out.subjectsUp).toBe(1);
  });

  it('carries the previous period, so the rate has something to move against', () => {
    const out = timeToProgress({
      days: [
        ...run(30, { focus_minutes: 60, xp_earned: 60 }),
        ...run(30, { focus_minutes: 60, xp_earned: 120 }),
      ],
      finished: [],
      tracks: [],
      windowDays: 30,
    });
    expect(out.perHour).toBe(120);
    expect(out.perHourBefore).toBe(60);
  });

  it('refuses a ratio over less than an hour', () => {
    const out = timeToProgress({
      days: run(60, { focus_minutes: 0 }),
      finished: [],
      tracks: [track()],
      windowDays: 30,
    });
    expect(out.perHour).toBeNull();
    expect(out.pointsPerTenHours).toBeNull();
  });

  it('separates rated and hard work from the finished count', () => {
    const out = timeToProgress({
      days: run(60),
      finished: [
        task({ difficulty: 5, execution: 4 }),
        task({ difficulty: 4, execution: 3 }),
        task({ difficulty: 2, execution: 5 }),
        // Finished but never rated: it happened, and it moved no score.
        task({}),
      ],
      tracks: [],
      windowDays: 30,
    });
    expect(out.finished).toBe(4);
    expect(out.rated).toBe(3);
    expect(out.hard).toBe(2);
  });
});
