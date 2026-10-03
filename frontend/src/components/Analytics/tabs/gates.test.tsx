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
import { RecommendationsTab } from './RecommendationsTab';
import { SubjectsTab } from './SubjectsTab';
import { NEED_DAYS } from '../useAnalyticsModel';
import { whyFor } from '../milestones';
/* The model these are driven from — see ./fixtures, which gates.test.tsx used
   to hold and ./groups.test.tsx now needs too. */
import { draw, fakeData, fakeModel, subjects } from './fixtures';
import { reviewAdopted, summarise } from '@/utils/followup';
import { days } from '@/test/factories';

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
