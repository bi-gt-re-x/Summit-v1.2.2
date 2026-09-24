/**
 * The focus session's day, and where its goal comes from.
 *
 * Two things that were wrong in the same hook and for the same reason: it read
 * the clock and the preferences at the moment it needed an answer, and never
 * asked again.
 *
 * **The day.** The record is keyed `focus:<user>:<date>`, which is right at the
 * moment a tab loads and wrong every moment after midnight — the state in
 * memory still held yesterday's banked seconds and the next write put them
 * under today's key. A dashboard left open overnight woke up having already
 * focused for six hours. The tests below move the clock rather than the code:
 * the day has to turn over under a mounted hook, because that is the only way
 * it ever went wrong.
 *
 * **The goal.** It was `focus_goal_hours` from Settings, while the account was
 * separately choosing a pomodoro level and style that say exactly how long its
 * day is meant to be. The order now is the day's own goal, then the method,
 * then Settings — see utils/pomodoroChoice.
 *
 * Both keys are spelled out literally rather than built from the code, for the
 * usual reason: a test that derives a key agrees with a rename, and these two
 * are read by the calendar's Focus card and by the timer respectively.
 */
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsContext } from '@/context/contexts';
import { settingsValue } from '@/test/render';
import { useFocusSession } from './useFocusSession';
import { POMODORO_CHANGED } from '@/utils/pomodoroChoice';
import type { Prefs } from '@/services/settings';

/** Late on a Sunday evening — ten minutes from the next day. */
const SUNDAY_NIGHT = new Date('2026-08-30T23:50:00');
const SUNDAY = 'focus:myles:2026-08-30';
const MONDAY = 'focus:myles:2026-08-31';

/** Where hooks/usePomodoro.ts keeps the chosen method. */
const POMODORO = 'pomodoro:myles';

function Probe() {
  const session = useFocusSession('myles');
  return (
    <>
      <span data-testid="focused">{Math.round(session.focused)}</span>
      <span data-testid="goal">{session.goalHours}</span>
      <span data-testid="running">{String(session.running)}</span>
      <button type="button" onClick={session.start}>
        start
      </button>
      <button type="button" onClick={session.stop}>
        stop
      </button>
    </>
  );
}

function draw(prefs: Partial<Prefs> = {}) {
  return render(
    <MemoryRouter>
      <SettingsContext.Provider value={settingsValue({ prefs })}>
        <Probe />
      </SettingsContext.Provider>
    </MemoryRouter>,
  );
}

const focused = () => Number(screen.getByTestId('focused').textContent);
const goal = () => Number(screen.getByTestId('goal').textContent);

/** Move the wall clock on, and let the hook's minute watch notice. */
async function passTime(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(SUNDAY_NIGHT);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.className = '';
});

describe('the day the session belongs to', () => {
  it('starts the new day at nothing, with a tab that never reloaded', async () => {
    // Two hours banked on Sunday, nothing running.
    localStorage.setItem(
      SUNDAY,
      JSON.stringify({ goalHours: null, accumulatedSeconds: 7200, runningSince: null }),
    );
    draw();
    expect(focused()).toBe(7200);

    await passTime(20 * 60_000); // past midnight, and past one minute watch

    expect(focused()).toBe(0);
    // …and Sunday is left exactly as Sunday left it. The bug this replaced
    // wrote the 7200 under Monday's key on the next save.
    expect(JSON.parse(localStorage.getItem(SUNDAY)!).accumulatedSeconds).toBe(7200);
    expect(localStorage.getItem(MONDAY)).toBeNull();
  });

  it('cuts a running session at midnight and gives each day its own half', async () => {
    draw();
    await act(async () => {
      screen.getByRole('button', { name: 'start' }).click();
    });

    // Ten minutes to midnight, then ten minutes past it.
    await passTime(20 * 60_000);

    // Still running — it is one sitting and the reader is still at it.
    expect(screen.getByTestId('running')).toHaveTextContent('true');
    // Monday has the ten minutes since midnight, not the twenty since starting.
    expect(focused()).toBeGreaterThanOrEqual(595);
    expect(focused()).toBeLessThanOrEqual(605);
    // Sunday was banked with its own ten, and stopped.
    const sunday = JSON.parse(localStorage.getItem(SUNDAY)!);
    expect(Math.round(sunday.accumulatedSeconds)).toBeGreaterThanOrEqual(595);
    expect(Math.round(sunday.accumulatedSeconds)).toBeLessThanOrEqual(605);
    expect(sunday.runningSince).toBeNull();
  });

  it('writes to the day the state belongs to, never to the clock’s', async () => {
    draw();
    await passTime(20 * 60_000); // now Monday

    await act(async () => {
      screen.getByRole('button', { name: 'start' }).click();
    });
    await passTime(60_000);
    await act(async () => {
      screen.getByRole('button', { name: 'stop' }).click();
    });

    expect(localStorage.getItem(MONDAY)).not.toBeNull();
    // Nothing was ever written under Sunday: there was nothing to write.
    expect(localStorage.getItem(SUNDAY)).toBeNull();
  });
});

describe('the goal the day is measured against', () => {
  it('follows the chosen pomodoro method', () => {
    // Level 2 is four sittings; classic's focus phase is 25 minutes. 4 x 25 is
    // 100 minutes, which `goalHoursFor` rounds to the half hour: 1.5.
    localStorage.setItem(POMODORO, JSON.stringify({ styleId: 'classic', levelId: 2 }));
    draw({ focus_goal_hours: 12 });

    expect(goal()).toBe(1.5);
  });

  it('moves when the method moves, without a reload', async () => {
    localStorage.setItem(POMODORO, JSON.stringify({ styleId: 'classic', levelId: 2 }));
    draw();
    expect(goal()).toBe(1.5);

    // What the timer does when the level is changed on it: writes, then says so.
    localStorage.setItem(POMODORO, JSON.stringify({ styleId: 'classic', levelId: 5 }));
    await act(async () => {
      window.dispatchEvent(new CustomEvent(POMODORO_CHANGED));
    });

    expect(goal()).toBe(4); // 10 sittings x 25 minutes
  });

  it('falls back to Settings for an account that has never opened the timer', () => {
    draw({ focus_goal_hours: 3 });
    expect(goal()).toBe(3);
  });

  it('lets the day’s own goal outrank both', () => {
    localStorage.setItem(POMODORO, JSON.stringify({ styleId: 'classic', levelId: 5 }));
    localStorage.setItem(
      SUNDAY,
      JSON.stringify({ goalHours: 2.5, accumulatedSeconds: 0, runningSince: null }),
    );
    draw({ focus_goal_hours: 12 });

    // Set on the day with the panel's +/-, which is a thing the reader said
    // about today and outranks anything said in general.
    expect(goal()).toBe(2.5);
  });
});
