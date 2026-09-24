/**
 * The pomodoro method an account has chosen, read without running the cycle.
 *
 * `hooks/usePomodoro.ts` owns the cycle — the phase, the clock, the day's
 * count — and one page at a time runs it. But two of the things it stores are
 * not about a cycle at all: the style and the level are a standing choice
 * about how this account works, and the day's focus goal is read straight off
 * them (`goalHoursFor`). `hooks/useFocusSession.ts` needs that goal and must
 * not start a second cycle to get it, so the choice is read from here.
 *
 * ## Why this file exists rather than an export from the hook
 *
 * The key and the two fields have to be written down somewhere, and there is
 * exactly one honest place for them: beside each other. Putting them in
 * usePomodoro and importing them into useFocusSession would work today and be
 * an import cycle the moment either hook needs a type from the other — and
 * usePomodoro already takes `UseFocusSession` as an argument, so half of it is
 * there already. This module imports nothing but the pure figures in
 * components/Timer/pomodoro, so nothing can import its way back round.
 *
 * usePomodoro is still the only *writer*. It builds its record on the key
 * below and announces a change with the event below; this file only ever
 * reads.
 */
import { goalHoursFor, levelFor, styleFor } from '@/components/Timer/pomodoro';

/** Where hooks/usePomodoro.ts keeps an account's cycle. */
export function pomodoroKey(user: string): string {
  return `pomodoro:${user}`;
}

/**
 * Announced by hooks/usePomodoro.ts whenever it writes.
 *
 * The same device as `EGG_UNLOCKED` in utils/easterEgg.ts and
 * `summit:stats-changed` in components/Rail.tsx: one fact, one direction, no
 * reply. Without it the Focus card would show the goal the level implied when
 * the dashboard mounted and go on showing it after the level moved — the two
 * are separate hooks reading one record, and localStorage tells nobody it has
 * changed inside a single tab.
 *
 * It fires on every write and not only on a change of style or level, because
 * the writer does not know which fields moved and a listener that re-reads a
 * number it already had is free.
 */
export const POMODORO_CHANGED = 'summit:pomodoro-changed';

/**
 * The focus goal, in hours, implied by the method this account has chosen.
 *
 * The level names a number of sittings and the style says how long a sitting
 * is, so the two together are already a statement about how much of the day
 * this account means to spend — which is exactly what a daily focus goal is.
 * Reading it off them is what stops the dashboard asking for four hours while
 * the timer is set up for seven.
 *
 * `null` means this account has never opened the timer, and it is a real
 * answer rather than a failure: an account that has not chosen a method has
 * not said anything about how long its day should be, and the caller falls
 * back to the figure in Settings. Once there is a record there is always a
 * number, because `styleFor` and `levelFor` both hand back the default for
 * anything they do not recognise — so a record from an older shape, a renamed
 * style or a hand-edited number lands on the figure the timer itself would
 * open on rather than on nothing.
 */
export function chosenGoalHours(user: string): number | null {
  let saved: { styleId?: unknown; levelId?: unknown };
  try {
    const raw = window.localStorage.getItem(pomodoroKey(user));
    if (!raw) return null;
    saved = JSON.parse(raw) as typeof saved;
  } catch {
    /* private mode, blocked site data, or a value that is not JSON */
    return null;
  }
  return goalHoursFor(
    levelFor(typeof saved.levelId === 'number' ? saved.levelId : undefined),
    styleFor(typeof saved.styleId === 'string' ? saved.styleId : undefined),
  );
}
