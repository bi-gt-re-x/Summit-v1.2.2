/**
 * The client's copy of the server's progress rule. tests/test_goal_verify.py
 * pins the same figures on the other side, so the two cannot drift apart
 * without one of them failing.
 */
import { describe, expect, it } from 'vitest';
import type { Goal, Milestone } from '@/types';
import { awaitingVerify, stoneShare, stonesProgress, withStoneStatus, withSteps } from './goalProgress';

const step = (id: string, done: boolean, placeholder = false) =>
  ({ id, title: placeholder ? '' : id, done, placeholder, task_id: null, due: null });
const stone = (id: string, status: Milestone['status'], steps = [step('x', false)]) =>
  ({ id, goal_id: 'g', status, steps, position: 0 }) as unknown as Milestone;
const goal = (stones: Milestone[], over: Partial<Goal> = {}) =>
  ({ id: 'g', measure: 'milestones', status: 'active', milestones: stones, ...over }) as unknown as Goal;

describe('one checkpoint', () => {
  it('is whole once reached', () => {
    expect(stoneShare(stone('a', 'done'))).toBe(1);
  });

  it("is its named steps' share while open, placeholders aside", () => {
    expect(stoneShare(stone('a', 'active', [step('1', true), step('2', false), step('3', false, true)]))).toBe(0.5);
  });

  it('never counts as whole while open', () => {
    expect(stoneShare(stone('a', 'active', [step('1', true)]))).toBe(0.9);
  });
});

describe('the goal', () => {
  it('matches the server on the same figures', () => {
    // tests/test_goal_verify.py: half of the first of two is 25; one done and
    // one fully ticked is 95.
    expect(stonesProgress([stone('a', 'active', [step('1', true), step('2', false)]), stone('b', 'pending')])).toBe(25);
    expect(stonesProgress([stone('a', 'done'), stone('b', 'active', [step('1', true), step('2', true)])])).toBe(95);
  });

  it('moves when one step is ticked', () => {
    const before = goal([stone('a', 'active', [step('1', false), step('2', false)])]);
    const after = withSteps(before, 'a', [step('1', true), step('2', false)]);
    expect(after.progress).toBe(50);
    expect(after.status).toBe('active');
  });

  it('finishes and asks when the last checkpoint closes', () => {
    const after = withStoneStatus(goal([stone('a', 'done'), stone('b', 'active')]), 'b', 'done');
    expect(after.status).toBe('completed');
    expect(awaitingVerify(after)).toBe(true);
  });

  it('does not ask again about a goal already confirmed', () => {
    const after = withStoneStatus(goal([stone('a', 'done'), stone('b', 'active')], { verified_at: '2026-10-01' }), 'b', 'done');
    expect(awaitingVerify(after)).toBe(false);
  });

  it('leaves goals of other kinds to the server', () => {
    const counter = { id: 'g', measure: 'xp', progress: 40, milestones: [] } as unknown as Goal;
    expect(withSteps(counter, 'a', []).progress).toBe(40);
  });
});
