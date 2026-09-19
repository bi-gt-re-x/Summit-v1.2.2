/**
 * The goal panel on a subject's own page.
 *
 * The panel used to be a progress bar and a line of prose. A bar answers "how
 * far along", which is the one question about a goal that cannot be acted on:
 * 40% is fine with 60% of the time left and a disaster with a week to go, and
 * either reading looks identical on the bar.
 *
 * What is pinned here is the part that is actionable, and the part that only
 * *this* page can say. The goals page knows the goal's own numbers. This page
 * knows which of the reader's work in this subject was pointed at it — so the
 * two failures that look the same from a bar, "not enough work" and "the work
 * is happening and nothing is recording it", have to come out as different
 * sentences. The arithmetic is tested in components/Subject/model.test; this
 * is about what reaches the screen.
 */
import { screen, within } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';

const tasks: unknown[] = [];
const goals: unknown[] = [];

/** Finished in this subject on a given day, optionally pointed at the goal. */
const did = (id: string, day: string, goalId?: string) => ({
  id,
  title: 'Practice set',
  subject: 'algebra',
  status: 'done',
  xp_value: 30,
  completed_at: `${day}T10:00:00`,
  created_at: `${day}T09:00:00`,
  difficulty: 3,
  execution: 3,
  ...(goalId ? { goal_id: goalId } : {}),
});

/** The kind of goal this panel was written for: a score, by a date. */
const amc8 = (over: Record<string, unknown> = {}) => ({
  id: 'g-amc8',
  title: 'Get 24 on the AMC 8',
  status: 'active',
  measure: 'number',
  unit: 'points',
  target_number: 24,
  current_value: 12,
  progress: 50,
  subject_ids: 'algebra',
  start_date: '2026-07-01',
  created_at: '2026-07-01',
  deadline: '2026-11-01',
  milestones: [],
  ...over,
});

vi.mock('@/services/analytics', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    analyticsTasks: async () => ({ success: true, tasks }),
    subjectMilestones: async () => ({ success: true, milestones: [] }),
    subjectBriefAvailable: async () => ({ success: true, available: false }),
    suggestSubjectGoal: async () => ({ success: true, draft: null }),
    /* The three the page asks for on mount that nothing here is about. Left
       real they reach `fetch`, which under jsdom has no base URL to resolve
       `/api/...` against and rejects — and `request` throws on that rather
       than returning a failed result, so it surfaces as an unhandled
       rejection pinned to whichever test was running at the time. The empty
       answer is the honest stub: none written, none asked for yet. */
    subjectReadingAvailable: async () => ({ success: true, available: false }),
    savedSubjectReading: async () => ({
      success: true, reading: null, written_at: '', span: '',
    }),
    subjectRecommendations: async () => ({
      success: true, recommendations: [], outcomes: [],
    }),
  };
});
vi.mock('@/services/goals', async (original) => {
  const real = await original<Record<string, unknown>>();
  return { ...real, getGoals: async () => ({ success: true, goals }) };
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
      ['algebra', { id: 'algebra', name: 'Algebra', label: 'Algebra', icon: 'algebra', group: 'Maths and science', custom: false }],
    ]),
  };
});

const SubjectAnalytics = (await import('./SubjectAnalytics')).default;

async function show(rows: unknown[], theGoals: unknown[]) {
  tasks.length = 0;
  tasks.push(...rows);
  goals.length = 0;
  goals.push(...theGoals);
  renderWithProviders(<SubjectAnalytics />, {
    route: '/analytics/subject/algebra',
    auth: { username: 'alpha' },
  });
  await act(async () => { await new Promise((r) => { setTimeout(r, 60); }); });
}

/** The panel, so an assertion cannot pass on a match somewhere else. */
const panel = () => screen.getByText('What this subject is for').closest('section')!;

/** Recent enough to be inside every window the page offers. */
const RECENT = ['2026-09-01', '2026-09-02', '2026-09-03'];

describe('the goal panel', () => {
  it('names the goal and prints its terms in its own units', async () => {
    await show(RECENT.map((day, at) => did(`t${at}`, day, 'g-amc8')), [amc8()]);

    const box = within(panel());
    expect(box.getByText('Get 24 on the AMC 8')).toBeInTheDocument();
    // 24 points aimed at, 12 of them held.
    expect(box.getByText('Still to go')).toBeInTheDocument();
    expect(box.getByText('12 points')).toBeInTheDocument();
  });

  it('says how much of the subject was actually pointed at the goal', async () => {
    // The figure only this page can produce, and the one that separates
    // "not working enough" from "working and not recording it".
    await show(
      [did('a', '2026-09-01', 'g-amc8'), did('b', '2026-09-02'), did('c', '2026-09-03')],
      [amc8()],
    );

    const box = within(panel());
    expect(box.getByText('Aimed at it')).toBeInTheDocument();
    expect(box.getByText('1 of 3 tasks')).toBeInTheDocument();
  });

  it('tells a busy subject to point its work at the goal before working harder', async () => {
    // Six finished tasks, none of them linked. Telling this reader to do more
    // would be the page misreading a bookkeeping failure as a discipline one.
    await show(
      Array.from({ length: 6 }, (_, at) => did(`t${at}`, '2026-09-0' + ((at % 3) + 1))),
      [amc8()],
    );

    const box = within(panel());
    expect(box.getByText(/link your tasks to this goal/i)).toBeInTheDocument();
    expect(box.getByText(/none of the 6 tasks/i)).toBeInTheDocument();
  });

  it('draws where the calendar has got to beside where the reader has', async () => {
    await show(RECENT.map((day, at) => did(`t${at}`, day, 'g-amc8')), [amc8()]);

    const box = within(panel());
    // The bar carries both, so the label has to as well — a mark nobody can
    // read is not on the page for a screen reader at all.
    expect(box.getByLabelText(/done, .* of its time gone/)).toBeInTheDocument();
    expect(box.getByText(/the calendar is at \d+%/)).toBeInTheDocument();
  });

  it('asks for the terms rather than reporting a pace it cannot compute', async () => {
    await show(
      RECENT.map((day, at) => did(`t${at}`, day, 'g-amc8')),
      [amc8({ target_number: 0, current_value: 0, progress: 0, deadline: '' })],
    );

    const box = within(panel());
    expect(box.getByText(/give it a target and a date/i)).toBeInTheDocument();
    expect(box.queryByText('Needs a week')).not.toBeInTheDocument();
  });

  it('draws nothing at all when no goal names this subject', async () => {
    // The panel is about a goal. With none there is nothing to be read
    // against, and an empty one would be a row of dashes.
    await show(RECENT.map((day, at) => did(`t${at}`, day)), [
      amc8({ subject_ids: 'chemistry' }),
    ]);
    expect(screen.queryByText('What this subject is for')).not.toBeInTheDocument();
  });
});
