/**
 * The limiter, where it reaches the screen.
 *
 * `utils/goalLimiter.test` pins the arithmetic and the floors under it. This is
 * about the other half of the decision: five tabs print the same finding and
 * they print it at two different sizes, on purpose, and which tab gets which
 * size is a judgement that nothing but a test can hold.
 *
 * The rule, in one line: a tab a reader opens to ask *why* gets the card;
 * a tab with its own job gets one sentence. Insights and Recommendations are
 * the first kind. Overview, Habits and Subjects are the second, and a card on
 * any of them would quietly turn that tab into a fourth copy of the goals page
 * — which is exactly what four rows were deleted off the Overview for doing.
 *
 * The Subjects tab carries the one extra condition, and it is the one most
 * worth pinning because nothing about it is visible in the types: a limiter is
 * only drawn there when its subject is on the page under it.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HabitsTab } from './HabitsTab';
import { InsightsTab } from './InsightsTab';
import { OverviewTab } from './OverviewTab';
import { RecommendationsTab } from './RecommendationsTab';
import { SubjectsTab } from './SubjectsTab';
import { draw, fakeData, fakeModel, matureOverview, subjects } from './fixtures';
import { buildHabits } from '@/utils/habits';
import { task } from '@/test/factories';
import type { GoalLimiter } from '@/utils/goalLimiter';

/** What `goalLimiter` produces for the goal the whole feature was written for. */
const AMC8: GoalLimiter = {
  goalId: 'g-amc8',
  goalTitle: 'Get 24 on the AMC 8',
  direction: 'accelerating',
  movement: 'You are improving',
  subjectId: 'geometry',
  subjectName: 'Geometry',
  basis: 'rated',
  share: 60,
  count: 3,
  total: 5,
  because: '3 of the 5 tasks you rated as going badly on this goal are filed under Geometry.',
  treeHref: '/skill-trees?subject=geometry&node=m.geometry',
  subjectHref: '/analytics/subject/geometry',
};

/** A second one, less concentrated, on a subject nothing else here mentions. */
const COURSE: GoalLimiter = {
  ...AMC8,
  goalId: 'g-course',
  goalTitle: 'Finish the course',
  subjectId: 'chemistry',
  subjectName: 'Chemistry',
  share: 45,
  basis: 'open',
};

/** Habits draws nothing at all without a habit in it. */
const HABITS = buildHabits(
  Array.from({ length: 8 }, (_, week) =>
    task({
      title: 'Revision',
      status: 'done',
      completed_at: `2026-0${week < 4 ? 6 : 7}-${String(1 + (week % 4) * 7).padStart(2, '0')}T18:00:00`,
    }),
  ),
  (id: string) => id,
  '2026-06-01',
  '2026-07-31',
);

describe('the tabs a reader opens to ask why', () => {
  it('gives Recommendations the whole reading, ending in the way in', () => {
    draw(
      <RecommendationsTab
        model={fakeModel({ goalLimits: [AMC8] })}
        data={fakeData()}
      />,
    );

    // The sentence, in the three parts it is built from: what the goal is,
    // which way it is going, and what is holding it up.
    expect(screen.getByText('Get 24 on the AMC 8')).toBeInTheDocument();
    expect(screen.getByText(/You are improving, but/)).toBeInTheDocument();
    // The share and the noun it is a share of, in one read: "60%" alone is
    // the number this whole file exists to stop being printed on its own.
    expect(document.querySelector('.ax-limiter-share')!.textContent)
      .toContain('about 60% of the work on this goal that went badly');
    // The working, under the claim rather than instead of it.
    expect(screen.getByText(AMC8.because)).toBeInTheDocument();

    // And the promise the whole finding rests on: naming geometry and then
    // leaving the reader to find it is most of a broken one.
    expect(screen.getByRole('link', { name: /Geometry skill tree/i }))
      .toHaveAttribute('href', '/skill-trees?subject=geometry&node=m.geometry');
  });

  it('gives Insights the same card, and still never an instruction', () => {
    draw(<InsightsTab model={fakeModel({ goalLimits: [AMC8] })} />);

    expect(screen.getByText(/You are improving, but/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Geometry skill tree/i })).toBeInTheDocument();
  });
});

describe('the tabs with their own job', () => {
  it('gives the Overview one line, and only about the worst goal', () => {
    // Two limiters in, one sentence out. The Overview's whole argument is that
    // it is the shortest honest answer and hands the longer questions on.
    draw(
      <OverviewTab
        model={{ ...matureOverview(), goalLimits: [AMC8, COURSE] }}
        data={fakeData()}
        onEditBaseline={() => {}}
      />,
    );

    expect(screen.getByText(/Get 24 on the AMC 8/)).toBeInTheDocument();
    expect(screen.queryByText(/Finish the course/)).not.toBeInTheDocument();
    // A line, not a card: no working, and no button.
    expect(screen.queryByText(AMC8.because)).not.toBeInTheDocument();
  });

  it('gives Habits one line too', () => {
    draw(
      <HabitsTab
        model={fakeModel({ goalLimits: [AMC8], habits: HABITS })}
        subjects={subjects}
      />,
    );

    expect(screen.getByText(/biggest limiter/)).toBeInTheDocument();
    expect(screen.queryByText(AMC8.because)).not.toBeInTheDocument();
  });
});

describe('the Subjects tab, where the subject has to be on the page', () => {
  /** The breakdown the tab reads to decide which subjects this window shows. */
  const worked = (...keys: string[]) => ({
    rows: keys.map((key) => ({ key, label: key, name: key, xp: 500, share: 1, tasks: 4 })),
  }) as never;

  it('draws the limiter whose subject was worked in this window', () => {
    draw(
      <SubjectsTab
        model={fakeModel({ goalLimits: [AMC8], breakdown: worked('geometry') })}
        subjects={subjects}
      />,
    );

    expect(screen.getByText(/Get 24 on the AMC 8/)).toBeInTheDocument();
  });

  it('leaves out one about a subject this window has nothing to say about', () => {
    // True, and belonging on the tab that is about goals rather than on the
    // one that is about subjects.
    draw(
      <SubjectsTab
        model={fakeModel({ goalLimits: [COURSE], breakdown: worked('geometry') })}
        subjects={subjects}
      />,
    );

    expect(screen.queryByText(/Finish the course/)).not.toBeInTheDocument();
  });
});
