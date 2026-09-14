/**
 * The four derivations behind the subject page's charts.
 *
 * What is worth testing here is the handling of absence, because that is where
 * a chart starts asserting things nobody recorded: an unmeasured dimension
 * drawn at nought, an undated completion filed on Monday, a line of fit
 * through six points that do not support one. Each of those is one case below.
 */
import { describe, expect, it } from 'vitest';
import type { AnalyticsTask } from '@/services/analytics';
import type { Band } from './model';
import type { Dimension } from './state';
import { bandVolume, dimensionAxes, effortPoints, weekLoad } from './graphs';

function dimension(over: Partial<Dimension> = {}): Dimension {
  return {
    key: 'execution',
    label: 'Execution',
    value: 80,
    known: true,
    meaning: 'how it goes',
    evidence: ['12 rated'],
    delta: null,
    ...over,
  } as Dimension;
}

function band(over: Partial<Band> = {}): Band {
  return {
    level: 3,
    label: 'Fair',
    done: 4,
    holding: 70,
    delta: null,
    seconds: null,
    secondsDelta: null,
    ...over,
  } as Band;
}

function task(over: Partial<AnalyticsTask> = {}): AnalyticsTask {
  return {
    id: 't1',
    title: 'A task',
    status: 'completed',
    priority: 'medium',
    xp_value: 10,
    created_at: '2026-09-01',
    completed_at: '2026-09-01',
    ...over,
  } as AnalyticsTask;
}

describe('dimensionAxes', () => {
  it('leaves an unmeasured dimension off rather than plotting it at nought', () => {
    const axes = dimensionAxes([
      dimension({ key: 'execution', label: 'Execution', value: 80 }),
      dimension({ key: 'quality', label: 'Quality', value: null, known: false }),
    ]);

    expect(axes).toEqual([{ label: 'Execution', value: 0.8 }]);
  });

  it('drops momentum, which is the one axis centred on 50', () => {
    // A radar compares its axes against each other, and it can only do that
    // while they all mean the same kind of thing. Momentum means change.
    const axes = dimensionAxes([
      dimension({ key: 'momentum', label: 'Momentum', value: 62 }),
      dimension({ key: 'mastery', label: 'Mastery', value: 40 }),
    ]);

    expect(axes.map((axis) => axis.label)).toEqual(['Mastery']);
  });
});

describe('bandVolume', () => {
  it('marks the level most of the work sits at', () => {
    const columns = bandVolume([
      band({ level: 2, label: 'Easy', done: 3 }),
      band({ level: 3, label: 'Fair', done: 11 }),
      band({ level: 4, label: 'Hard', done: 5 }),
    ]);

    expect(columns.find((column) => column.peak)?.label).toBe('Fair');
    expect(columns.map((column) => column.value)).toEqual([3, 11, 5]);
  });

  it('keeps an empty level, because the gap is the finding', () => {
    const columns = bandVolume([
      band({ level: 3, label: 'Fair', done: 8 }),
      band({ level: 4, label: 'Hard', done: 0 }),
      band({ level: 5, label: 'Brutal', done: 6 }),
    ]);

    expect(columns).toHaveLength(3);
    expect(columns[1]).toMatchObject({ label: 'Hard', value: 0, peak: false });
  });
});

describe('weekLoad', () => {
  it('counts Monday first', () => {
    // 2026-09-14 is a Monday, 2026-09-20 the Sunday after it.
    const columns = weekLoad([
      task({ id: 'a', completed_at: '2026-09-14' }),
      task({ id: 'b', completed_at: '2026-09-14' }),
      task({ id: 'c', completed_at: '2026-09-20' }),
    ]);

    expect(columns[0]).toMatchObject({ label: 'Mon', value: 2, peak: true });
    expect(columns[6]).toMatchObject({ label: 'Sun', value: 1 });
  });

  it('drops an undated completion rather than filing it on Monday', () => {
    const columns = weekLoad([
      task({ id: 'a', completed_at: undefined }),
      task({ id: 'b', completed_at: 'not a date' }),
    ]);

    expect(columns.every((column) => column.value === 0)).toBe(true);
  });
});

describe('effortPoints', () => {
  const timed = (minutes: number, execution: number, id: string) =>
    task({ id, completion_seconds: minutes * 60, execution });

  it('says it has nothing rather than drawing a cloud out of three points', () => {
    const cloud = effortPoints([timed(10, 3, 'a'), timed(20, 4, 'b'), timed(30, 5, 'c')]);

    expect(cloud.points).toHaveLength(0);
    expect(cloud.correlation).toBeNull();
    expect(cloud.fit).toBe(false);
    expect(cloud.count).toBe(3);
  });

  it('earns a line of fit when longer sessions really do land better', () => {
    const cloud = effortPoints([
      timed(10, 1, 'a'), timed(15, 2, 'b'), timed(20, 2, 'c'),
      timed(30, 3, 'd'), timed(45, 4, 'e'), timed(60, 5, 'f'),
      timed(70, 5, 'g'),
    ]);

    expect(cloud.count).toBe(7);
    expect(cloud.correlation).toBeGreaterThan(0.8);
    expect(cloud.fit).toBe(true);
  });

  it('draws no line through a cloud with nothing in it', () => {
    // Same execution at every length: r is 0, and the page says "no
    // relationship here" rather than drawing a confident flat diagonal.
    const cloud = effortPoints([
      timed(10, 3, 'a'), timed(20, 3, 'b'), timed(30, 3, 'c'),
      timed(40, 3, 'd'), timed(50, 3, 'e'), timed(60, 3, 'f'),
    ]);

    expect(cloud.correlation).toBeNull();
    expect(cloud.fit).toBe(false);
  });

  it('cuts the x-axis at the 90th percentile so one long session cannot flatten the rest', () => {
    const cloud = effortPoints([
      timed(10, 2, 'a'), timed(12, 3, 'b'), timed(14, 3, 'c'),
      timed(16, 4, 'd'), timed(18, 4, 'e'), timed(20, 5, 'f'),
      timed(600, 5, 'g'),
    ]);

    expect(cloud.longest).toBeLessThan(600);
    // The outlier is pinned to the right edge rather than left off.
    expect(cloud.points).toHaveLength(7);
    expect(Math.max(...cloud.points.map(([x]) => x))).toBe(1);
  });

  it('ignores a task with time but no rating', () => {
    const cloud = effortPoints([
      timed(10, 2, 'a'), timed(12, 3, 'b'), timed(14, 3, 'c'),
      timed(16, 4, 'd'), timed(18, 4, 'e'), timed(20, 5, 'f'),
      task({ id: 'g', completion_seconds: 3000 }),
    ]);

    expect(cloud.count).toBe(6);
  });
});
