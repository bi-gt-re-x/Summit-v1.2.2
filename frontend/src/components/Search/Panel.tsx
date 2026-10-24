/**
 * The top bar's search: a real text field in the bar, with the matches in a
 * drop-down right under it.
 *
 * ## What it looks for
 *
 * **Pages** — the containers the app is made of: pages, the tabs inside them,
 * the sections of Settings. Matched locally against utils/siteIndex, which is
 * where the words a reader actually types are written down. Instant.
 *
 * **Tasks** — the account's own unfinished work, matched by the server
 * (`/api/tasks/search`) once the typing settles.
 *
 * ## It stays put while you type
 *
 * It used to take you to the closest match on every keystroke, from a second
 * box in a floating panel. That made the page behind it jump around while the
 * reader was still deciding. Now nothing moves until they choose: a click on a
 * row, or Enter on the highlighted one. Up and Down move the highlight.
 *
 * The drop-down hangs off the field with `position: absolute`, so it never
 * pushes the page. Pages are listed above tasks and the two groups never mix,
 * so the slower half arriving late adds rows under what is already there
 * instead of reshuffling it. While a new task search is in flight the last
 * answer stays on screen, and "Nothing matches" waits for that answer too.
 *
 * ## Keys
 *
 *   Down / Up   move the highlight
 *   Enter       go to the highlighted match
 *   Escape      clear the box and close the drop-down
 *
 * It is a combobox in the ARIA sense: focus stays in the field, a listbox sits
 * beneath it, and `aria-activedescendant` names the highlighted option.
 *
 * ## Where a task actually is
 *
 * A task the calendar knows about (`show_on_calendar` with a date on it) lives
 * on a day, so that is where the reader is taken: the Day view, opened on that
 * day, scrolled to the block. Everything else is a list item and lives on the
 * tasks page.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tasks as taskService } from '@/services';
import { isCalendarPlaced } from '@/utils/calendarGrid';
import { isoDate } from '@/utils/dates';
import { findPlaces, placePoints, score } from '@/utils/siteIndex';
import type { Place } from '@/utils/siteIndex';
import type { Task } from '@/types';
import '@/styles/search.css';

/** How many of each category the drop-down lists. Enough to choose from. */
const PER_CATEGORY = 6;

/** How long the typing has to settle before the server is asked. */
const SETTLE_MS = 180;

const LIST_ID = 'sf-matches';
const optionId = (hit: Hit) => `sf-option-${hit.key.replace(/[^\w-]/g, '-')}`;

export interface Hit {
  key: string;
  kind: 'component' | 'task';
  name: string;
  /** The line beside the name: where it lives. */
  meta: string;
  /** Where going to it means going. */
  to: string;
  points: number;
}

/**
 * Where a task is. A task the calendar draws sits on a day, and the Day view
 * opened on that day is where the reader means. The rest are list items, and
 * the tasks page is where they are. The id rides along either way so the page
 * can reveal the row or scroll to the block.
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

export interface SearchFieldProps {
  /** Whether the drop-down may show. The bar owns this so one panel is open at a time. */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

/** What the bar can ask of the field: ⌘K and the rail put the caret in it. */
export interface SearchFieldHandle {
  focus: () => void;
}

export const SearchField = forwardRef<SearchFieldHandle, SearchFieldProps>(function SearchField(
  { open, onOpen, onClose },
  ref,
) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Task[]>([]);
  /** The text the task list in `found` answers, so we know when it's stale. */
  const [answered, setAnswered] = useState('');
  const [cursor, setCursor] = useState(0);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  const needle = query.trim();

  /*
   * The task half, from the server. Debounced, and guarded by a ticket so a
   * reply that arrives late for old text can't overwrite the current one.
   * The previous answer stays up until the new one lands, so the list doesn't
   * blink empty between keystrokes.
   */
  const ticket = useRef(0);
  useEffect(() => {
    const mine = ++ticket.current;
    if (!needle) {
      setFound([]);
      setAnswered('');
      return;
    }
    const timer = window.setTimeout(() => {
      void taskService.searchTasks(needle, true).then((result) => {
        if (mine !== ticket.current) return;
        // A routine is many tasks with one name, and six identical rows tell
        // the reader nothing. Keep the first of each name.
        const seen = new Set<string>();
        const unique = (result.success ? result.tasks : []).filter((task) => {
          const name = task.title.trim().toLowerCase();
          if (seen.has(name)) return false;
          seen.add(name);
          return true;
        });
        setFound(unique.slice(0, PER_CATEGORY));
        setAnswered(needle);
      });
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [needle]);

  const components = useMemo(
    () => (needle ? findPlaces(needle, PER_CATEGORY).map((place) => placeHit(needle, place)) : []),
    [needle],
  );

  const hits = useMemo(
    () => found.map((task) => taskHit(needle, task)).sort((a, b) => b.points - a.points),
    [found, needle],
  );

  /** Pages first, then tasks: the order they're drawn in, so the arrows walk down the screen. */
  const all = useMemo(() => [...components, ...hits], [components, hits]);

  // Back to the top whenever the text changes, and only then. Tasks landing
  // under the pages must not move a highlight the reader already placed.
  useEffect(() => {
    setCursor(0);
  }, [needle]);

  const at = all.length ? Math.min(cursor, all.length - 1) : -1;
  const current = at >= 0 ? all[at] : undefined;
  const settled = answered === needle;
  const showing = open && needle.length > 0;

  const reset = useCallback(() => {
    setQuery('');
    setCursor(0);
  }, []);

  const go = useCallback(
    (hit: Hit) => {
      reset();
      onClose();
      inputRef.current?.blur();
      navigate(hit.to);
    },
    [navigate, onClose, reset],
  );

  const onKey = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        reset();
        onClose();
        inputRef.current?.blur();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (current) go(current);
        return;
      }
      if (!all.length) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!open) onOpen();
        setCursor((c) => (Math.min(c, all.length - 1) + 1) % all.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCursor((c) => (Math.min(c, all.length - 1) - 1 + all.length) % all.length);
      }
    },
    [all.length, current, go, onClose, onOpen, open, reset],
  );

  return (
    <div className="topbar-search-field">
      <svg
        className="topbar-search-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        className="topbar-search-input"
        placeholder="Search..."
        aria-label="Search tasks and pages"
        role="combobox"
        aria-expanded={showing}
        aria-controls={LIST_ID}
        aria-autocomplete="list"
        aria-activedescendant={showing && current ? optionId(current) : undefined}
        autoComplete="off"
        spellCheck={false}
        value={query}
        onFocus={onOpen}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!open) onOpen();
        }}
        onKeyDown={onKey}
      />

      {showing && (
        <div className="topbar-panel topbar-search sf-panel">
          {all.length === 0 ? (
            <p className="sf-empty">{settled ? `Nothing matches "${needle}".` : 'Searching...'}</p>
          ) : (
            <div id={LIST_ID} role="listbox" aria-label="Matches" className="sf-groups">
              <Group label="Pages" rows={components} current={current} onGo={go} />
              <Group label="Tasks" rows={hits} current={current} onGo={go} />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

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
            // mousedown, not click: the field would blur first and the bar's
            // outside-click listener can close the list before a click lands.
            onMouseDown={(event) => {
              event.preventDefault();
              onGo(hit);
            }}
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
