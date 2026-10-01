/**
 * The week strip on the Current Streak card.
 *
 * Seven marks, worked out from the streak rather than fetched — a request per
 * dashboard for a row of dots would be a request for a decoration. The streak,
 * the last day it was extended and the day its grace last covered are enough
 * to place the run exactly (`runMarks` in StatCards.tsx).
 *
 * Those last two are recent. Before them the strip assumed a streak of *n* was
 * the *n* days ending today, which ticked today before anything was finished
 * on it and drew a forgiven day as a worked one. Both are pinned below.
 *
 * Three more things are worth pinning and only one of them is the arithmetic.
 *
 * The first is that a **day in the future is not a missed day**. A Friday
 * drawn as empty-and-failed on a Wednesday is the app telling somebody they
 * have lost a day that has not started, which is the single worst thing a
 * streak widget can do.
 *
 * The second is that the week **starts where the rest of the app starts it**.
 * The calendar honours `week_starts_on`; a dashboard that always began on
 * Monday would put a different day under the same column.
 *
 * The third is that the strip **never claims a day the streak cannot vouch
 * for**. A run of three says nothing about the far side of the day that broke
 * it, so an earlier day in the same week stays empty even if it was worked.
 * That is a real limit of reading this off a streak and it is asserted here so
 * nobody later "fixes" it into a lie.
 */
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsContext } from '@/context/contexts';
import { settingsValue, statsValue } from '@/test/render';
import { StatsContext } from '@/context/contexts';
import { StreakCard } from './StatCards';
import { stats as makeStats } from '@/test/factories';
import type { Prefs } from '@/services/settings';
import type { UserStats } from '@/types';

/** A Thursday, so there are days on both sides of today inside the week. */
const THURSDAY = new Date('2026-09-24T10:00:00');

function draw(streak: number, prefs: Partial<Prefs> = {}, days: Partial<UserStats> = {}) {
  return render(
    <MemoryRouter>
      <SettingsContext.Provider value={settingsValue({ prefs })}>
        <StatsContext.Provider value={statsValue()}>
          <StreakCard
            stats={makeStats({ current_streak: streak, best_streak: 293, ...days })}
          />
        </StatsContext.Provider>
      </SettingsContext.Provider>
    </MemoryRouter>,
  );
}

/** The seven marks, in the order they are drawn. */
function days() {
  return within(screen.getByRole('list', { name: 'This week' })).getAllByRole('listitem');
}

const names = () => days().map((day) => day.querySelector('.dash-week-name')!.textContent);
const done = () => days().filter((day) => day.classList.contains('is-done'));
const doneNames = () => done().map((day) => day.querySelector('.dash-week-name')!.textContent);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(THURSDAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the week strip', () => {
  it('draws seven days, Monday first', () => {
    draw(0);
    expect(names()).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });

  it('starts on Sunday when the account does', () => {
    draw(0, { week_starts_on: 'sunday' });
    expect(names()).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });

  it('fills today and back, one mark per day of the run', () => {
    draw(3); // Thursday, and the Tuesday and Wednesday before it
    expect(doneNames()).toEqual(['Tue', 'Wed', 'Thu']);
  });

  it('leaves the rest of the week alone, however long the run', () => {
    // A 293-day streak has still not happened on Friday.
    draw(293);
    expect(doneNames()).toEqual(['Mon', 'Tue', 'Wed', 'Thu']);
  });

  it('marks nothing on a broken streak, and does not blame tomorrow for it', () => {
    draw(0);
    expect(done()).toHaveLength(0);
    // The three days still to come are not drawn as missed either — there is
    // one class for "in the run" and no class at all for "not".
    expect(names()).toHaveLength(7);
  });

  it('rings today whether or not it has been earned', () => {
    draw(0);
    const ringed = days().filter((day) => day.classList.contains('is-today'));
    expect(ringed).toHaveLength(1);
    expect(ringed[0]!.querySelector('.dash-week-name')).toHaveTextContent('Thu');
  });

  it('says in words what each dot is, for a reader who cannot see it', () => {
    draw(2); // Wednesday and Thursday
    const said = days().map((day) => day.querySelector('.dash-week-say')!.textContent);
    expect(said).toEqual([
      'not yet', // Mon — before the run
      'not yet', // Tue
      'done', // Wed
      'done', // Thu, today
      'still to come', // Fri
      'still to come', // Sat
      'still to come', // Sun
    ]);
  });
});

describe('the week strip, placed by the days the run actually covers', () => {
  const TUESDAY = '2026-09-22';
  const WEDNESDAY = '2026-09-23';
  const THURSDAY_ISO = '2026-09-24';
  const forgiven = () =>
    days()
      .filter((day) => day.classList.contains('is-forgiven'))
      .map((day) => day.querySelector('.dash-week-name')!.textContent);

  it('does not tick today before anything is finished on it', () => {
    // Three days in a row up to yesterday; Thursday is still open.
    draw(3, {}, { last_task_date: WEDNESDAY });
    expect(doneNames()).toEqual(['Mon', 'Tue', 'Wed']);
  });

  it('ticks today once something is', () => {
    draw(3, {}, { last_task_date: THURSDAY_ISO });
    expect(doneNames()).toEqual(['Tue', 'Wed', 'Thu']);
  });

  it('draws a forgiven day as forgiven, not worked, and reaches one further back for it', () => {
    // Four worked days and Tuesday covered by grace: Sun (last week), Mon, Wed, Thu.
    draw(4, {}, { last_task_date: THURSDAY_ISO, streak_grace_day: TUESDAY });
    expect(doneNames()).toEqual(['Mon', 'Wed', 'Thu']);
    expect(forgiven()).toEqual(['Tue']);
    const tuesday = days()[1]!;
    expect(tuesday.querySelector('.dash-week-say')).toHaveTextContent(
      'missed, covered by your grace day',
    );
    expect(tuesday.querySelector('svg')).toBeInTheDocument();
  });

  it('shows yesterday as covered while today is still open', () => {
    // Worked Tuesday, missed Wednesday (grace already written down), nothing yet today.
    draw(9, {}, { last_task_date: TUESDAY, streak_grace_day: WEDNESDAY });
    expect(doneNames()).toEqual(['Mon', 'Tue']);
    expect(forgiven()).toEqual(['Wed']);
  });

  it('ignores a grace day left over from before the run began', () => {
    draw(2, {}, { last_task_date: THURSDAY_ISO, streak_grace_day: '2026-09-21' });
    expect(doneNames()).toEqual(['Wed', 'Thu']);
    expect(forgiven()).toEqual([]);
  });

  it('marks nothing at all on a broken streak, grace day or not', () => {
    draw(0, {}, { last_task_date: '2026-09-20', streak_grace_day: TUESDAY });
    expect(done()).toHaveLength(0);
    expect(forgiven()).toEqual([]);
  });
});
