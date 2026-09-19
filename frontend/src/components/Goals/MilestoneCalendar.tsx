/**
 * The year of checkpoints, laid out as months.
 *
 * ## Why a calendar, when the page already has rails
 *
 * The rails above answer "how does this one goal land" — one goal, in order,
 * ten rows deep. What they cannot show is the shape of a month: that the last
 * week of March carries four checkpoints across three goals and the two weeks
 * after it carry none. That is a question about density, and density is the
 * one thing a list is bad at and a grid is good at.
 *
 * So this is deliberately not a third list. Every cell is a day, its weight is
 * how many checkpoints land on it, and its colour is what state those are in.
 * Reading it should take about a second: dark clumps are crunch weeks, red is
 * something already missed, and the pale stretches are where there is room.
 *
 * ## What a day's colour means
 *
 * A day is coloured by the worst thing on it, in that order — late beats due,
 * due beats done. A day where two checkpoints were reached and one is overdue
 * is an overdue day; calling it done because two thirds of it went well is the
 * kind of averaging that makes a chart lie.
 *
 * ## Where the dates come from
 *
 * A reached checkpoint sits on `completed_at`, the day it actually happened.
 * An unreached one sits on `target_date`, the day it is meant to. Undated
 * checkpoints are not drawn at all and are counted in a line under the grid
 * instead: a calendar's whole claim is that position means time, and parking
 * "someday" on an arbitrary square breaks that claim for every other cell.
 */
import { useMemo, useState } from 'react';
import { categoryOf } from './Outcome';
import type { Goal, Milestone } from '@/types';
import { Icon } from '@/components/Icon';

/** Six rows of seven, always, so a month does not change height by starting on a Saturday. */
const CELLS = 42;

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Months on screen at once.
 *
 * Four is a quarter and a bit — long enough that the next crunch is almost
 * always already on it, short enough that each month keeps cells big enough to
 * click. Past that the grids shrink faster than the extra months are worth.
 */
const MONTHS = 4;

/** Where the window opens, relative to this month. One month of hindsight. */
const LOOK_BACK = 1;

export type MilestoneDay = {
  iso: string;
  entries: Array<{ goal: Goal; milestone: Milestone; done: boolean; late: boolean }>;
  /** The worst state on the day. Drives the cell's colour. */
  state: 'done' | 'due' | 'late';
};

/** Local-midnight ISO, so a date never slides a day by way of a timezone. */
function isoOf(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A day's label, read in local time.
 *
 * Not the page's `formatGoalDate`: that takes the string straight to
 * `new Date`, and a bare `YYYY-MM-DD` parses as UTC midnight there. Formatted
 * back into a timezone behind UTC that prints the day before — so a checkpoint
 * sitting in the 30th's square would call itself the 29th, which is precisely
 * the lie a calendar cannot tell. Building the date from its parts pins it to
 * local midnight, the same instant the grid placed it on.
 */
function dayLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Every dated checkpoint, keyed by the day it lands on.
 *
 * Exported because it is the whole model this view has: the grid below is a
 * loop over dates that reads this map, and the summary line reads its totals.
 */
export function milestoneDays(goals: Goal[], todayIso: string): Map<string, MilestoneDay> {
  const days = new Map<string, MilestoneDay>();

  for (const goal of goals) {
    for (const milestone of goal.milestones ?? []) {
      const done = milestone.status === 'done';
      const stamp = done ? milestone.completed_at : milestone.target_date;
      if (!stamp) continue;
      const iso = String(stamp).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;

      const late = !done && iso < todayIso;
      const day = days.get(iso) ?? { iso, entries: [], state: 'done' as const };
      day.entries.push({ goal, milestone, done, late });
      // Worst-wins, as the header comment says.
      day.state = day.entries.some((entry) => entry.late)
        ? 'late'
        : day.entries.some((entry) => !entry.done)
          ? 'due'
          : 'done';
      days.set(iso, day);
    }
  }

  return days;
}

export interface MilestoneCalendarProps {
  goals: Goal[];
  /** Opening a day's checkpoint opens the goal it belongs to — same as the rails. */
  onOpen: (goal: Goal) => void;
  today?: Date;
  months?: number;
}

export function MilestoneCalendar({
  goals,
  onOpen,
  today = new Date(),
  months = MONTHS,
}: MilestoneCalendarProps) {
  /** How many months the window has been paged from its resting position. */
  const [shift, setShift] = useState(0);
  /** The day whose checkpoints are listed under the grid. Null until one is picked. */
  const [picked, setPicked] = useState<string | null>(null);

  const todayIso = isoOf(today);
  const days = useMemo(() => milestoneDays(goals, todayIso), [goals, todayIso]);

  /** Checkpoints with no date at all — counted here, not drawn on a square. */
  const undated = useMemo(
    () =>
      goals.reduce(
        (count, goal) =>
          count +
          (goal.milestones ?? []).filter(
            (milestone) => milestone.status !== 'done' && !milestone.target_date,
          ).length,
        0,
      ),
    [goals],
  );

  const first = new Date(today.getFullYear(), today.getMonth() - LOOK_BACK + shift, 1);
  const grids = Array.from({ length: months }, (_, index) => {
    const anchor = new Date(first.getFullYear(), first.getMonth() + index, 1);
    // How far back the grid reaches for the Monday of the week the 1st is in.
    const lead = (anchor.getDay() + 6) % 7;
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1 - lead);
    return { anchor, start };
  });

  const openDay = picked ? days.get(picked) : undefined;

  if (days.size === 0) {
    return (
      <p className="gx-empty">
        No dated checkpoints yet. Date one on its rail above and it lands here.
      </p>
    );
  }

  return (
    <div className="gx-cal">
      <header className="gx-cal-head">
        <div className="gx-cal-nav">
          <button
            type="button"
            className="gx-cal-arrow"
            aria-label="Earlier months"
            onClick={() => setShift((n) => n - 1)}
          >
            <Icon name="chevron-left" />
          </button>
          <span className="gx-cal-span">
            {grids[0]!.anchor.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
            {' – '}
            {grids[grids.length - 1]!.anchor.toLocaleDateString(undefined, {
              month: 'short',
              year: 'numeric',
            })}
          </span>
          <button
            type="button"
            className="gx-cal-arrow"
            aria-label="Later months"
            onClick={() => setShift((n) => n + 1)}
          >
            <Icon name="chevron-right" />
          </button>
          {shift !== 0 && (
            <button type="button" className="gx-cal-today" onClick={() => setShift(0)}>
              Today
            </button>
          )}
        </div>

        <ul className="gx-cal-key">
          <li><i className="gx-cal-dot is-done" aria-hidden="true" />reached</li>
          <li><i className="gx-cal-dot is-due" aria-hidden="true" />due</li>
          <li><i className="gx-cal-dot is-late" aria-hidden="true" />overdue</li>
        </ul>
      </header>

      <div className="gx-cal-months">
        {grids.map(({ anchor, start }) => (
          <section className="gx-cal-month" key={`${anchor.getFullYear()}-${anchor.getMonth()}`}>
            <h3>{anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
            <div className="gx-cal-dow" aria-hidden="true">
              {DOW.map((letter, index) => (
                <span key={`${letter}${index}`}>{letter}</span>
              ))}
            </div>
            <div className="gx-cal-grid">
              {Array.from({ length: CELLS }, (_, index) => {
                const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
                const iso = isoOf(date);
                const day = days.get(iso);
                const outside = date.getMonth() !== anchor.getMonth();
                // Three steps of weight is all the eye can read at this size,
                // so four checkpoints and nine look the same on purpose.
                const load = day ? Math.min(day.entries.length, 3) : 0;
                const classes = [
                  'gx-cal-cell',
                  outside ? 'is-outside' : '',
                  iso === todayIso ? 'is-today' : '',
                  iso === picked ? 'is-picked' : '',
                  day ? `has-marks is-${day.state}` : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                const label = day
                  ? `${dayLabel(iso)} — ${day.entries.length} checkpoint${
                      day.entries.length === 1 ? '' : 's'
                    }`
                  : dayLabel(iso);

                return (
                  <button
                    key={iso}
                    type="button"
                    className={classes}
                    data-load={load || undefined}
                    title={label}
                    aria-label={label}
                    // An empty day has nothing to show, so it does not take the
                    // selection away from the day being read.
                    onClick={() => day && setPicked(iso === picked ? null : iso)}
                  >
                    <span>{date.getDate()}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {openDay ? (
        <div className="gx-cal-day">
          <h4>{dayLabel(openDay.iso)}</h4>
          <ul>
            {openDay.entries.map(({ goal, milestone, done, late }) => (
              <li key={milestone.id} className={`tone-${categoryOf(goal).tone}`}>
                <button type="button" onClick={() => onOpen(goal)}>
                  <span className="gx-cal-mark" aria-hidden="true">{done ? '✓' : late ? '!' : '•'}</span>
                  <span className="gx-cal-goal">{goal.title}</span>
                  <span className="gx-cal-title">{milestone.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="gx-cal-hint">
          Pick a marked day to see what lands on it.
          {undated > 0 && ` ${undated} checkpoint${undated === 1 ? ' has' : 's have'} no date yet and
            ${undated === 1 ? 'is' : 'are'} not drawn here.`}
        </p>
      )}
    </div>
  );
}
