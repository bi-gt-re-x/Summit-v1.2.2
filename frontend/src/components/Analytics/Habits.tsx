/**
 * The Habits tab — what this person repeatedly does.
 *
 * The first of the three analysis tabs and the most visual of them, on purpose.
 * Habits is *what I do*, Insights is *why and how*, Recommendations is *what to
 * change*, and the fastest way to make that division legible is to give each
 * tab a different personality rather than three grids of the same card. So this
 * one is cards, a calendar and a timeline: behavioural, historical, and almost
 * entirely counts. Nothing here explains a behaviour — the moment a panel here
 * starts saying *why*, the tab beside it has lost its reason to exist.
 *
 * Every figure comes from utils/habits and nothing is recomputed locally, which
 * is what stops the number on a card and the number in the timeline from
 * drifting apart when one of them is edited.
 */
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Panel, Sparkline, asTone, toneVar } from './charts';
import { StatRow, type Stat } from './StatRow';
import {
  CALENDAR_WINDOWS,
  STRENGTH_LABEL,
  STRENGTH_NOTE,
  STRENGTH_TONE,
  habitCalendar,
  type CalendarKey,
  type Habit,
  type HabitDay,
  type HabitPattern,
  type HabitShift,
  type HabitStrength,
  type HabitSummary,
} from '@/utils/habits';

/** Sunday first, matching every other weekday list in the app. */
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

/** "3 days ago", "today" — how a person says how long it has been. */
function since(iso: string | null, todayIso: string): string {
  if (!iso) return 'never';
  const ms = new Date(`${todayIso}T00:00:00`).getTime() - new Date(`${iso}T00:00:00`).getTime();
  const days = Math.round(ms / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.round(days / 7)} weeks ago`;
  return pretty(iso);
}

// --------------------------------------------------------------------------
// The headline
// --------------------------------------------------------------------------
export function HabitTiles({
  summary,
  span,
  hours,
}: {
  summary: HabitSummary;
  span: string;
  /**
   * Focus hours logged across the window, when the account logs them.
   *
   * The scale under "Days worked". A rate of 62% is a different fact over
   * eleven logged hours than over ninety, and this row counted days without
   * ever saying how much was done on them — the one tab about repetition had
   * no measure of volume on it at all.
   */
  hours?: number | null;
}) {
  const logged = typeof hours === 'number' && hours > 0
    ? `${Math.round(hours).toLocaleString()}h logged`
    : null;
  /* Two or three words a note, not a clause. These are read at a glance beside
     a figure, and "nothing repeats often enough yet to count as a habit" under
     a 0 is a sentence doing the work the 0 already did. The long-form versions
     of all four live in the panels underneath. */
  const stats: Stat[] = [
    {
      key: 'tracked',
      label: 'Habits',
      value: String(summary.tracked),
      note: span,
      tone: 'violet',
    },
    {
      key: 'strong',
      label: 'Holding',
      value: String(summary.strong),
      note: summary.strong ? 'in most weeks' : 'none yet',
      tone: 'green',
    },
    {
      key: 'active',
      label: 'Days worked',
      value: `${summary.activeRate}%`,
      note: logged ? `of this range · ${logged}` : 'of this range',
      tone: 'blue',
    },
    {
      key: 'anchor',
      label: 'Anchor',
      value: summary.anchor?.name ?? '—',
      note: summary.anchor ? `${summary.anchor.consistency}% of weeks` : 'none steady yet',
      tone: 'amber',
    },
  ];

  return <StatRow stats={stats} />;
}

// --------------------------------------------------------------------------
// A habit
// --------------------------------------------------------------------------
/**
 * One card per habit, with the figures arranged by how often they are read.
 *
 * The name and the consistency are the two things a reader takes from a glance,
 * so they get the size; the streak and the trend sit beside them because they
 * answer "is it alive"; everything else is a footnote and is set as one. A card
 * that gave nine numbers equal weight would be a table with rounded corners.
 */
export function HabitCard({ habit, todayIso }: { habit: Habit; todayIso: string }) {
  const tone = STRENGTH_TONE[habit.strength];
  const unit = habit.unit === 'day' ? 'day' : 'week';

  return (
    <article className="ax-habit">
      <header className="ax-habit-head">
        <div className="ax-habit-name">
          <h3>{habit.name}</h3>
          <span className="ax-habit-source">
            {habit.source === 'subject' ? 'Subject' : 'Routine'} · {habit.cadence}
          </span>
        </div>
        <span className={`ax-habit-badge ax-tone-${tone}`}>{STRENGTH_LABEL[habit.strength]}</span>
      </header>

      <div className="ax-habit-figure">
        <strong>{habit.consistency}%</strong>
        <span className="ax-muted ax-small">of weeks in this range</span>
      </div>

      <div className="ax-habit-track" aria-hidden="true">
        <i style={{ width: `${habit.consistency}%`, background: toneVar(tone) }} />
      </div>

      <div className="ax-habit-row">
        <span className="ax-habit-streak" title={`Longest run: ${habit.bestStreak} ${unit}s`}>
          <i className="ax-flame" aria-hidden="true" />
          {habit.streak > 0 ? `${habit.streak}-${unit} streak` : 'no run going'}
        </span>
        {habit.trend === null ? (
          <span className="ax-delta ax-delta-none">too short to trend</span>
        ) : (
          <span
            className={`ax-delta ax-delta-${habit.trend > 4 ? 'up' : habit.trend < -4 ? 'down' : 'flat'}`}
          >
            {habit.trend > 4 ? '↑' : habit.trend < -4 ? '↓' : '→'} {Math.abs(habit.trend)}% vs earlier
          </span>
        )}
      </div>

      <Sparkline values={habit.weekly} tone={asTone(tone)} />

      <dl className="ax-habit-facts">
        <div>
          <dt>Frequency</dt>
          <dd>{habit.frequency}× / week</dd>
        </div>
        <div>
          <dt>Finished</dt>
          <dd>{habit.completionRate}%</dd>
        </div>
        <div>
          <dt>Best run</dt>
          <dd>
            {habit.bestStreak} {unit}
            {habit.bestStreak === 1 ? '' : 's'}
          </dd>
        </div>
        <div>
          <dt>Last done</dt>
          <dd>{since(habit.lastCompleted, todayIso)}</dd>
        </div>
      </dl>
    </article>
  );
}

export function HabitCards({ habits, todayIso }: { habits: Habit[]; todayIso: string }) {
  if (habits.length === 0) {
    return (
      <p className="ax-empty">
        Nothing here repeats often enough to call a habit yet.
      </p>
    );
  }
  return (
    <div className="ax-habit-grid">
      {habits.map((habit) => (
        <HabitCard key={habit.id} habit={habit} todayIso={todayIso} />
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// The calendar
// --------------------------------------------------------------------------
export interface HabitCalendarProps {
  byDate: Map<string, HabitDay>;
  lastIso: string;
  accountDays: number;
}

/**
 * Every day in the window as a square, clickable.
 *
 * The window picker is the panel's own rather than the page's, for the same
 * reason the consistency heatmap on the Overview tab always draws a year: a map
 * of 91 squares and a map of 730 are not the same picture, and the question
 * this panel answers — what does my rhythm look like — is asked at whatever
 * zoom the reader wants regardless of what the rest of the tab is showing.
 *
 * Clicking a square is the whole reason the dates are carried through
 * `habitCalendar`. A heatmap that cannot be interrogated is decorative; one
 * that names what happened on the dark Tuesday is a record.
 */
export function HabitCalendarPanel({ byDate, lastIso, accountDays }: HabitCalendarProps) {
  const [window, setWindow] = useState<CalendarKey>('90');
  const [picked, setPicked] = useState<string | null>(null);

  const rows = useMemo(
    () => habitCalendar(byDate, lastIso, window, accountDays),
    [accountDays, byDate, lastIso, window],
  );

  const chosen = picked ? byDate.get(picked) : undefined;
  const worked = rows.reduce(
    (count, row) => count + row.days.filter((cell) => cell.date && cell.count > 0).length,
    0,
  );
  const covered = rows.reduce((count, row) => count + row.days.filter((cell) => cell.date).length, 0);

  return (
    <Panel
      title="Habit calendar"
      note="One square a day — click for detail"
      aside={
        <div className="ax-chips ax-chips-sm" role="group" aria-label="Calendar window">
          {CALENDAR_WINDOWS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`ax-chip${option.key === window ? ' is-on' : ''}`}
              aria-pressed={option.key === window}
              onClick={() => {
                setWindow(option.key);
                setPicked(null);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      {/* Two shapes, one set of cells. Under about a month the map turns on its
          side and becomes the month calendar in `.is-calendar` — see the note
          in analytics.css. The column count goes to CSS as a number because a
          square here has a maximum size, and the width that follows from it is
          arithmetic no intrinsic sizing can do: the grid clips its overflow, so
          it will not state a width of its own. */}
      <div
        className={`ax-heat ax-heat-wide${window === '7' || window === '30' ? ' is-calendar' : ''}`}
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
          <div className="ax-heat-grid">
            {rows.map((row, index) => (
              <div className="ax-heat-week" key={index}>
                {row.days.map((cell, cellIndex) =>
                  cell.date ? (
                    <button
                      key={cellIndex}
                      type="button"
                      className={`ax-heat-cell ax-heat-hit${cell.date === picked ? ' is-picked' : ''}`}
                      data-level={cell.level}
                      title={`${pretty(cell.date)} · ${cell.count} finished`}
                      aria-label={`${pretty(cell.date)}, ${cell.count} finished`}
                      onClick={() => setPicked(cell.date === picked ? null : cell.date)}
                    />
                  ) : (
                    <span key={cellIndex} className="ax-heat-cell is-blank" data-level={0} />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ax-heat-key">
        <span>
          {worked} of {covered} days worked
        </span>
        <span className="ax-heat-key-scale">
          Less
          {[0, 1, 2, 3, 4].map((level) => (
            <i key={level} className="ax-heat-cell" data-level={level} />
          ))}
          More
        </span>
      </div>

      <div className="ax-daycard">
        {chosen ? (
          <>
            <div className="ax-daycard-head">
              <strong>{pretty(chosen.date)}</strong>
              <span className="ax-muted ax-small">
                {chosen.count} finished · {Math.round(chosen.xp).toLocaleString()} XP
              </span>
            </div>
            <ul className="ax-daycard-list">
              {chosen.names.slice(0, 6).map((name, index) => (
                <li key={`${name}-${index}`}>{name}</li>
              ))}
              {chosen.names.length > 6 && (
                <li className="ax-muted">and {chosen.names.length - 6} more</li>
              )}
            </ul>
          </>
        ) : picked ? (
          <p className="ax-muted ax-small">
            <strong>{pretty(picked)}</strong> — nothing finished on this day.
          </p>
        ) : (
          <p className="ax-muted ax-small">
            Pick any square to see what was completed that day.
          </p>
        )}
      </div>
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Patterns
// --------------------------------------------------------------------------
/**
 * Recurring behaviours, described and never explained.
 *
 * The frequency word carries the confidence — "Usually" is 75% of occurrences
 * and "Sometimes" is under half — and the count it was read off is printed
 * underneath, because a tendency stated without its denominator is an assertion.
 */
/**
 * `limit` is `toneRules().diagnoses` — how many findings this account asked to
 * see at once. The list arrives ranked, so this drops the weakest rows and
 * never the strongest, and it rewrites none of them.
 */
export function PatternsPanel({
  patterns,
  limit,
}: {
  patterns: HabitPattern[];
  limit?: number;
}) {
  const shown = limit === undefined ? patterns : patterns.slice(0, Math.max(1, limit));

  return (
    <Panel
      title="Patterns in what you do"
      note="Counts. Why is the Insights tab"
    >
      {patterns.length === 0 ? (
        <p className="ax-empty">
          Nothing repeats often enough to call a pattern yet.
        </p>
      ) : (
        <ul className="ax-patterns">
          {shown.map((pattern) => (
            <li key={pattern.id}>
              <span className="ax-dot" style={{ background: toneVar(pattern.tone) }} />
              <div>
                <strong>
                  <em className="ax-pattern-word">{pattern.frequency}</em> {pattern.text}
                </strong>
                <span className="ax-muted ax-small">{pattern.support}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Consistency
// --------------------------------------------------------------------------
const ORDER: HabitStrength[] = ['strong', 'developing', 'inconsistent', 'declining'];

/**
 * The habits sorted into four states, with what each state means.
 *
 * The four are worth naming rather than leaving as a consistency percentage per
 * card: "82%" tells a reader where a habit sits on a scale, and "Declining"
 * tells them what to do about it. A bucket with nothing in it is still drawn —
 * an empty Declining column is the best news on the panel and hiding it would
 * throw that away.
 */
export function ConsistencyPanel({ habits }: { habits: Habit[] }) {
  const grouped = ORDER.map((strength) => ({
    strength,
    list: habits.filter((habit) => habit.strength === strength),
  }));

  // The first bucket is the strongest, `ORDER` being reliability-first.
  const solid = grouped[0]?.list.length ?? 0;

  return (
    <Panel
      title="Which habits are actually stable"
      note="By reliability, not by earnings"
      claim={
        habits.length === 0 ? undefined : (
          <>
            <strong>{solid}</strong> of your <strong>{habits.length}</strong> habits{' '}
            {solid === 1 ? 'is' : 'are'} holding reliably; the rest come and go.
          </>
        )
      }
    >
      <div className="ax-buckets">
        {grouped.map(({ strength, list }) => (
          <section className="ax-bucket" key={strength}>
            <header>
              <span className={`ax-dot ax-tone-${STRENGTH_TONE[strength]}`} style={{ background: toneVar(STRENGTH_TONE[strength]) }} />
              <strong>{STRENGTH_LABEL[strength]}</strong>
              <span className="ax-bucket-count">{list.length}</span>
            </header>
            <p className="ax-muted ax-small">{STRENGTH_NOTE[strength]}</p>
            {list.length > 0 && (
              <ul>
                {list.map((habit) => (
                  <li key={habit.id}>
                    <span>{habit.name}</span>
                    <span className="ax-muted">{habit.consistency}%</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </Panel>
  );
}

// --------------------------------------------------------------------------
// The timeline
// --------------------------------------------------------------------------
const EVENT_WORD: Record<HabitShift['event'], string> = {
  started: 'Started',
  strengthened: 'Strengthened',
  weakened: 'Weakened',
  stopped: 'Stopped',
};

/**
 * How each habit's rate moved across the range, as four steps and a verdict.
 *
 * Four chunks rather than a line per week, because the thing being read is a
 * sentence — "3/wk → 5/wk → 6/wk" — and a sentence with fifty-two clauses in it
 * is a chart, which the card above already has. The steps are drawn as bars so
 * the direction is visible before any of the numbers are.
 */
export function TimelinePanel({
  habits,
  shifts,
}: {
  habits: Habit[];
  shifts: HabitShift[];
}) {
  const withPhases = habits.filter((habit) => habit.phases.length >= 2).slice(0, 6);

  // Which way the tracked habits moved overall — the one thing the four little
  // phase bars are there to show, said in words first.
  const rising = withPhases.filter(
    (habit) => (habit.phases[habit.phases.length - 1] ?? 0) > (habit.phases[0] ?? 0),
  ).length;

  return (
    <Panel
      title="Your behavioural history"
      note="Where each started, where it is"
      claim={
        withPhases.length === 0 ? undefined : (
          <>
            Of the <strong>{withPhases.length}</strong> habits with enough history to split,{' '}
            <strong>{rising}</strong> {rising === 1 ? 'is' : 'are'} stronger now than when{' '}
            {rising === 1 ? 'it' : 'they'} started.
          </>
        )
      }
    >
      {withPhases.length === 0 ? (
        <p className="ax-empty">
          Too short a range to split into phases.
        </p>
      ) : (
        <ul className="ax-phases">
          {withPhases.map((habit) => {
            const peak = Math.max(...habit.phases, 0.1);
            const first = habit.phases[0] ?? 0;
            const last = habit.phases[habit.phases.length - 1] ?? 0;
            const tone = STRENGTH_TONE[habit.strength];
            return (
              <li key={habit.id}>
                <span className="ax-phase-name">{habit.name}</span>
                <span className="ax-phase-steps" aria-hidden="true">
                  {habit.phases.map((value, index) => (
                    <i
                      key={index}
                      style={{
                        height: `${Math.max(8, (value / peak) * 100)}%`,
                        background: toneVar(tone),
                        opacity: 0.35 + (index / Math.max(1, habit.phases.length - 1)) * 0.65,
                      }}
                    />
                  ))}
                </span>
                <span className="ax-phase-text">
                  {first.toFixed(1)} → <strong>{last.toFixed(1)}</strong>
                  <span className="ax-muted ax-small"> per week</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {shifts.length > 0 && (
        <ul className="ax-shifts">
          {shifts.slice(0, 5).map((shift) => (
            <li key={`${shift.name}-${shift.event}`}>
              <span className="ax-shift-tag" style={{ color: toneVar(shift.tone), borderColor: toneVar(shift.tone) }}>
                {EVENT_WORD[shift.event]}
              </span>
              <div>
                <strong>{shift.name}</strong>
                <span className="ax-muted ax-small">{shift.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// The opening
// --------------------------------------------------------------------------
/**
 * The tab's opening sentence, naming the reader's own routine back to them.
 *
 * Assembled from the summary rather than written, clause by clause, with each
 * clause dropped when the figure behind it is missing — the same contract the
 * Insights state keeps, for the same reason.
 *
 * It is a function rather than the lead paragraph of the panel below because
 * the sentence belongs at the top of the tab, in the slot every other tab now
 * fills too. See `TabOpening`. The panel keeps everything that is not this
 * sentence, and no longer prints it twice.
 */
export function habitLead(summary: HabitSummary, span: string): string {
  const parts: string[] = [];
  if (summary.tracked > 0) {
    parts.push(
      `${summary.tracked} ${summary.tracked === 1 ? 'habit' : 'habits'} found in ${span}`,
    );
  }
  if (summary.anchor) {
    parts.push(
      `and ${summary.anchor.name} is your most consistent (${summary.anchor.consistency}% of weeks)`,
    );
  }
  return parts.length
    ? `${parts.join(', ')}.`
    : 'Nothing here repeats often enough to call a habit yet.';
}

/** What the routine looks like underneath the sentence at the top of the tab. */
/**
 * `leadWithStrength` is `toneRules().leadWithStrength`, and it decides which of
 * the two habits this panel names goes first — the anchor that is holding, or
 * the one falling fastest.
 *
 * Both are named at every setting. This is the order and not the content, the
 * same line Summary draws on the Overview: a gentle page states what is working
 * before what is not, a blunt one names the slip and then what is left. Nothing
 * here moves `habitSummary`'s arithmetic — the slipping habit is slipping by
 * the same percentage whichever sentence comes first.
 */
export function HabitOpening({
  summary,
  span,
  leadWithStrength = false,
}: {
  summary: HabitSummary;
  span: string;
  leadWithStrength?: boolean;
}) {
  const slip =
    summary.slipping && summary.slipping.trend !== null ? (
      <p className="ax-prose" key="slip">
        <strong>{summary.slipping.name}</strong> is moving the wrong way — down{' '}
        <strong>{Math.abs(summary.slipping.trend)}%</strong> against its own earlier rate.
      </p>
    ) : null;

  /* Only worth stating beside the slip. On its own it is the Anchor tile again,
     four inches lower and in a full sentence. */
  const hold =
    leadWithStrength && slip && summary.anchor ? (
      <p className="ax-prose" key="hold">
        <strong>{summary.anchor.name}</strong> is holding at{' '}
        <strong>{summary.anchor.consistency}%</strong> of weeks.
      </p>
    ) : null;

  return (
    <Panel title="Your routine" note={span}>
      <p className="ax-prose ax-prose-lead">
        You worked <strong>{summary.activeRate}%</strong> of the days here.{' '}
        {summary.activeRate >= 80
          ? 'That is a strong routine.'
          : summary.activeRate >= 50
            ? 'A good routine with some gaps. Try to work on more days.'
            : 'You’re missing most days. Working more often matters more than working longer.'}
      </p>
      {leadWithStrength ? [hold, slip] : [slip, hold]}
    </Panel>
  );
}
