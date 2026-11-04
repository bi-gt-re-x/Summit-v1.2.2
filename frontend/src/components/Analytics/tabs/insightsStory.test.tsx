/**
 * The Insights tab as a story: what changed, then the evidence under it.
 *
 * What this pins is the order of the argument and the tab's two boundaries:
 * nothing another tab already prints, and nothing that says what to do.
 *
 *   1  what changed, as cards of three named kinds
 *   2  the groups, which are the evidence under it
 *
 * The state meters that used to open the tab — the five measures, the grade,
 * the streak — are the Overview, the Growth tab and Achievements, so they are
 * pinned as absent.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InsightsTab } from './InsightsTab';
import { draw, fakeModel, subjects } from './fixtures';
import { analyticalScore } from '@/utils/analyticalScore';
import type { Change } from '@/utils/changed';
import type { AnalyticsModel } from '../useAnalyticsModel';
import type { Ratings } from '@/types';

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

/** A mature Insights tab. */
function model(over: Partial<AnalyticsModel> = {}): AnalyticsModel {
  return fakeModel({
    historyDays: 400,
    analytical: analyticalScore(card()),
    streak: 6,
    weekChange: 18,
    wins: [{ id: 'w1', text: 'Your daily XP is up 20% on the previous 30 days', figure: '100 → 120', suggests: 'Keep it going.', tone: 'violet' }],
    changes: [change()],
    ...over,
  });
}

/** Where a node sits in the rendered document, for order assertions. */
function positionOf(node: Element): number {
  return [...document.querySelectorAll('*')].indexOf(node);
}

describe('what it does not repeat', () => {
  it('draws no state meters, grade or streak', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    expect(screen.queryByText('Performance')).not.toBeInTheDocument();
    expect(screen.queryByText(/out of 100 overall/)).not.toBeInTheDocument();
    expect(screen.queryByText('Current streak')).not.toBeInTheDocument();
    expect(screen.queryByText('Biggest weakness')).not.toBeInTheDocument();
  });

  it('draws no list of key findings, no calendar and no subject split', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    expect(screen.queryByText("What's changing")).not.toBeInTheDocument();
    expect(screen.queryByText('Habit calendar')).not.toBeInTheDocument();
    expect(screen.queryByText('XP by subject')).not.toBeInTheDocument();
  });

  it('ends a change in what it suggests', () => {
    draw(
      <InsightsTab
        model={model({ changes: [change({ suggests: 'This suggests you can stay at this level.' })] })}
        subjects={subjects}
      />,
    );
    expect(screen.getByText('This suggests you can stay at this level.')).toBeInTheDocument();
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
            change({ id: 'c', kind: 'pattern', text: 'You rate your work higher before 5pm.', strength: 'emerging' }),
          ],
        })}
        subjects={subjects}
      />,
    );
    expect(screen.getByText('Getting stronger')).toBeInTheDocument();
    expect(screen.getByText('New problem')).toBeInTheDocument();
    expect(screen.getByText('Pattern')).toBeInTheDocument();
    // The chip only where the source graded itself.
    expect(screen.getByText('Emerging pattern')).toBeInTheDocument();
  });

  it('says so plainly when nothing has moved', () => {
    draw(<InsightsTab model={model({ changes: [] })} subjects={subjects} />);
    expect(screen.getByText(/Nothing has changed much yet/)).toBeInTheDocument();
  });

  it('puts the problems ahead of the gains', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    const kinds = [...document.querySelectorAll('.ax-change-kind')].map((one) => one.textContent);
    expect(kinds.indexOf('New problem')).toBeLessThan(kinds.indexOf('Getting stronger'));
  });

  it('sits above the evidence groups', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    const changed = screen.getByText('What changed');
    const first = screen.getByText('What goes together');
    expect(positionOf(changed)).toBeLessThan(positionOf(first));
  });
});

describe('what the tab no longer draws', () => {
  it.each([
    'So far',
    'Patterns in what you do',
    'Your best and worst work',
    'What moves with what',
    'Your steadiest habits',
    'Holding or slipping',
  ])('%s', (title) => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    expect(screen.queryByRole('heading', { name: new RegExp(`^${title}`) })).not.toBeInTheDocument();
  });

  it('opens what goes together, right under what changed', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    expect(screen.getByRole('button', { name: /What goes together/ })).toHaveAttribute('aria-expanded', 'true');
  });
});
