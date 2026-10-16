/**
 * The limiter, where it reaches the screen.
 *
 * `utils/goalLimiter.test` pins the arithmetic and the floors under it. This is
 * about the other half of the decision: where the finding is drawn. It is a
 * line on the Subjects tab, beside the subject it names, and nowhere else:
 * the card Recommendations carried was taken off with that tab's goal rows.
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
  because: '3 of the 5 tasks that went badly on this goal are in Geometry.',
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

describe('Recommendations', () => {
  it('no longer carries the goal rows', () => {
    draw(
      <RecommendationsTab
        model={fakeModel({ goalLimits: [AMC8] })}
        data={fakeData()}
      />,
    );

    expect(screen.queryByText(/Get 24 on the AMC 8/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Why your goals are moving/)).not.toBeInTheDocument();
  });
});

describe('the tabs with their own job', () => {
  /* A one-line version on the Subjects tab (below). The Overview has none. */
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
});

describe('the Subjects tab', () => {
  /* One line per goal, and only where the subject holding it back is on the
     page. */
  const worked = (key: string) =>
    ({ rows: [{ key, label: key, name: key, xp: 500, share: 1, tasks: 4 }] }) as never;

  it('draws the limiter whose subject was worked in this window', () => {
    draw(<SubjectsTab model={fakeModel({ goalLimits: [AMC8], breakdown: worked('geometry') })} />);
    expect(screen.getByText(/Get 24 on the AMC 8/)).toBeInTheDocument();
  });

  it('leaves out one about a subject this window has nothing to say about', () => {
    draw(<SubjectsTab model={fakeModel({ goalLimits: [COURSE], breakdown: worked('geometry') })} />);
    expect(screen.queryByText(/Finish the course/)).not.toBeInTheDocument();
  });
});
