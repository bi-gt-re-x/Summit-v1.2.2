/**
 * The subject page's Recommendations section.
 *
 * What it promises: it sits right above the calendar heatmap; it holds the
 * model's sessions and nothing else; they come three at a time, each a
 * dropdown that says exactly what to work, how fast and from where, with
 * "Plan my next session" and "I did this" inside; "Generate 3 more" adds three under
 * the ones on screen, up to six; and every finished task, grouped by name, is
 * what the model is handed.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';

const tasks: unknown[] = [];

const did = (id: string, day: string, difficulty: number, execution: number) => ({
  id,
  title: 'Problem set',
  subject: 'algebra',
  status: 'done',
  xp_value: 30,
  completed_at: `${day}T10:00:00`,
  created_at: `${day}T09:00:00`,
  difficulty,
  execution,
});

/** Easy work landing and hard work not — enough record for advice. */
function ceilingRecord() {
  const days = (n: number, from: number) =>
    Array.from({ length: n }, (_, at) => `2026-09-${String(from + at).padStart(2, '0')}`);
  return [
    ...days(4, 1).map((day, at) => did(`fair${at}`, day, 3, 5)),
    ...days(4, 5).map((day, at) => did(`hard${at}`, day, 4, 2)),
  ];
}

const step = (n: number) => ({
  id: `r${n}`,
  title: `Session ${n}`,
  problems: `MATHCOUNTS Sprint #${n * 10 - 9}-${n * 10}`,
  pace: '2 min per problem',
  resource: 'mathcounts.org past competitions',
  focus: 'Factoring',
  type: 'targeted_practice',
  difficulty: 4,
  minutes: 40,
  reason: `Reason ${n}, citing a counted figure.`,
  signal: `Signal ${n}`,
  drills: [`Drill ${n}`],
});

/**
 * The server, faked the way it behaves: `fresh` is a new three, `more` adds
 * three under what is on screen and refuses past six, `read` leaves the steps.
 */
let onScreen: ReturnType<typeof step>[] = [];
let made = 0;
const batch = () => [step(++made), step(++made), step(++made)];
const readSubject = vi.fn(async (payload: { mode?: string }) => {
  if (payload.mode === 'more') {
    if (onScreen.length >= 6) return { success: false, message: 'Six is the most this holds at once.' };
    onScreen = [...onScreen, ...batch()];
  } else if (payload.mode !== 'read') {
    onScreen = batch();
  }
  return { success: true, reading: { diagnosis: [], priorities: [], insights: [], next_steps: onScreen } };
});
const takeRecommendation = vi.fn(async (id: string) => ({ success: true, id }));
const planSession = vi.fn(async (id: string, _subjectId: string) => ({
  success: true, id, minutes: 45,
  task: { id: 't-new', start: '2026-10-06T16:00:00', end: '2026-10-06T16:45:00', xp: 25 },
}));

vi.mock('@/services/analytics', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    analyticsTasks: async () => ({ success: true, tasks }),
    subjectMilestones: async () => ({ success: true, milestones: [] }),
    subjectBriefAvailable: async () => ({ success: true, available: false }),
    suggestSubjectGoal: async () => ({ success: true, draft: null }),
    subjectReadingAvailable: async () => ({ success: true, available: true }),
    savedSubjectReading: async () => ({ success: true, reading: null, written_at: '', span: '' }),
    subjectRecommendations: async () => ({ success: true, recommendations: [], outcomes: [] }),
    readSubject: (payload: { mode?: string }) => readSubject(payload),
    takeRecommendation: (id: string) => takeRecommendation(id),
    planSession: (id: string, subjectId: string) => planSession(id, subjectId),
  };
});
vi.mock('@/services/goals', async (original) => {
  const real = await original<Record<string, unknown>>();
  return { ...real, getGoals: async () => ({ success: true, goals: [] }) };
});
vi.mock('react-router-dom', async (original) => {
  const real = await original<Record<string, unknown>>();
  return { ...real, useParams: () => ({ subjectId: 'algebra' }) };
});
vi.mock('@/hooks/useSubjects', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    useSubjects: () => [],
    subjectOf: () => null,
    useSubjectIndex: () => new Map([
      ['algebra', {
        id: 'algebra', name: 'Algebra', label: 'Algebra', icon: 'algebra',
        group: 'Maths and science', custom: false,
      }],
    ]),
  };
});

const SubjectAnalytics = (await import('./SubjectAnalytics')).default;

async function show() {
  tasks.length = 0;
  tasks.push(...ceilingRecord());
  renderWithProviders(<SubjectAnalytics />, {
    route: '/analytics/subject/algebra',
    auth: { username: 'alpha' },
  });
  await act(async () => { await new Promise((r) => { setTimeout(r, 60); }); });
}

const section = () => screen.getByRole('region', { name: 'Recommendations' });

async function generate() {
  await userEvent.click(within(section()).getByRole('button', { name: /Generate 3 with AI/ }));
}

beforeEach(() => {
  onScreen = [];
  made = 0;
  readSubject.mockClear();
  takeRecommendation.mockClear();
  planSession.mockClear();
});

describe('the subject Recommendations section', () => {
  it('sits right above the calendar heatmap', async () => {
    await show();
    const record = screen.getByRole('heading', { name: 'What the record says' });
    // DOCUMENT_POSITION_FOLLOWING: the record section comes after.
    expect(section().compareDocumentPosition(record) & 4).toBeTruthy();
    // And no other section's heading sits between them.
    const between = [...document.querySelectorAll('h2')].filter(
      (h) =>
        !section().contains(h)
        && (section().compareDocumentPosition(h) & 4)
        && (h.compareDocumentPosition(record) & 4),
    );
    expect(between).toEqual([]);
  });

  it('holds the model\'s sessions and nothing else', async () => {
    await show();
    // No ranked advice from the app's own arithmetic above the invitation.
    expect(section().querySelector('.sb-advice')).toBeNull();
    expect(within(section()).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('invites the reader to have AI plan three sessions', async () => {
    await show();
    expect(within(section()).getByText(/Get 3 sessions planned with AI/)).toBeInTheDocument();
  });

  it('asks for a fresh three, with every task grouped by name', async () => {
    await show();
    await generate();
    expect(readSubject).toHaveBeenCalledWith(expect.objectContaining({ mode: 'fresh' }));
    const sent = (readSubject.mock.calls[0]![0] as { work_groups: Array<{ name: string; count: number }> }).work_groups;
    expect(sent).toEqual([expect.objectContaining({ name: 'Problem set', count: 8 })]);
    expect(within(section()).getByText('Session 1')).toBeInTheDocument();
    expect(within(section()).getByText('Session 3')).toBeInTheDocument();
  });

  it('says exactly what to work, how fast and where to get it', async () => {
    await show();
    await generate();
    expect(within(section()).getByText('MATHCOUNTS Sprint #1-10')).toBeInTheDocument();
    expect(within(section()).getAllByText('2 min per problem')[0]).toBeInTheDocument();
    expect(within(section()).getAllByText('mathcounts.org past competitions')[0]).toBeInTheDocument();
  });

  it('opens the first step and keeps the others as dropdowns', async () => {
    await show();
    await generate();
    const folds = section().querySelectorAll('.sx-step-fold');
    expect(folds).toHaveLength(3);
    expect(folds[0]).toHaveAttribute('open');
    expect(folds[1]).not.toHaveAttribute('open');
  });

  it('adds three more under the first three, rather than replacing them', async () => {
    await show();
    await generate();
    await userEvent.click(within(section()).getByRole('button', { name: 'Generate 3 more' }));
    expect(readSubject).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'more' }));
    expect(section().querySelectorAll('.sx-step-fold')).toHaveLength(6);
    expect(within(section()).getByText('Session 1')).toBeInTheDocument();
    expect(within(section()).getByText('Session 6')).toBeInTheDocument();
    expect(within(section()).getByText(/6 of 6/)).toBeInTheDocument();
  });

  it('stops at six, and offers a fresh three instead', async () => {
    await show();
    await generate();
    await userEvent.click(within(section()).getByRole('button', { name: 'Generate 3 more' }));
    expect(within(section()).queryByRole('button', { name: 'Generate 3 more' })).not.toBeInTheDocument();
    expect(within(section()).getByText(/That is 6, the most at once/)).toBeInTheDocument();

    await userEvent.click(within(section()).getByRole('button', { name: 'Start over with 3' }));
    expect(readSubject).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'fresh' }));
    expect(section().querySelectorAll('.sx-step-fold')).toHaveLength(3);
    expect(within(section()).getByText('Session 7')).toBeInTheDocument();
  });

  it('leaves the steps alone when the record is read again', async () => {
    await show();
    await generate();
    await userEvent.click(screen.getByRole('button', { name: 'Read it again' }));
    expect(readSubject).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'read' }));
    expect(section().querySelectorAll('.sx-step-fold')).toHaveLength(3);
    expect(within(section()).getByText('Session 1')).toBeInTheDocument();
  });

  it('plans a step as a session filed under the subject, and locks it', async () => {
    await show();
    await generate();
    await userEvent.click(within(section()).getAllByRole('button', { name: 'Plan my next session' })[0]!);
    expect(planSession).toHaveBeenCalledWith('r1', 'algebra');
    expect(takeRecommendation).not.toHaveBeenCalled();
    expect(await within(section()).findByText(/Planned for .* · 25 XP/)).toBeInTheDocument();
    expect(within(section()).getAllByRole('button', { name: 'Plan my next session' })).toHaveLength(2);
  });

  it('records "I did this" without making a task', async () => {
    await show();
    await generate();
    await userEvent.click(within(section()).getAllByRole('button', { name: 'I did this' })[0]!);
    expect(planSession).not.toHaveBeenCalled();
    expect(takeRecommendation).toHaveBeenCalledWith('r1');
  });
});

describe('when the request itself fails', () => {
  it('lets go of the button and says so, rather than planning forever', async () => {
    await show();
    readSubject.mockImplementationOnce(async () => {
      throw new Error('500');
    });
    await generate();
    expect(within(section()).getByRole('alert')).toHaveTextContent(/Could not reach the server/);
    expect(within(section()).getByRole('button', { name: /Generate 3 with AI/ })).toBeEnabled();
  });
});
