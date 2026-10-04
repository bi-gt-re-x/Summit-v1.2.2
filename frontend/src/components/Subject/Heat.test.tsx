/**
 * The subject's work calendar.
 *
 * The grid itself is `habitCalendar`, which has its own tests — what is
 * pinned here is everything this component decides on top of it: what a
 * square counts and what it leaves out, that the window is the reader's to
 * move and does not follow the page's, and that the sentence beside the map
 * cannot drift from what the map draws.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubjectHeat } from './Heat';
import type { AnalyticsTask } from '@/services/analytics';
import type { CalendarKey } from '@/utils/habits';

const TODAY = '2026-09-30';

let seq = 0;

/** A finished task in `maths`, on a given day. */
function did(day: string, over: Partial<AnalyticsTask> = {}): AnalyticsTask {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    status: 'done',
    priority: 'medium',
    subject: 'maths',
    xp_value: 30,
    created_at: day,
    completed_at: `${day}T10:00:00`,
    ...over,
  } as AnalyticsTask;
}

function ago(days: number): string {
  const at = new Date(`${TODAY}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - days);
  return at.toISOString().slice(0, 10);
}

const show = (mine: AnalyticsTask[], window: CalendarKey = '90') =>
  render(<SubjectHeat mine={mine} today={TODAY} subject="Mathematics" window={window} />);
const label = () => screen.getByRole('img').getAttribute('aria-label') ?? '';

/** Every square with a day behind it, in the drawn grid. */
const filled = () =>
  Array.from(document.querySelectorAll('.ax-heat-grid .ax-heat-cell:not(.is-blank)'));

describe('what the squares count', () => {
  it('labels the map with how many days had work', () => {
    /* No sentence under the map any more — the count is the "Turning up"
       row on the Evidence tab — but the map still says it to a screen reader. */
    show([did(ago(1)), did(ago(1)), did(ago(5))]);

    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/^2 of \d+ days with work in Mathematics$/);
  });

  it('counts a day once however many tasks are on it', () => {
    show([did(ago(2)), did(ago(2)), did(ago(2)), did(ago(2))]);

    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/^1 of /);
  });

  it('shades the busier day darker than the quieter one', () => {
    /* Quartiles of the window's own busiest day, so the map is legible on an
       account doing one task a week and on one doing ten a day. */
    show([did(ago(1)), did(ago(1)), did(ago(1)), did(ago(1)), did(ago(3))]);

    const levels = filled()
      .filter((cell) => cell.getAttribute('data-level') !== '0')
      .map((cell) => Number(cell.getAttribute('data-level')));

    expect(Math.max(...levels)).toBe(4);
    expect(Math.min(...levels)).toBeLessThan(4);
  });

  it('draws a day with nothing rather than leaving a hole in the grid', () => {
    /* A grid drawn only where there is data cannot tell a quiet Tuesday from
       a Tuesday before the account existed. */
    show([did(ago(1))]);

    const empty = filled().filter((cell) => cell.getAttribute('data-level') === '0');
    expect(empty.length).toBeGreaterThan(0);
  });

  it('says so plainly when nothing landed in the window', () => {
    show([did(ago(800))]);

    expect(screen.getByText(/Nothing finished in Mathematics in this window/))
      .toBeInTheDocument();
  });
});

describe('what stays out of it', () => {
  it('counts every task it is handed, because the caller has filtered', () => {
    /* Not a filter of its own, and this pins that rather than pretending
       otherwise: the page passes `mine`, which is already one subject's
       tasks. A component that filtered again would be a second place for
       "which subject is this" to be decided, and the two would disagree the
       first time one of them learned about archived subjects.

       The page-level guard that the right list is passed is in
       pages/SubjectAnalytics.narrative.test. */
    show([did(ago(1)), did(ago(2), { subject: 'code' })]);

    expect(label()).toMatch(/^2 of /);
  });

  it('counts only finished work', () => {
    show([
      did(ago(1)),
      did(ago(2), { status: 'todo', completed_at: undefined }),
    ]);

    expect(label()).toMatch(/^1 of /);
  });
});

describe('the window is the page’s', () => {
  it('draws more of the record when the page asks for a longer window', () => {
    /* It used to carry its own picker beside the page's; one range control
       per page now. */
    show([did(ago(1)), did(ago(200))], '90');
    expect(label()).toMatch(/^1 of /);
    cleanup();
    show([did(ago(1)), did(ago(200))], '365');
    expect(label()).toMatch(/^2 of /);
  });

  it('has no picker of its own', () => {
    show([did(ago(1))]);
    expect(screen.queryByRole('group', { name: 'Heatmap window' })).not.toBeInTheDocument();
  });

  it('turns into a month calendar under a month, and a map above one', () => {
    /* Four columns of squares is a strip, and it reads as a rendering fault
       however well it is sized. Same cells, turned on their side. */
    show([did(ago(1))]);
    expect(document.querySelector('.ax-heat-wide')).not.toHaveClass('is-calendar');
    cleanup();
    show([did(ago(1))], '7');
    expect(document.querySelector('.ax-heat-wide')).toHaveClass('is-calendar');
  });
});

describe('the map can be read by something other than eyes', () => {
  it('names the count on each square it draws', () => {
    show([did(ago(1)), did(ago(1))]);

    const two = filled().find((cell) => cell.getAttribute('title')?.includes('2 finished'));
    expect(two).toBeDefined();
  });

  it('gives the grid a label saying what it is a picture of', () => {
    show([did(ago(1))]);

    const grid = screen.getByRole('img');
    expect(grid).toHaveAccessibleName(/days with work in Mathematics/);
  });
});
