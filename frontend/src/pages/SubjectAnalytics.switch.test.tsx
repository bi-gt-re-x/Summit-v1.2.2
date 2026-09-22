/**
 * Moving between one subject page and the next.
 *
 * Changing subject here is navigation, not a control: the id comes off the
 * route, so "switching" means the same component rendering against a different
 * `subjectId`. Two things have to hold for that to be usable, and neither is
 * visible when it stops holding.
 *
 * **It has to actually re-scope.** Every figure on the page is arithmetic over
 * `tasks.data` narrowed by `task.subject === subjectId`, in memos whose
 * dependency arrays name `subjectId`. Drop it from one of them and that panel
 * keeps the previous subject's numbers under the new subject's heading — a page
 * that renders perfectly and is wrong.
 *
 * **It must not refetch.** `/api/analytics/tasks` is the largest request the
 * app makes — 3.44 MB on the largest account here — and the `useApi` call is
 * keyed on `[username]` precisely so that changing subject does not re-ask for
 * it. A dependency array that picked up `subjectId` would turn every subject
 * you clicked into another three megabytes, which is invisible on a fast
 * connection and ruinous on a slow one. The fetch count below is what pins it.
 *
 * Between them those two also answer whether this needs a loading state. It
 * does not: no request, and the recount is milliseconds.
 */
import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';

/** Flipped between renders to stand in for the route changing. */
let current = 'algebra';
/** Every call to the shared task history, so a refetch cannot hide. */
let fetches = 0;

const rows: unknown[] = [];

/** A finished, rated task in `subject`. */
const did = (id: string, subject: string, day: string, execution: number) => ({
  id,
  title: 'Problem set',
  subject,
  status: 'done',
  xp_value: 30,
  completed_at: `${day}T10:00:00`,
  created_at: `${day}T09:00:00`,
  difficulty: 3,
  execution,
});

vi.mock('@/services/taskHistory', () => ({
  taskHistory: async () => {
    fetches += 1;
    return { success: true, tasks: rows };
  },
  invalidate: () => {},
}));
vi.mock('@/services/analytics', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    analyticsTasks: async () => ({ success: true, tasks: rows }),
    subjectMilestones: async () => ({ success: true, milestones: [] }),
    subjectBriefAvailable: async () => ({ success: true, available: false }),
    suggestSubjectGoal: async () => ({ success: true, draft: null }),
    subjectReadingAvailable: async () => ({ success: true, available: false }),
    savedSubjectReading: async () => ({ success: true, reading: null, written_at: '', span: '' }),
    subjectRecommendations: async () => ({ success: true, recommendations: [], outcomes: [] }),
  };
});
vi.mock('@/services/goals', async (original) => {
  const real = await original<Record<string, unknown>>();
  return { ...real, getGoals: async () => ({ success: true, goals: [] }) };
});
vi.mock('react-router-dom', async (original) => {
  const real = await original<Record<string, unknown>>();
  return { ...real, useParams: () => ({ subjectId: current }) };
});
vi.mock('@/hooks/useSubjects', async (original) => {
  const real = await original<Record<string, unknown>>();
  const entry = (id: string, name: string) => [
    id,
    { id, name, label: name, icon: id, group: 'Maths and science', custom: false },
  ];
  return {
    ...real,
    useSubjects: () => [],
    subjectOf: () => null,
    useSubjectIndex: () =>
      new Map([entry('algebra', 'Algebra'), entry('violin', 'Violin')] as never),
  };
});

const SubjectAnalytics = (await import('./SubjectAnalytics')).default;

/* Two subjects with deliberately different records, so a page that failed to
   re-scope would show the same numbers twice and be caught. Algebra has eight
   tasks and Violin three, and they are rated at opposite ends. */
const RECORD = [
  ...Array.from({ length: 8 }, (_, at) =>
    did(`a${at}`, 'algebra', `2026-09-${String(at + 1).padStart(2, '0')}`, 5),
  ),
  ...Array.from({ length: 3 }, (_, at) =>
    did(`v${at}`, 'violin', `2026-09-${String(at + 1).padStart(2, '0')}`, 2),
  ),
];

async function settle() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });
  });
}

describe('switching between subject pages', () => {
  it('re-scopes the page, without asking for the record again', async () => {
    rows.length = 0;
    rows.push(...RECORD);
    fetches = 0;
    current = 'algebra';

    const view = renderWithProviders(<SubjectAnalytics />, {
      route: '/analytics/subject/algebra',
      auth: { username: 'alpha' },
      settings: { prefs: {} },
    });
    await settle();

    expect(screen.getAllByText(/Algebra/).length).toBeGreaterThan(0);
    const afterFirst = fetches;
    expect(afterFirst).toBeGreaterThan(0);

    // The route changes. Same component, different id.
    current = 'violin';
    const started = performance.now();
    view.rerender(<SubjectAnalytics />);
    await settle();
    const took = performance.now() - started;

    // The page is about the other subject now...
    expect(screen.getAllByText(/Violin/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Algebra/)).toHaveLength(0);

    // ...and it did not go back for the three megabytes.
    expect(fetches, 'the task history was re-fetched on a subject change').toBe(afterFirst);

    /* Loose, and for the same reason as the analytics page's: it is not
       measuring the handful of milliseconds this takes, it is there to catch a
       recount of the whole record, which reads as hundreds. */
    expect(took, `switch took ${took.toFixed(0)}ms`).toBeLessThan(800);
  });

  it('shows each subject only its own work', async () => {
    rows.length = 0;
    rows.push(...RECORD);
    fetches = 0;
    current = 'violin';

    renderWithProviders(<SubjectAnalytics />, {
      route: '/analytics/subject/violin',
      auth: { username: 'alpha' },
      settings: { prefs: {} },
    });
    await settle();

    /* Three tasks, not eleven. The page counts what is filed under the subject
       rather than what is in the account — the failure this catches is a panel
       reading `tasks.data` where it meant to read the narrowed list. */
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/\b11 tasks\b/);
  });
});
