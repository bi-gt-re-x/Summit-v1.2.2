/**
 * The skill tree on a subject's own page.
 *
 * The panel used to be entirely the curriculum's: what the lattice contains,
 * how many nodes are core, and a count of the ones the reader had hand-marked
 * as practised. All of that is authored or hand-kept, so the page could say
 * what mathematics *is* and could not say how far into it this account had
 * got — and the footnote under it spent four lines apologising for exactly
 * that.
 *
 * It says both now. What is pinned here is the half that is a reading of the
 * record: the same measure the Subjects tab draws and the same one the server
 * awards the Mastery badges on, so the three cannot disagree about an account.
 */
import { screen } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { SUBJECT_TREES } from '@/skills/subjectTrees';

const worthOf = (id: string) => {
  const tree = SUBJECT_TREES.find((entry) => entry.id === id)!;
  return tree.nodes.reduce((sum, node) => sum + (node.navTo ? 0 : node.xp ?? 0), 0);
};

/** Finished tasks in one subject, adding up to `xp`. */
const filed = (subject: string, xp: number) =>
  Array.from({ length: 20 }, (_, n) => ({
    id: `${subject}-${n}`,
    title: 'Work',
    subject,
    status: 'done',
    xp_value: xp / 20,
    completed_at: '2026-09-01T10:00:00',
    created_at: '2026-08-30T10:00:00',
    difficulty: 3,
    execution: 3,
  }));

const tasks: unknown[] = [];

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
      ['algebra', { id: 'algebra', name: 'Algebra', label: 'Algebra', icon: 'algebra', group: 'Maths and science', custom: false }],
      ['geometry', { id: 'geometry', name: 'Geometry', label: 'Geometry', icon: 'geometry', group: 'Maths and science', custom: false }],
    ]),
  };
});

const SubjectAnalytics = (await import('./SubjectAnalytics')).default;

async function show(rows: unknown[]) {
  tasks.length = 0;
  tasks.push(...rows);
  renderWithProviders(<SubjectAnalytics />, {
    route: '/analytics/subject/algebra',
    auth: { username: 'alpha' },
  });
  await act(async () => { await new Promise((r) => { setTimeout(r, 60); }); });
}

describe('the skill tree panel', () => {
  it('says how far into the lattice the record has got', async () => {
    await show(filed('algebra', worthOf('mathematics') / 4));
    expect(await screen.findByRole('button', { name: /Skill tree/ })).toBeInTheDocument();
    expect(screen.getAllByText('25%').length).toBeGreaterThan(0);
  });

  it('counts every subject that opens the same lattice, not just this one', async () => {
    /* Algebra and Geometry both open Mathematics. A reader on the Algebra page
       is told where *the tree* stands — the tree is the thing being measured,
       and half of it filed under a sibling subject is still half of it. */
    const half = worthOf('mathematics') / 4;
    await show([...filed('algebra', half), ...filed('geometry', half)]);
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
  });

  it('does not let a subject worked past its lattice run over 100', async () => {
    await show(filed('algebra', worthOf('mathematics') * 3));
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
    // Three times the lattice is still one lattice covered.
    expect(screen.queryByText('300%')).not.toBeInTheDocument();
  });
});
