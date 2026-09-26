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
import userEvent from '@testing-library/user-event';
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

/**
 * The same, for a `Panel`.
 *
 * `Panel` renders a bare `<section>` with its title as a heading rather than
 * as an `aria-label`, and an unnamed `<section>` is not a `region` — so the
 * helper above cannot find one. Scoping to the heading's own panel is the
 * honest way to ask "inside this card" without adding an attribute to the
 * component for the tests' convenience.
 */
const panel = (title: string) =>
  within(screen.getByRole('heading', { name: title }).closest('.ax-panel') as HTMLElement);

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

  it('offers the outcome goals to aim at, and leaves the counters out', async () => {
    // "Earn 250,000 XP" is fed by every task on the account, so aiming a
    // subject at one says nothing about the subject. See components/Goals/
    // numbers for the split, and components/Subject/LinkGoal for the cap.
    await show({
      theGoals: [
        {
          id: 'g1', title: 'Reach AIME', status: 'active', goal_type: 'xp',
          measure: 'number', subject_ids: 'geometry', milestones: [],
        },
        {
          id: 'g2', title: 'Earn 250,000 XP', status: 'active', goal_type: 'xp',
          measure: '', subject_ids: '', milestones: [],
        },
      ],
    });

    const picker = within(screen.getByLabelText('Aim this subject at a goal'));
    await userEvent.click(picker.getByRole('button', { name: /Choose a goal/ }));

    expect(picker.getByText('Reach AIME')).toBeInTheDocument();
    expect(picker.queryByText('Earn 250,000 XP')).not.toBeInTheDocument();
  });

  it('draws no goal-kind chip, because arithmetic cannot know the kind', async () => {
    await show({
      prefs: { analytics_ambitions: { algebra: { aim: 'Get to AIME' } } },
    });

    const band = within(section('What this subject is for'));
    expect(band.queryByText('Competition')).not.toBeInTheDocument();
  });
});

describe('what the record says', () => {
  it('draws the work calendar before anybody has asked a model anything', async () => {
    /* The section used to be the model's reading and nothing else, so on a
       page nobody had pressed the button on it did not exist — a section
       called "what the record says" that says nothing until a model is asked
       has the relationship backwards. The record says something from the
       first task. */
    await show();

    const said = panel('What the record says');
    expect(said.getByRole('heading', { name: 'How much you work on this' }))
      .toBeInTheDocument();
    expect(said.getByRole('group', { name: 'Heatmap window' })).toBeInTheDocument();
  });

  it('counts this subject and not the whole account', async () => {
    /* `SubjectHeat` deliberately does not filter — it counts what it is
       handed, and this is the guard that the page hands it the right list.
       Without it, another subject's work draws as this one's and nothing
       else on the page contradicts it. */
    await show({
      rows: [
        ...ceilingRecord(),
        did('other1', '2026-09-02', 3, 4, { subject: 'history' }),
        did('other2', '2026-09-03', 3, 4, { subject: 'history' }),
      ],
    });

    // The eight tasks of `ceilingRecord` sit on eight separate days; the two
    // history tasks land on days already in that run, so a page counting
    // them would still say eight days and ten tasks.
    expect(panel('What the record says').getByText(/days had work in/))
      .toHaveTextContent('8 tasks in all');
  });
});

describe('the order of the page', () => {
  it('puts what to do above the figures it was argued from', async () => {
    await show();

    const order = Array.from(document.querySelectorAll('[aria-label]'))
      .map((node) => node.getAttribute('aria-label'));
    const at = (label: string) => order.indexOf(label);

    expect(at('Where this subject stands')).toBeLessThan(at('What this subject is for'));
    expect(at('What this subject is for')).toBeLessThan(at('What to do next'));
  });

  it('opens the three counts under the verdict, before anything is interpreted', async () => {
    /* They need none of what the verdict needs: counts are true from the
       first task, where the ring says "unrated" until something is rated.

       Three, not four. A "Completed" card printed the same figure the ring
       above prints under itself. */
    await show();

    const cards = within(document.querySelector('.sb-cards') as HTMLElement);
    expect(cards.getByText('Total tasks')).toBeInTheDocument();
    expect(cards.getByText('Current streak')).toBeInTheDocument();
    expect(cards.getByText('Focus area')).toBeInTheDocument();
    expect(cards.queryByText('Completed')).not.toBeInTheDocument();
  });
});

describe('the evidence is a tab', () => {
  it('keeps the working off the overview entirely', async () => {
    /* Shut was already right — the page ran to fourteen panels before the
       folds existed — but a shut fold is still a row to read past, and
       there were nine of them between the last thing a reader came for and
       the bottom of the page. */
    await show();

    expect(screen.queryByRole('button', { name: /Where you stand/ }))
      .not.toBeInTheDocument();
  });

  it('shows the folds once the tab is chosen, and hides the overview', async () => {
    await show();

    await userEvent.click(screen.getByRole('button', { name: 'Evidence' }));

    expect(screen.getByRole('button', { name: /Where you stand/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Where this subject stands')).not.toBeInTheDocument();
  });

  it('states each fold\'s answer on its shut row', async () => {
    // The whole point of the folds: a reader who opens nothing still learns
    // where the work falls off, so they open the one that surprised them
    // rather than all nine. See components/Subject/Fold.
    await show();
    await userEvent.click(screen.getByRole('button', { name: 'Evidence' }));

    const difficulty = screen.getByRole('button', { name: /Difficulty/ });
    expect(difficulty).toHaveAttribute('aria-expanded', 'false');
    expect(within(difficulty).getByText('Falls off at')).toBeInTheDocument();

    // One is open on arrival, and it is the one a reader who opens nothing
    // else would have wanted.
    expect(screen.getByRole('button', { name: /Where you stand/ }))
      .toHaveAttribute('aria-expanded', 'true');
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

  it('states the outcome on the row, in one line', async () => {
    await show({ past: [advised()] });

    const loop = within(section('Did your last advice work'));
    expect(loop.getByText('Timed set at Fair')).toBeInTheDocument();
    expect(loop.getByText('acted on')).toBeInTheDocument();
    expect(loop.getByText('Execution rose after it')).toBeInTheDocument();
  });

  it('keeps a recommendation nobody ran out of the verdict', async () => {
    await show({ past: [advised({ taken: false, taken_on: '' })] });

    const loop = within(section('Did your last advice work'));
    expect(loop.getByText('Never acted on')).toBeInTheDocument();
    expect(loop.getByText('not acted on')).toBeInTheDocument();
    expect(loop.getByText('0 of 1 acted on')).toBeInTheDocument();
  });

  it('draws the last three and counts the rest', async () => {
    // Six recommendations was a screen and a half of prose, most of it the
    // same paragraph repeated. See components/Subject/Verdicts.
    await show({
      past: [1, 2, 3, 4, 5].map((n) => advised({ id: `r${n}`, title: `Advice ${n}` })),
    });

    const loop = within(section('Did your last advice work'));
    expect(loop.getByText('Advice 1')).toBeInTheDocument();
    expect(loop.getByText('Advice 3')).toBeInTheDocument();
    expect(loop.queryByText('Advice 4')).not.toBeInTheDocument();
    expect(loop.getByText('2 older ones not shown.')).toBeInTheDocument();
  });
});

describe('the skill tree', () => {
  it('reads the standing back on the shut row rather than only counting it', async () => {
    // The fold's lead is the reading. It used to be printed twice — once as
    // the lead and once under a "What this says" heading with three more
    // paragraphs of curriculum description beneath it.
    await show();

    await userEvent.click(screen.getByRole('button', { name: 'Evidence' }));
    const fold = screen.getByRole('button', { name: /Skill tree/ }).closest('section')!;
    expect(within(fold).getByText(/of this tree/i)).toBeInTheDocument();
    expect(within(fold).queryByText('What this says')).not.toBeInTheDocument();
  });
});
