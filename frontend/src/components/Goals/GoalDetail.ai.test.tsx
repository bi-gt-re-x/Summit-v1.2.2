/**
 * The drawer's two offers, and the rows they refuse to appear on.
 *
 * The card already offered both; the drawer is where a plan actually gets
 * built — it is the only view with the dates, the ordering and every
 * checklist on screen at once — and a reader who opened it to write the plan
 * had to close it again to reach the button that would draft one.
 *
 * As on the card, the interesting assertions are the absences. Both writes
 * behind these buttons replace a whole list, so every place the button is
 * *not* drawn is a place it would have deleted something.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GoalDetail } from './GoalDetail';
import type { GoalDetailProps } from './GoalDetail';
import type { Goal, Milestone } from '@/types';

const step = (title: string) =>
  ({ id: `s-${title}`, title, done: false, placeholder: false, task_id: null }) as never;
const blank = (at: number) =>
  ({ id: `b-${at}`, title: '', done: false, placeholder: true, task_id: null }) as never;

const stone = (id: string, status: string, steps: unknown[] = []): Milestone =>
  ({ id, goal_id: 'g-1', title: `Stage ${id}`, status, steps,
     completed_at: status === 'done' ? '2026-08-02T10:00:00' : null }) as unknown as Milestone;

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g-1',
    title: 'Qualify for AIME',
    status: 'active',
    category: 'math',
    measure: 'milestones',
    subject_ids: 'algebra',
    priority: 5,
    start_date: '2026-07-01',
    created_at: '2026-07-01T09:00:00',
    deadline: '2026-12-01',
    milestones: [],
    ...over,
  } as unknown as Goal;
}

function show(over: Partial<GoalDetailProps> = {}) {
  const props = {
    goal: goal(),
    tasks: [],
    busy: false,
    onClose: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onAddMilestone: vi.fn(),
    onMilestoneStatus: vi.fn(),
    onFocusMilestone: vi.fn(),
    onMilestoneSteps: vi.fn(),
    onMilestoneDate: vi.fn(),
    onDeleteMilestone: vi.fn(),
    onReorder: vi.fn(),
    onValue: vi.fn(),
    onSuggestStones: vi.fn(),
    onSuggestSteps: vi.fn(),
    onFillSteps: vi.fn(),
    onRedraftStones: vi.fn(),
    ...over,
  } satisfies GoalDetailProps;
  render(<GoalDetail {...props} />);
  return props;
}

describe('drafting the ladder', () => {
  it('is offered on a goal with no checkpoints', async () => {
    const props = show();
    await userEvent.click(screen.getByRole('button', { name: /suggest checkpoints/i }));
    expect(props.onSuggestStones).toHaveBeenCalledWith(expect.objectContaining({ id: 'g-1' }));
  });

  /** `setMilestones` writes the list entire — over five rows it renames five. */
  it('is not offered once there is a ladder', () => {
    show({ goal: goal({ milestones: [stone('a', 'pending')] }) });
    expect(screen.queryByRole('button', { name: /suggest checkpoints/i })).not.toBeInTheDocument();
  });
});

describe('drafting one checkpoint’s steps', () => {
  it('is offered per rung while the checklist is only prompts', async () => {
    const props = show({
      goal: goal({ milestones: [stone('a', 'pending', [blank(1), blank(2), blank(3)])] }),
    });
    await userEvent.click(screen.getByRole('button', { name: /suggest steps/i }));
    expect(props.onSuggestSteps).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('is not offered once a step has been written', () => {
    show({ goal: goal({ milestones: [stone('a', 'pending', [step('Read chapter 3')])] }) });
    expect(screen.queryByRole('button', { name: /suggest steps/i })).not.toBeInTheDocument();
  });

  /** Drafting the work that reaches somewhere already reached. */
  it('is not offered on a checkpoint that is done', () => {
    show({ goal: goal({ milestones: [stone('a', 'done', [blank(1)])] }) });
    expect(screen.queryByRole('button', { name: /suggest steps/i })).not.toBeInTheDocument();
  });

  it('offers one button per unwritten rung and no more', () => {
    show({
      goal: goal({
        milestones: [
          stone('a', 'done', [blank(1)]),
          stone('b', 'pending', [blank(1)]),
          stone('c', 'pending', [step('Already mine')]),
          stone('d', 'pending', [blank(1)]),
        ],
      }),
    });
    expect(screen.getAllByRole('button', { name: /suggest steps/i })).toHaveLength(2);
  });
});

describe('while a draft is on its way', () => {
  it('every offer on the drawer reads as busy', () => {
    show({ planning: true });

    /* All of them, not one. The drawer now carries the empty-list prompt and
       the smart-plan row (components/Goals/SmartPlan), and one of them left
       pressable during a draft is a second request against a goal that is
       already being written to. */
    const offers = screen.getAllByRole('button', { name: /thinking/i });
    expect(offers.length).toBeGreaterThan(0);
    offers.forEach((button) => expect(button).toBeDisabled());
  });
});
