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

const TOPICS = [
  { id: 'competition-math:counting', label: 'Counting', area: 'Competition Math', subject: 'mathematics', subject_label: 'Mathematics', status: 'weak', tasks: 6 },
  { id: 'competition-math:casework', label: 'Casework', area: 'Competition Math', subject: 'mathematics', subject_label: 'Mathematics', status: 'strong', tasks: 5 },
];

const onScreen = (kind: analytics.SessionKind = 'general', due: number | null = null) => ({
  success: true as const,
  subject: 'All subjects',
  subject_id: '',
  kind,
  steps: [],
  subjects: SUBJECTS,
  topics: TOPICS,
  due,
  available: true,
});

let slot = 0;
vi.mock('@/services/analytics', async (original) => {
  const real = await original<typeof import('@/services/analytics')>();
  return {
    ...real,
    nextSessions: vi.fn(),
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
  localStorage.clear();
  vi.mocked(analytics.nextSessions).mockReset();
  vi.mocked(analytics.nextSessions).mockImplementation(async (_subject = '', kind = 'general') => onScreen(kind));
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

describe('around the goal that comes first', () => {
  const goal = { goal_id: 'g1', title: 'AMC 10 cutoff', days_left: 3, next: 'Mock 4' };
  const scoped = (written_for: string | null = 'g1') => ({
    ...onScreen(), steps: [step(1)], goal, scoped: true, written_for, subject: 'All subjects',
  });

  it('says which goal they are for', async () => {
    vi.mocked(analytics.nextSessions).mockImplementation(async () => scoped());
    show();
    expect(await screen.findByText('AMC 10 cutoff')).toBeInTheDocument();
    expect(screen.getByText(/the goal that comes first right now/)).toBeInTheDocument();
    expect(screen.queryByText(/written before/)).toBeNull();
  });

  it('owns up when the saved three are from before it', async () => {
    vi.mocked(analytics.nextSessions).mockImplementation(async () => scoped(null));
    show();
    expect(await screen.findByText(/written before AMC 10 cutoff came first/)).toBeInTheDocument();
  });

  it('lets the reader ask for every subject, and go back', async () => {
    vi.mocked(analytics.nextSessions).mockImplementation(async (_subject = '', _kind = 'general', _picked = [], across = false) => (
      across ? { ...onScreen(), goal, scoped: false, written_for: null } : scoped()
    ));
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Use all my subjects instead' }));
    expect(await screen.findByRole('button', { name: 'Back to AMC 10 cutoff' })).toBeInTheDocument();
    expect(screen.getByText(/in all your subjects/)).toBeInTheDocument();
    await waitFor(() => expect(analytics.nextSessions).toHaveBeenLastCalledWith('', 'general', [], true));
  });

  it('sends the same choice when asking for new ones', async () => {
    vi.mocked(analytics.nextSessions).mockImplementation(async () => ({ ...onScreen(), goal, scoped: false }));
    localStorage.setItem('nsPicks:alpha', JSON.stringify({ across: true }));
    show();
    await suggest();
    expect(analytics.suggestNextSessions).toHaveBeenCalledWith('', expect.objectContaining({ across: true }));
  });

  it('has no switch when there is no goal to go back to', async () => {
    show();
    await screen.findByRole('button', { name: 'Suggest 3 sessions' });
    expect(screen.queryByRole('button', { name: 'Use all my subjects instead' })).toBeNull();
  });
});

const suggest = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Suggest 3 sessions' }));
  await screen.findByText('Session 1');
};

const pickFrom = async (name: string, option: string) => {
  const box = await screen.findByRole('combobox', { name });
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: option } });
  fireEvent.mouseDown(await screen.findByRole('option', { name: new RegExp(option) }));
};

describe('three next sessions', () => {
  it('opens on general across every subject', async () => {
    show();
    const kinds = await screen.findByRole('radiogroup', { name: 'Kind of session' });
    expect(within(kinds).getAllByRole('radio').map((pill) => pill.textContent)).toEqual([
      'General', 'Expansion', 'Weakness', 'Review', 'New topics',
    ]);
    expect(within(kinds).getByRole('radio', { name: 'General' })).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(analytics.nextSessions).toHaveBeenCalledWith('', 'general', [], false));
    expect(await screen.findByText(/Nothing suggested yet/)).toBeInTheDocument();
  });

  it('suggests three across every subject', async () => {
    show();
    await suggest();
    expect(analytics.suggestNextSessions).toHaveBeenCalledWith('', { kind: 'general', subjects: [], topics: [], across: false });
    expect(screen.getAllByRole('button', { name: 'Plan my next session' })).toHaveLength(3);
  });

  it('asks for the kind that is picked, and remembers it', async () => {
    show();
    fireEvent.click(await screen.findByRole('radio', { name: 'Weakness' }));
    await waitFor(() => expect(analytics.nextSessions).toHaveBeenLastCalledWith('', 'weakness', [], false));
    await suggest();
    expect(analytics.suggestNextSessions).toHaveBeenCalledWith('', { kind: 'weakness', subjects: [], topics: [], across: false });
    expect(JSON.parse(localStorage.getItem('nsPicks:alpha') || '{}').kind).toBe('weakness');
  });

  it('review is one of the pills and says how much is due', async () => {
    vi.mocked(analytics.nextSessions).mockImplementation(async (_subject = '', kind = 'general') =>
      onScreen(kind, kind === 'review' ? 5 : null));
    show();
    fireEvent.click(await screen.findByRole('radio', { name: 'Review' }));
    expect(await screen.findByText(/5 pieces of work are due/)).toBeInTheDocument();
  });

  it('holds the button and says why when a kind has nothing to work from', async () => {
    vi.mocked(analytics.nextSessions).mockImplementation(async (_subject = '', kind = 'general') => ({
      ...onScreen(kind, kind === 'expansion' ? 0 : null),
      topics: [],
    }));
    show();
    fireEvent.click(await screen.findByRole('radio', { name: 'Expansion' }));
    expect(await screen.findByText(/No strong topics yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Suggest 3/ })).toBeDisabled();
  });

  it('one subject picked from the search has its own three', async () => {
    show();
    await screen.findByText(/Nothing suggested yet/);
    await pickFrom('Subjects', 'Mathematics');
    await waitFor(() => expect(analytics.nextSessions).toHaveBeenLastCalledWith('mathematics', 'general', ['mathematics'], false));
    await suggest();
    expect(analytics.suggestNextSessions).toHaveBeenCalledWith('mathematics', { kind: 'general', subjects: [], topics: [], across: false });
  });

  it('several subjects share the three across every subject', async () => {
    show();
    await screen.findByText(/Nothing suggested yet/);
    await pickFrom('Subjects', 'Mathematics');
    await pickFrom('Subjects', 'Music');
    await waitFor(() => expect(analytics.nextSessions).toHaveBeenLastCalledWith('', 'general', ['mathematics', 'music'], false));
    await suggest();
    expect(analytics.suggestNextSessions).toHaveBeenCalledWith('', {
      kind: 'general', subjects: ['mathematics', 'music'], topics: [], across: false,
    });
  });

  it('filters by topic, from the pills or the search, with no subject pills', async () => {
    show();
    const filters = await screen.findByRole('group', { name: 'Filter by topic' });
    expect(within(filters).getAllByRole('button').map((pill) => pill.textContent)).toEqual(['+Counting', '+Casework']);
    expect(within(filters).queryByRole('button', { name: /Mathematics/ })).not.toBeInTheDocument();

    fireEvent.click(within(filters).getByRole('button', { name: /Counting/ }));
    await pickFrom('Topics', 'Casework');
    await suggest();
    expect(analytics.suggestNextSessions).toHaveBeenCalledWith('', {
      kind: 'general', subjects: [], topics: ['competition-math:counting', 'competition-math:casework'], across: false,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Counting' }));
    expect(await screen.findByRole('button', { name: 'Counting' })).toBeInTheDocument();
  });

  it('drops a picked topic that is not on offer for the new kind', async () => {
    vi.mocked(analytics.nextSessions).mockImplementation(async (_subject = '', kind = 'general') => ({
      ...onScreen(kind),
      topics: kind === 'new' ? [] : TOPICS,
    }));
    show();
    fireEvent.click(await screen.findByRole('button', { name: /Counting/ }));
    expect(await screen.findByRole('button', { name: 'Remove Counting' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'New topics' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove Counting' })).not.toBeInTheDocument());
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
    vi.mocked(analytics.nextSessions).mockResolvedValueOnce({ ...onScreen(), available: false });
    show();
    expect(await screen.findByText(/need an AI key/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Suggest/ })).not.toBeInTheDocument();
  });
});
