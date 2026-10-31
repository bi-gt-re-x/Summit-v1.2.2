/**
 * The "vs usual" line, and the mornings it used to spoil.
 *
 * `typicalDay` averages *complete* days and skips today deliberately, so the
 * comparison holds a partial day against finished ones. Before somebody has
 * done anything the arithmetic is `(0 - usual) / usual`, and the card greeted
 * an account with a year of work behind it with a red **↓ 100% vs usual** —
 * every morning, before they had a chance to do anything about it.
 *
 * These pin the three cases the line stays out of, and that it still appears
 * when there is a real comparison to make.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TodayCard, XpCard } from './StatCards';
import type { DaySummary, Typical } from './summary';
import { renderWithProviders } from '@/test/render';

const USUAL: Typical = { tasks: 8, xp: 400, days: 30 };

function day(done: number, total = 10): DaySummary {
  return { total, done, xp: done * 50, percent: Math.round((done / total) * 100) };
}

function today(props: { done: number; usual?: Typical }) {
  renderWithProviders(
    <TodayCard day={day(props.done)} xpLeft={0} usual={props.usual ?? USUAL} />,
  );
}

describe('the comparison against a usual day', () => {
  it('is silent before anything has been done today', () => {
    // The bug: a day that has not happened is not a 100% shortfall.
    today({ done: 0 });
    expect(screen.queryByText(/vs usual/)).toBeNull();
    expect(screen.queryByText(/100%/)).toBeNull();
  });

  it('is silent for an account with no history to compare against', () => {
    today({ done: 3, usual: { tasks: 0, xp: 0, days: 0 } });
    expect(screen.queryByText(/vs usual/)).toBeNull();
  });

  it('is silent when the usual day is itself zero', () => {
    // Every number is infinitely better than nothing.
    today({ done: 3, usual: { tasks: 0, xp: 0, days: 30 } });
    expect(screen.queryByText(/vs usual/)).toBeNull();
  });

  it('still says so when the day is genuinely ahead', () => {
    today({ done: 16 });
    expect(screen.getByText(/vs usual/)).toHaveTextContent('100% vs usual');
  });

  it('still says so when the day is genuinely behind', () => {
    // Behind, but not empty — this is the comparison worth keeping, and the
    // one the empty-day case was drowning out.
    today({ done: 2 });
    expect(screen.getByText(/vs usual/)).toHaveTextContent('75% vs usual');
  });

  it('calls an ordinary day ordinary rather than reporting noise', () => {
    today({ done: 8 });
    expect(screen.getByText('about usual')).toBeInTheDocument();
  });
});

describe('the same rule on the XP card', () => {
  it('says nothing about a day with no XP on it yet', () => {
    render(
      <XpCard
        stats={{
          level: 70, xp: 243730, tasks_completed: 3882,
          current_streak: 12, best_streak: 34, charge: 0,
        }}
        xpToday={0}
        dailyGoal={100}
        usual={USUAL}
      />,
    );
    expect(screen.queryByText(/vs usual/)).toBeNull();
  });
});
