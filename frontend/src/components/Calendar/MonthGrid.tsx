/**
 * The month: six rows of seven, Monday first, drawn as a table of cells.
 *
 * It used to be twenty-eight bare numbers floating on the page, and a number
 * on its own says only that the day exists. Each cell now carries what the day
 * is actually holding — how many things are on it, what they are worth, and
 * how much of it got done — so the grid can be read as a map of the month
 * rather than as a date picker with shading.
 *
 * **A day with nothing on it says nothing.** It used to say "0 events" and
 * "0 XP", and in a month with a few busy days that is thirty cells of the same
 * two zeroes: the reader's eye has to skip past a paragraph of noise to find
 * the four days that are not empty. An empty day is now the number alone, and
 * the difference between an empty grid and a full one is visible from across
 * the room.
 *
 * The bar along a cell's foot is the day's tasks, done against scheduled. It
 * is the one thing the grid could not say before at all — the counts tell you
 * a day was busy and never whether it went well — and it is drawn as a rule
 * rather than a figure because forty-two of anything has to be readable
 * without being read.
 *
 * The number is a filled badge, coloured by what the day is worth. It used to
 * be shaded by priority-weighted load measured against the busiest day *on
 * screen*, which meant the same Tuesday changed colour when you stepped to a
 * month with a heavier day in it and no colour meant anything you could write
 * down. The bands are fixed now (`XP_BANDS` in utils/monthSummary) and the
 * legend under the grid says what each one is — which is the difference
 * between a heat map and a key. The bands are one hue, getting deeper as the
 * day gets heavier, rather than four unrelated colours: they are an order, and
 * an order drawn as green, navy, violet and red has to be looked up every time,
 * where pale-to-deep can be read straight off the cell. It also stops the
 * lightest band being the loudest thing on the grid — a month of weekends in
 * alarm red was the page scolding the reader for resting.
 *
 * Under the number is the day's main focus, with the icon its words suggest —
 * the primary of the note the Day view writes (hooks/useDayFocus). It is the
 * one thing on the cell the reader wrote rather than the app counted, so it
 * sits nearest the date and the figures come after it.
 *
 * Today is the one cell with a tinted background and carries a star; the day
 * the panel is showing carries a ring.
 *
 * The rows always add to six, so stepping between a five-row month and a
 * six-row one does not resize the grid under the reader's cursor. The days
 * that fill the corners belong to the neighbouring months and are drawn as
 * such — dimmed, and carrying no counts, because they are context rather than
 * content. Clicking one still goes there.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { XP_BANDS, xpBand, type MonthDay } from '@/utils/monthSummary';
import { iconUrlFor } from '@/utils/calendarIcons';
import { dates } from '@/utils';

/** Six rows of seven — the grid never changes height between months. */
const CELLS = 42;

/** Sunday first, and rotated to the week's opening day before it is drawn. */
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export interface MonthGridProps {
  year: number;
  month: number;
  /** The store key of the chosen day, "2026-8-6". */
  selectedKey: string | null;
  /** 1 for a Monday-first grid (the default), 0 for Sunday-first. From the
      account's preferences — see MiniMonth, which takes the same. */
  weekStart?: 0 | 1;
  /** Every day of the month, counted — see utils/monthSummary. */
  days: MonthDay[];
  /**
   * A day's main focus, by ISO date — '' for a day without one. The primary
   * of the day's note (hooks/useDayFocus), which is what the Week row shows
   * too. Absent, and no cell draws one.
   */
  focusOn?: (iso: string) => string;
  onStep: (delta: number) => void;
  /** Back to the current month, with today selected. */
  onToday: () => void;
  /** A day of this month, by its store key. */
  onSelect: (dateKey: string) => void;
  /**
   * A day of a neighbouring month. The view has to step there as well as
   * select it, which is why this is not `onSelect`.
   */
  onSelectOther: (date: Date) => void;
  /**
   * Something has been dropped on a day. Absent when the view offers no drag,
   * and the cells are then not drop targets at all rather than targets that
   * accept and discard.
   */
  onDropDay?: (date: Date) => void;
  /** True while something is being dragged, so the grid can show it is a target. */
  dropping?: boolean;
  /**
   * The name of the thing waiting to be given a day, when one is — the
   * keyboard's half of the drag. While it is set the grid is a day picker: it
   * says what it is holding, every cell is a target, and picking one moves the
   * card rather than selecting the day.
   */
  pending?: string | null;
  /** Give up on the move. Bound to Escape as well as to the strip's button. */
  onCancelPending?: () => void;
  /** The view switcher, rendered on the header's right-hand end. */
  tools?: React.ReactNode;
  /** Rendered under the dates, in the same column — the summary strip. */
  children?: React.ReactNode;
}

/** How many cells of the previous month the grid opens with.
 *
 * `getDay()` counts from Sunday, so it has to be rotated by the day the week
 * opens on before it means a column. `+ 7` keeps the modulo positive.
 */
function leadingBlanks(year: number, month: number, weekStart: 0 | 1): number {
  return (new Date(year, month, 1).getDay() - weekStart + 7) % 7;
}

export function MonthGrid({
  year,
  month,
  selectedKey,
  weekStart = 1,
  days,
  focusOn,
  onStep,
  onToday,
  onSelect,
  onSelectOther,
  onDropDay,
  dropping = false,
  pending = null,
  onCancelPending,
  tools,
  children,
}: MonthGridProps) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
  const thisMonth = today.getMonth() === month && today.getFullYear() === year;

  // The 42 dates the grid draws, whichever months they belong to. Built from
  // one running Date so the month boundaries take care of themselves.
  const cells = useMemo(() => {
    const first = new Date(year, month, 1 - leadingBlanks(year, month, weekStart));
    return Array.from({ length: CELLS }, (_, index) => {
      const date = dates.addDays(first, index);
      return {
        date,
        key: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
        inMonth: date.getMonth() === month && date.getFullYear() === year,
      };
    });
  }, [month, weekStart, year]);

  /** The seven headings, opening on the same day the cells do. */
  const names = useMemo(
    () => (weekStart === 1 ? [...DAY_NAMES.slice(1), DAY_NAMES[0]!] : DAY_NAMES),
    [weekStart],
  );

  const byKey = useMemo(
    () => new Map(days.map((day) => [day.key, day])),
    [days],
  );

  // --- moving about it with the keyboard ----------------------------------
  /**
   * Which cell is the grid's single tab stop.
   *
   * Every one of the forty-two used to be `tabIndex={0}`, so tabbing past the
   * calendar meant forty-two presses and there was no way to move *within* it
   * except more of them. A grid is one stop with arrows inside it — the
   * roving-tabindex pattern every date picker uses — and the stop is the day
   * the panel is already describing, so returning to the grid returns to where
   * the reader was.
   *
   * The fallbacks matter on a month nobody has picked a day in: today when it
   * is on screen, and the 1st otherwise, which are the two cells a reader
   * would look at first anyway.
   */
  const stopKey = useMemo(() => {
    const inGrid = (key: string | null) =>
      key !== null && cells.some((cell) => cell.inMonth && cell.key === key);
    if (inGrid(selectedKey)) return selectedKey;
    if (inGrid(todayKey)) return todayKey;
    return cells.find((cell) => cell.inMonth)?.key ?? null;
  }, [cells, selectedKey, todayKey]);

  const grid = useRef<HTMLDivElement>(null);
  /* Set by a keystroke and read by the effect under it. Focus is only moved
     when the reader moved it — a selection that came from a click, or from the
     Day view arriving with a `?date=`, must not steal it. */
  const viaKeys = useRef(false);

  useEffect(() => {
    if (!viaKeys.current) return;
    viaKeys.current = false;
    grid.current
      ?.querySelector<HTMLElement>(`[data-date="${CSS.escape(selectedKey ?? '')}"]`)
      ?.focus();
  }, [selectedKey]);

  /**
   * Arrows move the day, and the day moves the panel with it.
   *
   * Strictly, the ARIA grid pattern moves *focus* on an arrow and waits for
   * Enter to activate. A calendar is the case where that is wrong: the whole
   * point of moving across the month is to read what is on each day, and a
   * reader arrowing through a week with the right-hand column frozen on the
   * day they started from is being shown the wrong thing on purpose. So the
   * two travel together, and Enter is left working for anyone who expects it.
   *
   * A move that leaves the month goes through `onSelectOther`, which steps the
   * grid — so the last cell of January and the first of February are next to
   * each other, as they are in the year.
   */
  const moveBy = useCallback(
    (days_: number, from: Date) => {
      viaKeys.current = true;
      const to = dates.addDays(from, days_);
      const inMonth = to.getMonth() === month && to.getFullYear() === year;
      if (inMonth) {
        onSelect(`${to.getFullYear()}-${to.getMonth() + 1}-${to.getDate()}`);
      } else {
        onSelectOther(to);
      }
    },
    [month, onSelect, onSelectOther, year],
  );

  const onGridKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-date]');
      const key = cell?.dataset.date;
      if (!key) return;
      const [y, m, d] = key.split('-').map(Number);
      if (y === undefined || m === undefined || d === undefined) return;
      const at = new Date(y, m - 1, d);

      switch (event.key) {
        case 'ArrowLeft': moveBy(-1, at); break;
        case 'ArrowRight': moveBy(1, at); break;
        case 'ArrowUp': moveBy(-7, at); break;
        case 'ArrowDown': moveBy(7, at); break;
        // The week's ends, counted from the day the grid opens on rather than
        // from Sunday — Home on a Monday-first grid is Monday.
        case 'Home': moveBy(-((at.getDay() - weekStart + 7) % 7), at); break;
        case 'End': moveBy(6 - ((at.getDay() - weekStart + 7) % 7), at); break;
        // Safe here in a way they are not on the Week and Day views, where
        // they page a twenty-four hour scroller: this grid has nothing to
        // scroll, and they are what the date-picker pattern uses.
        case 'PageUp': viaKeys.current = true; onStep(-1); break;
        case 'PageDown': viaKeys.current = true; onStep(1); break;
        // Only meaningful while a card is waiting for a day, and only then is
        // it taken — Escape on an ordinary grid belongs to whatever is above it.
        case 'Escape':
          if (!pending) return;
          onCancelPending?.();
          break;
        default: return;
      }
      event.preventDefault();
    },
    [moveBy, onCancelPending, onStep, pending, weekStart],
  );

  // --- and dropping something on it ---------------------------------------
  /** The cell the pointer is over mid-drag, so it can say it will take it. */
  const [over, setOver] = useState<string | null>(null);

  /* One set of handlers, spread onto both kinds of cell — a day in the corner
     of the grid belongs to a neighbouring month, and dropping something on it
     is exactly as meaningful as dropping it on any other day. Absent when the
     view passes no `onDropDay`, so a grid with no drag behind it does not
     advertise itself as a target. */
  const dropProps = useCallback(
    (cell: { key: string; date: Date }) =>
      onDropDay
        ? {
            onDragOver: (event: React.DragEvent) => {
              // Without this the browser refuses the drop, and the cursor says
              // so before the reader has let go.
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            },
            onDragEnter: () => setOver(cell.key),
            onDragLeave: (event: React.DragEvent) => {
              // Only when the pointer has actually left this cell: moving over
              // a child fires a leave for the parent.
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setOver((current) => (current === cell.key ? null : current));
              }
            },
            onDrop: (event: React.DragEvent) => {
              event.preventDefault();
              setOver(null);
              onDropDay(cell.date);
            },
          }
        : {},
    [onDropDay],
  );

  /* A drag that ends anywhere else leaves the last cell lit, because no cell
     ever gets the drop that would clear it. */
  useEffect(() => {
    if (!dropping) setOver(null);
  }, [dropping]);

  return (
    <div className="mv-left">
      <div className="mv-header">
        <h2 className="mv-title">
          {dates.formatDate(new Date(year, month, 1), { month: 'long', year: 'numeric' })}
        </h2>
        <div className="mv-nav">
          <button
            type="button"
            className="mv-arrow"
            aria-label="Previous month"
            title="Previous month (K, or Page Up in the grid)"
            aria-keyshortcuts="K PageUp"
            onClick={() => onStep(-1)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5 8 12l7 7" />
            </svg>
          </button>
          <button
            type="button"
            className="mv-arrow"
            aria-label="Next month"
            title="Next month (J, or Page Down in the grid)"
            aria-keyshortcuts="J PageDown"
            onClick={() => onStep(1)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 5 7 7-7 7" />
            </svg>
          </button>
        </div>
        {/* Disabled on the month it would take you to, which is the only
            honest state for a button that would do nothing. */}
        <button
          type="button"
          className="mv-today"
          disabled={thisMonth}
          title="This month (T)"
          aria-keyshortcuts="T"
          onClick={onToday}
        >
          Today
        </button>
        {tools && <div className="mv-headtools">{tools}</div>}
      </div>

      {/* The headings and the cells are one card now. They were two objects
          with a gap between them, which left the grid reading as a table
          somebody had dropped a row of labels above rather than as the
          calendar it is. */}
      <div className="mv-card">
        {/* What the grid is holding, and the way out of holding it. A mode
            with no sign that it is on and no way to leave it is a trap, and
            this one can be entered from a menu three columns away. */}
        {pending && (
          <div className="mv-pending" role="status">
            <span className="mv-pending-what">
              Pick a day for <strong>{pending}</strong>
            </span>
            <button type="button" className="mv-pending-stop" onClick={onCancelPending}>
              Cancel
            </button>
          </div>
        )}
        <div className="mv-daynames" aria-hidden="true">
          {names.map((name, index) => (
            <div
              className={`mv-dayname${
                (weekStart === 1 ? index >= 5 : index === 0 || index === 6)
                  ? ' is-weekend'
                  : ''
              }`}
              key={name}
            >
              {name}
            </div>
          ))}
        </div>

        <div
          className={`mv-grid${dropping || pending ? ' is-dropping' : ''}`}
          role="grid"
          /* Said on the grid rather than on each of the forty-two cells: it is
             one control with one set of keys, and repeating the sentence
             forty-two times is what a screen reader would then read out. */
          aria-label="Days of the month. Arrow keys move a day, Page Up and Page Down a month."
          ref={grid}
          onKeyDown={onGridKeyDown}
        >
        {cells.map((cell) => {
          if (!cell.inMonth) {
            return (
              <div
                className={`mv-cell is-outside${over === cell.key ? ' is-over' : ''}`}
                key={cell.key}
                data-date={cell.key}
                role="button"
                tabIndex={-1}
                onClick={() => onSelectOther(cell.date)}
                {...dropProps(cell)}
              >
                <span className="mv-daynum">{cell.date.getDate()}</span>
              </div>
            );
          }

          const day = byKey.get(cell.key);
          const count = day?.events ?? 0;
          const xp = day?.xp ?? 0;
          const tasks = day?.tasks ?? 0;
          const done = day?.done ?? 0;
          const settled = Boolean(day?.settled);
          const weekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;
          const band = xpBand(xp);
          const isToday = cell.key === todayKey;
          const focus = focusOn ? focusOn(dates.isoDate(cell.date)) : '';

          const classes = [
            'mv-cell',
            isToday ? 'is-today' : '',
            cell.key === selectedKey ? 'is-selected' : '',
            count === 0 ? 'is-empty' : '',
            settled ? 'is-settled' : '',
            weekend ? 'is-weekend' : '',
            over === cell.key ? 'is-over' : '',
          ]
            .filter(Boolean)
            .join(' ');

          /* Said in full for a screen reader, because the cell itself says it
             in dots and a rule. An empty day is "nothing on it" rather than a
             recitation of zeroes, for the same reason it draws nothing. */
          const spoken = count
            ? `${count} ${count === 1 ? 'thing' : 'things'}, ${xp} XP`
              + (tasks ? `, ${done} of ${tasks} tasks done` : '')
            : 'nothing on it';

          return (
            <div
              className={classes}
              key={cell.key}
              data-date={cell.key}
              role="gridcell"
              aria-selected={cell.key === selectedKey}
              /* The one tab stop. Everything else in the grid is reached with
                 the arrows — see `stopKey` above. */
              tabIndex={cell.key === stopKey ? 0 : -1}
              aria-label={`${dates.formatDate(cell.date, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}: ${focus ? `focus ${focus}; ` : ''}${spoken}`}
              onClick={() => onSelect(cell.key)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onSelect(cell.key);
              }}
              {...dropProps(cell)}
            >
              <span className="mv-cell-top">
                <span className={`mv-daynum band-${band}`}>{cell.date.getDate()}</span>

                {/* Today wears a star and a finished day wears a tick, and no
                    day wears both — today is not finished until it is, and on
                    the day it is the tick is the better news. */}
                {settled ? (
                  <span
                    className="mv-cell-flag is-clear"
                    aria-hidden="true"
                    title="Everything on this day is done"
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                ) : isToday ? (
                  <span className="mv-cell-flag is-today" aria-hidden="true" title="Today">
                    <svg viewBox="0 0 24 24">
                      <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.8-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z" />
                    </svg>
                  </span>
                ) : null}
              </span>

              {/* The day's main focus, under its date. One line, ellipsised —
                  the full text is the hover title — because a cell is a
                  seventh of the grid and a focus is a phrase, not a
                  paragraph. The icon is guessed from the words, exactly as
                  the Day view's field guesses it as they are typed. */}
              {focus && (
                /* `data-family` is the day's subject, and it is the only
                   colour on this grid that is not the XP scale — see `family`
                   on MonthDay. styles/calendar/palette.css turns it into the
                   tint, the edge and the ink, so a Tuesday spent on machine
                   learning is the same colour here as its blocks are in the
                   Week and Day views. Absent on a day whose work says nothing
                   about what it was, and the chip is then the neutral it has
                   always been. */
                <span
                  className="mv-cell-focus"
                  data-family={day?.family ?? undefined}
                  title={focus}
                >
                  <i
                    className="cal-ico"
                    style={{ ['--ico' as string]: `url(${iconUrlFor(focus)})` }}
                    aria-hidden="true"
                  />
                  <span className="mv-cell-focus-text">{focus}</span>
                </span>
              )}

              {count > 0 && (
                <span className="mv-cell-meta">
                  <span className="mv-cell-events">
                    <i className="mv-cell-dot" aria-hidden="true" />
                    {count}
                  </span>
                  {xp > 0 && (
                    <span className="mv-cell-xp">{xp.toLocaleString()} XP</span>
                  )}
                </span>
              )}

              {/* The day's things, one segment each, in their own bands — so a
                  day reads as "four things, two of them big" without the reader
                  having to turn a number back into an impression. A finished
                  task's segment is filled; an unfinished one is the same colour
                  at a quarter strength, which is how the row doubles as the
                  day's progress. */}
              {day && day.marks.length > 0 && (
                <span className="mv-cell-marks" aria-hidden="true">
                  {day.marks.map((mark, index) => (
                    <i
                      key={index}
                      className={`mv-mark band-${mark}${index < done ? ' is-done' : ''}`}
                    />
                  ))}
                </span>
              )}
              {!day?.marks.length && tasks > 0 && (
                <span className="mv-cell-marks" aria-hidden="true" />
              )}
            </div>
          );
        })}
        </div>

        {/* The key. A colour that cannot be looked up is decoration, and the
            whole point of moving off "shaded against the busiest day on
            screen" was that these bands are fixed enough to be written down.
            Inside the card, under the cells it explains. */}
        <ul className="mv-legend">
          {XP_BANDS.map((entry) => (
            <li key={entry.key}>
              <i className={`mv-legend-dot band-${entry.key}`} aria-hidden="true" />
              {entry.label}
              {entry.note && <span className="mv-legend-note">({entry.note})</span>}
            </li>
          ))}
        </ul>
      </div>

      {children}
    </div>
  );
}
