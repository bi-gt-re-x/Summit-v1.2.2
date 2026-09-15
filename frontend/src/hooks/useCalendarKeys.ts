/**
 * Stepping the calendar from the keyboard.
 *
 * All three views carry a back arrow, a forward arrow and a Today button, and
 * until now only the mouse could reach any of them. A calendar is a thing you
 * page through — the arrows are the most-pressed controls on it — so needing a
 * pointer to move a week is the kind of gap that never looks urgent and makes
 * the view unusable for anyone who does not use one.
 *
 * ## Why J / K and not the arrow keys
 *
 * The obvious binding is taken twice over. The Week and Day views are a
 * twenty-four hour scroller, so ← ↑ → ↓ are how the reader moves *within* the
 * day; the Month grid is a grid, so the arrows move between its cells
 * (components/Calendar/MonthGrid.tsx). Binding them here as well would mean
 * the same key doing two things depending on where the focus happened to be,
 * which is worse than no shortcut.
 *
 * `PageUp` / `PageDown` are taken for the same reason — they scroll the grid,
 * and a calendar that cannot be paged with them is a calendar with a broken
 * scrollbar.
 *
 * So: `J` and `N` step forward, `K` and `P` step back, `T` goes to today.
 * That is Google Calendar's set, which is the nearest thing to a convention
 * this gesture has, and none of the five collides with scrolling or with the
 * grid.
 *
 * ## What it refuses to fire on
 *
 * Anything typed into a field, and anything typed while a dialog is open. The
 * calendar is full of both — a day's focus line, a block's name, the task and
 * event modals — and a letter shortcut that steps the week while somebody is
 * typing "just the notes" into a title is not a shortcut, it is a fault.
 * `contentEditable` is checked as well as the tag: a rich field is a `div`.
 * That test lives in utils/keys now — the lattice's shortcuts ask the same
 * question, and two copies of it would be two chances to forget the
 * `contenteditable` half.
 */
import { useEffect } from 'react';
import { claimed, typing } from '@/utils/keys';

export interface CalendarKeys {
  /** Move by whole periods — a day, a week or a month, whichever this view is. */
  onStep: (delta: number) => void;
  /** Back to the period holding today. */
  onToday: () => void;
  /** False while a dialog is up, so the shortcuts stand down. */
  enabled?: boolean;
}

export function useCalendarKeys({ onStep, onToday, enabled = true }: CalendarKeys): void {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      // A modifier means the key belongs to the browser or the OS — ⌘T is a
      // new tab, and taking it would be taking something that is not ours.
      if (claimed(event) || typing(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === 'j' || key === 'n') onStep(1);
      else if (key === 'k' || key === 'p') onStep(-1);
      else if (key === 't') onToday();
      else return;

      event.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, onStep, onToday]);
}
