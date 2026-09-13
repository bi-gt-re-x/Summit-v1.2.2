/**
 * The colour a month cell wears, and what it is allowed to mean.
 *
 * The grid has two colour systems now and keeping them apart is the whole
 * design. The XP bands are an *order* — a heavier day is a deeper cell — and
 * they stay one hue, because a scale drawn in four unrelated colours stops
 * being a scale; the note over `--mv-band-exceptional` in
 * styles/calendar/month.css records what happened the last time they were.
 *
 * `family` is the other question a month gets read for: not how heavy the
 * ninth was, but what it was *about*. It comes from the same twelve-family
 * palette the Week and Day views paint every block with, so a Tuesday spent on
 * machine learning is the same colour in all three views.
 *
 * What is worth pinning is where it stays null. A colour on this grid is a
 * claim about the day, and a day that never said what its work was should not
 * be making one.
 */
import { describe, expect, it } from 'vitest';
import { monthDays } from './monthSummary';
import { familyForSubject } from './eventPalette';
import { task } from '@/test/factories';
import type { Task } from '@/types';

function dated(day: number, xp: number, over: Partial<Task> = {}): Task {
  return task({
    id: `t${day}-${xp}-${Math.random()}`,
    xp_value: xp,
    show_on_calendar: true,
    due_date: `2026-09-${String(day).padStart(2, '0')}T10:00:00`,
    status: 'todo',
    ...over,
  });
}

/** The families the fixtures below lean on, read from the map rather than typed. */
const MATHS = familyForSubject('algebra');
const SCIENCE = familyForSubject('physics');

describe('the family a day takes', () => {
  it('is the subject of the work on it', () => {
    const [day] = monthDays(2026, 8, [dated(1, 300, { subject: 'algebra' })], {});
    expect(day?.family).toBe(MATHS);
  });

  it('is the family most of the day went on, not the one with most entries', () => {
    // Three small science tasks against one large maths one. Counting rows
    // would call this a science day; the day was mostly maths.
    const [day] = monthDays(2026, 8, [
      dated(1, 900, { subject: 'algebra' }),
      dated(1, 40, { subject: 'physics' }),
      dated(1, 40, { subject: 'physics' }),
      dated(1, 40, { subject: 'physics' }),
    ], {});
    expect(day?.family).toBe(MATHS);
  });

  it('still answers when nothing on the day scored', () => {
    // Every weight carries a +1, so a day of unscored work has a subject
    // rather than being drawn as empty. A calendar used for scheduling rather
    // than scoring is otherwise colourless.
    const [day] = monthDays(2026, 8, [
      dated(1, 0, { subject: 'physics' }),
      dated(1, 0, { subject: 'physics' }),
      dated(1, 0, { subject: 'algebra' }),
    ], {});
    expect(day?.family).toBe(SCIENCE);
  });

  it('takes calendar events as readily as tasks', () => {
    const [day] = monthDays(2026, 8, [], {
      '2026-9-1': {
        timestamps: [
          { startTime: '09:00', endTime: '10:00', task: 'Lab', xp: 200, family: 'orange' },
        ],
      },
    } as never);
    expect(day?.family).toBe('orange');
  });

  it('weighs an event against a task on the same day', () => {
    const [day] = monthDays(2026, 8, [dated(1, 80, { subject: 'algebra' })], {
      '2026-9-1': {
        timestamps: [
          { startTime: '09:00', endTime: '12:00', task: 'Lab', xp: 600, family: 'orange' },
        ],
      },
    } as never);
    expect(day?.family).toBe('orange');
  });
});

describe('where it stays null', () => {
  it('on a day with nothing on it', () => {
    const [day] = monthDays(2026, 8, [], {});
    expect(day?.family).toBeNull();
  });

  /**
   * The one that matters. `familyForSubject` answers 'gray' for an empty
   * string, so taking it unconditionally would paint a grey chip on every
   * subjectless task — a colour, on a grid where colour is a claim, saying
   * only that nobody filled the field in.
   */
  it('on work that never said what it was about', () => {
    const [day] = monthDays(2026, 8, [dated(1, 300), dated(1, 400)], {});
    expect(day?.family).toBeNull();
  });

  it('and the day is still counted in every other way', () => {
    const [day] = monthDays(2026, 8, [dated(1, 300)], {});
    expect(day?.family).toBeNull();
    expect(day?.events).toBe(1);
    expect(day?.xp).toBe(300);
    expect(day?.marks).toEqual(['good']);
  });
});

describe('it is stable', () => {
  it('gives the same answer for the same day twice', () => {
    const build = () => monthDays(2026, 8, [
      dated(1, 300, { subject: 'algebra' }),
      dated(1, 300, { subject: 'physics' }),
    ], {})[0]?.family;
    // A tie. It has to resolve the same way every render, or a cell changes
    // colour when something unrelated on the page re-renders it.
    expect(build()).toBe(build());
  });
});
