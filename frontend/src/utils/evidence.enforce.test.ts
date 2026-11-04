/**
 * The evidence rules, enforced where the claims get made.
 *
 * shared.cases.test.ts checks the arithmetic. These check that nothing routes around it:
 * a thin comparison never reaches the page, whichever module it came from.
 */
import { describe, expect, it } from 'vitest';
import type { GrowthDay, Task } from '@/types';
import { discoverPatterns } from './patterns';
import { howFindings, whatsWorking, whyFindings } from './insight';
import { diagnose, vitals } from './diagnosis';
import { whatSummitKnows } from './knows';
import { findSlump, weekBlocks } from './weekTrend';
import { observations } from './observations';
import { CONFIDENCE_LABEL } from './observations';

const stamp = (index: number, hour = 12) => {
  const at = new Date(2026, 9, 1 + (index % 28), hour);
  return at.toISOString();
};

const task = (over: Partial<Task>): Task =>
  ({ id: `${Math.random()}`, title: 'A task', status: 'done', subject: 'maths', xp_value: 40, ...over }) as Task;

const day = (date: string, over: Partial<GrowthDay> = {}): GrowthDay =>
  ({ date, xp_earned: 100, tasks_completed: 3, focus_minutes: 60, ...over }) as GrowthDay;

const days = (count: number, read: (index: number) => Partial<GrowthDay> = () => ({})): GrowthDay[] =>
  Array.from({ length: count }, (_, index) => {
    const at = new Date(Date.UTC(2026, 0, 1 + index));
    return day(at.toISOString().slice(0, 10), read(index));
  });

describe('patterns', () => {
  const nameOf = (id: string) => id;

  it('says nothing about a gap inside the ordinary swing of the ratings', () => {
    const swing = [1, 5, 2, 4, 1, 5, 2, 4, 3, 3];
    const finished = [
      ...swing.map((execution, index) => task({ difficulty: 3, execution, completed_at: stamp(index, 9) })),
      ...swing.map((execution, index) => task({ difficulty: 3, execution: Math.min(5, execution + (index % 5 === 0 ? 1 : 0)), completed_at: stamp(index, 20) })),
    ];
    const found = discoverPatterns({ days: [], finished, nameOf });
    expect(found.find((row) => row.id === 'exec-before-five')).toBeUndefined();
  });

  it('labels a clear gap by the smaller side and hedges what it means', () => {
    const finished = [
      ...Array.from({ length: 7 }, (_, index) => task({ difficulty: 3, execution: 5, completed_at: stamp(index, 9) })),
      ...Array.from({ length: 7 }, (_, index) => task({ difficulty: 3, execution: 2, completed_at: stamp(index, 20) })),
    ];
    const found = discoverPatterns({ days: [], finished, nameOf }).find((row) => row.id === 'exec-before-five');
    expect(found?.strength).toBe('preliminary');
    expect(found?.means).toMatch(/^It's early, but this may mean/);
    expect(found?.means).toMatch(/test/);
  });

  it('never claims a rating run proves something worked', () => {
    const finished: Task[] = [];
    [2, 3, 4, 5, 5.5].forEach((level, week) => {
      for (let at = 0; at < 8; at += 1) {
        finished.push(task({ difficulty: 3, execution: Math.min(5, level), completed_at: new Date(2026, 8, 7 + week * 7, 12).toISOString() }));
      }
    });
    const run = discoverPatterns({ days: [], finished, nameOf }).find((row) => row.id === 'rating-run');
    if (run) expect(run.means).not.toMatch(/is working/);
  });
});

describe('findings', () => {
  const clock = { coreWindow: null } as never;
  const rhythm = (gapCount: number, span = 400) => ({ gapCount, span }) as never;

  it("doesn't read two breaks as what breaks do to you", () => {
    const series = days(400, (index) => (index === 100 || index === 200 || index === 101 || index === 102 || index === 201 || index === 202 ? { xp_earned: 0 } : {}));
    const found = howFindings(series, [], clock, rhythm(2));
    expect(found.find((row) => row.id === 'how-gaps')).toBeUndefined();
  });

  it("doesn't call a rise inside the ordinary swing a win", () => {
    const series = days(60, (index) => ({ xp_earned: index % 2 ? 40 : 200, tasks_completed: 3, focus_minutes: 60 }));
    const lifted = series.map((row, index) => (index >= 30 ? { ...row, xp_earned: Number(row.xp_earned) * 1.06 } : row));
    expect(whatsWorking(lifted, []).find((row) => row.id === 'win-xp')).toBeUndefined();
  });

  it('only lets arithmetic say because', () => {
    const series = days(60, (index) => ({ xp_earned: index < 30 ? 200 : 100 }));
    const found = whyFindings(series);
    const split = found.find((row) => row.id === 'why-decomposition');
    expect(split?.claim).toBe('arithmetic');
    found.filter((row) => row.claim !== 'arithmetic').forEach((row) => {
      expect(`${row.headline} ${row.suggests}`).not.toMatch(/\bbecause\b/i);
    });
  });
});

describe('diagnosis', () => {
  it('names a break without saying what it does to the next day', () => {
    const pick = (index: number) => (index < 14 ? {} : index >= 16 && index <= 19 ? { xp_earned: 0, tasks_completed: 0, focus_minutes: 0 } : { xp_earned: 400 });
    const series = days(28, pick);
    const found = diagnose(vitals(series.slice(14), []), vitals(series.slice(0, 14), []));
    const gap = found.find((row) => row.id === 'gap');
    if (gap) {
      expect(gap.means).not.toMatch(/come back strong/i);
      expect(gap.means).toMatch(/too soon to say/);
      expect(gap.points.join(' ')).not.toMatch(/first day back/i);
    }
  });
});

describe('what we notice', () => {
  const base = { finished: 400, activeDays: 50, spanDays: 60, recentTop: null, subjects: [
    { name: 'Math', count: 20 }, { name: 'Physics', count: 19 }, { name: 'Art', count: 18 }, { name: 'History', count: 18 },
    { name: 'Music', count: 17 },
  ] };

  it("doesn't say pick a subject out of nothing", () => {
    const found = whatSummitKnows({ ...base }).find((row) => row.key === 'subjects');
    expect(found?.advice).not.toMatch(/pick one and give it more hours/);
  });

  it('says which one when a goal is what needs the time', () => {
    const found = whatSummitKnows({ ...base, priority: 'AMC 10 cutoff' }).find((row) => row.key === 'subjects');
    expect(found?.advice).toContain('AMC 10 cutoff');
  });
});

describe('a slump', () => {
  const series = days(70, (index) => ({ xp_earned: index >= 63 ? 10 : 400, tasks_completed: index >= 63 ? 1 : 8 }));
  const tasks = Array.from({ length: 12 }, (_, index) =>
    task({ subject: 'computer_science', completed_at: `${series[40 + index]!.date}T12:00:00` }));

  it('points at the goal that needs you when there is one', () => {
    const slump = findSlump({
      blocks: weekBlocks(series, 8), all: series, tasks, nameOf: (id) => id,
      focus: { title: 'AMC 10 cutoff', days_left: 3, next: 'Mock 4' },
    });
    const step = slump?.steps.find((row) => row.id === 'best-subject');
    expect(step?.title).toContain('AMC 10 cutoff');
    expect(step?.detail).toContain('3 days left');
    expect(step?.detail).toContain('Mock 4');
  });
});

describe('observations', () => {
  it('uses the same words as every other claim', () => {
    expect(Object.values(CONFIDENCE_LABEL)).toEqual(['Preliminary signal', 'Emerging pattern', 'Potentially reliable']);
  });

  it("won't speak under the floor", () => {
    const three = Array.from({ length: 3 }, () => ({ status: 'done', difficulty: 5, execution: 5 }));
    expect(observations(three)).toEqual([]);
  });
});

describe('the hedge', () => {
  it("never doubles up, so a preliminary line doesn't read may mean, may be", () => {
    const finished = [
      ...Array.from({ length: 7 }, (_, index) => task({ difficulty: 3, execution: 5, completed_at: stamp(index, 9), subject: 'chem' })),
      ...Array.from({ length: 7 }, (_, index) => task({ difficulty: 3, execution: 2, completed_at: stamp(index, 20), subject: 'maths' })),
    ];
    discoverPatterns({ days: [], finished, nameOf: (id) => id }).forEach((row) => {
      expect(row.means ?? '').not.toMatch(/may mean[^.]*\bmay be\b/);
    });
  });

  it("doesn't turn a plain fact into something to test", () => {
    const pick = (index: number) => (index < 14 ? {} : index >= 16 && index <= 19 ? { xp_earned: 0, tasks_completed: 0, focus_minutes: 0 } : { xp_earned: 400 });
    const series = days(28, pick);
    const gap = diagnose(vitals(series.slice(14), []), vitals(series.slice(0, 14), [])).find((row) => row.id === 'gap');
    if (gap) expect(gap.means).not.toMatch(/something to test/);
  });
});
