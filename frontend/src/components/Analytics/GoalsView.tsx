/**
 * The Goals tab — how the set of goals is doing, and what is missing from it.
 *
 * It replaced Trends, and the two answer different questions about the same
 * record: Trends asked which way each *measure* was heading, this asks whether
 * the things the reader actually aimed at are going to happen. The measures
 * are still on the page — the Overview leads with all three and their
 * direction, and the score panel draws them over time.
 *
 * ## What each panel is not
 *
 * The goals page has a card per goal and a drawer behind it, and every figure
 * about one goal is already there in higher resolution. So nothing here is a
 * goal card: this tab is about the *portfolio*, and every panel states
 * something that is only true of the set — the spread of health across it, how
 * much of the account's work is aimed at any of it, what it is missing. The
 * one place it names individual goals is where the set has a shape a name
 * explains ("three at risk, and this is the worst of them"), and those names
 * are links out to the page that can actually do something about them.
 *
 * ## Silence is a real answer here
 *
 * `Suggestions` is empty for a reader with well-covered, well-paced goals, and
 * that is the intended common case rather than a gap to fill — see
 * utils/goalSuggest. The same rule the rest of this page follows.
 */
import { Link } from 'react-router-dom';
import { Columns, Panel } from './charts';
import { StatRow, type Stat } from './StatRow';
import type { GoalNote, GoalsOverview } from '@/utils/goalAnalytics';
import type {
  EffortRow,
  GoalSuggestion,
  PacePoint,
  ReachedMonth,
} from '@/utils/goalSuggest';
import type { GoalWorkRow, LinkCoverage } from '@/utils/goalWork';
import type { Goal, Task } from '@/types';
import { goalHealth, goalPace } from '@/utils/goalHealth';
import { goalNumbers } from '@/components/Goals/numbers';

// --------------------------------------------------------------------------
// The spread
// --------------------------------------------------------------------------
/** "in 3 days", "tomorrow", "2 days over". Days, because a fortnight is short. */
function dueWords(deadline: string, today: Date = new Date()): string {
  const at = Date.parse(`${String(deadline).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(at)) return '';
  const days = Math.round((at - new Date(today.toDateString()).getTime()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} over`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

// --------------------------------------------------------------------------
// The row the tab opens with
// --------------------------------------------------------------------------
/**
 * The whole set in five figures, above everything that explains them.
 *
 * The Overview opens on `Tiles` and every other tab on a `StatRow`, and this
 * one opened on a paragraph and a panel — so the tab a reader came to for
 * "are my goals going to happen" made them read a sentence and then find the
 * answer inside a card. Same component as every other tab now, which is the
 * whole argument for StatRow existing (see the note at its head).
 *
 * It is deliberately the same figures `PortfolioPanel` breaks down underneath.
 * The tile is the reading and the panel is the working — the Overview does
 * exactly this with the score, which is a tile above and `ScorePanel` below.
 * What is not repeated is the words: the notes here are two or three each,
 * because a tile a reader has to read a sentence off is a paragraph in a box.
 */
export function GoalTiles({ overview }: { overview: GoalsOverview }) {
  const behind = overview.atRisk + overview.offTrack;

  const stats: Stat[] = [
    {
      key: 'live',
      label: 'Live',
      value: String(overview.active),
      tone: 'violet',
      glyph: 'target',
      ...(overview.completed > 0 ? { note: `${overview.completed} finished` } : {}),
    },
    {
      key: 'on-track',
      label: 'On track',
      value: String(overview.onTrack),
      tone: 'green',
      glyph: 'check',
    },
    {
      key: 'behind',
      label: 'Behind',
      value: String(behind),
      /* No glyph, so the row draws a tone dot — none of the nine says "behind"
         and a wrong drawing is worse than none. The tone carries it: pink while
         there is something to answer for, green once there is not. */
      tone: behind > 0 ? 'pink' : 'green',
      ...(behind > 0 ? { note: `${overview.offTrack} off track` } : {}),
    },
    /* The weighted mean, which is the one figure here that is not a count.
       Guarded for the reason `PortfolioPanel` guards it: a mean across no live
       goals is a mean of nothing, and a large 0% reads as a score. */
    ...(overview.active > 0
      ? [
          {
            key: 'progress',
            label: 'Progress',
            value: `${Math.round(overview.overall)}%`,
            tone: 'blue' as const,
            glyph: 'sparkle' as const,
            note: 'weighted by priority',
          },
        ]
      : []),
    {
      key: 'due-soon',
      label: 'Due soon',
      value: String(overview.dueSoon.length),
      tone: 'amber',
      glyph: 'clock',
      note: 'next 14 days',
    },
  ];

  return <StatRow stats={stats} />;
}

export interface PortfolioPanelProps {
  overview: GoalsOverview;
}

/**
 * The set as four counts and one figure.
 *
 * The bar is stacked rather than four separate tiles because the question is
 * proportion — "how much of what I am aiming at is in trouble" — and four
 * numbers side by side make the reader do the division.
 */
export function PortfolioPanel({ overview }: PortfolioPanelProps) {
  const bands = [
    { key: 'on-track', label: 'On track', count: overview.onTrack, tone: 'good' },
    { key: 'at-risk', label: 'At risk', count: overview.atRisk, tone: 'warn' },
    { key: 'off-track', label: 'Off track', count: overview.offTrack, tone: 'bad' },
    { key: 'not-started', label: 'Not started', count: overview.notStarted, tone: 'flat' },
  ];
  /* The bar drops the empty bands and the counts keep them. A zero-width
     segment is not a segment, but "0 off track" is a reading — it is half of
     what the reader came to the panel to find out, and dropping it made the
     legend a caption for the bar rather than the four figures themselves. */
  const drawn = bands.filter((band) => band.count > 0);

  return (
    <Panel title="The set">
      {/* The figure is the weighted mean across live goals, so with none it is
          a mean of nothing — and a large "0%" above "nothing live" reads as a
          score rather than as an absence. The sentence carries it alone. */}
      {overview.active > 0 && (
        <div className="ax-goal-head">
          <strong className="ax-goal-figure">{Math.round(overview.overall)}%</strong>
          <p className="ax-muted">
            across <strong>{overview.active}</strong>{' '}
            {overview.active === 1 ? 'live goal' : 'live goals'}, weighted by the priority you
            gave each one
            {overview.completed > 0 ? `. ${overview.completed} finished.` : '.'}
          </p>
        </div>
      )}

      {overview.active === 0 ? (
        <p className="ax-empty">
          Nothing live{overview.completed > 0 ? `, and ${overview.completed} finished` : ''}. The
          figures on this page have no target to be read against until something here does.
        </p>
      ) : (
        <>
          <div className="ax-goal-bar" role="img" aria-label={drawn.map((b) => `${b.count} ${b.label}`).join(', ')}>
            {drawn.map((band) => (
              <i
                key={band.key}
                className={`is-${band.tone}`}
                style={{ flexGrow: band.count }}
                title={`${band.count} ${band.label.toLowerCase()}`}
              />
            ))}
          </div>
          {/* Four figures rather than a caption in 12px. This is the panel's
              answer, and it was set smaller than the footnotes underneath it. */}
          <ul className="ax-goal-legend">
            {bands.map((band) => (
              <li key={band.key} className={band.count === 0 ? 'is-zero' : undefined}>
                <i className={`is-${band.tone}`} aria-hidden="true" />
                <strong>{band.count}</strong>
                <span>{band.label}</span>
              </li>
            ))}
          </ul>

          {/* What lands next. `goalsOverview` has computed this since it was
              written and nothing had ever drawn it — it is the one thing about
              the set that is time-critical rather than descriptive, and it
              belongs beside the spread rather than in a panel of its own. */}
          <div className="ax-goal-soon">
            <h4>Due in the next fortnight</h4>
            {overview.dueSoon.length === 0 ? (
              <p className="ax-muted">
                Nothing lands in the next two weeks. The pace map is the longer view.
              </p>
            ) : (
              <ul>
                {overview.dueSoon.slice(0, 5).map((goal) => (
                  <li key={goal.id}>
                    <Link to="/goals" title={goal.title}>
                      {goal.title}
                    </Link>
                    <span className="ax-muted">{dueWords(goal.deadline)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* What the four bands are, on the card that draws them. The states
              are computed from three different signals and the page had never
              said so anywhere — a reader who wondered why a goal was "at risk"
              had nowhere on this tab to find out. */}
          <p className="ax-muted ax-goal-foot">
            Each goal's state is read from its progress against its date, how recently it
            moved, and how much of your work is linked to it —{' '}
            <Link to="/goals" className="ax-link">
              the goals page
            </Link>{' '}
            names the weakest signal for each one.
          </p>
        </>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Pace
// --------------------------------------------------------------------------
export interface PacePanelProps {
  goals: Goal[];
  tasks: Task[];
}

/**
 * Which goals land when they said they would, at the rate they are actually
 * going.
 *
 * Only the goals that can answer: a goal with no date has nothing to be early
 * or late against, and one with no work behind it has no rate. Both are
 * dropped rather than printed as a dash, so the panel is a list of real
 * readings or it is not there.
 */
/**
 * A drift in words.
 *
 * `goalPace` projects the current rate out to 100%, and a goal barely moving
 * projects a very long way — "795 days late" is arithmetically true and reads
 * as a broken number. Past a year the projection has stopped being a date and
 * become a statement that the rate is not going to get there, so it is printed
 * as one. The precise figure is on the goal's own drawer, where the rate it
 * came from is beside it.
 */
function driftWords(drift: number): string {
  if (drift === 0) return 'on the day';
  const late = drift > 0;
  const size = Math.abs(drift);
  if (size > 365) return late ? 'over a year late' : 'over a year early';
  if (size > 90) {
    const months = Math.round(size / 30);
    return `about ${months} months ${late ? 'late' : 'early'}`;
  }
  return `${size} days ${late ? 'late' : 'early'}`;
}

/**
 * How much of a goal's window has passed, 0-1.
 *
 * Null when the window is not a window — no start, or a deadline on or before
 * it. `paceMap` computes the same share for the chart; this is the row-level
 * one, kept here rather than exported from there because the two want
 * different things on the edges (the chart plots past 1, a bar does not).
 */
function elapsedShare(goal: Goal, today: Date = new Date()): number | null {
  const day = (value: string | null | undefined) => {
    const at = Date.parse(`${String(value ?? '').slice(0, 10)}T00:00:00`);
    return Number.isNaN(at) ? null : at;
  };
  const start = day(goal.start_date) ?? day(goal.created_at);
  const end = day(goal.deadline);
  if (start === null || end === null || end <= start) return null;
  return Math.min(Math.max((today.getTime() - start) / (end - start), 0), 1);
}

/** "12 Oct". The year is dropped — every projection here is inside one. */
function landingWords(iso: string): string {
  const at = Date.parse(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(at)) return '';
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function PacePanel({ goals, tasks }: PacePanelProps) {
  const rows = goals
    .filter((goal) => goal.status !== 'completed' && goal.deadline)
    .map((goal) => ({ goal, pace: goalPace(goal), health: goalHealth(goal, tasks) }))
    .filter((row) => row.pace.drift !== null)
    .sort((a, b) => (b.pace.drift ?? 0) - (a.pace.drift ?? 0))
    .slice(0, 5);

  if (rows.length === 0) {
    return (
      <Panel title="Pace against the dates">
        <p className="ax-empty">
          No goal here has both a date and enough finished work to read a rate from. Pace is
          measured, not estimated — see the goals page for what each one is waiting on.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Pace against the dates">
      <ul className="ax-goal-pace">
        {rows.map(({ goal, pace, health }) => {
          const drift = pace.drift ?? 0;
          const late = drift > 0;
          const progress = Math.round(goalNumbers(goal).progress);
          /* The rate it is getting against the rate it needs. A ratio rather
             than the two raw figures, because "units a day" is a unit the
             reader never chose and 0.4 against 0.9 is a division to do. */
          const ratio =
            pace.need && pace.need > 0 && pace.have !== null ? pace.have / pace.need : null;
          /* How much of its window has gone. This shares the bar's axis with
             `progress` on purpose — both are shares of the same goal, one of
             its work and one of its time, and the gap between them is exactly
             what `driftWords` says in words above. */
          const elapsed = elapsedShare(goal);
          return (
            <li key={goal.id} className={late ? 'is-late' : 'is-early'}>
              <div className="ax-goal-pace-top">
                <Link to="/goals" className="ax-goal-name" title={goal.title}>
                  {goal.title}
                </Link>
                <span className="ax-goal-drift">{driftWords(drift)}</span>
              </div>

              {/* Done against the deadline still to come. The panel used to
                  print the percentage alone, and a bare "40%" beside "12 days
                  late" makes the reader hold both and do the comparison the
                  bar does for them. */}
              <div
                className="ax-goal-pace-bar"
                role="img"
                aria-label={`${progress}% done${
                  elapsed === null ? '' : `, ${Math.round(elapsed * 100)}% of the time gone`
                }`}
              >
                <i style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }} />
                {elapsed !== null && (
                  <b
                    style={{ left: `${Math.round(elapsed * 100)}%` }}
                    title={`${Math.round(elapsed * 100)}% of the time is gone`}
                  />
                )}
              </div>

              <div className="ax-goal-pace-foot">
                <span>
                  <strong>{progress}%</strong> done
                </span>
                {ratio !== null && (
                  <span title="Its actual rate as a share of the rate the deadline needs">
                    {Math.round(ratio * 100)}% of the pace it needs
                  </span>
                )}
                <span>{pace.lands ? `lands ${landingWords(pace.lands)}` : health.label}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="ax-muted ax-goal-foot">
        The bar is the work done; the notch is how much of the time has gone. A bar short of
        its notch is a goal behind — and the landing date is at the rate it has actually been
        moving, not the rate it would need.
      </p>
    </Panel>
  );
}

// --------------------------------------------------------------------------
// What the set says
// --------------------------------------------------------------------------
/**
 * It used to return `null` when it had nothing, and that was wrong here.
 *
 * The panel sits in a two-column row, so a null second child left the row
 * half-drawn — one card and an equal expanse of page beside it, which reads as
 * a panel that failed to load rather than as a set with nothing remarkable in
 * it. Silence is a real answer on this tab (see the note at the top of this
 * file), but it has to be *said*, the way every other panel here says it.
 */
export function NotesPanel({ notes }: { notes: GoalNote[] }) {
  return (
    <Panel title="What stands out">
      {notes.length === 0 ? (
        <p className="ax-empty">
          Nothing about the set stands out either way — no goal is running away from the rest
          and none has gone quiet. This panel only speaks when the shape of your goals says
          something the counts above do not.
        </p>
      ) : (
        <>
          <ul className="ax-goal-notes">
            {notes.map((note) => (
              <li key={note.headline} className={`is-${note.tone}`}>
                <strong>{note.headline}</strong>
                <span className="ax-muted">{note.hint}</span>
              </li>
            ))}
          </ul>
          <p className="ax-muted ax-goal-foot">
            Only what is true of the set rather than of one goal. Every figure about a single
            goal is on{' '}
            <Link to="/goals" className="ax-link">
              its own card
            </Link>
            , in higher resolution than this tab can carry.
          </p>
        </>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// What is missing
// --------------------------------------------------------------------------
/**
 * `limit` is `toneRules().headlines` — how many changes this account asked to
 * be shown at once. Two on gentle, three on balanced, everything the record
 * supports on blunt. It drops rows off an already-ranked list rather than
 * rewriting any of them: the suggestion a gentle reader is shown is the same
 * suggestion, and the ones held back are the weakest, never the worst.
 */
export function SuggestPanel({
  suggestions,
  limit,
}: {
  suggestions: GoalSuggestion[];
  limit?: number;
}) {
  const shown = limit === undefined ? suggestions : suggestions.slice(0, Math.max(1, limit));
  const held = suggestions.length - shown.length;

  return (
    <Panel title="Worth setting">
      {suggestions.length === 0 ? (
        <p className="ax-empty">
          Nothing obvious missing. Your goals cover the subjects you are working in and the
          ones with dates are pacing — this panel stays quiet until that stops being true.
        </p>
      ) : (
        <>
          {/* Two columns at full width. This panel spans the tab, and a single
              file of short rows down the left of it left the right half of the
              card empty on every screen wider than a phone. */}
          <ul className="ax-goal-suggest">
            {shown.map((row) => (
              <li key={row.id}>
                <span className={`ax-goal-kind is-${row.kind}`}>{row.kind}</span>
                <div>
                  <strong>{row.title}</strong>
                  <span className="ax-muted">{row.because}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="ax-muted ax-goal-foot">
            {held > 0 && `${held} more held back at this tone. `}
            Each one is drawn from your own record, and nothing here creates a goal —{' '}
            <Link to="/goals" className="ax-link">
              the goals page
            </Link>{' '}
            does that.
          </p>
        </>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// The pace map
// --------------------------------------------------------------------------
export interface PaceMapProps {
  points: PacePoint[];
  /** Live goals with no deadline, counted out loud rather than plotted. */
  undated: number;
}

/** Where a state sits on the palette. One place, so the dots and the key agree. */
const STATE_TONE: Record<string, string> = {
  'on-track': 'var(--ax-green)',
  'at-risk': 'var(--ax-amber)',
  'off-track': 'var(--ax-pink)',
  'not-started': 'var(--ax-line)',
};

/** Reading order for the key — best to worst, then the ones not begun. */
const STATE_LABEL: Array<[string, string]> = [
  ['on-track', 'On track'],
  ['at-risk', 'At risk'],
  ['off-track', 'Off track'],
  ['not-started', 'Not started'],
];

/**
 * Time gone against work done, with the diagonal that makes it mean something.
 *
 * The whole chart is the line: a goal exactly on pace sits where the two
 * shares are equal, so everything below the diagonal is behind and everything
 * above is ahead. That is the comparison a list of percentages cannot give,
 * because "40% done" says nothing until you know whether a fifth or nine
 * tenths of the time has gone.
 *
 * Drawn here rather than with `Scatter` because this needs three things that
 * primitive deliberately does not have: a colour per point (the health state),
 * a size per point (the priority), and a reference line. `Scatter`'s one tone
 * and no-line-unless-earned rule is right for a correlation cloud and wrong
 * for a chart whose entire content is the reference.
 *
 * The plot area runs to 1.2 on x so an overdue goal sits past the deadline
 * gridline rather than clamped onto it beside goals merely due today.
 */
export function PaceMapPanel({ points, undated }: PaceMapProps) {
  const W = 320;
  const H = 210;
  const pad = { top: 10, right: 10, bottom: 10, left: 10 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const X_MAX = 1.2;

  /* An inset the width of the biggest dot, so a goal at 0% or at (or past)
     100% sits inside the frame rather than half-clipped on its edge. Goals
     that have overshot their target are common and land exactly on 1. */
  const DOT = 8;
  const x = (v: number) => pad.left + (v / X_MAX) * plotW;
  const y = (v: number) => pad.top + DOT + (1 - v) * (plotH - DOT * 2);

  /* Only the states actually on the chart. A key listing four colours when
     three of them are not plotted describes the palette rather than the
     reader's goals. */
  const counts = points.reduce<Record<string, number>>((tally, point) => {
    tally[point.state] = (tally[point.state] ?? 0) + 1;
    return tally;
  }, {});

  if (points.length === 0) {
    return (
      <Panel title="Time gone against work done">
        <p className="ax-empty">
          {undated > 0
            ? `${undated} live ${undated === 1 ? 'goal has' : 'goals have'} no deadline, so there is no window for time to be a share of. Put a date on one and it appears here.`
            : 'Nothing live with a date on it yet.'}
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Time gone against work done">
      <svg
        className="ax-pacemap"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${points.length} goals plotted against how much of their time has passed`}
      >
        {/* The frame, then the deadline, then the diagonal — in that order so
            the line the chart is about is drawn over everything else. */}
        <rect x={pad.left} y={pad.top} width={plotW} height={plotH} className="ax-pacemap-plot" />
        {[0.25, 0.5, 0.75].map((at) => (
          <line key={at} x1={x(at)} y1={pad.top} x2={x(at)} y2={pad.top + plotH} className="ax-pacemap-grid" />
        ))}
        <line
          x1={x(1)}
          y1={pad.top}
          x2={x(1)}
          y2={pad.top + plotH}
          className="ax-pacemap-deadline"
        />
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="ax-pacemap-pace" />

        {points.map((point) => (
          <circle
            key={point.id}
            cx={x(point.elapsed)}
            cy={y(point.progress)}
            /* Priority as area rather than radius — a 10 is not ten times the
               dot of a 1, and radius would make it a hundred. */
            r={3.5 + Math.sqrt(point.weight) * 1.1}
            fill={STATE_TONE[point.state] ?? 'var(--ax-violet)'}
            className="ax-pacemap-dot"
          >
            <title>
              {point.title} — {Math.round(point.progress * 100)}% done,{' '}
              {Math.round(point.elapsed * 100)}% of the time gone
            </title>
          </circle>
        ))}

      </svg>

      {/* The axis labels are HTML, not <text> inside the chart. The svg scales
          to the panel, so a font-size in viewBox units renders at whatever the
          scale happens to be — 9px became 15px in a half-width panel and would
          become something else again in a wider one. Out here they are simply
          the size they say they are. */}
      <div className="ax-pacemap-axis">
        <span>start</span>
        <span>deadline</span>
      </div>

      {/* The key. Every dot carries two variables — health in its colour and
          priority in its area — and neither was written down anywhere on the
          page. A reader met four colours and a spread of sizes and had to
          infer both, which is the one thing a chart may not ask of them. */}
      <ul className="ax-pacemap-key">
        {STATE_LABEL.filter(([state]) => counts[state]).map(([state, label]) => (
          <li key={state}>
            <i style={{ background: STATE_TONE[state] }} aria-hidden="true" />
            <span>{label}</span>
            <strong>{counts[state]}</strong>
          </li>
        ))}
        <li className="is-size">
          <i aria-hidden="true" />
          <span>larger dot, higher priority</span>
        </li>
      </ul>

      <p className="ax-muted ax-goal-foot">
        Goals below the diagonal are behind schedule.
        {undated > 0
          ? ` ${undated} ${undated === 1 ? 'goal has' : 'goals have'} no due date and ${undated === 1 ? 'is' : 'are'} not shown.`
          : ''}
      </p>
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Checkpoints reached
// --------------------------------------------------------------------------
export function CheckpointsPanel({ months }: { months: ReachedMonth[] }) {
  const total = months.reduce((sum, row) => sum + row.count, 0);
  const peak = Math.max(...months.map((row) => row.count), 0);
  /* Only when it is actually the best month. `Columns` marks the peak so the
     answer to "when" is visible before the numbers are read — and with every
     month tied there is no such answer, so marking all of them paints the
     whole row in the accent and says nothing. */
  const unique = months.filter((row) => row.count === peak).length === 1;
  /* Named only when it is the single best month — with everything tied there
     is no "best", and the same rule that keeps `Columns` from painting the
     whole row in the accent keeps the label off it. */
  const best = unique ? months.find((row) => row.count === peak) : null;
  const current = months[months.length - 1];

  return (
    <Panel title="Checkpoints reached">
      {total === 0 ? (
        <p className="ax-empty">
          No checkpoint has been ticked in the last {months.length} months. This is the only
          history goals keep — a goal's progress is not recorded over time, but the day you
          reach a checkpoint is.
        </p>
      ) : (
        <>
          {/* The three readings a bar chart of six months makes the reader work
              out by eye: the run rate, the best of them, and where the month
              they are standing in has got to. The chart is still the panel —
              these are the numbers it is a picture of. */}
          <ul className="ax-goal-stats">
            <li>
              <strong>{total}</strong>
              <span>in {months.length} months</span>
            </li>
            <li>
              <strong>{(total / months.length).toFixed(1)}</strong>
              <span>a month, average</span>
            </li>
            <li>
              <strong>{peak}</strong>
              <span>best month{best ? `, ${best.label}` : ''}</span>
            </li>
            <li>
              <strong>{current?.count ?? 0}</strong>
              <span>this month so far</span>
            </li>
          </ul>

          <Columns
            columns={months.map((row) => ({
              label: row.label,
              value: row.count,
              text: row.count === 0 ? '—' : String(row.count),
              peak: unique && row.count > 0 && row.count === peak,
            }))}
            tone="green"
            label="Goal checkpoints reached each month"
          />
          <p className="ax-muted ax-goal-foot">
            Empty months are kept — a gap is the finding, and skipping them would draw four
            scattered checkpoints as a rhythm.
          </p>
        </>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Effort against priority
// --------------------------------------------------------------------------
export function EffortPanel({ rows }: { rows: EffortRow[] }) {
  if (rows.length === 0) {
    return (
      <Panel title="What you said against what you did">
        <p className="ax-empty">Nothing live to compare yet.</p>
      </Panel>
    );
  }

  /* The gap worth naming: highest priority, least of the work. Only called out
     when it is wide enough to be a finding rather than rounding. */
  const worst = [...rows].sort((a, b) => b.priority - b.effort - (a.priority - a.effort))[0];
  const gap = worst ? worst.priority - worst.effort : 0;

  return (
    <Panel title="What you said against what you did">
      <ul className="ax-goal-effort">
        {rows.map((row) => (
          <li key={row.id}>
            <div className="ax-goal-effort-head">
              <span className="ax-goal-effort-name" title={row.title}>
                {row.title}
              </span>
              {/* The count the bars are a share *of*. It was in a tooltip, which
                  is to say it was nowhere: two bars whose lengths are both
                  proportions say nothing about whether the row is built on
                  forty finished tasks or on one. */}
              <span className="ax-goal-effort-count">
                {row.finished} {row.finished === 1 ? 'task' : 'tasks'}
              </span>
            </div>
            <span className="ax-goal-effort-bars">
              <i className="is-said" style={{ width: `${row.priority * 100}%` }} title={`Priority ${Math.round(row.priority * 10)} of 10`} />
              <i className="is-did" style={{ width: `${row.effort * 100}%` }} title={`${row.finished} finished tasks — ${Math.round(row.effort * 100)}% of your goal work`} />
            </span>
          </li>
        ))}
      </ul>
      <p className="ax-goal-key">
        <span><i className="is-said" /> priority you set</span>
        <span><i className="is-did" /> share of your goal work</span>
      </p>

      {worst && gap >= 0.35 && (
        <p className="ax-muted ax-goal-foot">
          <strong>{worst.title}</strong> is the widest gap: you rated it{' '}
          {Math.round(worst.priority * 10)} out of 10 and it has taken{' '}
          {Math.round(worst.effort * 100)}% of your goal work.
        </p>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// The work itself
// --------------------------------------------------------------------------
/** "2,410" — the figures here are counts and XP, never fractions. */
const whole = (value: number) => Math.round(value).toLocaleString();

/** "4h 20m", "35m", "—". Recorded time only; most tasks carry none. */
function spent(minutes: number): string {
  if (minutes <= 0) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "today", "yesterday", "12 days ago", "not yet". */
function worked(days: number | null): string {
  if (days === null) return 'not yet';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/**
 * What has actually been done toward each goal.
 *
 * The panel the tab was missing: everything else here is a rate, a share or a
 * projection, and none of them say what the reader did. A goal at 20% with
 * four finished tasks behind it and one with forty are different situations
 * and every other panel drew them the same.
 *
 * The chosen/matched split is on the row rather than in a tooltip for the
 * reason the effort panel puts its count there: a figure whose confidence
 * varies has to carry the thing that varies it. Forty tasks the reader filed
 * themselves is a fact; forty the matcher inferred is a reading.
 */
export function GoalWorkPanel({ rows }: { rows: GoalWorkRow[] }) {
  if (rows.length === 0) {
    return (
      <Panel title="What you have done toward each">
        <p className="ax-empty">No live goals to account for yet.</p>
      </Panel>
    );
  }

  const busiest = Math.max(...rows.map((row) => row.finished), 1);
  const idle = rows.filter((row) => row.finished === 0);

  return (
    <Panel title="What you have done toward each">
      <ul className="ax-goal-work">
        {rows.map((row) => (
          <li key={row.id}>
            <div className="ax-goal-work-head">
              <span className="ax-goal-work-name" title={row.title}>
                {row.title}
              </span>
              <span className="ax-goal-work-when">{worked(row.daysSince)}</span>
            </div>
            {/* Length is the count against the busiest goal, so the row is
                readable as a row and the column is readable as a comparison. */}
            <span className="ax-goal-work-bar">
              <i
                className={row.finished === 0 ? 'is-none' : undefined}
                style={{ width: `${(row.finished / busiest) * 100}%` }}
              />
            </span>
            <dl className="ax-goal-work-figures">
              <div>
                <dt>Finished</dt>
                <dd>{whole(row.finished)}</dd>
              </div>
              <div>
                <dt>XP</dt>
                <dd>{whole(row.xp)}</dd>
              </div>
              <div>
                <dt>Tracked</dt>
                <dd>{spent(row.minutes)}</dd>
              </div>
              <div>
                {/* Only where there is something to split. "0 chosen" under a
                    goal with no work is a second way of saying nothing. */}
                <dt>You filed</dt>
                <dd>
                  {row.finished === 0 ? '—' : `${whole(row.chosen)} of ${whole(row.finished)}`}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      {idle.length > 0 && (
        <p className="ax-muted ax-goal-foot">
          {idle.length === 1 ? (
            <>
              <strong>{idle[0]!.title}</strong> has nothing finished against it yet.
            </>
          ) : (
            <>
              {idle.length} goals have nothing finished against them yet.
            </>
          )}{' '}
          A task counts toward a goal when you file it there or when its name says so.
        </p>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// How work reaches a goal at all
// --------------------------------------------------------------------------
/**
 * The counting rule, made visible.
 *
 * Every other figure on this tab is built on "work that counts toward a goal",
 * and until now the page never said what that meant. The reader could see a
 * goal's total move without having filed anything there and had no way to find
 * out why — the matcher is real and it is invisible, which is the worst
 * combination for a number somebody is meant to trust.
 *
 * So this panel is the legend for the rest of the tab: three counts, in the
 * order the app decides them, and a sentence saying that the third is normal.
 * `loose` is deliberately not styled as a problem. Most of anybody's finished
 * work belongs to no goal, and a page that treats every unlinked task as
 * something to fix is a page asking its reader to file "email Mr Chen" against
 * a five-year plan.
 */
export function LinkCoveragePanel({ coverage }: { coverage: LinkCoverage }) {
  if (coverage.finished === 0) {
    return (
      <Panel title="How work reaches a goal">
        <p className="ax-empty">Nothing finished yet, so nothing has been counted either way.</p>
      </Panel>
    );
  }

  const share = (value: number) => (value / coverage.finished) * 100;
  const parts = [
    { key: 'chosen', label: 'You filed it there', value: coverage.chosen },
    { key: 'matched', label: 'Matched from the name', value: coverage.matched },
    { key: 'loose', label: 'Counts toward nothing', value: coverage.loose },
  ];

  return (
    <Panel title="How work reaches a goal">
      <p className="ax-goal-cover-lead">
        <strong>{Math.round(coverage.share * 100)}%</strong> of your finished work is aimed at
        a goal.
      </p>

      <span className="ax-goal-cover-bar" aria-hidden="true">
        {parts.map((part) => (
          <i key={part.key} className={`is-${part.key}`} style={{ width: `${share(part.value)}%` }} />
        ))}
      </span>

      <ul className="ax-goal-cover-key">
        {parts.map((part) => (
          <li key={part.key}>
            <i className={`is-${part.key}`} aria-hidden="true" />
            <span className="ax-goal-cover-label">{part.label}</span>
            <strong>{whole(part.value)}</strong>
          </li>
        ))}
      </ul>

      <p className="ax-muted ax-goal-foot">
        Choosing a goal when you write a task down is the definite version and nothing
        overrides it. Leave it and the name decides: a task called after a goal, or filed
        under a subject the goal is about, is counted toward it. Anything the name does not
        reach counts toward nothing, which is what most work is.
      </p>
    </Panel>
  );
}
