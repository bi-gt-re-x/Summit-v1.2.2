/**
 * The cycle, and the two things about it that are easy to get wrong.
 *
 * **Where the long break goes.** A four-round style has three short breaks and
 * one long one, not four and one — the long break replaces the fourth short
 * one rather than following it. Off by one here is a method that gives you an
 * extra fifteen minutes every cycle and quietly stops being the method.
 *
 * **Styles with no long break.** DeskTime and the ultradian rhythm are one
 * sitting and one rest; they are not four-round methods, and `rounds: 1` is how
 * the list says so. The walk has to produce `long` straight after focus for
 * those, never a short break, or they would rest twice in a row.
 */
import { describe, expect, it } from 'vitest';
import {
  BY_ID,
  DEFAULT_LEVEL,
  DEFAULT_STYLE,
  LEVELS,
  goalHoursFor,
  levelFor,
  NEARBY,
  RECOMMENDED,
  STYLES,
  clock,
  cycleMinutes,
  focusShare,
  lengthOf,
  next,
  styleFor,
  type Cycle,
} from './pomodoro';

/** Walk `count` phases from the start of a cycle. */
function walk(styleId: string, count: number): string[] {
  const style = styleFor(styleId);
  let cycle: Cycle = { phase: 'focus', done: 0 };
  const seen = [cycle.phase as string];
  for (let n = 0; n < count; n += 1) {
    cycle = next(style, cycle);
    seen.push(cycle.phase);
  }
  return seen;
}

describe('the list', () => {
  it('offers ten', () => {
    expect(STYLES).toHaveLength(10);
  });

  it('has no repeated id or name', () => {
    expect(new Set(STYLES.map((s) => s.id)).size).toBe(10);
    expect(new Set(STYLES.map((s) => s.name)).size).toBe(10);
  });

  it('is sorted by how long you sit, which is what the picker promises', () => {
    const lengths = STYLES.map((s) => s.focus);
    expect([...lengths].sort((a, b) => a - b)).toEqual(lengths);
  });

  it('describes every style in one short line', () => {
    // Capped, not just required. The cards carried three lines of prose each
    // and the page read as an essay; the numbers are in a bigger typeface than
    // any sentence, so a description long enough to restate them is one that
    // will not be read. One line, and the grid stays scannable.
    for (const style of STYLES) {
      expect(style.who.length).toBeGreaterThan(15);
      expect(style.who.length).toBeLessThanOrEqual(34);
      expect(style.who.split(' ').length).toBeLessThanOrEqual(7);
      expect(style.focus).toBeGreaterThan(0);
      expect(style.rest).toBeGreaterThan(0);
      expect(style.long).toBeGreaterThanOrEqual(style.rest);
      expect(style.rounds).toBeGreaterThanOrEqual(1);
    }
  });

  it('gives every style its own color and glyph', () => {
    // The grid is the only place all ten are seen together, and it is scanned
    // by colour before it is read. Two styles sharing a tint is two styles
    // nobody can tell apart at a glance.
    expect(new Set(STYLES.map((s) => s.tone)).size).toBe(10);
    expect(new Set(STYLES.map((s) => s.icon)).size).toBe(10);
  });

  it('falls back rather than throwing on an id it does not know', () => {
    // The id comes out of the reader's storage, which an older build wrote.
    expect(styleFor('a-style-that-was-removed').id).toBe(DEFAULT_STYLE);
    expect(styleFor(null).id).toBe(DEFAULT_STYLE);
    expect(styleFor(undefined).id).toBe(DEFAULT_STYLE);
    expect(styleFor('deep-work').id).toBe('deep-work');
  });
});

describe('walking a cycle', () => {
  it('puts the long break in place of the fourth short one', () => {
    // Classic: four focus intervals, three short breaks, then the long one.
    expect(walk('classic', 8)).toEqual([
      'focus', 'break',
      'focus', 'break',
      'focus', 'break',
      'focus', 'long',
      'focus',
    ]);
  });

  it('starts the round count again after the long break', () => {
    const style = BY_ID.classic!;
    let cycle: Cycle = { phase: 'focus', done: 3 };
    cycle = next(style, cycle);
    expect(cycle).toEqual({ phase: 'long', done: 4 });
    expect(next(style, cycle)).toEqual({ phase: 'focus', done: 0 });
  });

  it('keeps the count through a short break', () => {
    // Otherwise the display would read "round 1 of 4" through every break.
    const style = BY_ID.classic!;
    const afterFirst = next(style, { phase: 'focus', done: 0 });
    expect(afterFirst).toEqual({ phase: 'break', done: 1 });
    expect(next(style, afterFirst)).toEqual({ phase: 'focus', done: 1 });
  });

  it('never gives a one-round style a short break', () => {
    for (const id of ['desktime', 'ultradian', 'animedoro']) {
      const phases = walk(id, 6);
      expect(phases).not.toContain('break');
      expect(phases).toEqual([
        'focus', 'long', 'focus', 'long', 'focus', 'long', 'focus',
      ]);
    }
  });

  it('gives a two-round style one short break per cycle', () => {
    expect(walk('deep-work', 4)).toEqual(['focus', 'break', 'focus', 'long', 'focus']);
  });

  it('alternates work and rest forever, whatever the style', () => {
    for (const style of STYLES) {
      const phases = walk(style.id, 40);
      phases.forEach((phase, at) => {
        expect(phase === 'focus').toBe(at % 2 === 0);
      });
    }
  });
});

describe('the figures on the card', () => {
  it('lengths follow the phase', () => {
    const style = BY_ID.classic!;
    expect(lengthOf(style, 'focus')).toBe(25);
    expect(lengthOf(style, 'break')).toBe(5);
    expect(lengthOf(style, 'long')).toBe(15);
  });

  it('a cycle is its rounds of work, the breaks between, and the long one', () => {
    // Classic: 4x25 work, 3x5 break, 15 long.
    expect(cycleMinutes(BY_ID.classic!)).toBe(100 + 15 + 15);
    // A one-round style has no breaks in between to add.
    expect(cycleMinutes(BY_ID.ultradian!)).toBe(90 + 20);
  });

  it('the work share is a share of the whole cycle', () => {
    expect(focusShare(BY_ID.classic!)).toBe(77);
    expect(focusShare(BY_ID.ultradian!)).toBe(82);
    for (const style of STYLES) {
      expect(focusShare(style)).toBeGreaterThan(0);
      expect(focusShare(style)).toBeLessThan(100);
    }
  });
});

describe('the clock', () => {
  it('is mm:ss under an hour', () => {
    expect(clock(0)).toBe('00:00');
    expect(clock(9)).toBe('00:09');
    expect(clock(65)).toBe('01:05');
    expect(clock(1500)).toBe('25:00');
  });

  it('grows an hours column rather than showing 90:00', () => {
    expect(clock(3600)).toBe('1:00:00');
    expect(clock(5400)).toBe('1:30:00');
  });

  it('never shows a negative, which a late tick can ask for', () => {
    expect(clock(-5)).toBe('00:00');
  });
});

describe('what the setup offers', () => {
  it('recommends a style that exists, for every answer', () => {
    for (const id of Object.values(RECOMMENDED)) {
      expect(BY_ID[id]).toBeDefined();
    }
  });

  it('offers the recommendation among the three it shows', () => {
    // The last step is a choice with a default, not an announcement.
    for (const [sitting, offered] of Object.entries(NEARBY)) {
      expect(offered).toHaveLength(3);
      expect(offered).toContain(RECOMMENDED[sitting as keyof typeof RECOMMENDED]);
      for (const id of offered) expect(BY_ID[id]).toBeDefined();
    }
  });

  it('offers longer sittings for longer answers', () => {
    const shortest = (ids: string[]) => Math.min(...ids.map((id) => BY_ID[id]!.focus));
    expect(shortest(NEARBY.short)).toBeLessThan(shortest(NEARBY.medium));
    expect(shortest(NEARBY.medium)).toBeLessThan(shortest(NEARBY.long));
  });
});


describe('intensity', () => {
  it('offers five levels, harder meaning more sittings', () => {
    expect(LEVELS).toHaveLength(5);
    const targets = LEVELS.map((level) => level.target);
    expect([...targets].sort((a, b) => a - b)).toEqual(targets);
  });

  it('falls back to the default for an id it does not know', () => {
    expect(levelFor(99).id).toBe(DEFAULT_LEVEL);
    expect(levelFor(null).id).toBe(DEFAULT_LEVEL);
    expect(levelFor(2).id).toBe(2);
  });

  it('asks for more of the day at a longer style', () => {
    // The goal is the level's sittings times the style's own length, so the
    // same level means something different under Classic and Ultradian — which
    // is the point of choosing both.
    const level = levelFor(4);
    expect(goalHoursFor(level, BY_ID.classic!)).toBeLessThan(
      goalHoursFor(level, BY_ID.ultradian!),
    );
  });

  it('turns a level into a plausible number of hours', () => {
    // Level 4 on Classic is eight 25-minute sittings: 3h20, to the nearest half.
    expect(goalHoursFor(levelFor(4), BY_ID.classic!)).toBe(3.5);
    expect(goalHoursFor(levelFor(1), BY_ID.gentle!)).toBe(0.5);
  });
});
