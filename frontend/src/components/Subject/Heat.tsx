/**
 * How much work has actually landed in this subject, day by day.
 *
 * ## Why the page needed one
 *
 * Every other figure on the subject page is a rate, a mean or a composite:
 * execution 47, quality 43, momentum +5, "falls off at Hard". All of them are
 * about *how the work goes* and none of them about *how much of it there is,
 * and when*. A reader who has not opened this subject in three weeks and a
 * reader who has worked it every day get the same page, because nothing above
 * the folds counts days.
 *
 * A calendar of squares answers that in one look, and it is the one shape
 * that answers it without a sentence: the gaps are as legible as the dark
 * squares, and a fortnight off is a white band nobody has to be told about.
 *
 * ## It is the same calendar the habits tab draws
 *
 * Deliberately, down to the class names. `habitDays` and `habitCalendar` in
 * utils/habits already build this grid out of a task list, and the `.ax-heat`
 * rules in styles/analytics.css already draw it at two shapes — a week per
 * column above a month, and the ordinary month calendar below one, where a
 * strip of four columns would read as a rendering fault. The only thing this
 * adds is the filter: these are one subject's tasks rather than the account's.
 *
 * Reusing it is not only less code. Two heatmaps in one app that shade by
 * different rules, or that turn over the week on different days, are two
 * readers' worth of confusion for no gain.
 *
 * ## Its own window, not the page's
 *
 * The page's picker runs 7D to All Time and scopes every figure above. This
 * does not follow it, for the reason the habits calendar gives: seven days is
 * seven squares and not a map, All Time on a three-year account is a decade
 * of them, and "what does my rhythm look like" is asked at whatever zoom the
 * reader wants regardless of what the rest of the page is scoped to. Keeping
 * them separate also means moving this does not silently rewrite the verdict
 * at the top of the page.
 */
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { CALENDAR_WINDOWS, habitCalendar, habitDays, type CalendarKey } from '@/utils/habits';
import type { AnalyticsTask } from '@/services/analytics';
import type { Task } from '@/types/models';

/* Sunday first, matching the order `habitCalendar` builds a week in. Only the
   alternate days are named: seven three-letter labels down a 22px column is a
   wall of text beside the map, and S M T W T F S has two pairs that read
   identically. */
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sun', '', 'Tue', '', 'Thu', '', 'Sat'];

/** "Mar 14, 2026" from an ISO date. */
function pretty(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export interface SubjectHeatProps {
  /** Every task filed under this subject, unwindowed — this picks its own. */
  mine: AnalyticsTask[];
  /** Today, passed so the grid is a pure function of its inputs. */
  today: string;
  /** For the sentence under the map. */
  subject: string;
}

/**
 * The calendar, its window chips, and one sentence saying what it shows.
 *
 * The sentence is not decoration. A grid of squares says "here is the shape
 * of it" and leaves the reader to count; the line says how many days out of
 * how many, which is the figure they would otherwise be estimating off the
 * fill. Both, because one of them is the answer and the other is the texture.
 */
export function SubjectHeat({ mine, today, subject }: SubjectHeatProps) {
  const [window, setWindow] = useState<CalendarKey>('90');

  /* Unwindowed on the way in: `habitCalendar` cuts the range itself, and
     handing it a pre-cut list would make the map's window the page's. The
     floor is a date no record predates rather than a computed first day —
     the map only ever reads the days it draws. */
  const byDate = useMemo(
    () => habitDays(mine as unknown as Task[], '0001-01-01', today),
    [mine, today],
  );

  /* How far back All Time is allowed to go. `habitCalendar` caps it at three
     years anyway; this keeps a young account from drawing two blank years
     around a fortnight of squares. */
  const accountDays = useMemo(() => {
    const first = [...byDate.keys()].sort()[0];
    if (!first) return 30;
    const ms = new Date(`${today}T00:00:00`).getTime() - new Date(`${first}T00:00:00`).getTime();
    return Math.max(30, Math.round(ms / 86_400_000) + 1);
  }, [byDate, today]);

  const rows = useMemo(
    () => habitCalendar(byDate, today, window, accountDays),
    [accountDays, byDate, today, window],
  );

  /* Counted off the drawn grid rather than off `byDate`, so the sentence and
     the picture can never disagree about what the window holds. */
  const { worked, covered, finished } = useMemo(() => {
    let workedDays = 0;
    let coveredDays = 0;
    let done = 0;
    rows.forEach((row) => {
      row.days.forEach((cell) => {
        if (!cell.date) return;
        coveredDays += 1;
        if (cell.count > 0) {
          workedDays += 1;
          done += cell.count;
        }
      });
    });
    return { worked: workedDays, covered: coveredDays, finished: done };
  }, [rows]);

  if (!rows.length) return null;

  /* The month calendar below a month, the week-per-column map above one. Same
     cells in the same order either way — see `.ax-heat-wide.is-calendar` in
     styles/analytics.css for why a four-column strip is not a map. */
  const asCalendar = window === '7' || window === '30';

  return (
    <div className="sb-heat">
      <div className="sb-heat-head">
        <div>
          <h3 className="sb-sub">How much you work on this</h3>
          <p className="sb-heat-say">
            {worked === 0 ? (
              <>Nothing finished in {subject} in this window.</>
            ) : (
              <>
                <strong>{worked}</strong> of {covered} days had work in {subject},{' '}
                <strong>{finished}</strong> {finished === 1 ? 'task' : 'tasks'} in all.
              </>
            )}
          </p>
        </div>
        <div className="ax-chips ax-chips-sm" role="group" aria-label="Heatmap window">
          {CALENDAR_WINDOWS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`ax-chip${option.key === window ? ' is-on' : ''}`}
              aria-pressed={option.key === window}
              onClick={() => setWindow(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* The column count goes to CSS as a number because a square here has a
          maximum size, and the width that follows from it is arithmetic no
          intrinsic sizing can do — the grid clips its overflow, so it will
          not state a width of its own. Same reasoning as the habits tab. */}
      <div
        className={`ax-heat ax-heat-wide${asCalendar ? ' is-calendar' : ''}`}
        style={{ '--ax-heat-weeks': rows.length } as CSSProperties}
      >
        <div className="ax-heat-days" aria-hidden="true">
          {WEEKDAY_NAMES.map((day, index) => (
            <span key={index}>{day || WEEKDAY_INITIALS[index]}</span>
          ))}
        </div>
        <div className="ax-heat-main">
          <div className="ax-heat-months" aria-hidden="true">
            {rows.map((row, index) => (
              <span key={index}>{row.label.slice(0, 1)}</span>
            ))}
          </div>
          <div
            className="ax-heat-grid"
            role="img"
            aria-label={`${worked} of ${covered} days with work in ${subject}`}
          >
            {rows.map((row, index) => (
              <div className="ax-heat-week" key={index}>
                {row.days.map((cell, cellIndex) => (
                  <span
                    key={cellIndex}
                    className={`ax-heat-cell${cell.date ? '' : ' is-blank'}`}
                    data-level={cell.level}
                    title={
                      cell.date
                        ? `${pretty(cell.date)} · ${cell.count} finished`
                        : undefined
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ax-heat-key">
        <span>One square a day</span>
        <span className="ax-heat-key-scale">
          Less
          {[0, 1, 2, 3, 4].map((level) => (
            <i key={level} className="ax-heat-cell" data-level={level} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
