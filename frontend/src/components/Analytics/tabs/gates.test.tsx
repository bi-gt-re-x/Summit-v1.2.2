/**
 * The gates, which are what the extraction could most easily have broken.
 *
 * Four of the seven tabs refuse to draw until the account has enough record,
 * and each refuses on a different number for a different reason. Pulling the
 * tab bodies out of the page moved every one of those conditions across a file
 * boundary — a mechanical change that TypeScript cannot check, because
 * `waitFor('habits') === 0` and `waitFor('habits') > 0` are both perfectly
 * typed and only one of them is right.
 *
 * So this is a boundary test, not a coverage one: at exactly the day the tab
 * unlocks, and at one day short of it. A tab that quietly inverted a condition
 * in the move would pass every type check and fail here.
 *
 * The model is faked rather than driven through `useAnalyticsModel`. The tabs
 * are presentation — they read figures and lay them out — so the thing worth
 * pinning is what they do with a given set of figures, and building the real
 * model would mean fabricating a year of day series to move one number.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HabitsTab } from './HabitsTab';
import { InsightsTab } from './InsightsTab';
import { RecommendationsTab } from './RecommendationsTab';
import { SubjectsTab } from './SubjectsTab';
import { NEED_DAYS } from '../useAnalyticsModel';
import { whyFor } from '../milestones';
/* The model these are driven from — see ./fixtures, which gates.test.tsx used
   to hold and ./groups.test.tsx now needs too. */
import { draw, fakeData, fakeModel, nameOf, subjects } from './fixtures';
import { buildHabits, habitSummary } from '@/utils/habits';
import { reviewAdopted, summarise } from '@/utils/followup';
import { days, task } from '@/test/factories';

describe('Habits', () => {
  it('is still building one day short of the record it needs', () => {
    draw(<HabitsTab model={fakeModel({ historyDays: NEED_DAYS.habits - 1 })} subjects={subjects} />);
    expect(screen.getByText(whyFor(NEED_DAYS.habits))).toBeInTheDocument();
  });

  it('is still building on the day it unlocks, when nothing repeats yet', () => {
    // Two conditions, not one: enough record *and* a habit found in it. The
    // same panel covers both, and says which it is waiting on.
    draw(<HabitsTab model={fakeModel({ historyDays: NEED_DAYS.habits, habits: [] })} subjects={subjects} />);
    expect(screen.getByText(/Nothing repeats often enough yet/i)).toBeInTheDocument();
  });

  it('draws once there is both enough record and a habit', () => {
    // A real habit, built by the real builder from tasks that actually repeat —
    // eight weekly "Revision" completions, which is what `buildHabits` needs to
    // call something a habit.
    const repeating = Array.from({ length: 8 }, (_, week) =>
      task({
        title: 'Revision',
        status: 'done',
        completed_at: `2026-0${week < 4 ? 6 : 7}-${String(1 + (week % 4) * 7).padStart(2, '0')}T18:00:00`,
      }),
    );
    const habits = buildHabits(repeating, nameOf, '2026-06-01', '2026-07-31');
    expect(habits.length).toBeGreaterThan(0); // the fixture is doing its job

    draw(
      <HabitsTab
        model={fakeModel({
          historyDays: NEED_DAYS.habits,
          habits,
          summary: habitSummary(habits, []),
        })}
        subjects={subjects}
      />,
    );
    expect(screen.queryByText(/Nothing repeats often enough yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Your habits/i })).toBeInTheDocument();
  });
});

describe('what a tab says while it is still building', () => {
  /* The trade in utils/observations: a finding clears its own floor long
     before a tab clears its threshold, and hiding it until the day the tab
     opens serves nobody. It appears wearing its confidence. */
  const finding = {
    key: 'when-finished',
    text: 'Most of your finished work here happens in the evening.',
    support: '9 of 11 timed finishes',
    confidence: 'low' as const,
    n: 11,
    strength: 0.4,
  };

  it('shows a finding that already holds, and grades it', () => {
    draw(
      <InsightsTab
        model={fakeModel({ historyDays: NEED_DAYS.insights - 1, observed: [finding] })}
      />,
    );
    expect(screen.getByText(finding.text)).toBeInTheDocument();
    expect(screen.getByText('Early observation')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('shows nothing of the sort when nothing clears its floor', () => {
    draw(<InsightsTab model={fakeModel({ historyDays: NEED_DAYS.insights - 1, observed: [] })} />);
    expect(screen.queryByText(/Confidence:/)).not.toBeInTheDocument();
  });

  it('still refuses the tab itself', () => {
    draw(
      <InsightsTab
        model={fakeModel({ historyDays: NEED_DAYS.insights - 1, observed: [finding] })}
      />,
    );
    // The finding is not the tab opening.
    expect(screen.getByText(whyFor(NEED_DAYS.insights))).toBeInTheDocument();
  });
});

describe('a gated tab still says what it can', () => {
  /* The rule these pin: a tab that shows nothing at all until the day it opens
     teaches a reader to stop opening it. Each one surfaces the part of its own
     question that needs no threshold, while the answer itself stays gated. */
  const finding = {
    key: 'when-finished',
    text: 'Most of your finished work here happens in the evening.',
    support: '9 of 11 timed finishes',
    confidence: 'low' as const,
    n: 11,
    strength: 0.4,
  };

  it('Insights lists every finding that already holds, not just the first', () => {
    const second = { ...finding, key: 'deadlines', text: 'When you put a deadline on work here, you meet it.' };
    draw(
      <InsightsTab
        model={fakeModel({ historyDays: NEED_DAYS.insights - 1, observed: [finding, second] })}
      />,
    );
    expect(screen.getByText(finding.text)).toBeInTheDocument();
    expect(screen.getByText(second.text)).toBeInTheDocument();
  });

  it('Insights stays silent when nothing clears its floor', () => {
    draw(<InsightsTab model={fakeModel({ historyDays: NEED_DAYS.insights - 1, observed: [] })} />);
    expect(screen.queryByText(/What is already true/)).not.toBeInTheDocument();
  });

  it('Habits shows the counts a habit is made of', () => {
    draw(<HabitsTab model={fakeModel({ historyDays: NEED_DAYS.habits - 1 })} subjects={subjects} />);
    expect(screen.getByText('What is already true')).toBeInTheDocument();
  });

  it('neither of them opens the tab itself', () => {
    draw(
      <InsightsTab
        model={fakeModel({ historyDays: NEED_DAYS.insights - 1, observed: [finding] })}
      />,
    );
    expect(screen.getByText(whyFor(NEED_DAYS.insights))).toBeInTheDocument();
  });

  it('the day-one section goes away once the tab opens', () => {
    draw(<HabitsTab model={fakeModel({ historyDays: 400, habits: [] })} subjects={subjects} />);
    expect(screen.queryByText('What is already true')).not.toBeInTheDocument();
  });
});

describe('Insights', () => {
  it('is still building one day short', () => {
    draw(<InsightsTab model={fakeModel({ historyDays: NEED_DAYS.insights - 1 })} />);
    expect(screen.getByText(whyFor(NEED_DAYS.insights))).toBeInTheDocument();
  });

  it('opens on the day it unlocks — record alone, no second condition', () => {
    // Unlike Habits. An explanation of a quiet fortnight is still an
    // explanation, so there is nothing else to wait for.
    draw(<InsightsTab model={fakeModel({ historyDays: NEED_DAYS.insights })} />);
    expect(screen.queryByText(whyFor(NEED_DAYS.insights))).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /What is true now/i })).toBeInTheDocument();
  });
});

describe('Recommendations', () => {
  it('is still building one day short', () => {
    draw(<RecommendationsTab model={fakeModel({ historyDays: NEED_DAYS.recommendations - 1 })} data={fakeData()} />);
    expect(screen.getByText(whyFor(NEED_DAYS.recommendations))).toBeInTheDocument();
  });

  it('is still building with enough record and nothing to say', () => {
    draw(<RecommendationsTab model={fakeModel({ historyDays: 400, advice: [] })} data={fakeData()} />);
    expect(screen.getByText(/Nothing to fix/i)).toBeInTheDocument();
  });

  it('shows the plan even while the tab is still building — it is gated on nothing', () => {
    // An account three days old still has overdue work and a deadline, and
    // those are the days when being told what to do is worth most.
    draw(<RecommendationsTab model={fakeModel({ historyDays: 1 })} data={fakeData()} />);
    expect(screen.getByText(whyFor(NEED_DAYS.recommendations))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /next/i })).toBeInTheDocument();
  });

  it('shows the follow-up even while the tab is still building — a different question', () => {
    // An account that adopted a change and then went quiet has nothing to
    // recommend and a result waiting. Hiding it behind the same gate would lose
    // the one thing this tab promised to come back and tell you.
    //
    // Built through the real `reviewAdopted`, so the fixture is an adoption
    // this account actually made rather than a hand-shaped Review.
    const reviews = reviewAdopted({
      adopted: [{ id: 'a1', title: 'Claim one weekend day', on: '2026-06-01' }],
      days: days('2026-05-01', 120),
      tasks: [],
      graded: {},
    });
    expect(reviews).toHaveLength(1); // the fixture is doing its job

    draw(
      <RecommendationsTab
        model={fakeModel({ historyDays: 1, reviews, reviewSummary: summarise(reviews) })}
        data={fakeData()}
      />,
    );
    expect(screen.getByText(whyFor(NEED_DAYS.recommendations))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /What happened after/i })).toBeInTheDocument();
  });
});

describe('Subjects', () => {
  it('says nothing about goals when no subject was worked', () => {
    draw(<SubjectsTab model={fakeModel({ namedSubjects: { total: 0, named: 0 } })} subjects={subjects} />);
    expect(screen.queryByText(/has a goal aimed at it/i)).not.toBeInTheDocument();
  });

  it('names the gap when subjects were worked and none has a goal', () => {
    draw(<SubjectsTab model={fakeModel({ namedSubjects: { total: 3, named: 0 } })} subjects={subjects} />);
    expect(screen.getByText(/None of the/i)).toBeInTheDocument();
  });

  it('counts the ones that do', () => {
    draw(<SubjectsTab model={fakeModel({ namedSubjects: { total: 3, named: 2 } })} subjects={subjects} />);
    expect(screen.getByText(/have a goal/i)).toBeInTheDocument();
  });
});
