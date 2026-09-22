/**
 * The climb, and the intention.
 *
 * Two claims on this page can be wrong in the same quiet way — by saying a
 * goal is fed by something that does not feed it.
 *
 * **The climb** puts goals under two headings, and the headings are the whole
 * content. "Counting your minutes" is a statement that running this timer moves
 * that goal's own figure, which is true of a goal measured in focus time and of
 * no other kind; a task goal listed there would be telling somebody their
 * afternoon at the clock was progress it was not. So the tests below are mostly
 * about which list a goal lands in, and they use one account holding both kinds
 * at once, because that is the case a filter gets wrong.
 *
 * **The intention** is scored against a number the account typed, and the
 * result is asked for rather than counted. The test for that is the one that
 * checks the panel says whose count it is.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stats, task } from '@/test/factories';
import type { Goal, Milestone } from '@/types';
import type { Interval } from '@/components/Timer/intervals';

vi.mock('@/hooks/useSubjects', () => ({
  useSubjectIndex: () => new Map([['maths', { id: 'maths', name: 'Mathematics', label: 'Maths' }]]),
  useSubjects: () => [],
  subjectOf: () => null,
}));

/** What the stubbed goals endpoint answers with, per test. */
let served: Goal[] = [];

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    focus: {
      ...(real.focus as object),
      history: () => Promise.resolve({ success: true, days: {} }),
      syncDay: () => Promise.resolve({ success: true }),
    },
    goals: { ...(real.goals as object), getGoals: () => Promise.resolve({ success: true, goals: served }) },
    growth: { ...(real.growth as object), ratings: () => Promise.resolve({ success: true }) },
  };
});

import Timer from './Timer';

const stone = (title: string, status: string): Milestone =>
  ({ id: `m-${title}`, goal_id: 'g', title, status, steps: [], position: 0 }) as unknown as Milestone;

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g-1',
    title: 'Qualify for AIME',
    status: 'active',
    measure: 'focus',
    progress: 42,
    target_focus: 600,
    current_focus: 200,
    subject_ids: 'maths',
    why: 'Because I want the shot at it.',
    milestones: [],
    unit: '',
    ...over,
  } as unknown as Goal;
}

function today(): string {
  const at = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`;
}

function logged(rows: Interval[]) {
  localStorage.setItem('pomodoro:intervals:myles', JSON.stringify(rows));
}

function sitting(over: Partial<Interval> = {}): Interval {
  return {
    day: today(),
    styleId: 'classic',
    planned: 25,
    minutes: 25,
    pauses: 0,
    finished: true,
    at: Date.now() - 30_000,
    ...over,
  };
}

function show(tasks = [task()]) {
  return renderWithProviders(<Timer />, {
    route: '/timer',
    userData: { data: { stats: stats(), tasks }, username: 'myles' },
  });
}

beforeEach(() => {
  served = [];
  localStorage.clear();
  localStorage.setItem('pomodoro:setup:myles', '1');
});

async function climb() {
  return within(await screen.findByRole('region', { name: /today's climb/i }));
}

describe('the climb', () => {
  it('says what is missing when nothing counts the time', async () => {
    show();
    const panel = await climb();
    expect(panel.getByText(/nothing counts this page's minutes yet/i)).toBeInTheDocument();
  });

  it('draws the chain for a goal measured in focus time', async () => {
    served = [goal({ milestones: [stone('Foundation', 'done'), stone('Counting', 'pending')] })];
    show();

    const panel = await climb();
    await waitFor(() => expect(panel.getByText('Qualify for AIME')).toBeInTheDocument());
    // Subject, stage, the goal's own arithmetic, and its own reason.
    expect(panel.getByText('Mathematics')).toBeInTheDocument();
    expect(panel.getByText('Counting')).toBeInTheDocument();
    expect(panel.getByText(/3h 20m of 10h recorded/i)).toBeInTheDocument();
    expect(panel.getByText(/because i want the shot at it/i)).toBeInTheDocument();
  });

  it('names the stage by the rule the rest of the app uses', async () => {
    // An explicitly active checkpoint wins over the first unfinished one —
    // utils/goalStage, shared with the goal card and the goal rail.
    served = [goal({
      milestones: [stone('Foundation', 'pending'), stone('Algebra', 'active')],
    })];
    show();

    const panel = await climb();
    await waitFor(() => expect(panel.getByText('Algebra')).toBeInTheDocument());
  });

  it('will not put a task goal under "counting your minutes"', async () => {
    // The failure this page could quietly commit: a goal that only moves when
    // tasks are finished, listed as though sitting at the clock advanced it.
    served = [goal({ id: 'g-2', title: 'Ship the rewrite', measure: 'tasks', target_focus: 0 })];
    show();

    const panel = await climb();
    await waitFor(() => {
      expect(panel.queryByText(/counting your minutes/i)).not.toBeInTheDocument();
    });
    expect(panel.queryByText('Ship the rewrite')).not.toBeInTheDocument();
  });

  it("lists the goals today's finished work fed, and counts it", async () => {
    served = [goal({ id: 'g-2', title: 'Ship the rewrite', measure: 'tasks', target_focus: 0 })];
    show([
      task({ status: 'done', completed_at: `${today()}T09:00:00`, goal_id: 'g-2' }),
      task({ status: 'done', completed_at: `${today()}T10:00:00`, goal_ids: ['g-2'] }),
      // Yesterday's work is not today's climb.
      task({ status: 'done', completed_at: '2026-01-02T10:00:00', goal_id: 'g-2' }),
    ]);

    const panel = await climb();
    await waitFor(() => expect(panel.getByText('Ship the rewrite')).toBeInTheDocument());
    expect(panel.getByText(/2 tasks today/i)).toBeInTheDocument();
    expect(panel.getByText(/what today's finished work fed/i)).toBeInTheDocument();
  });
});

describe('the intention', () => {
  it('is optional — the timer starts without one', async () => {
    show();
    expect(await screen.findByRole('button', { name: /^start focus$/i })).toBeEnabled();
    expect(screen.getByLabelText(/what does success look like/i)).toBeInTheDocument();
  });

  it('holds what was set, with its number', async () => {
    show();
    await userEvent.type(
      await screen.findByLabelText(/what does success look like/i),
      'Finish 15 problems',
    );
    await userEvent.type(screen.getByLabelText(/^how many$/i), '15');
    await userEvent.click(screen.getByRole('button', { name: /^set$/i }));

    expect(await screen.findByText('Finish 15 problems')).toBeInTheDocument();
    expect(screen.getByText(/target 15/i)).toBeInTheDocument();
  });

  it('takes no number without a line to attach it to', async () => {
    show();
    // Nothing typed: the Set button cannot be pressed, so a stray count cannot
    // become a target with nothing to be a target of.
    await userEvent.type(await screen.findByLabelText(/^how many$/i), '15');
    expect(screen.getByRole('button', { name: /^set$/i })).toBeDisabled();
  });

  it('asks how the sitting went, and scores the answer', async () => {
    logged([sitting({ intent: 'Finish 15 problems', target: 15 })]);
    show();

    expect(await screen.findByText('Finish 15 problems')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/how many of the 15/i), '17');
    await userEvent.click(screen.getByRole('button', { name: /log it/i }));

    await waitFor(() => expect(screen.getByText('113%')).toBeInTheDocument());
    expect(screen.getByText(/more than you set out to/i)).toBeInTheDocument();
    // Whose number it is, said on the panel.
    expect(screen.getByText(/17 of 15, your count/i)).toBeInTheDocument();
  });

  it('answers a numberless intention yes or no', async () => {
    logged([sitting({ intent: 'Understand integration by parts' })]);
    show();

    await userEvent.click(await screen.findByRole('button', { name: /did it/i }));
    await waitFor(() =>
      expect(screen.getByText(/did what you set out to do/i)).toBeInTheDocument());
    // No number was set, so nothing is scored as a percentage.
    expect(screen.queryByText(/execution/i)).not.toBeInTheDocument();
  });

  it('writes nothing when the question is skipped', async () => {
    logged([sitting({ intent: 'Finish 15 problems', target: 15 })]);
    show();

    await userEvent.click(await screen.findByRole('button', { name: /^skip$/i }));
    await waitFor(() =>
      expect(screen.queryByText('Finish 15 problems')).not.toBeInTheDocument());

    const stored = JSON.parse(localStorage.getItem('pomodoro:intervals:myles') ?? '[]');
    expect(stored[0].done).toBeUndefined();
    expect(stored[0].met).toBeUndefined();
  });

  it('does not ask about a sitting from hours ago', async () => {
    logged([sitting({ intent: 'Finish 15 problems', target: 15, at: Date.now() - 4 * 3600_000 })]);
    show();

    await screen.findByRole('button', { name: /^start focus$/i });
    expect(screen.queryByText('Finish 15 problems')).not.toBeInTheDocument();
  });
});
