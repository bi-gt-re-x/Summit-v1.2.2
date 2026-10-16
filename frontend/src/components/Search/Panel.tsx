/**
 * The top bar's search: two categories, a cursor, and no Enter key.
 *
 * ## What it looks for
 *
 * **Tasks** — the account's own work, matched by the server
 * (`/api/tasks/search`), because the task list is the largest thing this app
 * owns and filtering it in the browser is what the top bar used to do.
 *
 * **Components** — the containers the app is made of: pages, the tabs inside
 * them, the sections of Settings. Matched locally against utils/siteIndex,
 * which is where the words a reader actually types are written down.
 *
 * Both are scored on one scale, so "the closest match" means something across
 * the two of them rather than within each.
 *
 * ## It takes you there rather than waiting for Enter
 *
 * The closest match is the cursor's first position and the app goes there.
 * `›` steps to the next match and goes there too; `‹` steps back. So the way
 * to use this is to type until you can see where you are, then walk the
 * matches until the page behind the panel is the one you wanted — which is
 * faster than reading a list, and is the whole reason the arrows are the
 * control rather than a highlighted row waiting on a keypress.
 *
 * Enter still works. It closes the panel, because by then you are already
 * where it would have sent you.
 *
 * ## The keyboard is the whole control, not a shortcut for it
 *
 * Focus never leaves the box, so every key has to work from there:
 *
 *   Down / Up      the next and previous match
 *   Right / Left   the same, but only from the end and the start of the text,
 *                  so typing and correcting still own the caret. They are here
 *                  because the buttons on screen are `›` and `‹`, and a
 *                  control the eye is told to use should answer to the key it
 *                  is drawn as.
 *   Enter          close; you are already there
 *   Escape         close, and put the reader back where they started
 *
 * It is a combobox in the ARIA sense — `role="combobox"` on the box, a listbox
 * of options beneath it, and `aria-activedescendant` naming the one the cursor
 * is on. That last part is what makes this usable with a screen reader at all:
 * the reader's focus is in a text field the entire time, so nothing would be
 * announced as they stepped without it.
 *
 * Escape is handled here as well as by the bar's own listener
 * (components/Topbar.tsx). A `type="search"` box treats Escape as "clear me"
 * and stops it there, so the panel would empty and stay open — and a reader
 * pressing Escape twice would find themselves somewhere they never chose,
 * because clearing the box empties the matches.
 *
 * ## Where a task actually is
 *
 * A task the calendar knows about — `show_on_calendar` with a date on it —
 * lives on a day, so that is where the reader is taken: the Day view, opened
 * on that day, scrolled to the block. Everything else is a list item nobody
 * chose a time for, and lives on the tasks page. Sending both to `/tasks`
 * would be sending half of them to the page they are *not* on, which is the
 * one thing a search must not do.
 *
 * Only unfinished tasks are searched (`searchTasks(..., true)`). This panel's
 * answer to a match is to go there, and there is nothing to go to on a task
 * that is done.
 *
 * ## Why the navigation is an effect on the cursor
 *
 * Every path into this — typing, the arrows, the keyboard, clicking a row —
 * ends in "the cursor is now at N". Navigating from each of those separately
 * is four chances to disagree; navigating from the cursor is one. It is also
 * what makes the behaviour honest while typing: the list is recomputed on
 * change, the cursor lands back on the closest match, and the effect moves the
 * page only when that match is somewhere the reader is not.
 *
 * Replaced rather than pushed. A dozen keystrokes must not become a dozen
 * entries in the history — the reader's Back should be the page they were on
 * before they opened the search, not the eleventh thing the search flew past.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { tasks as taskService } from '@/services';
import { isCalendarPlaced } from '@/utils/calendarGrid';
import { isoDate } from '@/utils/dates';
import { findPlaces, placePoints, score } from '@/utils/siteIndex';
import type { Place } from '@/utils/siteIndex';
import type { Task } from '@/types';
import '@/styles/search.css';

/** How many of each category the panel lists. Enough to choose from. */
const PER_CATEGORY = 6;

/** How long the typing has to settle before the server is asked. */
const SETTLE_MS = 180;

/* The listbox and its options need ids for `aria-controls` and
   `aria-activedescendant` to point at. There is one search panel in the app
   and it is mounted only while open, so a fixed prefix is enough. */
const LIST_ID = 'sf-matches';
const optionId = (hit: Hit) => `sf-option-${hit.key.replace(/[^\w-]/g, '-')}`;

export interface Hit {
  key: string;
  kind: 'component' | 'task';
  name: string;
  /** The line under the name: where it lives, or what the task is worth. */
  meta: string;
  /** Where going to it means going. */
  to: string;
  points: number;
}

/**
 * Where a task is, which is not the same question as where tasks are.
 *
 * `isCalendarPlaced` is the calendar's own rule for what it will draw
 * (utils/calendarGrid, and the note on `useCalendarTasks` for why it is the
 * only door): flagged `show_on_calendar`, and dated. Those sit on a day, and
 * the Day view opened on that day is where the reader means. The rest are list
 * items nobody chose a time for, and the tasks page is where they are.
 *
 * The id rides along either way, so stepping between two task matches is a
 * move rather than the same page twice: pages/Tasks reveals the row and marks
 * it, pages/Calendar/Day scrolls the grid to the block.
 */
export function taskTo(task: Task): string {
  const id = encodeURIComponent(task.id);
  if (isCalendarPlaced(task) && task.due_date) {
    const day = new Date(task.due_date);
    if (!Number.isNaN(day.getTime())) {
      return `/calendar/day?date=${isoDate(day)}&task=${id}`;
    }
  }
  return `/tasks?task=${id}`;
}

function taskHit(needle: string, task: Task): Hit {
  return {
    key: `task:${task.id}`,
    kind: 'task',
    name: task.title,
    /* Where it will take you, said out loud. Two tasks with the same words in
       them can live on two different screens, and the reader is entitled to
       know which one the arrow is about to open. */
    meta: isCalendarPlaced(task) ? 'Calendar' : 'Tasks',
    to: taskTo(task),
    points: score(needle, task.title),
  };
}

function placeHit(needle: string, place: Place): Hit {
  return {
    key: `place:${place.id}`,
    kind: 'component',
    name: place.name,
    meta: place.where || 'Page',
    to: place.to,
    points: placePoints(needle, place),
  };
}

export interface SearchPanelProps {
  /** Close the panel — following a match by hand should not leave it open. */
  onClose: () => void;
}

export function SearchPanel({ onClose }: SearchPanelProps) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Task[]>([]);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const needle = query.trim();

  /*
   * The task half, from the server.
   *
   * Debounced rather than sent per keystroke, and the guard is a ticket rather
   * than a cancel: replies arrive out of order, and the one that matters is
   * the one for the text currently in the box.
   */
  const ticket = useRef(0);
  useEffect(() => {
    if (!needle) {
      setFound([]);
      return;
    }
    const mine = ++ticket.current;
    const timer = window.setTimeout(() => {
      void taskService.searchTasks(needle, true).then((result) => {
        if (mine !== ticket.current) return;
        setFound(result.success ? result.tasks.slice(0, PER_CATEGORY) : []);
      });
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [needle]);

  /** The component half, which needs nobody's permission and is instant. */
  const places = useMemo(
    () => (needle ? findPlaces(needle, PER_CATEGORY) : []),
    [needle],
  );

  const components = useMemo(
    () => places.map((place) => placeHit(needle, place)),
    [places, needle],
  );

  const hits = useMemo(
    () => found.map((task) => taskHit(needle, task)),
    [found, needle],
  );

  /**
   * Both categories on one scale, closest first.
   *
   * A task the server returned that the scorer gives nothing to still counts —
   * the server matches on a substring the same way, so a zero here means the
   * two disagree about wording rather than that the task is not a match. It
   * sorts last rather than disappearing.
   */
  const all = useMemo(
    () => [...components, ...hits].sort((a, b) => b.points - a.points),
    [components, hits],
  );

  /* Back to the closest match whenever the matches change — which is what
     makes typing feel like steering rather than like a list refreshing under
     a selection that no longer means anything. */
  const shape = all.map((hit) => hit.key).join('|');
  useEffect(() => {
    setCursor(0);
  }, [shape]);

  const current = all[Math.min(cursor, Math.max(0, all.length - 1))];

  /*
   * The one place navigation happens.
   *
   * Guarded on the *destination* rather than on where the browser ended up,
   * and that distinction is load-bearing. Some of the app's paths are
   * redirects — `/calendar` sends you to whichever view the account prefers
   * (App.tsx) — so "navigate unless the location already matches" never
   * settles for those: the effect asks for `/calendar`, the router lands on
   * `/calendar/week`, the location no longer matches, and it asks again,
   * forever.
   *
   * Remembering what was last asked for ends it after one go. It also gets a
   * second thing right for free: a reader who clicks something on the page
   * while the panel is open is not dragged back to the match.
   *
   * `replace`, so a dozen keystrokes are one history entry rather than twelve
   * — Back should be the page they were on before they opened the search.
   *
   * And it waits for the typing to settle, on the same beat the task search
   * does. The list and the highlight move on every keystroke — that is what
   * makes it feel live — but the *page* does not, because "calendar" typed at
   * speed would otherwise drag the router through Calendar, Analytics,
   * Achievements and Notes on the way, fetching a lazy chunk for each. An arrow
   * press pays the same 180ms and nobody has ever noticed 180ms.
   */
  const here = pathname + search;
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!current || sent.current === current.to) return;
    const timer = window.setTimeout(() => {
      sent.current = current.to;
      if (current.to === here) return;
      navigate(current.to, { replace: true });
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [current, here, navigate]);

  const step = useCallback(
    (by: number) => {
      if (all.length < 2) return;
      setCursor((at) => (at + by + all.length) % all.length);
    },
    [all.length],
  );

  /**
   * Go somewhere now, and close.
   *
   * Clicking a row cannot go through the settled effect above: closing the
   * panel unmounts it, which clears the pending timer, so the click would
   * choose a destination and then never arrive at it. The cursor is moved as
   * well, so the two agree for the frame before the panel goes.
   */
  const goNow = useCallback(
    (hit: Hit) => {
      sent.current = hit.to;
      setCursor(all.indexOf(hit));
      onClose();
      if (hit.to !== here) navigate(hit.to, { replace: true });
    },
    [all, here, navigate, onClose],
  );

  const onKey = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      const box = event.currentTarget;

      if (event.key === 'Escape') {
        // Handled here as well as by the bar, because a `type="search"` box
        // swallows Escape to clear itself — which would empty the panel and
        // leave it open, and a second Escape would then be a jump to nowhere.
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        onClose();
        return;
      }

      // Down and Up always step. Right and Left step only from the ends of the
      // text, so the caret keeps them everywhere it could still use them —
      // and the two buttons on screen have the keys they are drawn as.
      const caret = box.selectionStart ?? 0;
      const spread = (box.selectionEnd ?? caret) !== caret;
      const atEnd = !spread && caret === box.value.length;
      const atStart = !spread && caret === 0;

      if (event.key === 'ArrowDown' || (event.key === 'ArrowRight' && atEnd)) {
        event.preventDefault();
        step(1);
      } else if (event.key === 'ArrowUp' || (event.key === 'ArrowLeft' && atStart)) {
        event.preventDefault();
        step(-1);
      }
    },
    [onClose, step],
  );

  const at = current ? all.indexOf(current) : -1;

  return (
    <div className="sf-panel">
      {/* A combobox in the ARIA sense: focus stays in the box the whole time,
          so `aria-activedescendant` is the only thing that can tell a screen
          reader which match the arrows have landed on. */}
      <input
        ref={inputRef}
        type="search"
        className="sf-input"
        placeholder="Search tasks and pages"
        role="combobox"
        aria-expanded={all.length > 0}
        aria-controls={LIST_ID}
        aria-autocomplete="list"
        aria-activedescendant={current ? optionId(current) : undefined}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKey}
      />

      {!needle ? (
        <p className="sf-empty">
          Two things are searched: your <strong>tasks</strong>, and the{' '}
          <strong>pages</strong> of the app, including every tab and settings section. You jump
          to the closest match as you type. Press <span className="sf-key">›</span> for the
          next one.
        </p>
      ) : all.length === 0 ? (
        <p className="sf-empty">Nothing matches "{needle}".</p>
      ) : (
        <>
          {/* Where you are, and the two controls that move it. `aria-live`
              rather than a label, because this line is the only announcement a
              step makes for a reader watching the page rather than the list. */}
          <div className="sf-cursor">
            <button
              type="button"
              className="sf-step"
              aria-label="Previous match (Up or Left)"
              disabled={all.length < 2}
              onClick={() => step(-1)}
            >
              ‹
            </button>
            <span className="sf-at" aria-live="polite">
              <strong>{current?.name}</strong>
              <em>
                {at + 1} of {all.length} ·{' '}
                {current?.kind === 'task' ? 'Tasks' : 'Components'}
              </em>
            </span>
            <button
              type="button"
              className="sf-step is-next"
              aria-label="Next match (Down or Right)"
              disabled={all.length < 2}
              onClick={() => step(1)}
            >
              ›
            </button>
          </div>

          {/* One listbox over both groups, because the cursor is one cursor:
              two would mean two `aria-activedescendant` targets and a reader
              being told they are in the second list when they are not. The
              headings are `role="presentation"` inside it for the same
              reason — they are a visual grouping, not a level of navigation. */}
          <div id={LIST_ID} role="listbox" aria-label="Matches" className="sf-groups">
            <Group
              label="Components"
              rows={components}
              current={current}
              onGo={goNow}
            />
            <Group label="Tasks" rows={hits} current={current} onGo={goNow} />
          </div>
        </>
      )}
    </div>
  );
}

function Group({
  label,
  rows,
  current,
  onGo,
}: {
  label: string;
  rows: Hit[];
  current: Hit | undefined;
  onGo: (hit: Hit) => void;
}) {
  if (!rows.length) return null;

  return (
    <div className="sf-group" role="presentation">
      <div className="sf-group-head" role="presentation">
        {label}
      </div>
      <div className="sf-list" role="presentation">
        {rows.map((hit) => (
          <div
            key={hit.key}
            id={optionId(hit)}
            role="option"
            aria-selected={hit.key === current?.key}
            tabIndex={-1}
            className={`sf-row${hit.key === current?.key ? ' is-at' : ''}`}
            /* A div with `role="option"` rather than a button: a button inside
               a listbox is two things claiming to be the control, and a screen
               reader announces it as a button rather than as one of N options.
               Nothing is lost — focus never comes here, the keyboard drives it
               from the box, and the click still goes. */
            onClick={() => onGo(hit)}
          >
            <span className={`sf-mark is-${hit.kind}`} aria-hidden="true" />
            <span className="sf-row-name">{hit.name}</span>
            <span className="sf-row-meta">{hit.meta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
