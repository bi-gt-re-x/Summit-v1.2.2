/**
 * What counts toward a goal, and how the page is allowed to say so.
 *
 * Two ways a task reaches a goal and they are not the same claim: the reader
 * filed it there, or the matcher read the title and decided. Summing them and
 * printing one number would be the page presenting an inference as a
 * statement, which is the thing `goalWork` exists to avoid — so most of what
 * is pinned here is the split surviving every shape a task can arrive in.
 */
import { describe, expect, it } from 'vitest';
import { goalWork, linkCoverage } from './goalWork';
import type { Goal, Task } from '@/types';

const goal = (id: string, over: Partial<Goal> = {}): Goal =>
  ({ id, title: `Goal ${id}`, status: 'active', priority: 5, ...over }) as unknown as Goal;

const task = (over: Partial<Task> = {}): Task =>
  ({
    id: `t-${Math.random()}`,
    status: 'done',
    xp_value: 10,
    completed_at: '2026-09-10T10:00:00',
    ...over,
  }) as unknown as Task;

const TODAY = new Date('2026-09-20T12:00:00');

describe('goalWork', () => {
  it('counts what was filed and what was matched, separately', () => {
    const rows = goalWork(
      [goal('g1')],
      [
        task({ goal_id: 'g1' }),
        task({ goal_id: 'g1' }),
        task({ goal_ids: ['g1'] }),
      ],
      TODAY,
    );

    expect(rows[0]).toMatchObject({ finished: 3, chosen: 2, matched: 1 });
  });

  it('calls a task the reader filed chosen, even when the matcher agreed', () => {
    // The matcher stores its result beside a hand-made link rather than
    // replacing it, so this shape is the normal one for a filed task that also
    // happens to be named after its goal. It is one thing to the reader.
    const rows = goalWork([goal('g1')], [task({ goal_id: 'g1', goal_ids: ['g1'] })], TODAY);
    expect(rows[0]).toMatchObject({ finished: 1, chosen: 1, matched: 0 });
  });

  it('counts a task toward every goal it reaches', () => {
    const rows = goalWork(
      [goal('g1'), goal('g2')],
      [task({ goal_ids: ['g1', 'g2'], xp_value: 30 })],
      TODAY,
    );

    expect(rows.map((row) => [row.id, row.finished, row.xp])).toEqual([
      ['g1', 1, 30],
      ['g2', 1, 30],
    ]);
  });

  it('ignores unfinished work', () => {
    const rows = goalWork(
      [goal('g1')],
      [task({ goal_id: 'g1', status: 'todo' }), task({ goal_id: 'g1', status: 'expired' })],
      TODAY,
    );
    expect(rows[0]).toMatchObject({ finished: 0, xp: 0, daysSince: null });
  });

  it('keeps a goal with nothing against it', () => {
    // The strongest row the panel can draw. Dropping it would hide exactly the
    // case worth seeing — a goal that was set and never worked on.
    const rows = goalWork([goal('g1'), goal('g2')], [task({ goal_id: 'g1' })], TODAY);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ id: 'g2', finished: 0, lastWorked: '' });
  });

  it('leaves completed goals out', () => {
    const rows = goalWork([goal('g1', { status: 'completed' })], [task({ goal_id: 'g1' })], TODAY);
    expect(rows).toEqual([]);
  });

  it('totals XP and recorded time, and dates the last of it', () => {
    const rows = goalWork(
      [goal('g1')],
      [
        task({ goal_id: 'g1', xp_value: 40, completion_seconds: 1800, completed_at: '2026-09-18T09:00:00' }),
        task({ goal_id: 'g1', xp_value: 25, completion_seconds: 900, completed_at: '2026-09-11T09:00:00' }),
        // Untimed, which most tasks are. It adds XP and no minutes.
        task({ goal_id: 'g1', xp_value: 5, completed_at: '2026-09-02T09:00:00' }),
      ],
      TODAY,
    );

    expect(rows[0]).toMatchObject({
      finished: 3,
      xp: 70,
      minutes: 45,
      lastWorked: '2026-09-18',
      daysSince: 2,
    });
  });

  it('orders by how much work each carries', () => {
    const rows = goalWork(
      [goal('quiet'), goal('busy')],
      [task({ goal_id: 'busy' }), task({ goal_id: 'busy' }), task({ goal_id: 'quiet' })],
      TODAY,
    );
    expect(rows.map((row) => row.id)).toEqual(['busy', 'quiet']);
  });
});

describe('linkCoverage', () => {
  it('splits finished work three ways', () => {
    const coverage = linkCoverage([
      task({ goal_id: 'g1' }),
      task({ goal_ids: ['g1'] }),
      task({ goal_ids: ['g2'] }),
      task({}),
      task({}),
    ]);

    expect(coverage).toMatchObject({ finished: 5, chosen: 1, matched: 2, loose: 2 });
    expect(coverage.share).toBeCloseTo(0.6);
  });

  it('counts only finished work', () => {
    // An unfinished task counts toward nothing yet whatever it is linked to.
    // Counting them would make `loose` a measure of how much is on the list.
    const coverage = linkCoverage([task({ status: 'todo', goal_id: 'g1' }), task({})]);
    expect(coverage).toMatchObject({ finished: 1, chosen: 0, matched: 0, loose: 1 });
  });

  it('says nothing rather than dividing by nothing', () => {
    expect(linkCoverage([])).toMatchObject({ finished: 0, share: 0, loose: 0 });
  });
});
