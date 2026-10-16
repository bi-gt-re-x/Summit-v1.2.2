/**
 * The controls: a search, three menus, and two rows of chips.
 *
 * The split between the menus and the chips is the split between *rare* and
 * *constant*. Priority and subject are the two cuts a reader makes over and
 * over while working through a list, so they are chips — always visible, one
 * click, and the current state readable without opening anything. Status,
 * grouping and ordering are set once and left, so they are menus, where they
 * cost a click to reach and nothing to ignore.
 *
 * Every menu closes on Escape and on a click outside it, which is the whole of
 * `useDismiss`. Only one may be open at a time — they sit side by side and two
 * open panels would overlap each other.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Subject } from '@/services/subjects';
import type { GroupKey, SortKey, StatusFilter, TaskQuery } from './board';
import { GROUPS, PRIORITIES, SORTS, activeFilters, isFiltered } from './board';
import { XP_BANDS, type XpBand } from '@/utils/priority';

/** Subject chips shown before the rest go behind "+ More". */
const CHIPS = 7;

const STATUSES: Array<{ key: StatusFilter; label: string }> = [
  { key: 'open', label: 'Open tasks' },
  { key: 'done', label: 'Completed' },
  { key: 'all', label: 'Everything' },
];

/**
 * Close on Escape, or on a click outside — but only while actually open.
 *
 * The `open` guard is the whole of the fix for menus that opened, highlighted
 * and closed without ever changing anything. It was missing, so all three
 * menus kept a document `mousedown` listener registered at all times, and the
 * three of them share one `open` value — only one panel can be up at once.
 *
 * A click on an option inside the Group panel is therefore *outside* Filter's
 * ref and outside Sort's, so both of their listeners fired and both called
 * `onOpen(null)`. That is a state change on `mousedown`, so React unmounted
 * the panel — with the pointer still down and the option still under it. A
 * `click` only exists if mousedown and mouseup land on the same live element,
 * and by mouseup the option was gone. `onPick` never ran. The reader saw a
 * menu open, saw it close on the option they chose, and saw the list keep
 * exactly the order it had, which reads as "the sort does nothing" — and the
 * ordering, grouping and filtering underneath were correct the entire time and
 * were simply never asked for.
 *
 * The chips were never affected: they are plain buttons outside any menu, and
 * nothing unmounts them mid-click. That is why priority and subject filtered
 * while the three menus beside them did not.
 *
 * Every other dismissable in the app already guards this way — Topbar's
 * account menu, TaskRow's row menu, the page overflow in pages/Tasks.tsx. This
 * one is now the fourth rather than the exception.
 */
function useDismiss(onClose: () => void, open: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [onClose, open]);

  return ref;
}

function Menu({
  name,
  label,
  icon,
  open,
  onOpen,
  children,
  on,
  count,
  value,
}: {
  name: string;
  label: string;
  icon: React.ReactNode;
  open: boolean;
  onOpen: (name: string | null) => void;
  children: React.ReactNode;
  /** Whether this menu is holding a non-default setting. */
  on?: boolean;
  /** How many settings it is holding, when that is worth a number. */
  count?: number;
  /** The current choice, printed beside the label. */
  value?: string;
}) {
  const close = useCallback(() => onOpen(null), [onOpen]);
  const ref = useDismiss(close, open);

  return (
    <div className="tk-menu" ref={ref}>
      <button
        type="button"
        className={`tk-tool${open ? ' is-open' : ''}${on ? ' is-on' : ''}`}
        aria-expanded={open}
        onClick={() => onOpen(open ? null : name)}
      >
        {icon}
        <span className="tk-tool-label">{label}</span>
        {/* The setting itself, on the button. A menu whose state can only be
            read by opening it is a menu the reader opens to find out what they
            already chose. */}
        {value && <span className="tk-tool-value">{value}</span>}
        {count !== undefined && count > 0 && <span className="tk-tool-count">{count}</span>}
        <svg className="tk-tool-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="tk-menu-panel" role="menu">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * One option in a menu: a tick slot, a label, and the reason to pick it.
 *
 * The tick is a slot rather than a conditional glyph — it holds its width when
 * empty — so the labels sit on one left edge instead of stepping sideways as
 * the choice moves between them. The old items marked the current one with
 * colour and weight alone, which reads as emphasis rather than as selection
 * and disappears entirely for anyone who cannot see the violet.
 */
function Choice({
  on,
  label,
  hint,
  onPick,
}: {
  on: boolean;
  label: string;
  hint?: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={on}
      className={`tk-menu-item is-choice${on ? ' is-on' : ''}`}
      onClick={onPick}
    >
      <span className="tk-tick" aria-hidden="true">
        {on && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 13 4 4L19 7" />
          </svg>
        )}
      </span>
      <span className="tk-choice-body">
        <span className="tk-choice-label">{label}</span>
        {hint && <span className="tk-choice-hint">{hint}</span>}
      </span>
    </button>
  );
}

const ICON = {
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  filter: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h18M7 12h10M10 18h4" />
    </svg>
  ),
  group: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="2.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  sort: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4v16M7 20l-3-3M7 20l3-3" />
      <path d="M17 20V4M17 4l-3 3M17 4l3 3" />
    </svg>
  ),
};

const PRIORITY_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M12 4l9 16H3z" />
  </svg>
);

export interface ToolbarProps {
  query: TaskQuery;
  onQuery: (next: TaskQuery) => void;
  /** Only the subjects this account actually files things under. */
  subjects: Subject[];
  showing: number;
  total: number;
  /** What the list is cut into headings by. */
  group: GroupKey;
  onGroup: (key: GroupKey) => void;
}

export function Toolbar({
  query,
  onQuery,
  subjects,
  showing,
  total,
  group,
  onGroup,
}: ToolbarProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const box = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl-K puts the cursor in the search, which is the shortcut the
  // placeholder advertises. Advertising one and not binding it is worse than
  // not advertising it.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        box.current?.focus();
        box.current?.select();
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  const set = useCallback(
    (patch: Partial<TaskQuery>) => onQuery({ ...query, ...patch }),
    [onQuery, query],
  );

  const togglePriority = (priority: (typeof PRIORITIES)[number] | null) => {
    if (priority === null) return set({ priorities: [] });
    return set({ priorities: query.priorities.includes(priority) ? [] : [priority] });
  };

  // Multi-select, unlike priority: the bands are six narrow slices and
  // "Hard or Very Challenging" is the obvious thing to ask for. Clicking the
  // one that is on turns it off, so a single click still gets you back to all.
  const toggleBand = (band: XpBand | null) => {
    if (band === null) return set({ bands: [] });
    return set({
      bands: query.bands.includes(band)
        ? query.bands.filter((entry) => entry !== band)
        : [...query.bands, band],
    });
  };

  const toggleSubject = (id: string) => {
    const on = query.subjects.includes(id);
    set({ subjects: on ? query.subjects.filter((entry) => entry !== id) : [...query.subjects, id] });
  };

  const shown = more ? subjects : subjects.slice(0, CHIPS);
  const sort = SORTS.find((entry) => entry.key === query.sort);
  const groupEntry = GROUPS.find((entry) => entry.key === group);

  return (
    <div className="tk-toolbar">
      <div className="tk-toolbar-top">
        <label className="tk-search">
          <span className="tk-search-ico" aria-hidden="true">
            {ICON.search}
          </span>
          <input
            ref={box}
            type="search"
            value={query.search}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            onChange={(event) => set({ search: event.target.value })}
          />
          <kbd aria-hidden="true">⌘K</kbd>
        </label>

        <div className="tk-tools">
          <Menu
            name="filter"
            label="Filter"
            icon={ICON.filter}
            open={open === 'filter'}
            onOpen={setOpen}
            on={isFiltered(query)}
            count={activeFilters(query)}
          >
            <p className="tk-menu-head">Reach</p>
            <Choice
              on={query.horizon === 'week'}
              label="The next 7 days"
              hint="Plus anything without a date."
              onPick={() => set({ horizon: 'week' })}
            />
            <Choice
              on={query.horizon === 'all'}
              label="Everything dated"
              hint="No matter how far out."
              onPick={() => set({ horizon: 'all' })}
            />

            <p className="tk-menu-head">Show</p>
            {STATUSES.map((entry) => (
              <Choice
                key={entry.key}
                on={query.status === entry.key}
                label={entry.label}
                onPick={() => set({ status: entry.key })}
              />
            ))}

            {/* Priority and subject are chips below, and this is where the
                reader is told so. A Filter menu that silently excludes two of
                the five filters reads as a complete list of them. */}
            {(query.priorities.length > 0 || query.subjects.length > 0 || query.bands.length > 0) && (
              <>
                <p className="tk-menu-head">From the chips</p>
                {query.priorities.length > 0 && (
                  <button
                    type="button"
                    className="tk-menu-item is-chipnote"
                    onClick={() => set({ priorities: [] })}
                  >
                    <span>
                      {query.priorities.length === 1
                        ? `${query.priorities[0]![0]!.toUpperCase()}${query.priorities[0]!.slice(1)} priority`
                        : `${query.priorities.length} priorities`}
                    </span>
                    <span className="tk-menu-drop">Clear</span>
                  </button>
                )}
                {query.bands.length > 0 && (
                  <button
                    type="button"
                    className="tk-menu-item is-chipnote"
                    onClick={() => set({ bands: [] })}
                  >
                    <span>
                      {query.bands.length === 1
                        ? query.bands[0]
                        : `${query.bands.length} difficulties`}
                    </span>
                    <span className="tk-menu-drop">Clear</span>
                  </button>
                )}
                {query.subjects.length > 0 && (
                  <button
                    type="button"
                    className="tk-menu-item is-chipnote"
                    onClick={() => set({ subjects: [] })}
                  >
                    <span>
                      {query.subjects.length === 1
                        ? '1 subject'
                        : `${query.subjects.length} subjects`}
                    </span>
                    <span className="tk-menu-drop">Clear</span>
                  </button>
                )}
              </>
            )}

            {isFiltered(query) && (
              <button
                type="button"
                className="tk-menu-clear"
                onClick={() =>
                  set({ status: 'open', search: '', subjects: [], priorities: [], bands: [], horizon: 'week' })
                }
              >
                Clear filters
              </button>
            )}
          </Menu>

          <Menu
            name="group"
            label="Group"
            icon={ICON.group}
            open={open === 'group'}
            onOpen={setOpen}
            on={group !== 'due'}
            value={groupEntry?.label}
          >
            <p className="tk-menu-head">Headings by</p>
            {GROUPS.map((entry) => (
              <Choice
                key={entry.key}
                on={group === entry.key}
                label={entry.label}
                hint={entry.hint}
                onPick={() => onGroup(entry.key)}
              />
            ))}
            {/* The one pairing that cannot do what it says, said out loud
                rather than left to be noticed. See `groupTasks`. */}
            {group === 'due' && query.sort !== 'due' && (
              <p className="tk-menu-note">
                Date headings need a date order. Sorting by {sort?.noun} flattens the list:
                <button type="button" onClick={() => set({ sort: 'due' })}>
                  sort by due date
                </button>
                to get them back.
              </p>
            )}
          </Menu>

          <Menu
            name="sort"
            label="Sort"
            icon={ICON.sort}
            open={open === 'sort'}
            onOpen={setOpen}
            on={query.sort !== 'due' || query.descending}
            value={sort?.label}
          >
            <p className="tk-menu-head">Order by</p>
            {SORTS.map((entry) => (
              <Choice
                key={entry.key}
                on={query.sort === entry.key}
                label={entry.label}
                /* The direction in the words that fit this field — "highest
                   first", never "descending", which is meaningless here and
                   actively wrong for priority. */
                hint={query.descending ? entry.desc : entry.asc}
                onPick={() => set({ sort: entry.key as SortKey })}
              />
            ))}

            {/* Direction as a pair of choices rather than the footer toggle it
                was. That toggle sat in the `tk-menu-clear` slot, styled like the
                destructive action at the foot of the Filter menu, and printed
                the direction it would switch *to* — so the one place the
                current direction appeared said the opposite of it. */}
            {sort && (
              <>
                <p className="tk-menu-head">Direction</p>
                <Choice
                  on={!query.descending}
                  label={sort.asc[0]!.toUpperCase() + sort.asc.slice(1)}
                  onPick={() => set({ descending: false })}
                />
                <Choice
                  on={query.descending}
                  label={sort.desc[0]!.toUpperCase() + sort.desc.slice(1)}
                  onPick={() => set({ descending: true })}
                />
              </>
            )}
          </Menu>
        </div>
      </div>

      <div className="tk-chips">
        <div className="tk-chip-set">
          <span className="tk-chip-label">Priority</span>
          <button
            type="button"
            className={`tk-chip${query.priorities.length === 0 ? ' is-on' : ''}`}
            onClick={() => togglePriority(null)}
          >
            <span className="tk-chip-ico is-all" aria-hidden="true">
              {PRIORITY_ICON}
            </span>
            All
          </button>
          {PRIORITIES.map((priority) => (
            <button
              key={priority}
              type="button"
              className={`tk-chip${query.priorities.includes(priority) ? ' is-on' : ''}`}
              onClick={() => togglePriority(priority)}
            >
              <span className={`tk-chip-ico is-${priority}`} aria-hidden="true">
                {PRIORITY_ICON}
              </span>
              {priority[0]!.toUpperCase() + priority.slice(1)}
            </button>
          ))}
        </div>

        {/* The six difficulty bands, by name. They are a row of chips rather
            than a menu for the same reason priority is: a reader working
            through a list cuts by "what is big" over and over, and a control
            they have to open to read the state of is one they open to find out
            what they already chose. */}
        <div className="tk-chip-set">
          <span className="tk-chip-label">XP</span>
          <button
            type="button"
            className={`tk-chip${query.bands.length === 0 ? ' is-on' : ''}`}
            onClick={() => toggleBand(null)}
          >
            Any XP
          </button>
          {XP_BANDS.map((band) => (
            <button
              key={band.label}
              type="button"
              className={`tk-chip is-band${query.bands.includes(band.label) ? ' is-on' : ''}`}
              title={`${band.from} XP and up`}
              onClick={() => toggleBand(band.label)}
            >
              {band.label}
            </button>
          ))}
        </div>

        {subjects.length > 0 && (
          <div className="tk-chip-set">
            <span className="tk-chip-label">Subject</span>
            {shown.map((subject) => (
              <button
                key={subject.id}
                type="button"
                className={`tk-chip${query.subjects.includes(subject.id) ? ' is-on' : ''}`}
                onClick={() => toggleSubject(subject.id)}
              >
                {subject.label}
              </button>
            ))}
            {subjects.length > CHIPS && (
              <button type="button" className="tk-chip is-more" onClick={() => setMore(!more)}>
                {more ? 'Less' : `+ ${subjects.length - CHIPS} More`}
              </button>
            )}
          </div>
        )}
      </div>

      {showing !== total && (
        <p className="tk-showing">
          Showing {showing.toLocaleString()} of {total.toLocaleString()}
        </p>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// The bar that appears when rows are selected
// --------------------------------------------------------------------------
export interface BulkBarProps {
  count: number;
  busy: boolean;
  onComplete: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkBar({ count, busy, onComplete, onDelete, onClear }: BulkBarProps) {
  if (count === 0) return null;
  return (
    <div className="tk-bulk" role="status">
      <strong>
        {count} selected
      </strong>
      <button type="button" className="tk-bulk-do" disabled={busy} onClick={onComplete}>
        Complete
      </button>
      <button type="button" className="tk-bulk-do is-bad" disabled={busy} onClick={onDelete}>
        Delete
      </button>
      <button type="button" className="tk-bulk-clear" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
