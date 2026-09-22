/**
 * Which checkpoint a goal is on — the rule three places now draw.
 *
 * The goal card, the goal rail and the Timer page's climb all call this, and
 * what they need from it is not "an answer" but *the same* answer: a page
 * saying a goal is on Algebra while another says Foundation is worse than
 * neither saying anything. The two cases that pin it are the ones a fresh
 * implementation gets wrong — an explicitly active checkpoint that is not the
 * first unfinished one, and a plan whose order is not its dates.
 *
 * The nulls are here because they are the states where inventing an answer
 * would show a checkpoint its owner never wrote.
 */
import { describe, expect, it } from 'vitest';
import { currentStone } from './goalStage';
import type { Goal, Milestone } from '@/types';

const stone = (title: string, status: string, over: Record<string, unknown> = {}): Milestone =>
  ({ id: `m-${title}`, goal_id: 'g-1', title, status, steps: [], ...over }) as unknown as Milestone;

const goal = (milestones: Milestone[]): Goal =>
  ({ id: 'g-1', title: 'Qualify for AIME', milestones }) as unknown as Goal;

describe('the checkpoint a goal is on', () => {
  it('is the first unfinished one', () => {
    const at = currentStone(goal([
      stone('Foundation', 'done'),
      stone('Algebra', 'pending'),
      stone('Geometry', 'pending'),
    ]));
    expect(at?.title).toBe('Algebra');
  });

  it('is the active one, even when an earlier one is unfinished', () => {
    // Somebody skipped ahead on purpose. Answering "Foundation" here would
    // overrule a choice they made by hand.
    const at = currentStone(goal([
      stone('Foundation', 'pending'),
      stone('Algebra', 'active'),
    ]));
    expect(at?.title).toBe('Algebra');
  });

  it('follows the plan\'s order, not the calendar\'s', () => {
    // Stage two carries a later date than stage three. Order is the reader's.
    const at = currentStone(goal([
      stone('Done thing', 'done'),
      stone('Stage two', 'pending', { target_date: '2026-12-01' }),
      stone('Stage three', 'pending', { target_date: '2026-06-01' }),
    ]));
    expect(at?.title).toBe('Stage two');
  });

  it('is nothing for a goal with no checkpoints', () => {
    expect(currentStone(goal([]))).toBeNull();
    expect(currentStone({ id: 'g-2' } as unknown as Goal)).toBeNull();
  });

  it('is nothing once every checkpoint is finished', () => {
    expect(currentStone(goal([stone('One', 'done'), stone('Two', 'done')]))).toBeNull();
  });
});
