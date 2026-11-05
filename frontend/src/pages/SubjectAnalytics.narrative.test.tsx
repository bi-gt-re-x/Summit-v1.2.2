/**
 * The subject page, end to end, in the order a reader meets it.
 *
 * What it promises: it opens on what the subject is for and what the plan says about
 * it, the readings read against that goal with the bad news first, then sessions for
 * that goal. Everything else is "The numbers", one tab over. The ring, the count cards,
 * the AI summary and the second copy of the goal's pace were cut, and stay cut. What the
 * read says is tested in tests/test_subject_read.py; this is about what reaches the page.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';

const tasks: unknown[] = [];
const goals: unknown[] = [];
let goalRead: Record<string, unknown>;
const updateGoal = vi.fn(async () => ({ success: true }));
const askReadSubject = vi.fn(async () => ({
  success: true,
  reading: { diagnosis: [], priorities: [], insights: [], next_steps: [], for_goal: 'g1' },
}));
let canRead = false;
let saved: unknown = null;
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
    subjectReadingAvailable: async () => ({ success: true, available: canRead }),
    savedSubjectReading: async () => ({
      success: true, reading: saved, written_at: '', span: '',
    }),
    readSubject: () => askReadSubject(),
    subjectRecommendations: async () => ({
      success: true, recommendations, outcomes,
    }),
  };
});
vi.mock('@/services/topics', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    topicLibrary: async () => ({ success: false, message: 'none here' }),
    buildTopics: async () => ({ success: false, message: 'none here' }),
  };
});
vi.mock('@/services/goals', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    getGoals: async () => ({ success: true, goals }),
    updateGoal: (...args: unknown[]) => (updateGoal as (...a: unknown[]) => unknown)(...args),
  };
});
vi.mock('@/services/subjectGoal', () => ({
  subjectGoalRead: async () => ({ success: true, ...goalRead }),
}));
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
        group: 'Math and science', custom: false,
      }],
    ]),
  };
});

const SubjectAnalytics = (await import('./SubjectAnalytics')).default;

/** The read for a subject no goal needs. */
const noGoal = () => ({
  subject: 'algebra',
  stance: 'none',
  top: null,
  lead: null,
  card: {
    tone: 'flat',
    title: 'None of your goals depends on Algebra.',
    figures: '8 tasks here in the last 30 days, 8 of them study work.',
    suggests: "This suggests it's upkeep, or there's a goal here you haven't written down.",
  },
  goals: [],
  misfiled: [],
  insights: [],
});

const reading = (id: string, tone: string, title: string, evidence: string | null = null) => ({
  id, tone, title, evidence, resource: null,
  figures: `Figures for ${id}.`,
  suggests: `This suggests something about ${id}.`,
});

/** The read for a subject the plan needs most, with a goal filed somewhere wrong. */
const feedsTopGoal = () => ({
  subject: 'algebra',
  stance: 'first',
  top: { goal_id: 'g1', title: 'Reach AIME', days_left: 27 },
  lead: 'g1',
  card: {
    tone: 'bad',
    title: 'Algebra is what your top goal runs on, but most of the work here is going elsewhere.',
    figures: 'Reach AIME needs 5.8 sessions a week and you do 1.8, with 27 days left.',
    suggests: 'This suggests the time is there and the aim is off. Swap your next "Drills" for "Mock exam".',
  },
  goals: [
    {
      goal_id: 'g1', title: 'Reach AIME', state: 'behind', days_left: 27, percent: 40, needs: 5.8, pace: 1.8,
      gets_time: true, filed: false, work_here: 136, work_total: 176, next: 'Mock exam', note: '',
    },
    {
      goal_id: 'g2', title: 'AMC 12 cutoff', state: 'on_track', days_left: 200, percent: 60, needs: 0.5, pace: 0.8,
      gets_time: false, filed: true, work_here: 40, work_total: 40, next: '', note: 'It moves when Reach AIME does.',
    },
  ],
  misfiled: [{ goal_id: 'g3', title: 'Ship the app', work_here: 1, work_total: 160, home: 'programming', home_name: 'Programming' }],
  insights: [
    reading('topic', 'bad', 'Your weakest part of Reach AIME here is geometry.', 'Emerging pattern'),
    reading('level', 'bad', 'Your work on Reach AIME falls off once it gets hard.'),
    reading('coverage', 'flat', 'You only reach 5 of its 23 topics.'),
    reading('attended', 'flat', 'You sat through more Algebra than you practiced.'),
    reading('works', 'good', 'Your good sessions have something in common.'),
  ],
});

async function show({
  rows = ceilingRecord(),
  theGoals = [] as unknown[],
  past = [] as unknown[],
  kinds = [] as unknown[],
  prefs = {} as Record<string, unknown>,
  read = noGoal() as Record<string, unknown>,
  ai = false,
  savedReading = null as unknown,
} = {}) {
  goalRead = read;
  canRead = ai;
  saved = savedReading;
  updateGoal.mockClear();
  askReadSubject.mockClear();
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

const section = (label: string) => within(screen.getByRole('region', { name: label }));

// ---------------------------------------------------------------------------
describe('the page opens on what the subject is for', () => {
  it('leads with the reading: the headline, the figures, what they suggest', async () => {
    await show({ read: feedsTopGoal() });

    const lead = section('What this subject is for');
    expect(lead.getByRole('heading', { name: /what your top goal runs on/ })).toBeInTheDocument();
    expect(lead.getByText(/with/).textContent).toContain('needs 5.8 sessions a week');
    expect(lead.getByText(/Swap your next "Drills" for "Mock exam"/)).toBeInTheDocument();
    // Nothing comes before it but the page's own heading and tabs.
    expect(document.querySelector('.ax-panel')).toBe(screen.getByRole('region', { name: 'What this subject is for' }));
  });

  it('says what the plan calls the goal, how it is going and what is next', async () => {
    await show({ read: feedsTopGoal() });

    const lead = section('What this subject is for');
    expect(lead.getByText("Your plan's top goal")).toBeInTheDocument();
    expect(lead.getByRole('link', { name: 'Reach AIME' })).toBeInTheDocument();
    expect(lead.getByText('Behind')).toBeInTheDocument();
    expect(lead.getByText('Mock exam')).toBeInTheDocument();
    expect(lead.getByLabelText('40% done')).toBeInTheDocument();
  });

  it('names the other goals this work moves', async () => {
    await show({ read: feedsTopGoal() });

    const others = within(screen.getByRole('list', { name: 'Other goals this work feeds' }));
    expect(others.getByText('AMC 12 cutoff')).toBeInTheDocument();
    expect(others.getByText('It moves when Reach AIME does.')).toBeInTheDocument();
  });

  it('files a goal whose work is here, keeping what it already names', async () => {
    await show({
      read: feedsTopGoal(),
      theGoals: [{ id: 'g1', title: 'Reach AIME', status: 'active', measure: 'number', subject_ids: 'geometry', milestones: [] }],
    });

    await userEvent.click(section('What this subject is for').getAllByRole('button', { name: 'File it here' })[0]!);
    expect(updateGoal).toHaveBeenCalledWith('g1', { subject_ids: 'geometry,algebra' });
  });

  it('offers to move a goal filed here to where its work is', async () => {
    await show({
      read: feedsTopGoal(),
      theGoals: [{ id: 'g3', title: 'Ship the app', status: 'active', measure: 'number', subject_ids: 'algebra', milestones: [] }],
    });

    const wrong = within(screen.getByRole('list', { name: 'Goals filed here with their work elsewhere' }));
    expect(wrong.getByText(/1 of its 160 tasks is here/)).toBeInTheDocument();
    await userEvent.click(wrong.getByRole('button', { name: 'Move to Programming' }));
    expect(updateGoal).toHaveBeenCalledWith('g3', { subject_ids: 'programming' });
  });

  it('offers a goal only when nothing feeds this subject, and leaves counters out', async () => {
    await show({
      theGoals: [
        { id: 'g1', title: 'Reach AIME', status: 'active', goal_type: 'xp', measure: 'number', subject_ids: 'geometry', milestones: [] },
        { id: 'g2', title: 'Earn 250,000 XP', status: 'active', goal_type: 'xp', measure: '', subject_ids: '', milestones: [] },
      ],
    });
    expect(section('What this subject is for').getByRole('heading', { name: /None of your goals/ })).toBeInTheDocument();

    const picker = within(screen.getByLabelText('Link a goal'));
    await userEvent.click(picker.getByRole('button', { name: /Choose a goal/ }));
    expect(picker.getByText('Reach AIME')).toBeInTheDocument();
    expect(picker.queryByText('Earn 250,000 XP')).not.toBeInTheDocument();
  });

  it('has no chooser when goals already feed it', async () => {
    await show({ read: feedsTopGoal() });
    expect(screen.queryByLabelText('Link a goal')).not.toBeInTheDocument();
  });
});

describe('what the work says about the goal', () => {
  it('reads against the goal by name, each with its three parts and how sure it is', async () => {
    await show({ read: feedsTopGoal() });

    const reads = section('What the work says');
    expect(reads.getByRole('heading', { name: 'What your work says about Reach AIME' })).toBeInTheDocument();
    expect(reads.getByText('Your weakest part of Reach AIME here is geometry.')).toBeInTheDocument();
    expect(reads.getByText('Figures for topic.')).toBeInTheDocument();
    expect(reads.getByText('This suggests something about topic.')).toBeInTheDocument();
    expect(reads.getByText('How sure: emerging pattern')).toBeInTheDocument();
  });

  it('shows four and folds the rest', async () => {
    await show({ read: feedsTopGoal() });

    const reads = section('What the work says');
    expect(reads.queryByText(/good sessions/)).not.toBeInTheDocument();
    await userEvent.click(reads.getByRole('button', { name: 'Show 1 more' }));
    expect(reads.getByText(/good sessions/)).toBeInTheDocument();
  });

  it('draws nothing when nothing cleared the evidence table', async () => {
    await show();
    expect(screen.queryByRole('region', { name: 'What the work says' })).not.toBeInTheDocument();
  });
});

describe('the sessions are for the goal', () => {
  const steps = [{ id: 'r1', title: 'Old plan', type: 'targeted', difficulty: 3, minutes: 30, focus: '', reason: '', plan: [], success: [] }];
  const old = { diagnosis: [], priorities: [], insights: [], next_steps: steps };

  it('names the goal on the section', async () => {
    await show({ read: feedsTopGoal(), ai: true });
    expect(section('Recommendations').getByRole('heading', { name: 'Sessions for Reach AIME' })).toBeInTheDocument();
  });

  it('says when the ones on screen were not written for it, and starts over', async () => {
    await show({ read: feedsTopGoal(), ai: true, savedReading: old });

    const box = section('Recommendations');
    expect(box.getByText("These weren't written for Reach AIME")).toBeInTheDocument();
    await userEvent.click(box.getByRole('button', { name: 'Start over with 3' }));
    expect(askReadSubject).toHaveBeenCalled();
  });

  it('says nothing when they were', async () => {
    await show({ read: feedsTopGoal(), ai: true, savedReading: { ...old, for_goal: 'g1' } });
    expect(section('Recommendations').queryByText(/weren't written for/)).not.toBeInTheDocument();
  });
});

describe('what was cut stays cut', () => {
  it('has no grade, no count cards, no second goal band and no AI summary', async () => {
    await show({ read: feedsTopGoal(), ai: true });

    expect(screen.queryByLabelText('How this subject is going')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Your goal for this subject')).not.toBeInTheDocument();
    expect(document.querySelector('.sb-cards')).toBeNull();
    expect(screen.queryByText('Total tasks')).not.toBeInTheDocument();
    expect(screen.queryByText('Focus area')).not.toBeInTheDocument();
    expect(screen.queryByText(/Summarize/)).not.toBeInTheDocument();
    expect(screen.queryByText('AI tips')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What your work shows' })).not.toBeInTheDocument();
  });

  it('keeps the window picker off the overview, since nothing there follows it', async () => {
    await show();
    expect(screen.queryByRole('group', { name: 'Time window' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'The numbers' }));
    expect(screen.getByRole('group', { name: 'Time window' })).toBeInTheDocument();
  });
});

describe('the numbers are a tab', () => {
  it('keeps the working off the overview entirely', async () => {
    await show();
    expect(screen.queryByRole('button', { name: /Where you stand/ })).not.toBeInTheDocument();
  });

  it('shows the folds once the tab is chosen, and hides the overview', async () => {
    await show({ read: feedsTopGoal() });
    await userEvent.click(screen.getByRole('button', { name: 'The numbers' }));

    expect(screen.getByRole('button', { name: /Where you stand/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'What this subject is for' })).not.toBeInTheDocument();
  });

  it("states each fold's answer on its shut row", async () => {
    await show();
    await userEvent.click(screen.getByRole('button', { name: 'The numbers' }));

    const difficulty = screen.getByRole('button', { name: /Difficulty/ });
    expect(difficulty).toHaveAttribute('aria-expanded', 'false');
    expect(within(difficulty).getByText('Falls off at')).toBeInTheDocument();
  });

  it('has no fold repeating the goal, its pace or its checkpoints', async () => {
    await show({ read: feedsTopGoal() });
    await userEvent.click(screen.getByRole('button', { name: 'The numbers' }));

    expect(screen.queryByRole('button', { name: /^Goals/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Checkpoints/ })).not.toBeInTheDocument();
  });

  it('draws the work calendar under Over time, for this subject only', async () => {
    await show({
      prefs: { analytics_window: 'all' },
      rows: [
        ...ceilingRecord(),
        did('other1', '2026-09-02', 3, 4, { subject: 'history' }),
        did('other2', '2026-09-03', 3, 4, { subject: 'history' }),
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: 'The numbers' }));
    await userEvent.click(screen.getByRole('button', { name: /Over time/ }));

    // Eight tasks on eight days. The other subject's two land on days already in that
    // run, so a page counting them would still say eight days and ten tasks.
    expect(screen.getByRole('img', { name: /days with work in Algebra/ }).getAttribute('aria-label')).toMatch(/^8 of /);
  });

  it('reads what has been practiced back on the skill tree row', async () => {
    await show();
    await userEvent.click(screen.getByRole('button', { name: 'The numbers' }));
    const fold = screen.getByRole('button', { name: /Skill tree/ }).closest('section')!;
    expect(within(fold).getByText(/practiced/i)).toBeInTheDocument();
  });
});
