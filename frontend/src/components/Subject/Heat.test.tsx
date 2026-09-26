/**
 * The subject's work calendar.
 *
 * The grid itself is `habitCalendar`, which has its own tests — what is
 * pinned here is everything this component decides on top of it: what a
 * square counts and what it leaves out, that the window is the reader's to
 * move and does not follow the page's, and that the sentence beside the map
 * cannot drift from what the map draws.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SubjectHeat } from './Heat';
import type { AnalyticsTask } from '@/services/analytics';

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

const show = (mine: AnalyticsTask[]) =>
  render(<SubjectHeat mine={mine} today={TODAY} subject="Mathematics" />);

/** Every square with a day behind it, in the drawn grid. */
const filled = () =>
  Array.from(document.querySelectorAll('.ax-heat-grid .ax-heat-cell:not(.is-blank)'));

describe('what the squares count', () => {
  it('says how many days had work and how much landed', () => {
    show([did(ago(1)), did(ago(1)), did(ago(5))]);

    const say = screen.getByText(/days had work in Mathematics/);
    expect(say).toHaveTextContent('2 of');
    expect(say).toHaveTextContent('3 tasks in all');
  });

  it('counts a day once however many tasks are on it', () => {
    /* The map is about showing up; the shade is about how much. A day with
       four tasks is one dark square, not four days. */
    show([did(ago(2)), did(ago(2)), did(ago(2)), did(ago(2))]);

    const say = screen.getByText(/days had work in Mathematics/);
    expect(say).toHaveTextContent('1 of');
    expect(say).toHaveTextContent('4 tasks in all');
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

    expect(screen.getByText(/days had work in Mathematics/)).toHaveTextContent('2 of');
  });

  it('counts only finished work', () => {
    show([
      did(ago(1)),
      did(ago(2), { status: 'todo', completed_at: undefined }),
    ]);

    expect(screen.getByText(/days had work in Mathematics/)).toHaveTextContent('1 of');
  });
});

describe('the window is the reader’s', () => {
  it('opens on ninety days', () => {
    show([did(ago(1))]);

    expect(screen.getByRole('button', { name: '90D' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('draws more of the record when a longer window is chosen', async () => {
    /* The page's own picker scopes every figure above this. This one does
       not follow it: seven days is seven squares and a year is a map, and
       "what does my rhythm look like" is asked at whatever zoom the reader
       wants. */
    show([did(ago(1)), did(ago(200))]);

    expect(screen.getByText(/days had work in Mathematics/)).toHaveTextContent('1 of');

    await userEvent.click(screen.getByRole('button', { name: '1Y' }));

    expect(screen.getByText(/days had work in Mathematics/)).toHaveTextContent('2 of');
  });

  it('turns into a month calendar under a month, and a map above one', async () => {
    /* Four columns of squares is a strip, and it reads as a rendering fault
       however well it is sized. Same cells, turned on their side. */
    show([did(ago(1))]);

    const map = document.querySelector('.ax-heat-wide')!;
    expect(map).not.toHaveClass('is-calendar');

    await userEvent.click(screen.getByRole('button', { name: '7D' }));
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
    expect(within(document.body).getByRole('group', { name: 'Heatmap window' }))
      .toBeInTheDocument();
  });
});
