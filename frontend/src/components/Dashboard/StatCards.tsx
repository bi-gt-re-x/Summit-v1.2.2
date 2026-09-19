/**
 * The four cards across the top of the dashboard.
 *
 * One row, one question each: how today is going, where the level is, how much
 * focus time has been banked, and whether the streak is alive. They are small
 * on purpose — anything that needs a sentence to explain belongs in the panels
 * below, not here.
 *
 * All four read from what the page already has. Nothing in this file fetches.
 *
 * Every figure on the row travels to its new value rather than being replaced
 * by it — see hooks/useCountUp.ts for why, and for the rule about feeding it
 * the value at the precision it is shown at. The rings and bars are drawn from
 * those same animated numbers, so the arc, the bar and the label they belong to
 * always agree mid-flight; nothing here is transitioned separately in CSS.
 */
import { useCountUp } from '@/hooks';
import { format } from '@/utils';
import type { UseFocusSession } from '@/hooks/useFocusSession';
import type { DaySummary, Typical } from './summary';
import type { UserStats } from '@/types';
import { Badge, Card, Stat } from '@/components/ui';

// --------------------------------------------------------------------------
// The ring
// --------------------------------------------------------------------------
/** Stroke width and radius, in the 120-unit box the ring is drawn in. */
const RING_R = 50;
const RING_C = 2 * Math.PI * RING_R;

/**
 * A donut showing one percentage.
 *
 * Drawn with `stroke-dasharray` on a circle rotated a quarter turn, so the arc
 * starts at twelve o'clock and fills clockwise. `pathLength` is not used —
 * Safari has historically ignored it on circles — so the dash figures are
 * computed from the real circumference instead.
 */
function ProgressRing({ percent, label }: { percent: number; label: string }) {
  // One animated figure drives both the arc and the reading in the middle, so
  // the ring can never be somewhere the number underneath it is not. The label
  // is announced from the target rather than the tween — a screen reader should
  // be told where the ring got to, not read out every frame on the way.
  const shown = useCountUp(percent);
  const filled = (Math.max(0, Math.min(100, shown)) / 100) * RING_C;

  return (
    <div className="dash-ring">
      <svg viewBox="0 0 120 120" role="img" aria-label={`${percent}% complete`}>
        <circle className="dash-ring-track" cx="60" cy="60" r={RING_R} />
        <circle
          className="dash-ring-fill"
          cx="60"
          cy="60"
          r={RING_R}
          strokeDasharray={`${filled} ${RING_C - filled}`}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="dash-ring-centre">
        <span className="dash-ring-pct">{Math.round(shown)}%</span>
        <span className="dash-ring-label">{label}</span>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Today's Progress
// --------------------------------------------------------------------------
/**
 * The ring, and the three counts it is drawn from.
 *
 * "On Track" under the percentage is a claim, so it is only made when there is
 * something to be on track with: a day with nothing on it reads "Nothing due",
 * not 0% On Track.
 */
export function TodayCard({
  day,
  xpLeft,
  usual,
}: {
  day: DaySummary;
  xpLeft: number;
  usual: Typical;
}) {
  const caption = day.total === 0 ? 'Nothing due' : day.percent >= 60 ? 'On Track' : 'In Progress';

  const total = useCountUp(day.total);
  const done = useCountUp(day.done);
  const left = useCountUp(xpLeft);

  return (
    <Card className="dash-stat dash-stat-today">
      <h2 className="dash-stat-title">Today&apos;s Progress</h2>
      <Trend now={day.done} usual={{ ...usual, value: usual.tasks }} />
      <div className="dash-today-body">
        <ProgressRing percent={day.percent} label={caption} />
        <dl className="dash-today-figures">
          <Stat className="dash-figure" label="Tasks" value={format.number(total)} />
          <Stat className="dash-figure" label="Completed" value={format.number(done)} />
          {/* Not "XP Earned". That figure is the card immediately to the
              right of this one — `+60 XP today` — and having the same number
              twice on two adjacent cards spent one of four slots restating a
              neighbour. This is the other half of it: what finishing the rest
              of today is worth, which nothing else on the page says. */}
          <Stat className="dash-figure" label="XP left" value={format.number(left)} />
        </dl>
      </div>
    </Card>
  );
}

/**
 * "↑ 24% vs usual" — today held against the account's own average day.
 *
 * The comparison, not the figure, is what makes a number about today mean
 * anything: nobody knows off-hand whether 60 XP is a lot *for them*. The
 * baseline is `typicalDay` in ./summary, and the arrow carries the same claim
 * as the colour so the line still reads without it — the same rule the month
 * view's `Delta` follows.
 *
 * Silent in the three cases where a comparison would be a lie: an account with
 * no history behind it, a baseline of zero, which every number is infinitely
 * better than — and a day with nothing on it yet.
 *
 * That third one is the whole day up to now held against whole days that
 * finished. `typicalDay` averages complete days and skips today on purpose, so
 * before somebody has done anything the arithmetic is `(0 - usual) / usual`
 * and the card says **↓ 100% vs usual**, in red, every morning, to an account
 * with a year of work behind it. It is not a shortfall; it is a day that has
 * not happened yet, and −100% is only true of it at midnight.
 *
 * Nothing is hidden by dropping it. The zero it would be commenting on is an
 * inch away in the same card, and the case where a bare day is worth acting on
 * — a streak about to break — is already carried by the notification that says
 * so, at the hour it starts to matter rather than at nine in the morning.
 */
function Trend({ now, usual }: { now: number; usual: Typical & { value: number } }) {
  /* Rendered as a line of its own rather than beside the heading. Inline it
     fitted three cards and wrapped "Today's Progress" onto two, and a row of
     four cards where one heading is taller than the others reads as a mistake
     — while the line below costs height the cards already had, being stretched
     to the tallest of them anyway. */
  if (usual.days === 0 || usual.value <= 0) return <span className="dash-trend is-none" />;
  /* Nothing done yet today — see the third case in the note above. */
  if (now <= 0) return <span className="dash-trend is-none" />;

  const change = Math.round(((now - usual.value) / usual.value) * 100);
  /* Within a tenth either way is not a change, it is the same day. Saying
     "↑ 3%" about a normal Tuesday is how a comparison stops being read. */
  if (Math.abs(change) < 10) {
    return <Badge className="dash-trend">about usual</Badge>;
  }

  const up = change > 0;
  return (
    <Badge
      tone={up ? 'success' : 'danger'}
      className="dash-trend"
      /* The short form on screen and the sentence in the tooltip. "↑ 105%
         above your usual day" is a line of prose in a card the width of a
         phone, and four cards each carrying one is most of what made this row
         feel busy. */
      title={`${Math.abs(change)}% ${up ? 'above' : 'below'} your usual day`}
    >
      <span aria-hidden="true">{up ? '↑' : '↓'}</span> {Math.abs(change)}% vs usual
    </Badge>
  );
}

// --------------------------------------------------------------------------
// XP Overview
// --------------------------------------------------------------------------
/**
 * Level and progress toward the next one, and today against the daily goal.
 *
 * The level is derived from the lifetime total rather than read from
 * `stats.level`, so the bar and the number underneath it can never disagree —
 * `format.levelForTotalXp` mirrors `level_for_total_xp` in
 * backend/tracking/xp.py, and the backend stays the authority on both.
 *
 * The daily goal is the second line, and it is why this card takes it. The
 * account has been asked for that number since the day it signed up — Complete
 * Profile asks for it, Settings edits it, the database stores it — and until
 * now nothing in the app had ever read it back. A number a person is asked to
 * choose and then never shown is worse than one that was never asked for.
 */
export function XpCard({
  stats,
  xpToday,
  dailyGoal,
  usual,
}: {
  stats: UserStats;
  xpToday: number;
  dailyGoal: number;
  usual: Typical;
}) {
  const level = format.levelForTotalXp(stats.xp);

  // The bar is drawn from the XP figure beside it rather than from its own
  // tween, so the two cannot disagree halfway. The level is left to change at
  // once: it is a name for where you are, not a quantity, and counting through
  // 4, 5, 6 would claim to have passed levels that were never occupied. The
  // crossing itself is what <LevelUp/> is for.
  const xpInLevel = useCountUp(level.xpInLevel);
  const today = useCountUp(xpToday);
  const percent = level.xpRequired > 0 ? (xpInLevel / level.xpRequired) * 100 : 0;

  // A goal of zero is not reachable and not a goal; the API floors it at 10,
  // and this is the guard for a payload that predates that.
  const goal = Math.max(1, Math.round(dailyGoal));
  const goalMet = xpToday >= goal;

  return (
    <Card className="dash-stat">
      <h2 className="dash-stat-title">XP Overview</h2>
      <Trend now={xpToday} usual={{ ...usual, value: usual.xp }} />
      <div className="dash-xp-head">
        <span className="dash-xp-level">Level {level.level}</span>
        <span className="dash-xp-count">
          {format.number(xpInLevel)} / {format.number(level.xpRequired)} XP
        </span>
      </div>
      <div className="dash-bar">
        <div
          className="dash-bar-fill"
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={Math.round(level.percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Level ${level.level} progress`}
        />
      </div>
      <p className="dash-xp-today">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
        <strong>+{format.number(today)} XP</strong> today
        {/* Stated as the fraction it is, not as a percentage: the goal is a
            number the reader chose, and showing it back is what makes the
            choice mean something. Met is said in words — 100% and 340% would
            both round to "done" and only one of them is a good day. */}
        <span className="dash-xp-goal">
          {goalMet ? 'daily goal met' : `of ${format.number(goal)} goal`}
        </span>
      </p>
    </Card>
  );
}

// --------------------------------------------------------------------------
// Focus Time
// --------------------------------------------------------------------------
/**
 * Time focused today, against the goal set for today.
 *
 * Both figures come from the *same* session object the Focus panel below is
 * driven by, passed down rather than re-read. Two `useFocusSession` calls would
 * each hold their own copy of the day's localStorage record, and pressing + on
 * the panel would move its goal while this card went on showing the old one.
 */
export function FocusCard({
  session,
  usualHours,
}: {
  session: UseFocusSession;
  /** Hours focused on an average day, or null while the record is still
      being read. The figure comes from the focus history rather than from the
      task list, which is why it arrives separately from `Typical`. */
  usualHours: number | null;
}) {
  // Rounded to the tenth it is shown at *before* it is animated. The session
  // ticks every second, but this reading only moves every six minutes, and
  // feeding the hook the raw total would leave it tweening all day for changes
  // too small to render.
  const hours = useCountUp(Math.round((session.focused / 3600) * 10) / 10);
  // Already whole percents out of the hook that computes it, so the same rule
  // holds: it moves when the bar would move.
  const percent = useCountUp(session.percent);

  return (
    <Card className="dash-stat">
      <h2 className="dash-stat-title">
        <span className="dash-stat-ico dash-ico-focus" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        Focus Time
      </h2>
      <p className="dash-big">
        {hours.toFixed(1)} <span className="dash-big-unit">hrs</span>
      </p>
      <p className="dash-stat-sub">Today</p>
      <p className="dash-stat-foot">
        Daily Goal: {session.goalHours.toFixed(1)} hrs
        {usualHours !== null && usualHours > 0 && (
          <span className="dash-stat-usual">· usually {usualHours.toFixed(1)}</span>
        )}
      </p>
      <div className="dash-bar dash-bar-green">
        <div
          className="dash-bar-fill"
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={session.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Focus goal progress"
        />
      </div>
    </Card>
  );
}

// --------------------------------------------------------------------------
// Current Streak
// --------------------------------------------------------------------------
/**
 * The streak, and a line of encouragement pitched at where it is.
 *
 * The number is whatever `/api/get_user_data` last said, and that call decays a
 * streak that went stale overnight while answering — so a streak shown here is
 * one the backend still considers alive.
 */
export function StreakCard({ stats }: { stats: UserStats }) {
  const current = Number(stats.current_streak) || 0;
  const best = Number(stats.best_streak) || 0;

  // Both counters run, but the word beside them is chosen from the real figure,
  // so a streak of 1 never reads "0 days" on its way up.
  const shownCurrent = Math.round(useCountUp(current));
  const shownBest = Math.round(useCountUp(best));

  /* No percentage here, and that is not an omission. A streak is a count of
     consecutive days, so "up 40% on usual" is not a sentence about one — what
     it has instead is a target it can actually be measured against, which is
     the reader's own record. */
  const toBeat = best > current ? best - current : 0;

  return (
    <Card className="dash-stat">
      <h2 className="dash-stat-title">
        <span className="dash-stat-ico dash-ico-streak" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.1.2-2.2.5-3.3" />
          </svg>
        </span>
        Current Streak
      </h2>
      <p className="dash-big">
        {shownCurrent} <span className="dash-big-unit">{current === 1 ? 'day' : 'days'}</span>
      </p>
      {/* The line under the figure is where the target goes, because it is the
          only thing on this card the reader can act on. "Nice run" is what a
          streak already at its own record gets — there is nothing left to
          chase and saying so is the whole reward. */}
      <p className="dash-stat-sub">
        {current === 0
          ? 'Keep it going!'
          : toBeat > 0
            ? `${toBeat} ${toBeat === 1 ? 'day' : 'days'} to your best`
            : 'Your best run yet.'}
      </p>
      <p className="dash-stat-foot">
        Best Streak: {shownBest} {best === 1 ? 'day' : 'days'}
      </p>
    </Card>
  );
}
