/**
 * Three next sessions on the dashboard and the Recommendations tab —
 * components/NextSessions.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { NextSessionsPanel } from './NextSessions';
import * as analytics from '@/services/analytics';

const step = (n: number, subject = 'Mathematics') => ({
  id: `r${n}`,
  title: `Session ${n}`,
  focus: subject,
  type: 'timed_set' as const,
  difficulty: 3,
  minutes: 40,
  reason: `Reason ${n}`,
  signal: '',
  drills: [],
  state: 'open' as const,
  task: null,
});

const SUBJECTS = [
  { id: 'mathematics', name: 'Mathematics', count: 9 },
  { id: 'music', name: 'Music', count: 4 },
];

let slot = 0;
vi.mock('@/services/analytics', async (original) => {
  const real = await original<typeof import('@/services/analytics')>();
  return {
    ...real,
    nextSessions: vi.fn(async (subjectId = '') => ({
      success: true as const,
      subject: subjectId ? 'Mathematics' : 'All subjects',
      subject_id: subjectId,
      steps: [],
      subjects: SUBJECTS,
      available: true,
    })),
    suggestNextSessions: vi.fn(async (subjectId = '') => ({
      success: true as const,
      subject: subjectId ? 'Mathematics' : 'All subjects',
      subject_id: subjectId,
      steps: [step(1), step(2, 'Music'), step(3)],
    })),
    planSession: vi.fn(async (id: string) => {
      slot += 1;
      return {
        success: true as const,
        id,
        minutes: 40,
        task: { id: `t-${id}`, start: `2026-10-07T1${slot}:00:00`, end: `2026-10-07T1${slot}:40:00`, xp: 20 },
      };
    }),
    takeRecommendation: vi.fn(async (id: string) => ({ success: true as const, id })),
  };
});

beforeEach(() => {
  slot = 0;
  vi.mocked(analytics.nextSessions).mockClear();
  vi.mocked(analytics.suggestNextSessions).mockClear();
  vi.mocked(analytics.planSession).mockClear();
});

function show(mutate = vi.fn()) {
  renderWithProviders(<NextSessionsPanel where="dashboard" />, {
    auth: { username: 'alpha' },
    userData: { mutate },
  });
  return mutate;
}

const suggest = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Suggest 3 sessions' }));
  await screen.findByText('Session 1');
};

describe('three next sessions', () => {
  it('opens on every subject, with the subjects there is work in to pick from', async () => {
    show();
    const picker = await screen.findByRole('combobox', { name: 'Plan for' });
    await waitFor(() =>
      expect(within(picker).getAllByRole('option').map((option) => option.textContent)).toEqual([
        'All subjects', 'Mathematics', 'Music',
      ]),
    );
    expect(analytics.nextSessions).toHaveBeenCalledWith('');
    expect(screen.getByText(/Nothing suggested yet/)).toBeInTheDocument();
  });

  it('suggests three across every subject', async () => {
    show();
    await suggest();
    expect(analytics.suggestNextSessions).toHaveBeenCalledWith('');
    expect(screen.getAllByRole('button', { name: 'Plan my next session' })).toHaveLength(3);
  });

  it('suggests three for one subject once it is picked', async () => {
    show();
    const picker = await screen.findByRole('combobox', { name: 'Plan for' });
    await waitFor(() => expect(within(picker).getAllByRole('option')).toHaveLength(3));
    fireEvent.change(picker, { target: { value: 'mathematics' } });
    await waitFor(() => expect(analytics.nextSessions).toHaveBeenLastCalledWith('mathematics'));
    await suggest();
    expect(analytics.suggestNextSessions).toHaveBeenCalledWith('mathematics');
  });

  it('plans all three, one after another, onto the shared task list', async () => {
    const mutate = show();
    await suggest();
    fireEvent.click(screen.getByRole('button', { name: 'Plan all 3' }));
    await waitFor(() => expect(analytics.planSession).toHaveBeenCalledTimes(3));
    expect(vi.mocked(analytics.planSession).mock.calls.map((call) => call[0])).toEqual(['r1', 'r2', 'r3']);
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(3));

    let list = { stats: {}, tasks: [] as Array<{ id: string; show_on_calendar?: boolean }> };
    for (const [update] of mutate.mock.calls) list = update(list);
    expect(list.tasks.map((task) => task.id)).toEqual(['t-r1', 't-r2', 't-r3']);
    expect(list.tasks.every((task) => task.show_on_calendar)).toBe(true);

    await waitFor(() => expect(screen.queryByRole('button', { name: /Plan all/ })).not.toBeInTheDocument());
    expect(screen.queryAllByRole('button', { name: 'Plan my next session' })).toHaveLength(0);
  });

  it('plans one, and then offers to plan the other two', async () => {
    show();
    await suggest();
    fireEvent.click(screen.getAllByRole('button', { name: 'Plan my next session' })[0]!);
    expect(await screen.findByRole('button', { name: 'Plan the other 2' })).toBeInTheDocument();
    expect(analytics.planSession).toHaveBeenCalledWith('r1', '');
  });

  it('says what went wrong when no sessions can be suggested', async () => {
    vi.mocked(analytics.suggestNextSessions).mockResolvedValueOnce({
      success: false, message: 'There is no finished work anywhere in the last 90 days to plan from yet.',
    });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest 3 sessions' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no finished work');
  });

  it('says a model key is needed when there is none', async () => {
    vi.mocked(analytics.nextSessions).mockResolvedValueOnce({
      success: true, subject: 'All subjects', subject_id: '', steps: [], subjects: [], available: false,
    });
    show();
    expect(await screen.findByText(/needs a model key/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Suggest/ })).not.toBeInTheDocument();
  });
});
