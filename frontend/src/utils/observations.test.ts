import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_LABEL,
  OBSERVATION_FLOOR,
  observations,
} from './observations';
import type { AnalyticsTask } from '@/services/analytics';

function task(over: Partial<AnalyticsTask> = {}): AnalyticsTask {
  return {
    id: Math.random().toString(36).slice(2),
    title: 't',
    status: 'done',
    priority: 'medium',
    xp_value: 10,
    created_at: '2026-09-01T09:00:00',
    completed_at: '2026-09-01T19:00:00',
    ...over,
  } as AnalyticsTask;
}

const many = (n: number, over: Partial<AnalyticsTask> = {}) =>
  Array.from({ length: n }, () => task(over));

describe('the floor', () => {
  it('says nothing under it', () => {
    const four = many(OBSERVATION_FLOOR - 1, { difficulty: 5, execution: 1 });
    expect(observations(four)).toEqual([]);
  });

  it('speaks at it', () => {
    const five = many(OBSERVATION_FLOOR, { difficulty: 5, execution: 1 });
    expect(observations(five).length).toBeGreaterThan(0);
  });

  it('ignores unfinished work', () => {
    const open = many(30, { status: 'todo', difficulty: 5, execution: 1 });
    expect(observations(open)).toEqual([]);
  });
});

describe('execution gap', () => {
  it('reads execution above difficulty as underrating the result', () => {
    const found = observations(many(8, { difficulty: 2, execution: 5 }));
    const gap = found.find((o) => o.key === 'execution-gap');
    expect(gap?.text).toContain('harder than your execution');
  });

  it('reads execution below difficulty the other way', () => {
    const found = observations(many(8, { difficulty: 5, execution: 2 }));
    const gap = found.find((o) => o.key === 'execution-gap');
    expect(gap?.text).toContain('less smoothly');
  });

  it('stays quiet inside half a star', () => {
    const found = observations(many(30, { difficulty: 3, execution: 3 }));
    expect(found.find((o) => o.key === 'execution-gap')).toBeUndefined();
  });

  it('needs both rows answered', () => {
    const found = observations(many(30, { difficulty: 5 }));
    expect(found.find((o) => o.key === 'execution-gap')).toBeUndefined();
  });
});

describe('when finished', () => {
  it('names the part of day the work lands in', () => {
    const found = observations(many(10, { completed_at: '2026-09-01T19:30:00' }));
    const when = found.find((o) => o.key === 'when-finished');
    expect(when?.text).toContain('the evening');
  });

  it('skips rows with no clock on them', () => {
    const found = observations(many(30, { completed_at: '2026-09-01' }));
    expect(found.find((o) => o.key === 'when-finished')).toBeUndefined();
  });

  it('stays quiet when the work is spread', () => {
    const spread = [
      ...many(5, { completed_at: '2026-09-01T08:00:00' }),
      ...many(5, { completed_at: '2026-09-01T14:00:00' }),
      ...many(5, { completed_at: '2026-09-01T19:00:00' }),
      ...many(5, { completed_at: '2026-09-01T23:00:00' }),
    ];
    expect(observations(spread).find((o) => o.key === 'when-finished')).toBeUndefined();
  });
});

describe('deadlines', () => {
  it('reports holding', () => {
    const found = observations(many(10, { met_deadline: true }));
    expect(found.find((o) => o.key === 'deadlines')?.text).toContain('you meet it');
  });

  it('reports slipping', () => {
    const found = observations(many(10, { met_deadline: false }));
    expect(found.find((o) => o.key === 'deadlines')?.text).toContain('slip more often');
  });

  it('counts only tasks that recorded an outcome', () => {
    const found = observations(many(30, {}));
    expect(found.find((o) => o.key === 'deadlines')).toBeUndefined();
  });

  it('stays quiet in the middle', () => {
    const mixed = [...many(10, { met_deadline: true }), ...many(10, { met_deadline: false })];
    expect(observations(mixed).find((o) => o.key === 'deadlines')).toBeUndefined();
  });
});

describe('confidence', () => {
  it('needs a sample as well as an effect', () => {
    const strongButSmall = observations(many(6, { difficulty: 1, execution: 5 }));
    expect(strongButSmall[0]?.confidence).toBe('low');
  });

  it('reaches established only with both', () => {
    const found = observations(many(40, { difficulty: 1, execution: 5 }));
    expect(found.find((o) => o.key === 'execution-gap')?.confidence).toBe('high');
  });

  it('has a label for every tier', () => {
    expect(CONFIDENCE_LABEL.low).toBe('Early observation');
    expect(CONFIDENCE_LABEL.moderate).toBe('Pattern emerging');
    expect(CONFIDENCE_LABEL.high).toBe('Established pattern');
  });
});

describe('ranking', () => {
  it('puts the better-supported finding first', () => {
    const tasks = [
      // A big execution gap over few tasks, and evenings over many.
      ...many(6, { difficulty: 1, execution: 5, completed_at: '2026-09-01T19:00:00' }),
      ...many(30, { completed_at: '2026-09-02T20:00:00' }),
    ];
    const found = observations(tasks);
    expect(found[0]?.key).toBe('when-finished');
  });

  it('always carries the sample it came from', () => {
    const found = observations(many(12, { difficulty: 1, execution: 5 }));
    found.forEach((o) => expect(o.support.length).toBeGreaterThan(0));
  });
});
