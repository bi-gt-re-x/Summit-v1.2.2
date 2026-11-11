/**
 * The note on a day — "Focus" — shared by all three calendar views.
 *
 * The Week view's per-day row, the Day view's field and the Month view's
 * "Today's focus…" box are the same note, and they were kept in step by a
 * global (`window.DayFocus`) that every script wrote through. A hook is the
 * same idea with the wiring visible: one cache, one writer, and any view that
 * calls it re-renders when the note changes.
 *
 * ## One note, up to five focuses
 *
 * It was one line. A day usually has more than one thing worth naming, so the
 * Day view now takes up to five — a primary and four after it.
 *
 * They are stored in the one field, newline-separated, and that is a deliberate
 * choice rather than a shortcut. The note is a single string in localStorage,
 * in the server's `day_focus` map and in whatever a Jinja-served page reads;
 * splitting it into five would mean five keys, five endpoints and a migration,
 * to hold something that is a list of short phrases. A newline is a separator
 * no single-line input can produce, so a note written before this reads back as
 * a list of exactly one and nothing has to be converted.
 *
 * The Week and Month views show the **primary** and edit only that — see
 * `primary` and `setPrimary`, which leave the rest of the list untouched. A
 * multi-line string in their single-line inputs would render as the lines run
 * together, and neither view has room for five anyway.
 *
 * Three copies again, and the order matters. localStorage is the synchronous
 * one, under the Week view's historic key (`wkDayFocus:<user>:<iso>`) so a
 * page still served by Jinja reads the same note; the server copy follows the
 * account to another browser and is hydrated on mount; and React state is what
 * the views actually render. A keystroke writes the first two immediately and
 * the third after 800ms of quiet, because a note is typed a character at a
 * time and the endpoint should not be.
 *
 * Ported from day-focus.js.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { focus as focusService } from '@/services';

/** How long typing has to stop before the note is sent. */
const PUSH_DELAY_MS = 800;

/**
 * The most focuses one day can carry.
 *
 * Five, because the row has to stay a row: the Day view lays them across the
 * width of the grid's header, and a sixth would either wrap it onto a second
 * line or squeeze every field past reading. It is also about the honest limit
 * of the thing being named — a day with six equal priorities has none.
 */
export const MAX_DAY_FOCUSES = 5;

/**
 * A stored note as its list of focuses, longest-standing first.
 *
 * Blank lines are dropped rather than kept as empty slots: the list is what the
 * day is carrying, and an empty field the reader has opened but not filled in
 * is the editor's business, not the note's.
 */
export function focusList(text: string): string[] {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_DAY_FOCUSES);
}

/** The list back as one stored note. The inverse of `focusList`. */
export function joinFocuses(items: string[]): string {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_DAY_FOCUSES)
    .join('\n');
}

function storageKey(username: string | null, iso: string): string {
  return `wkDayFocus:${username || 'Default'}:${iso}`;
}

function readCached(username: string | null, iso: string): string {
  try {
    return localStorage.getItem(storageKey(username, iso)) || '';
  } catch {
    return '';
  }
}

export interface UseDayFocus {
  /** The whole stored note for a day. Never null — an empty day is ''. */
  get: (iso: string) => string;
  set: (iso: string, text: string) => void;
  /** The day's focuses, up to five. The Day view's editor works on these. */
  list: (iso: string) => string[];
  setList: (iso: string, items: string[]) => void;
  /** The first one — what the Week and Month views show. '' when there is none. */
  primary: (iso: string) => string;
  /** Replace the first one, leaving any others on the day alone. */
  setPrimary: (iso: string, text: string) => void;
}

export function useDayFocus(username: string | null): UseDayFocus {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Pull the account's saved notes over the local cache. The server is
  // authoritative here: it is the copy that followed the account from another
  // browser, and the local one may be this machine's stale idea of the week.
  useEffect(() => {
    if (!username) return;
    let live = true;

    void focusService.dayNotes().then((result) => {
      if (!live || !result.success) return;
      const fetched = result.day_focus || {};
      Object.entries(fetched).forEach(([iso, text]) => {
        try {
          localStorage.setItem(storageKey(username, iso), text);
        } catch {
          /* private mode: the server copy is still the one that matters */
        }
      });
      // The server sends every note the account has, so a cached one it doesn't
      // have was cleared somewhere else (another browser, a reset) and is stale.
      // A note typed here since the page opened is the one exception: its save
      // may still be on its way.
      try {
        const prefix = storageKey(username, '');
        for (let at = localStorage.length - 1; at >= 0; at -= 1) {
          const key = localStorage.key(at);
          if (!key || !key.startsWith(prefix)) continue;
          const iso = key.slice(prefix.length);
          if (!(iso in fetched) && !(iso in timers.current)) localStorage.removeItem(key);
        }
      } catch {
        /* private mode: nothing cached to clear */
      }
      setNotes((current) => {
        const typed = Object.fromEntries(Object.entries(current).filter(([iso]) => iso in timers.current));
        return { ...fetched, ...typed };
      });
    });

    return () => {
      live = false;
    };
  }, [username]);

  // Whatever is in flight when the page goes away should still be sent.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      Object.values(pending).forEach(clearTimeout);
    };
  }, []);

  const get = useCallback(
    (iso: string) => notes[iso] ?? readCached(username, iso),
    [notes, username],
  );

  const set = useCallback(
    (iso: string, text: string) => {
      setNotes((current) => ({ ...current, [iso]: text }));
      try {
        if (text) localStorage.setItem(storageKey(username, iso), text);
        else localStorage.removeItem(storageKey(username, iso));
      } catch {
        /* private mode: the note lives for this session only */
      }

      if (!username) return;
      clearTimeout(timers.current[iso]);
      timers.current[iso] = setTimeout(() => {
        void focusService.setDayNote(iso, text).catch(() => {
          /* offline: the local copy stands, and the next edit retries */
        });
      }, PUSH_DELAY_MS);
    },
    [username],
  );

  const list = useCallback((iso: string) => focusList(get(iso)), [get]);

  const setList = useCallback(
    (iso: string, items: string[]) => set(iso, joinFocuses(items)),
    [set],
  );

  const primary = useCallback((iso: string) => list(iso)[0] ?? '', [list]);

  const setPrimary = useCallback(
    (iso: string, text: string) => {
      // The rest of the day's focuses are not this field's to lose. A cleared
      // primary promotes the second rather than leaving a hole at the top,
      // which is what `joinFocuses` dropping blanks already does.
      const [, ...rest] = list(iso);
      set(iso, joinFocuses([text, ...rest]));
    },
    [list, set],
  );

  return { get, set, list, setList, primary, setPrimary };
}
