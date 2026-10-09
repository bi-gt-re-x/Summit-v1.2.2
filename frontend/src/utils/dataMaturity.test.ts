/**
 * The gate, at the edges that made the old one wrong.
 *
 * The first two describe the bug this module exists for: `growth_data` pads
 * every empty calendar day with zeros, so counting its length let an account
 * that had been open five weeks and used twice through a gate asking for three
 * weeks of record. Everything else pins the ladder's shape.
 */
import { describe, expect, it } from 'vitest';
import { dataMaturity, isActiveDay, stageFor, stageShows, STAGE_FLOOR, STAGES } from './dataMaturity';
import type { GrowthDay } from '@/types';

/** A row of the series. Zero on every measure unless the test says otherwise. */
function day(date: string, over: Partial<GrowthDay> = {}): GrowthDay {
  return {
    date,
    day_number: 1,
    xp_earned: 0,
    tasks_completed: 0,
    cumulative_xp: 0,
    avg_task_xp: 0,
    focus_minutes: 0,
    cumulative_focus_minutes: 0,
    rated_tasks: 0,
    quality_score: 0,
    avg_difficulty: 0,
    avg_execution: 0,
    ...over,
  } as GrowthDay;
}

/** `count` calendar days from 2026-01-01, of which the first `worked` have work. */
function series(count: number, worked: number): GrowthDay[] {
  return Array.from({ length: count }, (_, index) => {
    const at = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
    return index < worked ? day(at, { tasks_completed: 2, xp_earned: 40 }) : day(at);
  });
}

describe('counting what is actually there', () => {
  it('counts days with work, not days on the calendar', () => {
    const found = dataMaturity(series(40, 2));
    // Forty rows, two of them worked. The gap between these two figures is the
    // whole reason this module exists, and `spanDays` keeps it visible rather
    // than throwing the calendar away.
    expect(found.activeDays).toBe(2);
    expect(found.spanDays).toBe(40);
    expect(found.stage).toBe('new');
  });

  it('does not let account age open a gate on its own', () => {
    // The old rule was `growth_data.length`, which is 40 here.
    expect(dataMaturity(series(40, 2)).stage).not.toBe('full');
  });

  it('reads span from the first worked day, not from the account opening', () => {
    const rows = [day('2026-01-01'), day('2026-01-02'), day('2026-01-05', { xp_earned: 10 }), day('2026-01-08')];
    const found = dataMaturity(rows);
    expect(found.activeDays).toBe(1);
    // 5th to 8th inclusive.
    expect(found.spanDays).toBe(4);
    expect(found.lastActive).toBe('2026-01-05');
  });

  it('has nothing to say about an empty record, and does not throw', () => {
    const found = dataMaturity([]);
    expect(found).toMatchObject({ activeDays: 0, spanDays: 0, stage: 'new', lastActive: null });
  });
});

describe('what counts as a day', () => {
  it('takes tasks, focus or XP', () => {
    expect(isActiveDay(day('2026-01-01', { tasks_completed: 1 }))).toBe(true);
    expect(isActiveDay(day('2026-01-01', { focus_minutes: 12 }))).toBe(true);
    expect(isActiveDay(day('2026-01-01', { xp_earned: 5 }))).toBe(true);
  });

  it('ignores a day that only carries a rating, since rating is optional', () => {
    expect(isActiveDay(day('2026-01-01', { rated_tasks: 3, quality_score: 20 }))).toBe(false);
  });

  it('treats a blank row as blank', () => {
    expect(isActiveDay(day('2026-01-01'))).toBe(false);
  });
});

describe('the ladder', () => {
  it('starts everyone at new', () => {
    expect(stageFor(0)).toBe('new');
    expect(stageFor(2)).toBe('new');
  });

  it('opens each stage on its own floor, not one day after', () => {
    expect(stageFor(STAGE_FLOOR.early)).toBe('early');
    expect(stageFor(STAGE_FLOOR.weekly)).toBe('weekly');
    expect(stageFor(STAGE_FLOOR.developing)).toBe('developing');
    expect(stageFor(STAGE_FLOOR.full)).toBe('full');
  });

  it('never falls back — data does not expire', () => {
    // 400 calendar days, 30 of them worked, and nothing for the last year.
    expect(dataMaturity(series(400, 30)).stage).toBe('full');
  });

  it('counts the distance to the next stage in active days', () => {
    const found = dataMaturity(series(30, 5));
    expect(found.stage).toBe('early');
    expect(found.next).toBe('weekly');
    expect(found.toNext).toBe(2);
  });

  it('measures progress through the current stage rather than the whole ladder', () => {
    // 5 active days: two thirds of the way from `early` (3) to `weekly` (7).
    expect(dataMaturity(series(30, 5)).progress).toBeCloseTo(0.5, 5);
  });

  it('is finished at full', () => {
    const found = dataMaturity(series(60, 45));
    expect(found).toMatchObject({ stage: 'full', next: null, toNext: null, progress: 1 });
  });
});

describe('what each stage draws', () => {
  it('gives the mature page everything, and adds nothing to it', () => {
    // Step five of the progressive system is this line. `full` is every panel
    // on and the staging notice off — the analytics page exactly as it was,
    // with no separate full-analytics mode to transition into.
    expect(stageShows('full')).toEqual({
      counts: true,
      trends: true,
      judgement: true,
      note: false,
    });
  });

  it('never takes a panel away as the account matures', () => {
    // The one invariant the whole feature rests on: crossing a stage boundary
    // may add, and may never remove. A reader who saw a chart yesterday and
    // cannot find it today has been told the app is broken.
    const families = ['counts', 'trends', 'judgement'] as const;
    STAGES.slice(1).forEach((stage, index) => {
      const before = stageShows(STAGES[index]!);
      const after = stageShows(stage);
      families.forEach((family) => {
        if (before[family]) {
          expect(after[family], `${family} vanished between ${STAGES[index]} and ${stage}`).toBe(true);
        }
      });
    });
  });

  it('shows the notice at every stage except the last', () => {
    STAGES.forEach((stage) => {
      expect(stageShows(stage).note).toBe(stage !== 'full');
    });
  });

  it('holds judgment back until a fortnight, and trends until a week', () => {
    expect(stageShows('new')).toMatchObject({ trends: false, judgement: false });
    expect(stageShows('early')).toMatchObject({ trends: false, judgement: false });
    expect(stageShows('weekly')).toMatchObject({ trends: true, judgement: false });
    expect(stageShows('developing')).toMatchObject({ trends: true, judgement: true });
  });

  it('always has something to count, so no stage is a blank page', () => {
    STAGES.forEach((stage) => expect(stageShows(stage).counts).toBe(true));
  });

  it('agrees with the ladder, so a day count decides one thing', () => {
    // The page reads `stageShows(maturity.stage)`; these are the two halves of
    // that expression and they have to line up on the boundary itself.
    expect(stageShows(stageFor(STAGE_FLOOR.developing - 1)).judgement).toBe(false);
    expect(stageShows(stageFor(STAGE_FLOOR.developing)).judgement).toBe(true);
    expect(stageShows(stageFor(STAGE_FLOOR.full)).note).toBe(false);
  });
});

describe('the hand-off to the gated tabs', () => {
  it('is complete by the time the page is mature', async () => {
    /*
     * The two Early tallies are drawn while `waitFor('habits') > 0`, which is
     * how they hand over to the tab that answers the same question properly
     * rather than vanishing on a day number. That only works while the Habits
     * gate opens at or before `full` — raise `NEED_DAYS.habits` past 30 and
     * the mature analytics page grows two panels it is not supposed to have,
     * silently, with nothing else in the suite noticing.
     *
     * Imported here rather than in the module, because `dataMaturity` has no
     * business knowing what any tab needs.
     */
    const { NEED_DAYS } = await import('@/components/Analytics/useAnalyticsModel');
    Object.entries(NEED_DAYS).forEach(([tab, need]) => {
      expect(need, `${tab} opens after the page is already mature`).toBeLessThanOrEqual(
        STAGE_FLOOR.full,
      );
    });
  });
});
