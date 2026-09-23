/**
 * The four things the page claims about a sitting after it ends.
 *
 * Three of them are automatic, and that is exactly why they need pinning: the
 * reader is not asked to confirm any of it, so a wrong claim here is one
 * nobody is in a position to correct.
 *
 * **The replay** draws where the pauses fell. Its own line of text is what a
 * screen reader gets, so the text is what is asserted — a chart nobody can
 * read is not a feature.
 *
 * **The accounting** says which tasks were finished while the sitting ran, from
 * the sitting's own window. The case that matters is the task finished just
 * outside it: claiming that one would be the page taking credit for work done
 * over the break.
 *
 * **The kind** changes which reading leads and nothing else. The test for it is
 * that all three readings are still there.
 *
 * **The live goal line** only appears while work is actually running, and only
 * for a goal this page can move.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stats, task } from '@/test/factories';
import type { Goal } from '@/types';
import type { Interval } from '@/components/Timer/intervals';

vi.mock('@/hooks/useSubjects', () => ({
  useSubjectIndex: () => new Map(),
  useSubjects: () => [],
  subjectOf: () => null,
}));

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

const ENDED = Date.now() - 60_000;

function sitting(over: Partial<Interval> = {}): Interval {
  return {
    day: '2026-09-22',
    styleId: 'classic',
    planned: 25,
    minutes: 25,
    pauses: 0,
    finished: true,
    at: ENDED,
    intent: 'Finish 15 problems',
    target: 15,
    done: 15,
    ...over,
  };
}

function logged(rows: Interval[]) {
  localStorage.setItem('pomodoro:intervals:myles', JSON.stringify(rows));
}

function focusGoal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g-1',
    title: 'Qualify for AIME',
    status: 'active',
    measure: 'focus',
    progress: 20,
    target_focus: 600,
    current_focus: 120,
    subject_ids: '',
    why: '',
    milestones: [],
    unit: '',
    ...over,
  } as unknown as Goal;
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

describe('the replay', () => {
  it('says a clean sitting had no pauses', async () => {
    logged([sitting()]);
    show();
    expect(await screen.findByText(/25 min, no pauses\./i)).toBeInTheDocument();
  });

  it('says where the pauses fell, in order', async () => {
    logged([sitting({ pauses: 2, breaks: [4, 19] })]);
    show();
    expect(await screen.findByText(/25 min, paused at 4m, 19m\./i)).toBeInTheDocument();
  });

  it('still reads for a row from before positions were kept', async () => {
    // `pauses` without `breaks`: the count survives, the strip just has no
    // marks to draw. Losing the row instead would be the migration doing harm.
    logged([sitting({ pauses: 3 })]);
    show();
    expect(await screen.findByText(/25 min, no pauses\./i)).toBeInTheDocument();
  });
});

describe('what the sitting fed', () => {
  it('counts the tasks finished while it ran', async () => {
    served = [focusGoal({ id: 'g-2', title: 'Ship the rewrite', measure: 'tasks' })];
    logged([sitting()]);
    show([
      task({
        status: 'done',
        completed_at: new Date(ENDED - 5 * 60_000).toISOString(),
        goal_id: 'g-2',
      }),
    ]);

    // Scoped to the strip: the climb panel names the same goal further down,
    // which is correct — it fed today's work as well as this sitting's.
    const fed = await screen.findByText(/finished while it ran/i);
    expect(fed).toHaveTextContent(/1 task/i);
    await waitFor(() => expect(fed).toHaveTextContent(/ship the rewrite/i));
  });

  it('does not claim a task finished after the sitting ended', async () => {
    // Closed during the break. The window is the sitting's own, and taking
    // credit for this one would be the page inventing the link.
    logged([sitting()]);
    show([
      task({ status: 'done', completed_at: new Date(ENDED + 4 * 60_000).toISOString() }),
    ]);

    await screen.findByText(/25 min, no pauses\./i);
    expect(screen.queryByText(/finished while it ran/i)).not.toBeInTheDocument();
  });

  it('says nothing at all when nothing was closed', async () => {
    logged([sitting()]);
    show([]);
    await screen.findByText(/25 min, no pauses\./i);
    // A zero here would read as a judgement on a sitting that may have been
    // spent reading.
    expect(screen.queryByText(/finished while it ran/i)).not.toBeInTheDocument();
  });
});

/** The kind chips, scoped: "Deep work" is also one of the ten method cards. */
async function kinds() {
  return within(await screen.findByRole('group', { name: /what kind of work/i }));
}

describe('the kind of work', () => {
  it('can be tagged and untagged', async () => {
    show();
    const speed = (await kinds()).getByRole('button', { name: /speed run/i });
    await userEvent.click(speed);
    await waitFor(() => expect(speed).toHaveAttribute('aria-pressed', 'true'));

    await userEvent.click(speed);
    await waitFor(() => expect(speed).toHaveAttribute('aria-pressed', 'false'));
  });

  it('asks the record about that kind, and says so', async () => {
    logged([
      ...Array.from({ length: 6 }, () => sitting({
        styleId: 'deep-work', planned: 50, minutes: 50, kind: 'deep', at: undefined,
      })),
      ...Array.from({ length: 3 }, () => sitting({
        styleId: 'classic', planned: 25, minutes: 5, pauses: 4, finished: false, kind: 'deep',
        at: undefined,
      })),
    ]);
    show();

    await userEvent.click((await kinds()).getByRole('button', { name: /deep work/i }));
    await waitFor(() =>
      expect(screen.getByText(/recommended focus · 50 min for deep work/i)).toBeInTheDocument());
  });
});

describe('the live goal line', () => {
  it('stays away while nothing is running', async () => {
    served = [focusGoal()];
    show();
    await screen.findByRole('button', { name: /^start focus$/i });
    expect(screen.queryByText(/toward qualify for aime/i)).not.toBeInTheDocument();
  });

  it('shows the goal moving once work starts', async () => {
    served = [focusGoal()];
    show();
    await userEvent.click(await screen.findByRole('button', { name: /^start focus$/i }));

    await waitFor(() =>
      expect(screen.getByText(/toward qualify for aime/i)).toBeInTheDocument());
    // The goal's own standing, in its own units.
    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('stays away for a goal this page cannot move', async () => {
    served = [focusGoal({ title: 'Ship the rewrite', measure: 'tasks', target_focus: 0 })];
    show();
    await userEvent.click(await screen.findByRole('button', { name: /^start focus$/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^pause focus$/i })).toBeInTheDocument());
    expect(screen.queryByText(/toward ship the rewrite/i)).not.toBeInTheDocument();
  });
});
