/**
 * Weeks up and down, slumps, and what changed. See utils/weekTrend.
 */
import { describe, expect, it } from 'vitest';
import { days, task } from '@/test/factories';
import { directionOf, findSlump, trackChanges, weekBlocks, weekMove } from './weekTrend';
import type { GrowthDay } from '@/types';

/** `count` days from `from`, each earning `xp` with one task, then `quiet` empty days. */
function series(from: string, busy: number, xp: number, quiet = 0): GrowthDay[] {
  const all = days(from, busy + quiet);
  return all.map((day, index) =>
    index < busy ? { ...day, xp_earned: xp, tasks_completed: 1, focus_minutes: 30 } : day,
  );
}

const nameOf = (id: string) => id[0]!.toUpperCase() + id.slice(1);

describe('weekBlocks', () => {
  it('cuts rolling 7-day weeks ending on the last day, oldest first', () => {
    const blocks = weekBlocks(series('2026-09-01', 21, 10), 8);
    expect(blocks).toHaveLength(3);
    expect(blocks[2]!.to).toBe('2026-09-21');
    expect(blocks[2]!.from).toBe('2026-09-15');
    expect(blocks.map((block) => block.xp)).toEqual([70, 70, 70]);
  });
});

describe('directionOf', () => {
  it('ignores small moves and calls real ones', () => {
    expect(directionOf(1050, 1000)).toBe('level');
    expect(directionOf(1300, 1000)).toBe('up');
    expect(directionOf(700, 1000)).toBe('down');
    // A quiet account isn't flagged for a handful of XP.
    expect(directionOf(30, 10)).toBe('level');
  });
});

describe('weekMove', () => {
  it('reads this week against the last, and counts a run', () => {
    const all = [
      ...series('2026-09-01', 7, 100),
      ...series('2026-09-08', 7, 70),
      ...series('2026-09-15', 7, 40),
    ];
    const move = weekMove(weekBlocks(all));
    expect(move?.direction).toBe('down');
    expect(move?.run).toBe(2);
  });
});

describe('findSlump', () => {
  it('flags a week far under the usual, with steps to get out', () => {
    const all = [...series('2026-09-01', 28, 50), ...series('2026-09-29', 0, 0, 7)];
    const open = [task({ id: 'small', title: 'Read one page', due_date: '2026-10-01', xp_value: 5 })];
    const done = Array.from({ length: 6 }, (_, at) =>
      task({ status: 'done', subject: 'math', completed_at: `2026-09-${10 + at}T10:00:00` }),
    );
    const slump = findSlump({ blocks: weekBlocks(all), all, tasks: [...open, ...done], nameOf });
    expect(slump).not.toBeNull();
    expect(slump!.now).toBe(0);
    expect(slump!.idle).toBe(7);
    const titles = slump!.steps.map((step) => step.title);
    expect(titles[0]).toBe('Finish one small task today');
    expect(slump!.steps[0]!.detail).toContain('Read one page');
    expect(titles).toContain('Start with Math');
  });

  it('stays quiet on an ordinary week', () => {
    const all = series('2026-09-01', 35, 50);
    expect(findSlump({ blocks: weekBlocks(all), all, tasks: [], nameOf })).toBeNull();
  });

  it('needs a usual week before it can call one a slump', () => {
    const all = [...series('2026-09-01', 0, 0, 28), ...series('2026-09-29', 1, 10, 6)];
    expect(findSlump({ blocks: weekBlocks(all), all, tasks: [], nameOf })).toBeNull();
  });
});

describe('trackChanges', () => {
  it('keeps real moves, marks good and bad, and drops noise', () => {
    const previous = series('2026-09-01', 14, 100);
    const current = series('2026-09-15', 7, 100, 7);
    const moves = trackChanges({ current, previous, tasks: [], nameOf });
    const ids = moves.map((move) => move.id);
    expect(ids).toContain('xp');
    expect(ids).toContain('days');
    expect(moves.every((move) => !move.good)).toBe(true);
  });

  it('reports nothing when the two stretches look alike', () => {
    const previous = series('2026-09-01', 14, 100);
    const current = series('2026-09-15', 14, 104);
    expect(trackChanges({ current, previous, tasks: [], nameOf })).toEqual([]);
  });

  it('names a subject that grew', () => {
    const previous = series('2026-09-01', 14, 100);
    const current = series('2026-09-15', 14, 100);
    const tasks = Array.from({ length: 5 }, (_, at) =>
      task({ status: 'done', subject: 'chemistry', completed_at: `2026-09-${16 + at}T10:00:00` }),
    );
    const moves = trackChanges({ current, previous, tasks, nameOf });
    const chem = moves.find((move) => move.id === 'subject:chemistry');
    expect(chem?.good).toBe(true);
    expect(chem?.label).toBe('Chemistry');
  });
});
