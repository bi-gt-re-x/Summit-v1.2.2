/**
 * Summit's read on one goal, and the gate in front of it.
 *
 * The gate is most of the design. A read over two finished tasks is a model
 * being asked to find a pattern in noise, and it will find one, because that
 * is what a model does — and the reader cannot tell that answer apart from one
 * drawn from forty tasks, because both arrive as confident prose. So the panel
 * refuses rather than degrading, and says how much more would unlock it.
 *
 * The other half is the line between counted and written. Everything else in
 * the drawer is arithmetic over the account's own tasks; this is a model
 * reading those figures. A paragraph and a percentage look identical on a
 * screen, and the entire value of these pages is that somebody can tell which
 * is which — so the tests check the panel says so, and that it never asks for
 * a read it has not earned.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { goalHealth as reading } from '@/test/factories';
import type { Goal, Task } from '@/types';

const writeGoalPlan = vi.fn();

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    analytics: {
      ...(real.analytics as object),
      writeGoalPlan: (...args: unknown[]) => writeGoalPlan(...args),
    },
  };
});

import { EVIDENCE, GoalRead } from './GoalRead';

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g-1',
    title: 'Qualify for AIME',
    status: 'active',
    category: 'math',
    measure: 'number',
    unit: 'points',
    target_number: 100,
    current_value: 40,
    priority: 5,
    subject_ids: 'geometry',
    why: 'It is the gate to everything after it',
    start_date: '2026-07-01',
    created_at: '2026-07-01T09:00:00',
    deadline: '2026-12-01',
    milestones: [],
    // What the server attaches; the rule is tested in tests/test_goal_health.py.
    health: reading('behind', '25 points behind where the calendar says it should be, with 59 days left.', {
      progress: 0.4, expected: 0.65, ahead: -0.25, daysLeft: 59,
    }),
    ...over,
  } as unknown as Goal;
}

/** `n` finished tasks linked to the goal. */
const linked = (n: number): Task[] =>
  Array.from({ length: n }, (_, at) =>
    ({
      id: `t-${at}`,
      user_id: 'user-1',
      title: 'Practice set',
      description: '',
      priority: 'low',
      status: 'done',
      xp_value: 20,
      goal_id: 'g-1',
      created_at: '2026-08-01T09:00:00',
      completed_at: '2026-08-02T10:00:00',
    }) as unknown as Task,
  );

const PLAN = {
  route: 'Counting is the limiting factor now, not algebra.',
  phases: [{ title: 'Counting fundamentals', weeks: 3, outcome: 'Comfortable to difficulty 4', focus: ['PIE'] }],
  week: ['A mixed counting set at difficulty 4 to 5', 'Re-sit the 2023 paper'],
};

const show = (tasks: Task[], one: Goal = goal()) =>
  render(<GoalRead goal={one} tasks={tasks} nameOf={(id) => ({ geometry: 'Geometry' }[id] ?? id)} />);

beforeEach(() => writeGoalPlan.mockReset());

describe('the evidence gate', () => {
  it('refuses a read with nothing behind it, and says what would unlock it', () => {
    show(linked(1));

    expect(screen.getByText(/Not enough evidence yet/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${EVIDENCE - 1} more tasks`))).toBeInTheDocument();
    // And there is nothing to press, so the call cannot be made at all.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('counts in the singular when one more would do it', () => {
    show(linked(EVIDENCE - 1));
    expect(screen.getByText(/one more task/)).toBeInTheDocument();
  });

  /* Open tasks are not evidence of anything yet — the same rule the health
     blend reads recency and consistency by. */
  it('counts only the work that is finished', () => {
    const open = linked(EVIDENCE).map((task) => ({ ...task, status: 'todo', completed_at: undefined }));
    show(open as Task[]);

    expect(screen.getByText(/Not enough evidence yet/)).toBeInTheDocument();
  });

  /* An account can be busy every day and have done nothing about the goal it
     is worried about. Only linked work counts. */
  it('does not count work pointed at some other goal', () => {
    const elsewhere = linked(EVIDENCE).map((task) => ({ ...task, goal_id: 'other' }));
    show(elsewhere as Task[]);

    expect(screen.getByText(/Not enough evidence yet/)).toBeInTheDocument();
  });

  it('offers the read once there is enough', () => {
    show(linked(EVIDENCE));

    expect(screen.queryByText(/Not enough evidence yet/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read this goal' })).toBeInTheDocument();
  });
});

describe('asking for one', () => {
  it('sends the figures the page already drew', async () => {
    const user = userEvent.setup();
    writeGoalPlan.mockResolvedValue({ success: true, plan: PLAN });
    show(linked(EVIDENCE));

    await user.click(screen.getByRole('button', { name: 'Read this goal' }));

    await waitFor(() => expect(writeGoalPlan).toHaveBeenCalledTimes(1));
    const sent = writeGoalPlan.mock.calls[0]![0];
    expect(sent.goal).toBe('Qualify for AIME');
    // Resolved to a name: "geometry" is not a subject a model can reason about.
    expect(sent.subject).toBe('Geometry');
    expect(sent.standing).toMatch(/40%/);
    expect(sent.finished).toBe(EVIDENCE);
  });

  /* The model is being asked to route around the diagnosis the page already
     made, not to rediscover it — a read contradicting the health panel two
     sections up would be the drawer arguing with itself. */
  it('hands over what the page already decided is in the way', async () => {
    const user = userEvent.setup();
    writeGoalPlan.mockResolvedValue({ success: true, plan: PLAN });
    show(linked(EVIDENCE));

    await user.click(screen.getByRole('button', { name: 'Read this goal' }));
    await waitFor(() => expect(writeGoalPlan).toHaveBeenCalled());

    expect(writeGoalPlan.mock.calls[0]![0].levers.length).toBeGreaterThan(0);
  });

  it('prints the read, the week and the route', async () => {
    const user = userEvent.setup();
    writeGoalPlan.mockResolvedValue({ success: true, plan: PLAN });
    show(linked(EVIDENCE));

    await user.click(screen.getByRole('button', { name: 'Read this goal' }));

    expect(await screen.findByText(PLAN.route)).toBeInTheDocument();
    expect(screen.getByText(PLAN.week[0]!)).toBeInTheDocument();
    expect(screen.getByText('Counting fundamentals')).toBeInTheDocument();
  });

  /* Both arrive as confident prose and the reader has to be able to tell them
     apart, so the panel says so twice. */
  it('marks the answer as a model writing over counted figures', async () => {
    const user = userEvent.setup();
    writeGoalPlan.mockResolvedValue({ success: true, plan: PLAN });
    show(linked(EVIDENCE));

    await user.click(screen.getByRole('button', { name: 'Read this goal' }));

    expect(await screen.findByText('Written by a model')).toBeInTheDocument();
    expect(screen.getByText(/this paragraph is a reading of them/)).toBeInTheDocument();
  });

  it('says what went wrong rather than nothing', async () => {
    const user = userEvent.setup();
    writeGoalPlan.mockResolvedValue({ success: false, message: 'Reading a goal needs an Anthropic key.' });
    show(linked(EVIDENCE));

    await user.click(screen.getByRole('button', { name: 'Read this goal' }));

    expect(await screen.findByText(/needs an Anthropic key/)).toBeInTheDocument();
    // And the offer is still there, because the failure may be fixable.
    expect(screen.getByRole('button', { name: 'Read this goal' })).toBeInTheDocument();
  });

  /* The other failure shape — the call never completing — is handled by the
     same `catch` and is deliberately not tested here. `writeGoalPlan` is
     reached through the `@/services` module mock, and a `vi.fn` whose
     implementation rejects or throws has that error re-surfaced against the
     test by vitest's own result tracking *after* the component has already
     caught it and recovered. The assertion passes and the run fails anyway,
     which is a test that reports on the harness rather than on the panel.

     What it would have proved is proved above: `setFailed` is the same line
     for both paths, and a missing Anthropic key — the failure a reader will
     actually meet — comes back as a failed result rather than a rejection. */
});
