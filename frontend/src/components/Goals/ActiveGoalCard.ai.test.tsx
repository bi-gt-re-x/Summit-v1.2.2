/**
 * The two things the card asks a model for, and the one it refuses to.
 *
 * Both offers are drafts: five checkpoints for a goal that has none, and five
 * steps for a checkpoint whose checklist is empty. Neither is interesting on
 * its own — a button calls a function — and neither is what these tests are
 * for.
 *
 * What is worth pinning is where they are *not* offered, because each absence
 * is a decision somebody could reasonably undo:
 *
 * - Not over a checklist that has anything written in it. The save behind the
 *   button replaces the whole `steps` column, so on a checkpoint somebody has
 *   filled in, this button is a suggestion silently deleting their plan. That
 *   is the one failure here with a cost, and it is invisible in review — the
 *   code reads the same either way.
 * - Not twice on one card. A goal with no checkpoints and no chart has two
 *   empty panels, both of which want to say "shall I draft these", and the
 *   reader gets one button rather than the same button in two places.
 *
 * @see components/Goals/ActiveGoalCard for the panels these sit in.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActiveGoalCard } from './ActiveGoalCard';
import type { ActiveGoalCardProps } from './ActiveGoalCard';
import type { Goal, Milestone } from '@/types';

const step = (title: string, done = false) =>
  ({ id: `s-${title}`, title, done, placeholder: false, task_id: null }) as never;

/** The greyed prompts a new checkpoint is seeded with. Not written steps. */
const blank = (at: number) =>
  ({ id: `b-${at}`, title: '', done: false, placeholder: true, task_id: null }) as never;

const stone = (id: string, status: string, steps: unknown[] = []): Milestone =>
  ({ id, goal_id: 'g-1', title: `Stage ${id}`, status, steps,
     completed_at: null }) as unknown as Milestone;

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
    milestones: [stone('a', 'active', [blank(1), blank(2), blank(3)])],
    ...over,
  } as unknown as Goal;
}

function show(over: Partial<ActiveGoalCardProps> = {}) {
  const props = {
    goal: goal(),
    tasks: [],
    busy: false,
    onOpen: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onComplete: vi.fn(),
    onLinkTask: vi.fn(),
    onSuggest: vi.fn(async () => ['One', 'Two', 'Three', 'Four', 'Five']),
    onSuggestSteps: vi.fn(),
    onRedraftStones: vi.fn(),
    onFillSteps: vi.fn(),
    onSaveStones: vi.fn(async () => true),
    onFocusMilestone: vi.fn(),
    onMilestoneSteps: vi.fn(),
    onMilestoneStatus: vi.fn(),
    onCompleteGoal: vi.fn(),
    nameOf: (id: string) => id,
    ...over,
  } satisfies ActiveGoalCardProps;
  render(<ActiveGoalCard {...props} />);
  return props;
}

describe('the steps offer', () => {
  it('is made on a checkpoint whose checklist is only prompts', () => {
    show();
    expect(screen.getByRole('button', { name: /suggest steps/i })).toBeInTheDocument();
  });

  it('asks about the checkpoint being worked on', async () => {
    const props = show();
    await userEvent.click(screen.getByRole('button', { name: /suggest steps/i }));
    expect(props.onSuggestSteps).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
    );
  });

  /**
   * The one that matters. `update_milestone` takes the whole checklist and
   * replaces it, so offering this over written steps is offering to throw
   * them away — and the reader would have no reason to expect that from a
   * button labelled "suggest".
   */
  it('is not made once a single step has been written', () => {
    show({
      goal: goal({
        milestones: [stone('a', 'active', [step('Work through chapter 3'), blank(2), blank(3)])],
      }),
    });
    expect(screen.queryByRole('button', { name: /suggest steps/i })).not.toBeInTheDocument();
  });

  it('leaves the by-hand route in place either way', () => {
    show();
    expect(screen.getByRole('button', { name: /add another step/i })).toBeInTheDocument();
  });
});

describe('the checkpoints offer', () => {
  /** No checkpoints and no linked work: both panels are empty. */
  const bare = () => goal({ milestones: [] });

  it('is made exactly once on a goal with nothing on either side', () => {
    show({ goal: bare() });
    expect(screen.getAllByRole('button', { name: /suggest checkpoints/i })).toHaveLength(1);
  });

  it('drafts and saves in one press', async () => {
    const props = show({ goal: bare() });
    await userEvent.click(screen.getByRole('button', { name: /suggest checkpoints/i }));
    expect(props.onSuggest).toHaveBeenCalled();
    expect(props.onSaveStones).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'g-1' }),
      ['One', 'Two', 'Three', 'Four', 'Five'],
    );
  });

  it('saves nothing when the model could not answer', async () => {
    const props = show({ goal: bare(), onSuggest: vi.fn(async () => null) });
    await userEvent.click(screen.getByRole('button', { name: /suggest checkpoints/i }));
    expect(props.onSaveStones).not.toHaveBeenCalled();
  });

  it('is not made on a goal that already has checkpoints', () => {
    show();
    expect(screen.queryByRole('button', { name: /suggest checkpoints/i })).not.toBeInTheDocument();
  });

  /** A plan already on its way to this ladder — see `planning` in the props. */
  it('reads as busy while the page is drafting under this goal', () => {
    show({ goal: bare(), planning: true });

    /* Every offer on the card, not one: the empty panel's and the smart-plan
       row's (components/Goals/SmartPlan) are two doors to the same write. */
    const offers = screen.getAllByRole('button', { name: /thinking/i });
    expect(offers.length).toBeGreaterThan(0);
    offers.forEach((button) => expect(button).toBeDisabled());
  });
});

/**
 * The menu item, which is the answer to "I cannot see any of this".
 *
 * Every other offer on this card appears only where there is nothing to lose —
 * the empty panel, the checkpoint with no steps written. That is the right
 * default, and it had a consequence nobody looked for: on an account whose
 * goals all already have their checkpoints, not one of these offers is on
 * screen anywhere, and a reader who wants to redo a ladder has no way to ask
 * for one. The menu is the way back, so what matters is that it is there in
 * *both* states and that it does not draft on the spot.
 */
describe('the menu’s draft item', () => {
  const withLadder = () => goal({ milestones: [stone('a', 'active', [blank(1)])] });

  /** It lives behind the kebab, which is shut until it is asked for. */
  const openMenu = () => userEvent.click(screen.getByRole('button', { name: /actions for/i }));

  it('is offered on a goal that already has a ladder', async () => {
    show({ goal: withLadder() });
    await openMenu();
    expect(screen.getByRole('menuitem', { name: /redraft checkpoints/i })).toBeInTheDocument();
  });

  it('is offered on a goal with no ladder too, worded for that', async () => {
    show({ goal: goal({ milestones: [] }) });
    await openMenu();
    expect(screen.getByRole('menuitem', { name: /suggest checkpoints/i })).toBeInTheDocument();
  });

  it('asks the page rather than drafting on the spot', async () => {
    // The page confirms before replacing a ladder somebody wrote, so a
    // one-click menu item must not reach `onSuggest` itself.
    const props = show({ goal: withLadder() });
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /redraft checkpoints/i }));
    expect(props.onRedraftStones).toHaveBeenCalledWith(expect.objectContaining({ id: 'g-1' }));
    expect(props.onSuggest).not.toHaveBeenCalled();
    expect(props.onSaveStones).not.toHaveBeenCalled();
  });
});
