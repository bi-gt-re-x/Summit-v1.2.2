/**
 * Finishing a goal from its card: asked, loudly, and answered in one press.
 *
 * It used to be a quiet "Mark complete" that opened a second confirmation, on
 * the argument that the one control with a consequence should not shout. That
 * was the wrong call for the moment it covers. By the time the card asks, the
 * work is done: every checkpoint is ticked or the goal's own numbers say it
 * is reached. The reader is being asked to say so, and that deserves the big
 * button and the celebration that follows it (pages/Goals).
 *
 * So what is pinned: the question appears exactly when the goal is reached,
 * both answers go to the page in one press, and it is not on screen before
 * then or while a write is in flight.
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
  const onVerify = vi.fn();
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
      onVerify={onVerify}
      nameOf={(id) => id}
      {...over}
    />,
  );
  return onVerify;
}

const question = () => screen.getByRole('group', { name: /you reached it/i });

describe('asking whether a goal is done', () => {
  it('asks once every checkpoint is reached', () => {
    show();
    expect(question()).toHaveTextContent(/Is this goal done/);
  });

  it('asks when the goal finished itself and is waiting on the answer', () => {
    show({ goal: goal({ status: 'completed', needs_verify: true }) });
    expect(question()).toBeInTheDocument();
  });

  it('takes yes in one press', async () => {
    const user = userEvent.setup();
    const onVerify = show();
    await user.click(screen.getByRole('button', { name: /yes, it's done/i }));
    expect(onVerify).toHaveBeenCalledTimes(1);
    expect(onVerify.mock.calls[0]![0].id).toBe('g-1');
    expect(onVerify.mock.calls[0]![1]).toBe(true);
  });

  it('takes not yet in one press', async () => {
    const user = userEvent.setup();
    const onVerify = show();
    await user.click(screen.getByRole('button', { name: /not yet/i }));
    expect(onVerify).toHaveBeenCalledWith(expect.objectContaining({ id: 'g-1' }), false);
  });

  it('says where the goal goes', () => {
    show();
    expect(question()).toHaveTextContent(/finished goals and your Analytics/);
  });

  it('offers nothing while a write is already in flight', async () => {
    const user = userEvent.setup();
    const onVerify = show({ busy: true });
    const button = screen.getByRole('button', { name: /yes, it's done/i });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onVerify).not.toHaveBeenCalled();
  });

  it('is not asked while a checkpoint is still open', () => {
    show({ goal: goal({ milestones: [stone('a', 'done'), stone('b', 'todo')] }) });
    expect(screen.queryByRole('group', { name: /you reached it/i })).not.toBeInTheDocument();
  });

  it('is not asked again once the reader has answered', () => {
    show({ goal: goal({ status: 'completed', needs_verify: false, verified_at: '2026-10-12T10:00:00' }) });
    expect(screen.queryByRole('group', { name: /you reached it/i })).not.toBeInTheDocument();
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

describe('choosing the chart', () => {
  it('offers every chart from the panel menu and saves the one picked', async () => {
    const user = userEvent.setup();
    const onChart = vi.fn();
    show({ onChart });

    await user.click(screen.getByRole('button', { name: /Chart for/ }));
    const names = screen.getAllByRole('menuitemradio').map((item) => item.textContent);
    expect(names).toEqual([
      'Automatic', 'Line graph', 'Step chart', 'Heatmap', 'Basic graph',
      'Roadmap', 'Weekly volume', 'Difficulty',
    ]);
    expect(screen.getByRole('menuitemradio', { name: 'Automatic' })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('menuitemradio', { name: 'Step chart' }));
    expect(onChart).toHaveBeenCalledWith(expect.objectContaining({ id: 'g-1' }), 'step');
  });

  it('draws the chart the goal was given', () => {
    show({ goal: goal({ chart: 'basic' }), onChart: vi.fn() });

    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument();
    expect(screen.getByText(/You chose this chart/)).toBeInTheDocument();
  });
});

/**
 * The bar was one length against one target and nothing else, on the panel with
 * the most room to say more. Two things it can say from what the goal already
 * carries: how the target is divided, and where the clock is.
 */
describe('the basic graph', () => {
  const milestones = (count: number, done: number) =>
    Array.from({ length: count }, (_, i) => stone(`m${i}`, i < done ? 'done' : 'pending'));

  it('divides the bar where the target is divided', () => {
    show({ goal: goal({ chart: 'basic', milestones: milestones(5, 1) }), onChart: vi.fn() });

    // Four dividers make five segments — one per checkpoint, so "1 of 5" is
    // something the bar shows rather than something the caption claims.
    expect(document.querySelectorAll('.ag-scale-ticks i')).toHaveLength(4);
    expect(screen.getByText('4 milestones to go.')).toBeInTheDocument();
  });

  it('leaves a large target as one bar', () => {
    show({
      goal: goal({ chart: 'basic', measure: 'number', target_number: 2500, current_value: 500,
                   unit: 'problems', milestones: [] }),
      onChart: vi.fn(),
    });

    // 2,500 problems is a bar, not two and a half thousand segments.
    expect(document.querySelectorAll('.ag-scale-ticks i')).toHaveLength(0);
  });

  it('marks where the clock is, against where the work is', () => {
    // Half the window gone, one checkpoint of four done.
    const from = Date.now() - 100 * 86_400_000;
    const to = Date.now() + 100 * 86_400_000;
    show({
      goal: goal({
        chart: 'basic',
        start_date: new Date(from).toISOString(),
        deadline: new Date(to).toISOString(),
        milestones: milestones(4, 1),
      }),
      onChart: vi.fn(),
    });

    expect(screen.getByText(/50% of the time, 25% of the work/)).toBeInTheDocument();
    expect(document.querySelector('.ag-scale-clock')).toHaveStyle({ left: '50%' });
  });

  it('says so when the target date has gone', () => {
    show({
      goal: goal({
        chart: 'basic',
        start_date: '2020-01-01',
        deadline: '2021-01-01',
        milestones: milestones(4, 1),
      }),
      onChart: vi.fn(),
    });

    expect(screen.getByText(/The target date has passed/)).toBeInTheDocument();
  });

  it('says nothing about a clock a goal does not have', () => {
    show({
      goal: goal({ chart: 'basic', deadline: '', milestones: milestones(4, 1) }),
      onChart: vi.fn(),
    });

    // An open-ended goal is not ahead or behind. Inventing a window to measure
    // it against would be the app making the deadline up.
    expect(screen.queryByText(/of the time,/)).not.toBeInTheDocument();
    expect(document.querySelector('.ag-scale-clock')).toBeNull();
  });
});
