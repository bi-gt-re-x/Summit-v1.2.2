/**
 * The streak's flame: its stages, and the moment the streak goes up.
 *
 * The stages are pinned at their edges, because an off-by-one there is a flame
 * that changes colour a day before or after the milestone notification says
 * it has. The moment is pinned for what must *not* set it off as much as what
 * must: arriving on the page with a streak, or the streak falling to 0.
 */
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsContext, StatsContext } from '@/context/contexts';
import { settingsValue, statsValue } from '@/test/render';
import { stats as makeStats } from '@/test/factories';
import { StreakCard } from './StatCards';
import { FLAME_STAGES, flameStage } from './StreakFlame';

describe('the stages', () => {
  it('starts as a spark, grows to full size, then gets hotter', () => {
    expect(FLAME_STAGES.map((stage) => stage.key)).toEqual([
      'none', 'spark', 'small', 'medium', 'full', 'red', 'yellow', 'blue', 'infinite',
    ]);
    // Every stage from full size on is the same size; only the heat changes.
    const after = FLAME_STAGES.slice(FLAME_STAGES.findIndex((stage) => stage.key === 'full'));
    expect(new Set(after.map((stage) => stage.size))).toEqual(new Set(['large']));
  });

  it.each([
    [0, 'none'], [1, 'spark'], [2, 'spark'], [3, 'small'], [6, 'small'], [7, 'medium'],
    [13, 'medium'], [14, 'full'], [29, 'full'], [30, 'red'], [49, 'red'], [50, 'yellow'],
    [99, 'yellow'], [100, 'blue'], [364, 'blue'], [365, 'infinite'], [2000, 'infinite'],
  ])('a %i-day streak is %s', (days, key) => {
    expect(flameStage(days).key).toBe(key);
  });
});

describe('the moment the streak goes up', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-24T10:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  function card(streak: number, held = false) {
    return (
      <MemoryRouter>
        <SettingsContext.Provider value={settingsValue()}>
          <StatsContext.Provider value={statsValue()}>
            <StreakCard stats={makeStats({ current_streak: streak, best_streak: 400 })} held={held} />
          </StatsContext.Provider>
        </SettingsContext.Provider>
      </MemoryRouter>
    );
  }
  const flame = () => document.querySelector('.flame')!;
  /** Past the short wait a rise takes before it is played. */
  const settle = () =>
    act(() => {
      vi.advanceTimersByTime(100);
    });
  const chip = () => document.querySelector('.dash-stat-chip')!;

  it('does not flare on arrival', () => {
    render(card(12));
    expect(flame()).not.toHaveClass('is-flaring');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('flares when the figure rises, says so, and settles', () => {
    const { rerender } = render(card(12));
    rerender(card(13));
    settle();
    expect(flame()).toHaveClass('is-flaring');
    expect(chip()).toHaveClass('is-flaring');
    expect(document.querySelector('.dash-big')).toHaveClass('is-bumping');
    expect(document.querySelectorAll('.flame-embers i')).toHaveLength(3);
    expect(screen.getByRole('status')).toHaveTextContent('Streak extended to 13 days.');

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(flame()).not.toHaveClass('is-flaring');
    expect(document.querySelector('.flame-embers')).toBeNull();
  });

  it('settles into the new stage when a threshold is crossed', () => {
    const { rerender } = render(card(99));
    expect(chip()).toHaveClass('flame-chip-yellow');
    rerender(card(100));
    settle();
    expect(chip()).toHaveClass('flame-chip-blue');
    expect(flame()).toHaveClass('flame-heat-blue');
    expect(screen.getByRole('status')).toHaveTextContent('Streak extended to 100 days.');
  });

  it('grows from a spark into a flame', () => {
    const { rerender } = render(card(2));
    expect(flame()).toHaveClass('flame-size-spark');
    rerender(card(3));
    settle();
    expect(flame()).toHaveClass('flame-size-small');
  });

  it('does not celebrate a streak falling to nothing', () => {
    const { rerender } = render(card(12));
    rerender(card(0));
    expect(flame()).not.toHaveClass('is-flaring');
    expect(chip()).toHaveClass('flame-chip-cold');
  });

  it('holds a rise back while an overlay is up, and plays it when it closes', () => {
    const { rerender } = render(card(99));
    rerender(card(100, true));
    settle();
    expect(flame()).not.toHaveClass('is-flaring');
    expect(chip()).toHaveClass('flame-chip-yellow');
    expect(document.querySelector('.dash-big')).toHaveTextContent('99');

    rerender(card(100, false));
    settle();
    expect(flame()).toHaveClass('is-flaring');
    expect(chip()).toHaveClass('flame-chip-blue');
  });
});
