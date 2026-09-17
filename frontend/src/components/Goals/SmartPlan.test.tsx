/**
 * The model's offers, once a goal is no longer empty.
 *
 * Every offer on this page used to be attached to an absence — the empty
 * checkpoint list, the empty checklist — so a goal with a plan had no model
 * feature on screen at all. This row is the other half, and what is worth
 * pinning is which offer appears when, because each choice is one somebody
 * could reasonably undo without noticing what it cost.
 *
 * The one with a cost is the redraft. `setMilestones` writes the list entire,
 * so on a goal with five written checkpoints that button renames five things
 * the reader typed — which is why it goes through the page's confirm and why
 * this file checks it is the *only* one that does.
 *
 * @see components/Goals/SmartPlan
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SmartPlan } from './SmartPlan';
import type { Goal, Milestone } from '@/types';

const step = (title: string) =>
  ({ id: `s-${title}`, title, done: false, placeholder: false, task_id: null }) as never;

/** The greyed prompts a new checkpoint is seeded with. Not written steps. */
const blank = (at: number) =>
  ({ id: `b-${at}`, title: '', done: false, placeholder: true, task_id: null }) as never;

const stone = (id: string, status = 'pending', steps: unknown[] = []): Milestone =>
  ({ id, goal_id: 'g-1', title: `Stage ${id}`, status, steps, completed_at: null }) as unknown as Milestone;

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g-1',
    title: 'Get 24 on the AMC 8',
    status: 'active',
    measure: 'number',
    unit: 'points',
    target_number: 24,
    current_value: 12,
    progress: 50,
    priority: 5,
    deadline: '2026-11-01',
    created_at: '2026-07-01T09:00:00',
    milestones: [],
    ...over,
  } as Goal;
}

function show(over: Partial<Goal> = {}, compact = false) {
  const onRedraftStones = vi.fn();
  const onFillSteps = vi.fn();
  render(
    <SmartPlan
      goal={goal(over)}
      busy={false}
      onRedraftStones={onRedraftStones}
      onFillSteps={onFillSteps}
      compact={compact}
    />,
  );
  return { onRedraftStones, onFillSteps };
}

describe('a goal with no plan yet', () => {
  it('offers the whole thing in one press', () => {
    const { onRedraftStones } = show();
    expect(screen.getByRole('button', { name: /draft the whole plan/i })).toBeInTheDocument();
    // Nothing to fill in when there are no checkpoints to fill.
    expect(screen.queryByRole('button', { name: /fill in/i })).not.toBeInTheDocument();
    expect(onRedraftStones).not.toHaveBeenCalled();
  });
});

describe('a goal with a plan that has gaps', () => {
  const gappy = {
    milestones: [
      stone('m1', 'pending', [step('Written by hand')]),
      stone('m2', 'pending', []),
      stone('m3', 'pending', [blank(1), blank(2)]),
      // Reached. Drafting the work that would have got somewhere the reader
      // has already arrived is the app not reading its own screen.
      stone('m4', 'done', []),
    ],
  };

  it('counts only the rungs a draft could actually help', () => {
    show(gappy);
    // m2 and m3. Not m1, which is written; not m4, which is done.
    expect(screen.getByRole('button', { name: /fill in 2 checklists/i })).toBeInTheDocument();
  });

  it('fills the empty ones without asking, because it cannot overwrite', async () => {
    const { onFillSteps, onRedraftStones } = show(gappy);

    await userEvent.click(screen.getByRole('button', { name: /fill in 2 checklists/i }));

    // Straight through, no confirm: `fillSteps` skips anything written and
    // anything reached, so the worst case is that nothing happens.
    expect(onFillSteps).toHaveBeenCalledTimes(1);
    expect(onRedraftStones).not.toHaveBeenCalled();
  });

  it('offers the redraft too, worded as the replacement it is', () => {
    show(gappy);
    const redraft = screen.getByRole('button', { name: /redraft checkpoints/i });
    // The warning is on the control, where a reader deciding whether to press
    // it is actually looking.
    expect(redraft).toHaveAttribute('title', expect.stringMatching(/asked first/i));
  });

  it('says one rather than two when only one rung is empty', () => {
    show({ milestones: [stone('m1', 'pending', []), stone('m2', 'pending', [step('Mine')])] });
    expect(screen.getByRole('button', { name: /fill in 1 checklist$/i })).toBeInTheDocument();
  });
});

describe('a goal with a complete plan', () => {
  const full = {
    milestones: [stone('m1', 'pending', [step('One')]), stone('m2', 'done', [step('Two')])],
  };

  it('stops offering to fill anything', () => {
    show(full);
    expect(screen.queryByRole('button', { name: /fill in/i })).not.toBeInTheDocument();
  });

  it('still offers the redraft, which is the whole point of the row', () => {
    // The state where every other offer on the page disappears.
    show(full);
    expect(screen.getByRole('button', { name: /redraft checkpoints/i })).toBeInTheDocument();
  });
});

describe('a counter', () => {
  it('is offered nothing at all', () => {
    // "Earn 50,000 XP" has no checkpoints and cannot have any — the app counts
    // it directly. A button here would be one that quietly does nothing, since
    // `planGoal` refuses these too.
    const { container } = render(
      <SmartPlan
        goal={goal({ measure: 'xp' })}
        busy={false}
        onRedraftStones={vi.fn()}
        onFillSteps={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the compact form', () => {
  it('drops the sentence but keeps the offer', () => {
    show({}, true);
    expect(screen.getByRole('button', { name: /draft the whole plan/i })).toBeInTheDocument();
    expect(screen.queryByText(/Every row is yours to rename/i)).not.toBeInTheDocument();
  });
});
