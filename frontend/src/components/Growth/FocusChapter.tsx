/**
 * Focus & Consistency — can this account reliably execute?
 *
 * Not a streak page. A streak is one number and it answers one question badly:
 * it cannot tell a reader whether they follow through on what they planned, how
 * steady their weeks are, how deep their focus goes, or — the one that matters
 * most — how quickly they come back after a day off. Those are the six panels
 * here, and every one of them is arithmetic over the same two sources the rest
 * of the page uses: the day series, and the account's tasks.
 *
 * **Nothing here is scored against anybody else, and nothing shames a missed
 * day.** The calendar deliberately spends its largest figure on the recovery
 * rate rather than on the misses: "you are back within a day 94% of the time"
 * is the growth metric, and a wall of red squares is not. See `recoveryProfile`
 * in utils/growthFocus for how it is counted.
 *
 * The arithmetic is all in utils/growthFocus, which this file does not second
 * guess — the same split every panel on this page keeps.
 */
import { Fragment, useMemo, useState } from 'react';
import type { Subject } from '@/services/subjects';
import type { GrowthDay, Task } from '@/types';
import {
  COMPARE_BACK_DAYS,
  FOCUS_REFERENCE_MINUTES,
  HABIT_ROWS,
  consistencyTrail,
  dayName,
  focusMix,
  habitRows,
  onTimeShare,
  plannedGrid,
  recoveryProfile,
  scoreCards,
  trendLine,
  weeklyPlan,
  type PlanDay,
} from '@/utils/growthFocus';
import { HEAT_WEEKDAYS } from '@/utils/growthSummary';
import { EmptyChapter, HeroRow, Notes, PanelHead, Seg } from './ChapterParts';
import { Glyph } from './GrowthPanels';

/**
 * The three windows the calendar is drawn at, and the columns each needs.
 *
 * The same three the Overview map has (`HEAT_WINDOWS`), and the same week
 * counts, because the two calendars sit on one page and a 90 that meant
 * fourteen weeks in one and thirteen in the other would be a bug nobody could
 * see. A week is a column, so the count is what makes a year a wider grid
 * rather than a taller one.
 */
const WINDOWS = [
  { key: '30' as const, label: '30 days', days: 30, weeks: 6 },
  { key: '90' as const, label: '90 days', days: 90, weeks: 14 },
  { key: '365' as const, label: '1 year', days: 365, weeks: 53 },
];
type WindowKey = (typeof WINDOWS)[number]['key'];

/** How many weeks the follow-through chart draws. Eight is two months. */
const WEEKS = 8;

/**
 * A colour per habit row, in the order they are ranked.
 *
 * Six, so six rows are six colours. It cycles past that, but the panel draws
 * `HABIT_ROWS` of them and that is six.
 */
const HABIT_TONES = ['purple', 'green', 'blue', 'amber', 'teal', 'rose'];

export interface FocusChapterProps {
  all: GrowthDay[];
  tasks: Task[];
  subjects: Map<string, Subject>;
  streak: number;
}

export function FocusChapter({ all, tasks, subjects, streak }: FocusChapterProps) {
  const [window, setWindow] = useState<WindowKey>('30');
  /** Which square the reader has opened. Null means the most recent day. */
  const [picked, setPicked] = useState<string | null>(null);

  const shape = WINDOWS.find((entry) => entry.key === window) ?? WINDOWS[0]!;
  const today = all[all.length - 1]?.date ?? '';

  const scores = useMemo(() => scoreCards(all, tasks), [all, tasks]);
  const grid = useMemo(
    () => plannedGrid(all, tasks, shape.days, shape.weeks),
    [all, shape.days, shape.weeks, tasks],
  );
  const weeks = useMemo(() => weeklyPlan(all, tasks, WEEKS), [all, tasks]);
  const mix = useMemo(() => focusMix(all), [all]);
  // `all` is one row per day from the account's first to today — see the
  // backend's `series` — so its length is the account's age, and that is the
  // window the habit rows are measured over.
  const habits = useMemo(
    () => habitRows(tasks, subjects, today, all.length),
    [all.length, subjects, tasks, today],
  );
  const recovery = useMemo(() => recoveryProfile(all, tasks), [all, tasks]);
  const trail = useMemo(() => consistencyTrail(all), [all]);
  const onTime = useMemo(() => onTimeShare(tasks), [tasks]);

  /** Every drawn day, flattened, so the detail panel can find one by date. */
  const days = useMemo(
    () => grid.flatMap((week) => week.days).filter((day): day is PlanDay & { date: string } => !!day.date),
    [grid],
  );
  const chosen = days.find((day) => day.date === picked) ?? days[days.length - 1];

  if (all.length < 3) {
    return (
      <EmptyChapter
        title="Focus & Consistency"
        message="Not enough days yet to say anything about a habit."
      />
    );
  }

  const planned = weeks.reduce((sum, week) => sum + week.planned, 0);
  const consistencyNow = trail[0]?.value ?? null;
  const consistencyThen = trail.filter((point) => point.value !== null).pop();

  return (
    <div className="gr-grid">
      {/* --- Four figures, the whole width ---------------------------------- */}
      <div className="gr-span-3">
        <HeroRow
          cards={scores.map((score) => ({
            key: score.key,
            label: score.label,
            value: score.value,
            suffix: score.suffix,
            scale: score.suffix === '%' ? '' : '/ 100',
            grade: score.grade,
            delta: score.delta,
            against: `vs ${COMPARE_BACK_DAYS} days ago`,
            foot: score.foot,
            icon: score.icon,
          }))}
        />
      </div>

      {/* --- The calendar, and the day the reader opened -------------------- */}
      <section className="gr-panel gr-span-2 gr-heat gr-plan" data-window={window}>
        <PanelHead
          title="Consistency"
          hint={`One square a day across ${shape.days} — darkest is the busiest`}
        >
          <Seg
            value={window}
            options={WINDOWS.map((entry) => ({ key: entry.key, label: entry.label }))}
            onChange={setWindow}
            label="Calendar window"
          />
        </PanelHead>

        {/* A week is a column and a weekday is a row — see `XpHeatmap` for why
            that is the only shape that holds three windows in one panel. */}
        <div className="gr-heat-map">
          <div
            className="gr-heat-body"
            key={window}
            style={{ ['--weeks' as string]: grid.length }}
          >
            <span className="gr-heat-corner" aria-hidden="true" />
            {grid.map((week, at) => (
              <span className="gr-heat-month" key={`month-${at}`} aria-hidden="true">
                {week.label}
              </span>
            ))}

            {HEAT_WEEKDAYS.map((letter, weekday) => (
              <Fragment key={`row-${weekday}`}>
                <span className="gr-heat-day" aria-hidden="true">
                  {letter}
                </span>
                {grid.map((week, at) => {
                  const cell = week.days[weekday];
                  if (!cell?.date) {
                    return <span key={at} className="gr-heat-cell is-blank" aria-hidden="true" />;
                  }
                  const date = cell.date;
                  return (
                    <button
                      type="button"
                      key={at}
                      className={`gr-heat-cell lv-${cell.level}${
                        chosen?.date === date ? ' is-picked' : ''
                      }`}
                      style={{ ['--i' as string]: at + weekday * 2 }}
                      onClick={() => setPicked(date)}
                      aria-label={`${dayName(date)}: ${Math.round(cell.xp)} XP${
                        cell.completion === null
                          ? ', nothing planned'
                          : `, ${Math.round(cell.completion)}% of planned work done`
                      }`}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>

        {/* The same key the Overview map carries, because it is now the same
            scale: the ramp's stops are the four levels, and a square's shade
            lands in the same place on both. */}
        <div className="gr-heat-key">
          <span>Less XP</span>
          <span className="gr-heat-ramp" aria-hidden="true" />
          <span>More XP</span>
        </div>
      </section>

      <section className="gr-panel gr-day">
        <PanelHead title={chosen ? dayName(chosen.date) : 'No day'} icon="calendar" note="tap a square" />
        {!chosen ? (
          <p className="gr-empty">Nothing to open yet.</p>
        ) : (
          <>
            <div className="gr-day-figure">
              <strong className={chosen.completion === null ? 'is-none' : ''}>
                {chosen.completion === null ? '—' : `${Math.round(chosen.completion)}%`}
              </strong>
              <span>
                {chosen.completion === null
                  ? 'nothing was planned for this day'
                  : 'of the day’s plan completed'}
              </span>
            </div>
            <dl className="gr-day-list">
              <div>
                <dt>Planned</dt>
                <dd>
                  {chosen.planned === 0
                    ? '—'
                    : `${chosen.planned} ${chosen.planned === 1 ? 'task' : 'tasks'}`}
                </dd>
              </div>
              <div>
                <dt>Of those, done</dt>
                <dd>{chosen.planned === 0 ? '—' : chosen.met}</dd>
              </div>
              <div>
                <dt>Finished on the day</dt>
                <dd>{chosen.finished}</dd>
              </div>
              <div>
                <dt>XP earned</dt>
                <dd>{Math.round(chosen.xp).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Focus</dt>
                <dd>
                  {chosen.focusMinutes > 0
                    ? `${Math.round(chosen.focusMinutes)} min`
                    : 'none tracked'}
                </dd>
              </div>
            </dl>
          </>
        )}
      </section>

      {/* --- Week by week, with the line through it ------------------------- */}
      <section className="gr-panel gr-span-2 gr-chart-panel">
        <PanelHead
          title="Planned against completed"
          hint="How much of each week's plan you finished"
          note={planned > 0 ? `${WEEKS} weeks` : 'nothing planned yet'}
        />
        {planned === 0 ? (
          <p className="gr-empty">
            No due dates in these weeks, so there is no plan to measure against.
          </p>
        ) : (
          <WeeklyPlot weeks={weeks} />
        )}
      </section>

      {/* --- How the focus time was spent ----------------------------------- */}
      <section className="gr-panel gr-mix">
        <PanelHead
          title="Focus depth"
          hint={`Focus days by length, against a ${FOCUS_REFERENCE_MINUTES}-minute day`}
          note={`${mix.focusDays} of ${mix.totalDays} days`}
        />
        {mix.focusDays === 0 ? (
          <p className="gr-empty">No focus sessions in the last 90 days.</p>
        ) : (
          <>
            <div className="gr-mix-bar" aria-hidden="true">
              {mix.bands.map((band) => (
                <i
                  key={band.key}
                  className={`gr-mix-seg tone-${band.key}`}
                  style={{ width: `${band.share}%` }}
                />
              ))}
            </div>
            <ul className="gr-mix-list">
              {mix.bands.map((band) => (
                <li key={band.key}>
                  <i className={`gr-mix-dot tone-${band.key}`} aria-hidden="true" />
                  <span className="gr-mix-name">{band.label}</span>
                  <span className="gr-mix-share">{band.share}%</span>
                  {band.delta === null ? (
                    <span className="gr-mix-delta is-quiet">—</span>
                  ) : (
                    <span
                      className={`gr-mix-delta${band.delta > 0 ? ' is-up' : band.delta < 0 ? ' is-down' : ''}`}
                    >
                      {band.delta > 0 ? '↑' : band.delta < 0 ? '↓' : '='} {Math.abs(band.delta)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="gr-mix-foot">
              Against the 90 days before, in percentage points of your focus days.
            </p>
          </>
        )}
      </section>

      {/* --- The recurring work --------------------------------------------- */}
      <section className="gr-panel gr-span-2">
        <PanelHead
          title="Habit stability"
          hint={`Your ${HABIT_ROWS} steadiest subjects, counted since day one`}
          note={habits.length ? `since day one · ${habits[0]!.spanDays} days` : undefined}
        />
        {habits.length === 0 ? (
          <p className="gr-empty">
            No finished task carries a subject yet.
          </p>
        ) : (
          <ul className="gr-habits">
            {habits.slice(0, HABIT_ROWS).map((habit, index) => (
              <li className="gr-habit" key={habit.key}>
                <div className="gr-habit-head">
                  <span className="gr-habit-name">{habit.label}</span>
                  <span className="gr-habit-rate">
                    <strong>{habit.perWeek.toFixed(1)}</strong> / {habit.bestWeek} a week
                  </span>
                </div>
                <span className="gr-habit-track">
                  <i
                    className={`gr-habit-fill tone-${HABIT_TONES[index % HABIT_TONES.length]}`}
                    style={{ width: `${habit.consistency}%` }}
                  />
                </span>
                <div className="gr-habit-foot">
                  <span>
                    {habit.consistency}% of your {habit.spanDays} days
                  </span>
                  <span>
                    <Glyph name="flame" size={11} /> {habit.streak} wk · best {habit.bestStreak}
                  </span>
                  {habit.delta === null ? (
                    <span className="is-quiet">no earlier month</span>
                  ) : (
                    <span className={habit.delta >= 0 ? 'is-up' : 'is-down'}>
                      {habit.delta >= 0 ? '↑' : '↓'} {Math.abs(habit.delta)}%
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- The same score, four times ------------------------------------- */}
      <section className="gr-panel">
        <PanelHead
          title="Consistency over time"
          icon="trend"
          hint="The same 30-day score at four points"
        />
        <ul className="gr-trail">
          {trail.map((point) => (
            <li className={`gr-trail-row${point.key === 'now' ? ' is-now' : ''}`} key={point.key}>
              <span className="gr-trail-name">{point.label}</span>
              <span className="gr-trail-track">
                <i className="gr-trail-fill" style={{ width: `${point.value ?? 0}%` }} />
              </span>
              <span className="gr-trail-value">{point.value === null ? '—' : point.value}</span>
            </li>
          ))}
        </ul>
        <p className="gr-mix-foot">
          {consistencyNow !== null && consistencyThen && consistencyThen.key !== 'now'
            ? `${consistencyNow >= (consistencyThen.value ?? 0) ? 'Up' : 'Down'} ${Math.abs(
                consistencyNow - (consistencyThen.value ?? 0),
              )} points since ${consistencyThen.label.toLowerCase()}.`
            : 'A second reading appears once the account is a month older.'}
        </p>
      </section>

      {/* --- The calendar, read for recovery rather than for failure -------- */}
      <section className="gr-panel gr-span-2 gr-recov">
        <PanelHead
          title="Getting back on"
          hint="Ranked against your own median day"
          note={`${recovery.totalDays} days on record`}
        />
        <div className="gr-recov-row">
          <div className="gr-recov-figure">
            <strong>{recovery.rate === null ? '—' : `${recovery.rate}%`}</strong>
            <span>Recovery rate</span>
            <p>
              {recovery.rate === null
                ? 'You have not missed a day yet, so there is nothing to recover from.'
                : `You usually return to your routine within ${
                    recovery.typicalDays !== null && recovery.typicalDays <= 1.5
                      ? '1 day'
                      : `${recovery.typicalDays} days`
                  } after a quiet one.`}
            </p>
          </div>

          <div className="gr-recov-split">
            <div className="gr-mix-bar" aria-hidden="true">
              {(['perfect', 'strong', 'partial', 'missed'] as const).map((kind) => (
                <i
                  key={kind}
                  className={`gr-mix-seg tone-${kind}`}
                  style={{
                    width: `${
                      recovery.totalDays
                        ? (recovery.counts[kind] / recovery.totalDays) * 100
                        : 0
                    }%`,
                  }}
                />
              ))}
            </div>
            <ul className="gr-mix-list">
              {(
                [
                  ['perfect', 'Full days — plan kept, XP above your median'],
                  ['strong', 'Solid days'],
                  ['partial', 'Light days'],
                  ['missed', 'Rest days'],
                ] as const
              ).map(([kind, label]) => (
                <li key={kind}>
                  <i className={`gr-mix-dot tone-${kind}`} aria-hidden="true" />
                  <span className="gr-mix-name">{label}</span>
                  <span className="gr-mix-share">{recovery.counts[kind]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* --- What all of it comes to ---------------------------------------- */}
      <section className="gr-panel">
        <PanelHead title="What this says" icon="bulb" />
        <Notes
          rows={[
            {
              tone: recovery.rate !== null && recovery.rate >= 60 ? 'good' : 'note',
              icon: 'check',
              head:
                recovery.rate === null
                  ? 'Nothing to come back from yet.'
                  : `You come back from ${recovery.rate}% of quiet runs inside a day.`,
              hint:
                'The longest you have ever been away is ' +
                `${recovery.longestGap} ${recovery.longestGap === 1 ? 'day' : 'days'}, and you came back from it.`,
            },
            {
              tone: onTime.pct !== null && onTime.pct >= 70 ? 'good' : 'watch',
              icon: onTime.pct !== null && onTime.pct >= 70 ? 'check' : 'alert',
              head:
                onTime.pct === null
                  ? 'No finished tasks with a due date yet.'
                  : `${onTime.pct}% of tasks finished on time.`,
              hint:
                onTime.pct === null
                  ? 'Add a due date to a task to see this.'
                  : `${onTime.met} of ${onTime.total} dated tasks were on time.`,
            },
            {
              tone: 'note',
              icon: 'info',
              head: `Current streak: ${streak} ${streak === 1 ? 'day' : 'days'}.`,
              hint: 'The rest of this page looks at the longer term.',
            },
          ]}
        />
      </section>
    </div>
  );
}

/**
 * Eight weeks of follow-through, and a straight line through them.
 *
 * One axis, 0-100%, shared by the bars and the line — which is the whole reason
 * the bars are percentages rather than task counts. A chart with bars on one
 * scale and an overlay on another is two charts sharing a box, and the reader
 * has no way to know which one the line belongs to.
 */
function WeeklyPlot({ weeks }: { weeks: ReturnType<typeof weeklyPlan> }) {
  const fitted = trendLine(weeks.map((week) => week.completion));
  // A bar owns a band of the box rather than a point on it, so the line is
  // anchored to band centres — `i + 0.5` — and not to 0 and 100, which would
  // put its ends half a bar outside the first and last column.
  const band = 100 / Math.max(1, weeks.length);
  const path = fitted
    .map(
      (value, index) =>
        `${index === 0 ? 'M' : 'L'}${((index + 0.5) * band).toFixed(2)} ${(
          100 - Math.max(0, Math.min(100, value))
        ).toFixed(2)}`,
    )
    .join(' ');

  return (
    <div className="gr-wk">
      <div className="gr-wk-ticks" aria-hidden="true">
        <span>100%</span>
        <span>50%</span>
        <span>0%</span>
      </div>

      {/* The box holds the bars and nothing else, so 0-100% in the overlay is
          0-100% on a bar. Labels live outside it for that reason — a name row
          inside the plot would shift the line off its own axis. */}
      <div className="gr-wk-main">
        <div className="gr-wk-box">
          <div className="gr-wk-cols">
            {weeks.map((week) => (
              // The column is the band; the bar is centred in it, which is
              // where the trend line's points are anchored. See `band` above.
              <span className="gr-wk-col" key={week.key}>
                <span
                  className="gr-wk-track"
                  title={
                    week.completion === null
                      ? `${week.label}: nothing planned`
                      : `${week.label}: ${week.met} of ${week.planned} planned tasks done`
                  }
                >
                  <i className="gr-wk-fill" style={{ height: `${week.completion ?? 0}%` }} />
                </span>
              </span>
            ))}
          </div>

          <svg
            className="gr-wk-line"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label="The trend through the weekly completion rates."
          >
            <path d={path} vectorEffect="non-scaling-stroke" />
          </svg>
        </div>

        <div className="gr-wk-names">
          {weeks.map((week) => (
            <span key={week.key}>
              <strong>{week.completion === null ? '—' : `${week.completion}%`}</strong>
              {week.opensOn}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
