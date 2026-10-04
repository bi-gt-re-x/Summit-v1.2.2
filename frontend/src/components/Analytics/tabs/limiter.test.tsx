/**
 * The limiter, where it reaches the screen.
 *
 * `utils/goalLimiter.test` pins the arithmetic and the floors under it. This is
 * about the other half of the decision: where the finding is drawn. It is
 * drawn once, as a card on Recommendations — the tab a reader opens to ask
 * *why* — and nowhere else.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OverviewTab } from './OverviewTab';
import { RecommendationsTab } from './RecommendationsTab';
import { SubjectsTab } from './SubjectsTab';
import { draw, fakeData, fakeModel, matureOverview } from './fixtures';
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

});

describe('the tabs with their own job', () => {
  /* The finding is drawn once, on Recommendations. It used to be repeated as a
     line on the Overview and the Subjects tab as well, which put the same
     goal in front of the reader three times. */
  it('leaves it off the Overview', () => {
    draw(
      <OverviewTab
        model={{ ...matureOverview(), goalLimits: [AMC8, COURSE] }}
        data={fakeData()}
        onEditBaseline={() => {}}
      />,
    );

    expect(screen.queryByText(/Get 24 on the AMC 8/)).not.toBeInTheDocument();
  });

  it('leaves it off the Subjects tab, even for a subject on the page', () => {
    draw(
      <SubjectsTab
        model={fakeModel({
          goalLimits: [AMC8],
          breakdown: {
            rows: [{ key: 'geometry', label: 'geometry', name: 'geometry', xp: 500, share: 1, tasks: 4 }],
          } as never,
        })}
      />,
    );

    expect(screen.queryByText(/Get 24 on the AMC 8/)).not.toBeInTheDocument();
  });
});
