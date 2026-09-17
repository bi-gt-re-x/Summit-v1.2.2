/**
 * Finishing a goal from its card, which is now two steps rather than one.
 *
 * The button used to read "Complete Goal?" and it used to be a filled green
 * bar the full width of the panel — the loudest thing on a card whose actual
 * primary action is View Details. A reader arriving at a goal is nearly always
 * reading it, and the one control with a consequence was the one shouting.
 *
 * It only ever appeared on a goal whose every checkpoint was already reached,
 * which is why it stays on the card rather than moving into the kebab: at that
 * moment the panel beside it says "Every checkpoint is behind you", and hiding
 * the control there would be a card telling the reader to do something and
 * then concealing how. What changed is the weight and the number of steps.
 *
 * So the property worth pinning is the one a rename alone would not give:
 * pressing the quiet button completes nothing. Nothing leaves the card until
 * the second press, and there is a way back from the first.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActiveGoalCard } from './ActiveGoalCard';
import type { ActiveGoalCardProps } from './ActiveGoalCard';
import type { Goal, Milestone } from '@/types';

const step = (title: string, done: boolean, over: Record<string, unknown> = {}) =>
  ({ id: `s-${title}`, title, done, placeholder: false, task_id: null, ...over }) as never;

const stone = (id: string, status: string, steps: unknown[] = []): Milestone =>
  ({
    id,
    goal_id: 'g-1',
    title: `Stage ${id}`,
    status,
    steps,
    completed_at: status === 'done' ? '2026-08-02T10:00:00' : null,
  }) as unknown as Milestone;

/** A goal mid-checkpoint: two steps ticked, three to go. */
const inFlight = () =>
  goal({
    milestones: [
      stone('a', 'done'),
      stone('b', 'active', [
        step('Complete the 2023 set', true),
        step('Review missed problems', true),
        step('Complete the Level 4 set', false),
        step('Timed practice', false),
        step('Re-test', false),
      ]),
    ],
  });

/** A goal whose checkpoints are all reached — the only state that offers this. */
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
    milestones: [stone('a', 'done'), stone('b', 'done')],
    ...over,
  } as unknown as Goal;
}

function show(over: Partial<ActiveGoalCardProps> = {}) {
  const onCompleteGoal = vi.fn();
  render(
    <ActiveGoalCard
      goal={goal()}
      tasks={[]}
      busy={false}
      onOpen={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onComplete={vi.fn()}
      onLinkTask={vi.fn()}
      onSuggest={vi.fn(async () => null)}
      onSuggestSteps={vi.fn()}
      onRedraftStones={vi.fn()}
      onFillSteps={vi.fn()}
      onSaveStones={vi.fn(async () => true)}
      onFocusMilestone={vi.fn()}
      onMilestoneSteps={vi.fn()}
      onMilestoneStatus={vi.fn()}
      onCompleteGoal={onCompleteGoal}
      nameOf={(id) => id}
      {...over}
    />,
  );
  return onCompleteGoal;
}

describe('marking a goal complete', () => {
  it('offers it quietly, and asks before doing anything', async () => {
    const user = userEvent.setup();
    const onCompleteGoal = show();

    await user.click(screen.getByRole('button', { name: 'Mark complete' }));

    // Asked, not done. This is the whole point of the change.
    expect(onCompleteGoal).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: /Mark this goal complete/ })).toBeInTheDocument();
  });

  it('completes it on the second press', async () => {
    const user = userEvent.setup();
    const onCompleteGoal = show();

    await user.click(screen.getByRole('button', { name: 'Mark complete' }));
    const confirm = screen.getByRole('group', { name: /Mark this goal complete/ });
    await user.click(
      screen.getAllByRole('button', { name: 'Mark complete' }).find((b) => confirm.contains(b))!,
    );

    expect(onCompleteGoal).toHaveBeenCalledTimes(1);
    expect(onCompleteGoal.mock.calls[0]![0].id).toBe('g-1');
  });

  it('has a way back that completes nothing', async () => {
    const user = userEvent.setup();
    const onCompleteGoal = show();

    await user.click(screen.getByRole('button', { name: 'Mark complete' }));
    await user.click(screen.getByRole('button', { name: 'Not yet' }));

    expect(onCompleteGoal).not.toHaveBeenCalled();
    // And the offer is back, rather than the card having spent it.
    expect(screen.getByRole('button', { name: 'Mark complete' })).toBeInTheDocument();
  });

  /* It says what completing does, because "complete" is not self-evident on a
     page where a goal is also a row in four other places. */
  it('says where the goal goes, and that it is reversible', async () => {
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole('button', { name: 'Mark complete' }));
    const confirm = screen.getByRole('group', { name: /Mark this goal complete/ });

    expect(confirm).toHaveTextContent('Qualify for AIME');
    expect(confirm).toHaveTextContent(/Recently Completed/);
    expect(confirm).toHaveTextContent(/reopen it by editing it/);
  });

  /* The question mark is gone from both. It read as the card asking the
     reader something on sight, which is exactly what it should not do. */
  it('does not ask the reader a question on sight', () => {
    show();
    expect(screen.queryByRole('button', { name: /Complete Goal\?/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Complete Milestone\?/)).not.toBeInTheDocument();
  });

  it('offers nothing while a write is already in flight', async () => {
    const user = userEvent.setup();
    const onCompleteGoal = show({ busy: true });

    const button = screen.getByRole('button', { name: 'Mark complete' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onCompleteGoal).not.toHaveBeenCalled();
  });

  it('is not offered at all while a checkpoint is still open', () => {
    show({ goal: goal({ milestones: [stone('a', 'done'), stone('b', 'todo')] }) });
    expect(screen.queryByRole('button', { name: 'Mark complete' })).not.toBeInTheDocument();
  });
});

/**
 * The right-hand column, which is the half of the card that can be acted on.
 *
 * The two panels answer different questions and only one of them is a next
 * move: the chart says why the goal is going the way it is, and this says
 * where you are in the plan and what to do about it. It used to be the
 * quieter of the two — a 13.5px checkpoint name beside a block of colour, with
 * the progress figure two headings further down under a list you had to read
 * to work the same thing out.
 *
 * The "Next" line is the piece that did not exist at all. The checklist is
 * windowed three rows at a time and a window onto a half-done checkpoint is a
 * mix of ticked and unticked rows, so "which of these is mine" was a question
 * the panel could answer and was making the reader answer instead.
 */
describe('the current checkpoint', () => {
  it('leads with the checkpoint and how far into it you are', () => {
    show({ goal: inFlight() });

    expect(screen.getByRole('heading', { name: 'Current checkpoint' })).toBeInTheDocument();
    expect(screen.getByText('2 / 5 steps')).toBeInTheDocument();
  });

  /* It was `focus.note || health.reason`, and the fallback printed the chip's
     own sentence two lines under the chip. */
  it('keeps the note the reader wrote, beside the count', () => {
    const one = inFlight();
    (one.milestones as never as Array<Record<string, unknown>>)[1]!.note = 'Counting is the wall';
    show({ goal: one });

    expect(screen.getByText(/2 \/ 5 steps · Counting is the wall/)).toBeInTheDocument();
  });

  it('names the one step to do next', () => {
    show({ goal: inFlight() });

    const next = screen.getByText('Next').closest('p')!;
    expect(next).toHaveTextContent('Complete the Level 4 set');
  });

  /* Not the ticked ones above it, and not an unwritten row below. A
     placeholder is a step nobody has named, and "Next: Step 4" is an
     instruction to go and do something that has no description. */
  it('skips the steps already done and the ones not yet written', () => {
    show({
      goal: goal({
        milestones: [
          stone('a', 'active', [
            step('Done already', true),
            step('', false, { placeholder: true }),
            step('The real next one', false),
          ]),
        ],
      }),
    });

    expect(screen.getByText('Next').closest('p')).toHaveTextContent('The real next one');
  });

  it('says nothing about next when the checkpoint is finished', () => {
    show({
      goal: goal({
        milestones: [stone('a', 'active', [step('Only step', true)])],
      }),
    });

    // The space belongs to the button that closes the checkpoint instead.
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark checkpoint reached' })).toBeInTheDocument();
  });

  it('says so plainly when a checkpoint has no steps at all', () => {
    show({ goal: goal({ milestones: [stone('a', 'active')] }) });

    expect(screen.getByText(/No steps yet/)).toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });
});
