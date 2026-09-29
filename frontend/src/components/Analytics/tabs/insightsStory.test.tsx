/**
 * The Insights tab as a story: state, then what changed, then the evidence.
 *
 * The tab's content is editorial and will keep moving. What this file pins is
 * the *order of the argument*, which is the one thing about it that is a design
 * decision rather than a preference:
 *
 *   1  the four metrics and the four movements, above every group
 *   2  what changed, as cards of three named kinds
 *   3  the groups, which are the evidence under the two sections above
 *
 * It also pins the two things that would quietly undo it: the behavioural tiles
 * staying out of the opening, and the weakness tile naming a measure rather than
 * a mood.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InsightsTab } from './InsightsTab';
import { draw, fakeModel, subjects } from './fixtures';
import { analyticalScore } from '@/utils/analyticalScore';
import type { Change } from '@/utils/changed';
import { subjectFocus } from '@/utils/subjectFocus';
import type { SkillRow } from '@/utils/skillScore';
import type { AnalyticsModel } from '../useAnalyticsModel';
import type { Ratings } from '@/types';

/**
 * A report card with the five metrics at known scores.
 *
 * Built through `analyticalScore` rather than as a literal, so the meters are
 * drawn from the same computation every other surface reads and a test cannot
 * pass against a shape the real page never produces.
 */
function card(): Ratings {
  return {
    metrics: {
      productivity: { score: 82, avg_daily_xp: 420 },
      quality: { score: 91, basis: 'ratings', avg_quality: 18, max_quality: 25, rated_tasks: 40 },
      consistency: { score: 64, active_days: 20, total_days: 30 },
      efficiency: { score: 47, has_timing: true, on_time_pct: 47 },
      focus: { score: 55, pct_of_goal: 55 },
    },
  } as unknown as Ratings;
}

const change = (over: Partial<Change> = {}): Change => ({
  id: 'c1',
  kind: 'gain',
  text: 'The work you take on has got harder.',
  move: '3.2 → 3.8',
  weight: 50,
  family: 'difficulty',
  ...over,
});

/**
 * A scored subject with branches under it.
 *
 * Through the real `subjectFocus` over the real routing table, so the section is
 * drawn from the same arithmetic the page uses — `algebra` and `geometry` both
 * route to nodes of the mathematics tree, which is what gives it bars at all.
 */
function focusRows() {
  const row: SkillRow = {
    subject: 'mathematics',
    score: 91,
    raw: 91,
    band: 'Strong' as SkillRow['band'],
    parts: { accuracy: 90, difficulty: 80, consistency: 84, recent: 88, execution: 86, retention: 70 },
    confidence: 0.8,
    finished: 60,
    rated: 40,
    avgExecution: 4.3,
    avgDifficulty: 4.08,
    hardAccuracy: 78,
    daysSince: 1,
    activeWeeks: 21,
    weeks: 25,
    trend: 6,
  };
  return subjectFocus({
    skills: [row],
    // 91% of m.algebra's 2000 XP, 60% of m.geometry's 1800.
    rows: [
      { key: 'algebra', label: 'algebra', xp: 1820, count: 20 },
      { key: 'geometry', label: 'geometry', xp: 1080, count: 12 },
    ],
    previous: new Map(),
    nameOf: (id: string) => id,
  });
}

/** A mature Insights tab with the opening's figures on it. */
function model(over: Partial<AnalyticsModel> = {}): AnalyticsModel {
  return fakeModel({
    historyDays: 400,
    analytical: analyticalScore(card()),
    streak: 6,
    weekChange: 18,
    wins: [{ id: 'w1', text: 'Your daily XP is up 20% on the previous 30 days', figure: '100 → 120', tone: 'violet' }],
    changes: [change()],
    focus: focusRows(),
    ...over,
  });
}

/** Where a node sits in the rendered document, for order assertions. */
function positionOf(node: Element): number {
  return [...document.querySelectorAll('*')].indexOf(node);
}

describe('the opening', () => {
  it('names the four metrics a reader asked for', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    /* Scoped to the meter's own label: "Efficiency" also appears on the
       weakness tile below, and an unscoped query would pass on that alone. */
    ['Performance', 'Consistency', 'Efficiency', 'Quality'].forEach((label) => {
      expect(screen.getByText(label, { selector: '.ax-meter-label' })).toBeInTheDocument();
    });
  });

  it('calls productivity Performance and still prints its own number', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    const meter = screen.getByRole('meter', { name: /Performance/ });
    expect(meter).toHaveAttribute('aria-valuenow', '82');
    // The measurement behind the score, not just the score.
    expect(screen.getByText('420 XP a day')).toBeInTheDocument();
  });

  it('leaves focus to the Overview tab', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    expect(screen.queryByRole('meter', { name: /Focus/ })).not.toBeInTheDocument();
  });

  it('shows the streak, the week and the two findings', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    expect(screen.getByText('Current streak')).toBeInTheDocument();
    expect(screen.getByText('Weekly change')).toBeInTheDocument();
    expect(screen.getByText('Biggest improvement')).toBeInTheDocument();
    expect(screen.getByText('Biggest weakness')).toBeInTheDocument();
    // The weakest of the five metrics by score, which is efficiency at 47.
    expect(screen.getByText('Efficiency', { selector: '.ax-tile-value' })).toBeInTheDocument();
  });

  it('drops the weekly tile rather than drawing a dash for it', () => {
    draw(<InsightsTab model={model({ weekChange: null })} subjects={subjects} />);
    expect(screen.queryByText('Weekly change')).not.toBeInTheDocument();
    expect(screen.getByText('Current streak')).toBeInTheDocument();
  });

  it('keeps the behavioural tiles out of the opening', () => {
    /* They are still on the tab — in the group about when and what you work on
       — and the assertion is that they are *below* what changed rather than
       above it. */
    draw(<InsightsTab model={model()} subjects={subjects} />);
    const changed = screen.getByText('What changed');
    const tiles = screen.getByText('Strongest day');
    expect(positionOf(changed)).toBeLessThan(positionOf(tiles));
  });
});

describe('what changed', () => {
  it('draws a card with its kind, its movement and its sentence', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    expect(screen.getByText('Getting stronger')).toBeInTheDocument();
    expect(screen.getByText('3.2 → 3.8')).toBeInTheDocument();
    expect(screen.getByText('The work you take on has got harder.')).toBeInTheDocument();
  });

  it('labels all three kinds', () => {
    draw(
      <InsightsTab
        model={model({
          changes: [
            change({ id: 'a', kind: 'gain' }),
            change({ id: 'b', kind: 'problem', text: 'Your hardest tasks go badly more often.' }),
            change({ id: 'c', kind: 'pattern', text: 'You rate your work higher before 5pm.', strength: 'likely' }),
          ],
        })}
        subjects={subjects}
      />,
    );
    expect(screen.getByText('Getting stronger')).toBeInTheDocument();
    expect(screen.getByText('Emerging problem')).toBeInTheDocument();
    expect(screen.getByText('Hidden pattern')).toBeInTheDocument();
    // The chip only where the source graded itself.
    expect(screen.getByText('Likely')).toBeInTheDocument();
  });

  it('says so plainly when nothing has moved', () => {
    draw(<InsightsTab model={model({ changes: [] })} subjects={subjects} />);
    expect(screen.getByText(/Nothing has moved far enough/)).toBeInTheDocument();
  });

  it('sits above the three evidence groups', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    const changed = screen.getByText('What changed');
    const first = screen.getByText('What is true now');
    expect(positionOf(changed)).toBeLessThan(positionOf(first));
  });
});

describe('subject insights', () => {
  it('gives each subject its four figures', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    expect(screen.getByText('Subject insights')).toBeInTheDocument();
    ['Performance', 'Difficulty', 'Consistency', 'Trend'].forEach((label) => {
      expect(screen.getByText(label, { selector: '.ax-subject-figure dt' })).toBeInTheDocument();
    });
    expect(screen.getByText('4.1')).toBeInTheDocument();
  });

  it('draws a bar per branch of the subject tree, with a way in', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    expect(screen.getByRole('meter', { name: /Algebra 91%/ })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /Geometry 60%/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Geometry' })).toHaveAttribute(
      'href',
      '/skill-trees?subject=geometry&node=m.geometry',
    );
  });

  it('recommends the largest gap and links into it', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    expect(screen.getByText('Recommended focus')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open the Geometry branch/ })).toHaveAttribute(
      'href',
      '/skill-trees?subject=geometry&node=m.geometry',
    );
  });

  /* It used to sit above the evidence groups, as a section of its own. The
     merge moved it inside one: `SubjectInsights`, `SkillColdPanel` and
     `SkillFindingsPanel` were three separate sections across the two tabs and
     all three are about which subject is doing what, so they are one group
     now — which necessarily puts this below the groups rather than above
     them. What has not changed is that it comes after "what changed": a claim
     about a subject is read against the movement that prompted it. */
  it('sits inside the subjects group, below the evidence and after what changed', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    const changed = positionOf(screen.getByText('What changed'));
    const groups = positionOf(screen.getByText('What is true now'));
    const subjectsAt = positionOf(screen.getByText('Subject insights'));
    expect(changed).toBeLessThan(groups);
    expect(groups).toBeLessThan(subjectsAt);
  });

  it('says what it needs when no subject is scored', () => {
    draw(<InsightsTab model={model({ focus: [] })} subjects={subjects} />);
    expect(screen.getByText(/Rate a few finished tasks/)).toBeInTheDocument();
  });
});
