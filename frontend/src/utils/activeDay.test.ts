/**
 * One definition, and the four modules that have to agree about it.
 *
 * The bug this pins is not in any one file. It is that "days worked" was
 * computed five times, in five places, and three of them tested `xp_earned`
 * alone — while **a focus session earns no XP**. So somebody whose habit is
 * the timer had a record that the maturity gates could see and the consistency
 * tile beside them could not. Nothing about that shows up in a unit test of
 * either module on its own; it only appears when you ask both about the same
 * two weeks, which is what the agreement tests below do.
 *
 * They are deliberately written against the real functions rather than against
 * `isActiveDay`, because a future edit that reintroduces a local `xp > 0` is
 * exactly the failure worth catching, and it would pass a test of the
 * predicate.
 */
import { describe, expect, it } from 'vitest';
import { ACTIVE_DAY_MEANS, activeRate, countActiveDays, isActiveDay } from './activeDay';
import { dataMaturity, STAGE_FLOOR } from './dataMaturity';
import { rhythmShape, weekdayProfile } from './behaviour';
import { vitals } from './diagnosis';
import { consistency } from '@/components/Analytics/data';
import { days } from '@/test/factories';
import type { GrowthDay } from '@/types';

/** A stretch where every day is worked, in one of the three ways. */
function worked(count: number, how: Partial<GrowthDay>): GrowthDay[] {
  return days('2026-01-01', count, how);
}

/** `count` days, of which the first `active` were worked by focus alone. */
function focusOnly(count: number, active: number): GrowthDay[] {
  return days('2026-01-01', count).map((day, index) =>
    index < active ? { ...day, focus_minutes: 90 } : day,
  );
}

describe('what makes a day count', () => {
  it('takes any one of the three, at any size', () => {
    expect(isActiveDay(worked(1, { tasks_completed: 1 })[0]!)).toBe(true);
    expect(isActiveDay(worked(1, { focus_minutes: 1 })[0]!)).toBe(true);
    expect(isActiveDay(worked(1, { xp_earned: 1 })[0]!)).toBe(true);
  });

  it('does not need more than one of them', () => {
    // The failure this rules out is an `&&` where an `||` belongs.
    expect(isActiveDay(worked(1, { focus_minutes: 45 })[0]!)).toBe(true);
  });

  it('counts a padded empty day as nothing', () => {
    // `series` in backend/tracking/growth.py emits a row per calendar day.
    expect(isActiveDay(worked(1, {})[0]!)).toBe(false);
    expect(countActiveDays(days('2026-01-01', 40))).toBe(0);
  });

  it('says what it means in the words the page prints', () => {
    // The sentence on screen comes from here, so it cannot describe a
    // different rule than the one above it.
    expect(ACTIVE_DAY_MEANS).toMatch(/task/);
    expect(ACTIVE_DAY_MEANS).toMatch(/focus session/);
    expect(ACTIVE_DAY_MEANS).toMatch(/XP/);
  });
});

describe('the ladder is thirty worked days, not thirty dates', () => {
  it('opens full analytics on thirty active days however long they took', () => {
    // Thirty worked days spread across a year of calendar. Same stage as
    // thirty on the trot, because nothing they learned about themselves
    // became untrue for having been spread out.
    const sparse = days('2026-01-01', 365).map((day, index) =>
      index % 12 === 0 && index / 12 < 30 ? { ...day, tasks_completed: 1, xp_earned: 20 } : day,
    );
    const found = dataMaturity(sparse);
    expect(found.activeDays).toBe(STAGE_FLOOR.full);
    expect(found.stage).toBe('full');
  });

  it('does not open it on thirty dates with two days of work in them', () => {
    const found = dataMaturity(focusOnly(30, 2));
    expect(found.activeDays).toBe(2);
    expect(found.stage).toBe('new');
  });

  it('counts a focus-only run toward every rung of the ladder', () => {
    // No task, no XP, thirty sessions. This is the reader the old rule lost.
    expect(dataMaturity(focusOnly(30, 30)).stage).toBe('full');
    expect(dataMaturity(focusOnly(30, STAGE_FLOOR.developing)).stage).toBe('developing');
    expect(dataMaturity(focusOnly(30, STAGE_FLOOR.weekly)).stage).toBe('weekly');
    expect(dataMaturity(focusOnly(30, STAGE_FLOOR.early)).stage).toBe('early');
  });
});

describe('everything that counts days worked agrees', () => {
  /* Fourteen days, all of them focus sessions and nothing else. Every figure
     below is some form of "how much of this window was worked", and before the
     definition was shared they answered 100% and 0%. */
  const twoWeeks = focusOnly(14, 14);

  it('the gate sees a full two weeks', () => {
    expect(dataMaturity(twoWeeks).activeDays).toBe(14);
  });

  it('the consistency panel sees a full two weeks', () => {
    expect(consistency({ current: twoWeeks, previous: [] }).rate).toBe(100);
    expect(activeRate(twoWeeks)).toBe(100);
  });

  it('the rhythm sees a full two weeks, and no gap in it', () => {
    const rhythm = rhythmShape(twoWeeks);
    expect(Math.round(rhythm.activeRate)).toBe(100);
    // The gap rules price a recommendation off this. Counting XP here told
    // somebody who sat down every day for two weeks that they had taken a
    // fourteen-day break.
    expect(rhythm.gapCount).toBe(0);
    expect(rhythm.longestGap).toBeNull();
  });

  it('the diagnosis sees a full two weeks', () => {
    expect(vitals(twoWeeks, []).activeDays).toBe(14);
  });

  it('the weekday profile sees every weekday as worked', () => {
    const stats = weekdayProfile(twoWeeks);
    stats.forEach((stat) => expect(stat.activeRate).toBe(100));
  });

  it('and they all agree about two weeks that was not worked', () => {
    const idle = days('2026-01-01', 14);
    expect(dataMaturity(idle).activeDays).toBe(0);
    expect(consistency({ current: idle, previous: [] }).rate).toBe(0);
    expect(rhythmShape(idle).activeRate).toBe(0);
    expect(vitals(idle, []).activeDays).toBe(0);
  });
});
