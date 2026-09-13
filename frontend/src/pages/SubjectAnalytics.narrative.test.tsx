/**
 * The subject page's narrative, end to end, in the order a reader meets it.
 *
 * ## Why this test exists as well as the unit tests beside it
 *
 * `components/Subject/objective.test`, `verdict.test` and `Opening.test` each
 * pin one piece: the arithmetic picks the right bottleneck, the verdict keeps
 * untaken apart from failed, the claim ends up in the heading. All of that can
 * be true while the page itself is broken — a memo wired to the wrong value, a
 * section rendered above the one it is supposed to answer, a reading that
 * arrives and changes nothing because it was never threaded through.
 *
 * So this mounts the real page with real tasks and asserts the five questions
 * come out in order and in the right relationship to each other:
 *
 *     what am I trying to do  →  what bears on it  →  what is in the way
 *       →  what to do about it  →  did the last lot work
 *
 * and that everything underneath is named as the evidence it is.
 *
 * ## The fixture
 *
 * One account, one subject, and a shape chosen to make the arithmetic say
 * something definite: work that lands at Fair and falls apart at Hard, which
 * is the case the difficulty curve exists for and the one most of the page's
 * counted sentences are written against.
 */
import { screen, within } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';

const tasks: unknown[] = [];
const goals: unknown[] = [];
const recommendations: unknown[] = [];
const outcomes: unknown[] = [];

/** A finished, rated task in the subject. */
const did = (
  id: string,
  day: string,
  difficulty: number,
  execution: number,
  over: Record<string, unknown> = {},
) => ({
  id,
  title: 'Problem set',
  subject: 'algebra',
  status: 'done',
  xp_value: 30,
  completed_at: `${day}T10:00:00`,
  created_at: `${day}T09:00:00`,
  difficulty,
  execution,
  ...over,
});

/**
 * Four at Fair that go well, four at Hard that do not.
 *
 * Three rated tasks is the floor for a rung to count, and twenty points
 * between two adjacent rungs is a cliff — so this is the smallest record that
 * produces one rather than a page saying it has nothing to say yet.
 */
function ceilingRecord() {
  const days = (n: number, from: number) =>
    Array.from({ length: n }, (_, at) => `2026-09-${String(from + at).padStart(2, '0')}`);

  return [
    ...days(4, 1).map((day, at) => did(`fair${at}`, day, 3, 5)),
    ...days(4, 5).map((day, at) => did(`hard${at}`, day, 4, 2)),
  ];
}

vi.mock('@/services/analytics', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    analyticsTasks: async () => ({ success: true, tasks }),
    subjectMilestones: async () => ({ success: true, milestones: [] }),
    subjectBriefAvailable: async () => ({ success: true, available: false }),
    suggestSubjectGoal: async () => ({ success: true, draft: null }),
    subjectReadingAvailable: async () => ({ success: true, available: false }),
    savedSubjectReading: async () => ({
      success: true, reading: null, written_at: '', span: '',
    }),
    subjectRecommendations: async () => ({
      success: true, recommendations, outcomes,
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
      ['algebra', {
        id: 'algebra', name: 'Algebra', label: 'Algebra', icon: 'algebra',
        group: 'Maths and science', custom: false,
      }],
    ]),
  };
});

const SubjectAnalytics = (await import('./SubjectAnalytics')).default;

async function show({
  rows = ceilingRecord(),
  theGoals = [] as unknown[],
  past = [] as unknown[],
  kinds = [] as unknown[],
  prefs = {} as Record<string, unknown>,
} = {}) {
  tasks.length = 0;
  tasks.push(...rows);
  goals.length = 0;
  goals.push(...theGoals);
  recommendations.length = 0;
  recommendations.push(...past);
  outcomes.length = 0;
  outcomes.push(...kinds);

  renderWithProviders(<SubjectAnalytics />, {
    route: '/analytics/subject/algebra',
    auth: { username: 'alpha' },
    settings: { prefs },
  });
  await act(async () => { await new Promise((r) => { setTimeout(r, 60); }); });
}

/** Where a section starts, so an assertion cannot pass on a match elsewhere. */
const section = (label: string) =>
  screen.getByRole('region', { name: label })
  ?? screen.getByLabelText(label);

// ---------------------------------------------------------------------------
describe('the page opens on what the subject is for', () => {
  it('leads with the goal rather than with a figure', async () => {
    await show({
      prefs: {
        analytics_ambitions: {
          algebra: { aim: 'Get to AIME', level: 'AMC 10 at 96' },
        },
      },
    });

    const band = within(section('What this subject is for'));
    expect(band.getByRole('heading', { name: 'Get to AIME' })).toBeInTheDocument();
    expect(band.getByText('Algebra')).toBeInTheDocument();
  });

  it('says nobody has set one rather than leaving the question unanswered', async () => {
    await show();

    const band = within(section('What this subject is for'));
    expect(band.getByRole('heading', { name: /no goal set/i })).toBeInTheDocument();
  });

  it('draws no goal-kind chip, because arithmetic cannot know the kind', async () => {
    await show({
      prefs: { analytics_ambitions: { algebra: { aim: 'Get to AIME' } } },
    });

    const band = within(section('What this subject is for'));
    expect(band.queryByText('Competition')).not.toBeInTheDocument();
  });
});

describe('what matters now', () => {
  it('leads each card with a claim and puts the counted figures under it', async () => {
    await show();

    const cards = within(section('What matters now'));
    expect(cards.getByText('Work stops landing at Hard.')).toBeInTheDocument();
    expect(cards.getByText(/execution 25 over 4 rated tasks/)).toBeInTheDocument();
    expect(cards.getByText('The level to work is Fair, not the one above.'))
      .toBeInTheDocument();
  });

  it('says the cards were chosen by rule until a reading is made', async () => {
    await show();
    expect(within(section('What matters now')).getByText(/chosen by rule/i))
      .toBeInTheDocument();
  });
});

describe('the bottleneck', () => {
  it('names one thing, with what says so and what it rules out', async () => {
    await show();

    const neck = within(section('Your current bottleneck'));
    expect(neck.getByRole('heading', { name: 'Work at Hard' })).toBeInTheDocument();
    expect(neck.getByText(/The level to work is Fair/)).toBeInTheDocument();
    expect(neck.getByText('Everything below Hard is not the problem.'))
      .toBeInTheDocument();
  });

  it('does not draw at all when the record cannot name one', async () => {
    // Two rated tasks is under every floor in this feature — no rung counts,
    // no halves to compare, and only one measure known, so the composite has
    // nothing to be largest of. The honest page for that has no section
    // rather than a naming at low confidence.
    await show({
      rows: ['2026-09-01', '2026-09-02'].map((day, at) => did(`t${at}`, day, 3, 3)),
    });

    expect(screen.queryByLabelText('Your current bottleneck')).not.toBeInTheDocument();
  });
});

describe('the order of the page', () => {
  it('puts what to do above the figures it was argued from', async () => {
    await show();

    const order = Array.from(
      document.querySelectorAll('[aria-label], .sb-detail-head'),
    ).map((node) => node.getAttribute('aria-label') ?? node.textContent);

    const at = (label: string) => order.findIndex((one) => one === label);

    expect(at('What this subject is for')).toBeLessThan(at('What matters now'));
    expect(at('What matters now')).toBeLessThan(at('Your current bottleneck'));
    expect(at('Your current bottleneck')).toBeLessThan(at('What to do next'));
    expect(at('What to do next')).toBeLessThan(at('Evidence'));
  });

  it('names the panels underneath as the evidence they are', async () => {
    await show();

    expect(screen.getByRole('heading', { name: 'Evidence' })).toBeInTheDocument();
    expect(screen.getByText(/Everything above is argued from these/))
      .toBeInTheDocument();
  });
});

describe('did your last advice work', () => {
  const advised = (over: Record<string, unknown> = {}) => ({
    id: 'r1',
    title: 'Timed set at Fair',
    focus: 'Algebra',
    type: 'timed_set',
    difficulty: 3,
    minutes: 40,
    reason: 'Execution falls at Hard.',
    signal: 'Execution rises while the level you file stays the same.',
    on: '2026-09-01',
    taken: true,
    taken_on: '2026-09-02',
    was: 10,
    task_id: '',
    ...over,
  });

  it('does not draw before anything has ever been advised', async () => {
    await show();
    expect(screen.queryByLabelText('Did your last advice work')).not.toBeInTheDocument();
  });

  it('shows what the advice predicted beside what happened', async () => {
    await show({ past: [advised()] });

    const loop = within(section('Did your last advice work'));
    expect(loop.getByText(/Execution rises while the level you file/))
      .toBeInTheDocument();
    expect(loop.getByText('Execution rose after it')).toBeInTheDocument();
  });

  it('keeps a recommendation nobody ran out of the verdict', async () => {
    await show({ past: [advised({ taken: false, taken_on: '' })] });

    const loop = within(section('Did your last advice work'));
    expect(loop.getByText('Never acted on')).toBeInTheDocument();
    expect(loop.getByText(/nothing to read from it/)).toBeInTheDocument();
    expect(loop.getByText('0 of 1 acted on')).toBeInTheDocument();
  });

  it('draws the by-kind strip only for kinds something was acted on', async () => {
    await show({
      past: [advised()],
      kinds: [
        { type: 'timed_set', given: 2, taken: 1, change: 5 },
        { type: 'review', given: 3, taken: 0, change: null },
      ],
    });

    const strip = within(
      document.querySelector('.so-loop-kinds') as HTMLElement,
    );
    expect(strip.getByText('Timed set')).toBeInTheDocument();
    expect(strip.getByText('1 of 2 acted on')).toBeInTheDocument();
    expect(strip.queryByText('Review')).not.toBeInTheDocument();
  });
});

describe('the skill tree', () => {
  it('reads the standing back rather than only counting it', async () => {
    await show();

    const panel = screen.getByText('The skill tree').closest('section')!;
    expect(within(panel).getByText('What this says')).toBeInTheDocument();
  });
});
