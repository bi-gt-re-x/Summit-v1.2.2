/**
 * The Week view's overview column.
 *
 * Every panel is scoped to the week on screen rather than to "now" — stepping
 * back a week steps all of them back. That is what makes the column readable:
 * every number on it answers a question about the same seven days.
 *
 * The shape follows the design: This Week Progress leads with a ring and the
 * week's three figures over a per-day XP sparkline, then XP by Subject and
 * Tasks by Priority, then Streaks as seven dots, then what is coming, the
 * week's focus time, and last of all the way through to the month.
 *
 * "XP by Subject" was once five invented rows — Math 160, Coding 140 — because
 * splitting XP by subject needed a subject on a task and the table had no such
 * column. It was replaced by an honest bar chart of XP per day, which turned
 * out to be the sparkline in the panel above drawn twice the size. Tasks now
 * carry a subject, so the panel asks the question it was named for and the
 * numbers under it are real. See utils/subjectXp.
 *
 * "View Full Calendar" is at the foot of the column rather than inside
 * Upcoming. Inside that card it read as the list's footer — a way to see more
 * of what was in it — where it is really the way out of the week, and so the
 * last thing the column offers rather than a part of one of its panels.
 *
 * Weekly Focus Time is not here. It was, for a while — a figure about the week
 * belongs with the figures about the week — but the design pins it to the
 * bottom-left corner of the grid, and that is where it is: `WeekFocusCard`
 * below, placed by pages/Calendar/Week.tsx.
 *
 * Two panels this column used to carry, the weekly focus note and Top
 * Priorities, are gone with them. Neither is in the design, and Top Priorities
 * is a card the dashboard already draws.
 */
import { useMemo } from 'react';
import { MiniMonth } from './MiniMonth';
import { Overview } from './Overview';
import type { DayLoad } from '@/utils/calendarBusy';
import { fmtHM } from '@/hooks/useFocusSession';
import { useCountUp } from '@/hooks/useCountUp';
import { OTHER_KEY, type SubjectXp } from '@/utils/subjectXp';
import { Icon, type IconName } from '@/components/Icon';

export interface WeekStats {
  total: number;
  done: number;
  rate: number;
  xp: number;
}

/** Focused against planned across the week, in seconds. */
export interface WeekFocus {
  focused: number;
  planned: number;
}

/** One day of the week, for the sparkline, the charts and the streak dots. */
export interface WeekDay {
  /** Mon…Sun, single letter. */
  initial: string;
  /** "Mon" — the whole abbreviation, for the charts' hover text. */
  name: string;
  /** XP earned that day. */
  xp: number;
  /** Seconds focused that day. */
  focused: number;
  /** Seconds that day's goal asked for. */
  planned: number;
  /** Whether anything was completed. Drives the streak dot. */
  active: boolean;
  /** A day that has not happened yet is drawn hollow, not missed. */
  future: boolean;
  today: boolean;
}

/** One priority band's share of the week. */
export interface PriorityRow {
  /** `low` | `medium` | `high` — the grid's own class suffix. */
  key: string;
  label: string;
  count: number;
  done: number;
  /** XP actually earned in this band. */
  xp: number;
}

export interface UpcomingEntry {
  id: string;
  icon: IconName;
  title: string;
  /** "Aug 4, 2026" */
  date: string;
  /** "4:30 PM", or "All Day". */
  when: string;
}

/**
 * The month at the head of the column, and the week it has banded.
 *
 * The cursor is the caller's because paging the month must not move the week —
 * see MiniMonth. `from`/`to` are the seven days on screen, which is what the
 * band draws and the reason this panel leads the column: every figure below it
 * is about those seven days, and until now the only thing saying *which* seven
 * was the date range in the header, on the far side of the grid.
 */
export interface WeekMini {
  year: number;
  month: number;
  /** The first and last day of the week on screen. */
  from: string;
  to: string;
  /** The day the week opens on, so the band lands on one row. See MiniMonth. */
  weekStart: 0 | 1;
  /** Which days of the month on show have anything on them. See MiniMonth. */
  load?: DayLoad;
  onStep: (delta: number) => void;
  /** Moves the week to the one the picked day falls in. */
  onPick: (iso: string) => void;
}

export interface WeekSidebarProps {
  mini: WeekMini;
  /** Opens the subject library in place of this column. */
  onOpenLibrary: () => void;
  stats: WeekStats;
  streak: number;
  /** Focused against planned across the week — the last card in the column. */
  focus: WeekFocus;
  days: WeekDay[];
  /** The week's earned XP by subject, five rows and Other. */
  breakdown: SubjectXp;
  /** The week's tasks by priority band, low first. */
  priorities: PriorityRow[];
  upcoming: UpcomingEntry[];
  /** The way out of the week — the design's "View Full Calendar". */
  onViewMonth: () => void;
  onViewAnalytics: () => void;
  collapsed: boolean;
}

const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

/**
 * A value's share of the plot's height, as a percentage.
 *
 * Zero is zero — a day with nothing on it draws nothing at all. Anything above
 * zero gets at least a sliver, because a real 3 XP rounded to half a pixel is
 * a day that happened and looks like a day that did not.
 */
function barHeight(value: number, peak: number): string {
  if (value <= 0 || peak <= 0) return '0%';
  return `${Math.max(3, (value / peak) * 100)}%`;
}

/**
 * XP earned, split by what the work was about.
 *
 * This panel was a bar chart of XP per day — the same seven values as the
 * sparkline two panels above it, drawn twice the size. Two pictures of one
 * series is one picture too many, and *when* the XP happened was already
 * answered up there. What was not answered anywhere is what it was **for**,
 * which is the question a breakdown exists to settle, and a subject on a task
 * is what makes it answerable.
 *
 * Five subjects get a row; everything else, unfiled tasks included, is the
 * Other row at the bottom — see utils/subjectXp for why, and for why Other
 * stays last however large it grows. Every row is named, counted and coloured,
 * so the colour is never the only thing carrying it, and the bar is read
 * against the largest row rather than against the total: the panel is a
 * ranking, not a pie.
 */
function SubjectBreakdown({ breakdown }: { breakdown: SubjectXp }) {
  const { rows, total } = breakdown;
  const peak = Math.max(1, ...rows.map((row) => row.xp));

  return (
    <section className="wk-panel">
      <h3 className="wk-panel-title">XP by Subject</h3>
      {total === 0 ? (
        <p className="wk-empty">No XP earned this week yet.</p>
      ) : (
        <>
          <div className="wk-break-total">
            <span>This week</span>
            <strong>{total.toLocaleString()} XP</strong>
          </div>
          <ul className="wk-break wk-break-subject">
            {rows.map((row, index) => (
              <li
                key={row.key}
                title={`${row.name ?? row.label}: ${row.xp} XP from ${row.count} ${
                  row.count === 1 ? 'task' : 'tasks'
                }`}
              >
                <span className="wk-break-label">
                  {row.icon ? (
                    <i
                      className="cal-ico wk-break-ico"
                      style={{ ['--ico' as string]: `url(/static/icons/${row.icon}.svg)` }}
                      aria-hidden="true"
                    />
                  ) : (
                    /* Other has no drawing of its own — it is not one thing.
                       The dot keeps the labels on a single left edge. */
                    <span className="wk-break-ico is-other" aria-hidden="true" />
                  )}
                  <span className="wk-break-name">{row.label}</span>
                </span>
                <span className="wk-break-track">
                  <i
                    className={`wk-break-fill ${
                      row.key === OTHER_KEY ? 'tone-sub-other' : `tone-sub-${index + 1}`
                    }`}
                    style={{ width: `${(row.xp / peak) * 100}%` }}
                  />
                </span>
                <span className="wk-break-xp">{row.xp.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * The week's tasks by priority.
 *
 * This panel used to be "XP Breakdown", and every row in it was invented —
 * Math 160, Coding 140 — because splitting XP by subject needs a subject on a
 * task and the table has no such column. Priority it does have, on every task
 * and on every block drawn on the grid beside this. The bars share one colour:
 * they were three, matching the three the grid painted its blocks, and the
 * grid stopped colouring tasks by difficulty. Every row is named and counted,
 * and the bar's length was always what was being read, so the hue was carrying
 * nothing on its own.
 *
 * The bar is the count. The figure is completions over that count, and the XP
 * under it is what was actually earned — an unfinished hard task is a count
 * without a score, which is the honest reading of a week still in progress.
 */
function PriorityChart({ priorities }: { priorities: PriorityRow[] }) {
  const peak = Math.max(1, ...priorities.map((row) => row.count));
  const total = priorities.reduce((sum, row) => sum + row.count, 0);

  return (
    <section className="wk-panel">
      <h3 className="wk-panel-title">Tasks by Priority</h3>
      {total === 0 ? (
        <p className="wk-empty">Nothing scheduled this week.</p>
      ) : (
        <>
          <div className="wk-break-total">
            <span>Tasks this week</span>
            <strong>{total}</strong>
          </div>
          <ul className="wk-break">
            {priorities.map((row) => (
              <li key={row.key} title={`${row.label}: ${row.done} of ${row.count} done, ${row.xp} XP`}>
                <span className="wk-break-label">{row.label}</span>
                <span className="wk-break-track">
                  <i
                    className={`wk-break-fill tone-prio-${row.key}`}
                    style={{ width: `${(row.count / peak) * 100}%` }}
                  />
                </span>
                <span className="wk-break-xp">
                  {row.done}/{row.count}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * Weekly Focus Time — the week's total, and the shape of it.
 *
 * The design floats this over the foot of the grid, and it was floated for a
 * while. It is the last panel of the same overview, written in the same
 * furniture as the ones above it, so it now simply sits with them — which also
 * gives back the corner of Sunday evening it was covering.
 *
 * The chart under the summary is focused against planned, a day at a time.
 * They are a measure and its target rather than two series, so they are drawn
 * as one: the pale column is the day's goal and the solid one in front of it is
 * what was actually focused. Height is shared across the week and scaled to
 * whichever is largest, so a day that overshot its goal visibly overshoots it.
 * That is also why the two are told apart by shape and position rather than by
 * colour alone.
 */
function WeekFocusCard({
  focus,
  days,
  onViewAnalytics,
}: {
  focus: WeekFocus;
  days: WeekDay[];
  onViewAnalytics: () => void;
}) {
  const percent =
    focus.planned > 0 ? Math.min(100, Math.round((focus.focused / focus.planned) * 100)) : 0;
  const peak = Math.max(...days.map((day) => Math.max(day.focused, day.planned)), 1);
  const anyFocus = days.some((day) => day.focused > 0 || day.planned > 0);

  return (
    <section className="wk-panel">
      <h3 className="wk-panel-title"><Icon name="timer" /> Weekly Focus Time</h3>
      <p className="wk-focustime">
        {fmtHM(focus.focused)} <span className="wk-focustime-of">/ {fmtHM(focus.planned)}</span>
      </p>
      <div className="wk-progress">
        <div
          className="wk-progress-bar"
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Weekly focus goal progress"
        />
      </div>
      <p className="wk-focustime-sub">{percent}% Goal Progress</p>

      {anyFocus && (
        <>
          <div
            className="wk-chart wk-chart-focus"
            role="img"
            aria-label={`Focused against planned each day: ${days
              .map((day) => `${day.name} ${fmtHM(day.focused)} of ${fmtHM(day.planned)}`)
              .join(', ')}`}
          >
            {days.map((day, index) => (
              <div className="wk-chart-col" key={index}>
                <div
                  className="wk-chart-track"
                  title={`${day.name}: ${fmtHM(day.focused)} focused of ${fmtHM(day.planned)}`}
                >
                  <i
                    className="wk-chart-goal"
                    style={{ height: barHeight(day.planned, peak) }}
                  />
                  <i
                    className={`wk-chart-bar is-focus${day.today ? ' is-today' : ''}`}
                    style={{ height: barHeight(day.focused, peak) }}
                  />
                </div>
                <span
                  className={`wk-chart-day${day.today ? ' is-today' : ''}`}
                  aria-hidden="true"
                >
                  {day.initial}
                </span>
              </div>
            ))}
          </div>
          <p className="wk-chart-legend" aria-hidden="true">
            <span className="wk-chart-key is-focus" />
            Focused
            <span className="wk-chart-key is-goal" />
            Planned
          </p>
        </>
      )}

      <button type="button" className="wk-panel-link" onClick={onViewAnalytics}>
        View Analytics<span aria-hidden="true"> →</span>
      </button>
    </section>
  );
}

/**
 * The sparkline's path, and the dot on each day.
 *
 * Drawn in a 100x34 box the SVG scales to the panel, so nothing here needs to
 * know how wide the column is. A week with no XP at all is a flat line along
 * the bottom rather than a divide by zero.
 */
function sparkPoints(days: WeekDay[]): { x: number; y: number }[] {
  const peak = Math.max(1, ...days.map((day) => day.xp));
  const step = 100 / days.length;
  return days.map((day, index) => ({
    // The centre of the day's share of the width, not its left edge — the day
    // initials below are a seven-column grid, and a point on the boundary
    // between two of them would sit under neither letter.
    x: (index + 0.5) * step,
    // 3 and 31 rather than 0 and 34, so the stroke and the dots have room to
    // sit inside the box instead of being clipped by it.
    y: 31 - (day.xp / peak) * 28,
  }));
}

/**
 * What the ring in the middle of the week's panel is allowed to say.
 *
 * It said "On Track" — always, unconditionally, at every percentage. A week
 * with two of twenty tasks finished was told it was on track, which is not a
 * soft encouragement, it is the panel being wrong about the one thing it is
 * there to report. This is the same rule the landing page's fake testimonial
 * was deleted under: a figure a reader can check, sitting under a label that
 * does not follow from it, costs the whole column its credibility.
 *
 * The bands are deliberately coarse. A ring is read at a glance and the
 * percentage under it is already exact, so the word's job is to say which of
 * four situations this is — not to name a fifth decimal place.
 *
 * Nothing here scolds. "Behind" is a fact about a fraction; the app's whole
 * argument is that the numbers are checkable, and a checkable number that only
 * ever says nice things is neither.
 */
function rateLabel(rate: number, total: number): string {
  if (total === 0) return 'Nothing on';
  if (rate >= 100) return 'All done';
  if (rate >= 60) return 'On track';
  if (rate >= 25) return 'Under way';
  return 'Just started';
}

export function WeekSidebar({
  mini,
  onOpenLibrary,
  stats,
  streak,
  focus,
  days,
  breakdown,
  priorities,
  upcoming,
  onViewMonth,
  onViewAnalytics,
  collapsed,
}: WeekSidebarProps) {
  // This Week Progress counts itself up rather than arriving finished. The
  // panel is four numbers and a ring about the same seven days, and a reader
  // who steps to another week gets all five replaced between frames with
  // nothing to say which of them moved. Travelling to the new figures is what
  // makes the change legible — and on the first paint, which follows a loading
  // state, it is what makes the column read as alive rather than as a
  // screenshot. The ring is driven off the same tweened rate, so the arc and
  // the percent in the middle of it stay the same number throughout.
  // Nothing moves under prefers-reduced-motion; see useCountUp.
  const rate = Math.round(useCountUp(stats.rate));
  const total = Math.round(useCountUp(stats.total));
  const done = Math.round(useCountUp(stats.done));
  const xp = Math.round(useCountUp(stats.xp));

  const points = useMemo(() => sparkPoints(days), [days]);
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  // The fill drops to the floor under the first and last points rather than at
  // the edges of the box, so it sits under the line instead of flaring past it.
  const area = `${points[0]?.x ?? 0},34 ${line} ${points[points.length - 1]?.x ?? 100},34`;

  const ringFilled = (Math.max(0, Math.min(100, rate)) / 100) * RING_C;

  return (
    <aside className="wk-sidebar" id="wkSidebar" hidden={collapsed}>
      {/* --- The way to the subject library --------------------------------
          At the very top, above the month. It is the one control in this
          column rather than a reading of the week, and everything below it is
          a reading of the week — so it goes where a control goes, before the
          figures rather than buried among them. */}
      <button type="button" className="wk-library-btn" onClick={onOpenLibrary}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H8v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
          <path d="M8 4h3.5v16H8z" />
          <path d="m14.2 5.1 2.6-.7a1.5 1.5 0 0 1 1.8 1l3 11a1.5 1.5 0 0 1-1 1.9l-2.6.7Z" />
        </svg>
        <span>Subject Library</span>
      </button>

      {/* --- The month, with this week on it -------------------------------
          Laid out from the same day the week opens on, so the seven days band
          one row instead of wrapping across two — which is the whole reason
          this grid takes the day rather than assuming one. The Day view's copy
          stays Sunday-first: nothing there depends on it. See MiniMonth. */}
      <MiniMonth
        year={mini.year}
        month={mini.month}
        fromIso={mini.from}
        toIso={mini.to}
        weekStart={mini.weekStart}
        load={mini.load}
        onStep={mini.onStep}
        onPick={mini.onPick}
      />

      {/* --- What the week came to ---------------------------------------- */}
      {/* The panel all three views share — components/Calendar/Overview.tsx.
          This one was a `<dl>` of three bare counts under the heading "This
          Week Progress": Tasks, Completed and XP Earned, with no focus figure
          at all even though the card below it has one, and with Tasks and
          Completed spending two entries on a fraction the reader still had to
          work out. The ring is the Week's own and stays — it is the one thing
          this magnification says that a day and a month do not. */}
      <Overview
        scale="week"
        tasks={stats.total}
        done={stats.done}
        focused={fmtHM(focus.focused)}
        planned={fmtHM(focus.planned)}
        xp={stats.xp}
        lead={
          <div className="wk-weekly">
            <div className="wk-ring">
            {/* The label reads the settled figure, not the tweened one: a
                screen reader should be told what the week is, not watch it
                arrive. */}
            <svg viewBox="0 0 64 64" role="img" aria-label={`${stats.rate}% complete`}>
              <circle className="wk-ring-track" cx="32" cy="32" r={RING_R} />
              <circle
                className="wk-ring-fill"
                cx="32"
                cy="32"
                r={RING_R}
                strokeDasharray={`${ringFilled} ${RING_C - ringFilled}`}
                transform="rotate(-90 32 32)"
              />
            </svg>
              <div className="wk-ring-centre">
                <span className="wk-ring-pct">{rate}%</span>
                <span className="wk-ring-label">{rateLabel(stats.rate, stats.total)}</span>
              </div>
            </div>
            {/* The three figures that used to sit beside the ring are the
                shared panel's tiles now. What is left here is the sentence the
                ring cannot say on its own. */}
            <p className="wk-weekly-said">
              {total === 0
                ? 'Nothing scheduled this week yet.'
                : `${done} of ${total} finished, ${xp.toLocaleString()} XP banked.`}
            </p>
          </div>
        }
      >

        {/* XP per day across the week. The reader is being shown a shape, not
            asked to read values off it, so there are no axes and no labels
            beyond the day initials. */}
        <div className="wk-spark">
          <svg viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
            <polygon className="wk-spark-area" points={area} />
            <polyline className="wk-spark-line" points={line} />
            {points.map((point, index) => (
              /* Keyed by position, not by the day's initial: Tuesday and
                 Thursday are both "T", and Saturday and Sunday both "S". */
              <circle
                key={index}
                className={`wk-spark-dot${days[index]?.today ? ' is-today' : ''}`}
                cx={point.x}
                cy={point.y}
                r={1.6}
              />
            ))}
          </svg>
          <div className="wk-spark-days" aria-hidden="true">
            {days.map((day, index) => (
              <span key={index} className={day.today ? 'is-today' : undefined}>
                {day.initial}
              </span>
            ))}
          </div>
        </div>
      </Overview>

      {/* --- XP by Subject ------------------------------------------------- */}
      <SubjectBreakdown breakdown={breakdown} />

      {/* --- Tasks by Priority --------------------------------------------- */}
      <PriorityChart priorities={priorities} />

      {/* --- Streaks ------------------------------------------------------- */}
      <section className="wk-panel">
        <h3 className="wk-panel-title"><Icon name="flame" /> Streaks</h3>
        <div className="wk-streak-num">
          <Icon name="flame" /> {streak} Day Streak
        </div>
        <div className="wk-streak-sub">Keep it up!</div>
        <div className="wk-dots">
          {days.map((day, index) => (
            <span key={index} className="wk-dot-cell">
              <span
                className={`wk-dot${day.active ? ' is-done' : ''}${day.future ? ' is-future' : ''}`}
                aria-hidden="true"
              >
                {day.active ? '✓' : ''}
              </span>
              <span className="wk-dot-day">{day.initial}</span>
            </span>
          ))}
        </div>
      </section>

      {/* --- Upcoming ------------------------------------------------------ */}
      <section className="wk-panel">
        <h3 className="wk-panel-title">
          Upcoming{' '}
          <span className="wk-priorities-count">
            {upcoming.length ? `(${upcoming.length})` : ''}
          </span>
        </h3>
        {upcoming.length === 0 ? (
          <p className="wk-empty">Nothing scheduled after this week.</p>
        ) : (
          <ul className="wk-upcoming">
            {upcoming.map((entry) => (
              <li key={entry.id}>
                <span className="wk-upcoming-ico" aria-hidden="true">
                  <Icon name={entry.icon} />
                </span>
                <span className="wk-upcoming-body">
                  <span className="wk-upcoming-name">{entry.title}</span>
                  <span className="wk-upcoming-when">
                    {entry.date} · {entry.when}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Weekly Focus Time -------------------------------------------- */}
      <WeekFocusCard focus={focus} days={days} onViewAnalytics={onViewAnalytics} />

      {/* --- The way out --------------------------------------------------
          The month, which is the only view that shows what comes after the
          seven days beside this. It used to be tucked inside Upcoming, where
          it read as that list's footer — a way to see more of what was in it —
          and it is not: it leaves the week entirely, which is the last thing
          this column has to offer and so belongs at the end of it, after every
          panel that is about the week itself. */}
      <button type="button" className="wk-fullcal" onClick={onViewMonth}>
        View Full Calendar<span aria-hidden="true"> →</span>
      </button>
    </aside>
  );
}
