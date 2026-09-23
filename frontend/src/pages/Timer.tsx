/**
 * Timer — the focus page: pick a session, run it, and see what it added up to.
 *
 * ## It is the same hours, and the same XP
 *
 * A running focus phase runs the account's own focus session, so what happens
 * here lands where a session started from the dashboard does — the Focus card,
 * the calendar, the focus metric on the report card. Nothing on this page mints
 * XP and no setting on it multiplies any: the intensity level changes how many
 * sittings you are *aiming* at, and the extra XP that follows a harder day is
 * the extra work, counted the ordinary way. See LEVELS in components/Timer.
 *
 * ## Every figure is read, not written
 *
 * The tiles, the bars, the line, the ratings, the goals and the tasks are all
 * the account's own record, from the endpoints that already serve them
 * elsewhere. The deltas are a real period against the real one before it, which
 * is why the range control refetches — "vs previous" has to mean the week
 * before the week on screen, and a window twice the size is what makes that
 * comparison exist.
 *
 * Where a figure would need something the app does not record, it is not shown
 * rather than estimated. There is no average *session* length in the tiles
 * because the server stores no session boundary — only the day's total — so
 * that tile is an average per working day, and is labelled as one.
 *
 * ## The two readings that are local, and why they are marked as such
 *
 * The recommendation and the session readout are the exceptions, and they are
 * not exceptions to the rule above. Neither is estimated from the day totals:
 * both read the interval log, which is a real record of real sittings written
 * as each one ends — hooks/useIntervals holds it, hooks/usePomodoro writes it,
 * components/Timer/intervals.ts is the arithmetic.
 *
 * That log lives in this browser. So the recommendation says how many sittings
 * it rests on, it declines to say anything at all until there are enough of
 * them at more than one length, and the session readout is about today rather
 * than about the account. The hours remain the account's, on the server, in the
 * tiles — losing the log loses the shape and not one minute of the work.
 *
 * ## What the time is for
 *
 * The climb is the page's one piece of borrowed data: the account's own goals,
 * from the same endpoint the Goals page reads. It puts them under two headings
 * and the headings are the content. A goal measured in focus time is advanced
 * by this page, so its own figures are printed under a line saying the minutes
 * count; every other kind is listed as what today's *finished work* fed, which
 * is what `goalIdsOf` (utils/goalLinks) says and nothing more. One list holding
 * both would tell somebody an afternoon at the clock was progress on a goal
 * that only counts closed tasks.
 *
 * ## The one figure on this page nobody can count
 *
 * A sitting may be given an intention — one line, optionally with a number —
 * and afterwards the page asks what came of it. That answer is a **self-report**
 * and is labelled as one wherever it is shown. Nothing here knows how many
 * problems were worked, and the alternative to asking was to print the number
 * the app *can* count, tasks closed, under an objective about something else.
 * The question is asked once, about the sitting that has just happened, and is
 * dropped rather than carried — see `unanswered` in
 * components/Timer/intervals.ts.
 *
 * ## Readiness, and the marks
 *
 * The readiness question is asked once a day and pays nothing back on the day
 * it is asked: no advice, no encouragement, no judgement in response to an
 * answer. Its whole return is one sentence in the marks panel weeks later,
 * which either says readiness has made a difference to how cleanly this
 * account's sittings run or says it has not — and it can say "no difference",
 * which is a finding and the one a page like this would otherwise never print.
 *
 * The marks themselves are records rather than rates: longest unbroken
 * sitting, best focus score, longest run seen through. None can be lost by
 * taking a week off. That is deliberate and it is not a criticism of the
 * account's day streak, which is a real fact, is counted by the server, and is
 * already in the hero — the reasoning is on `marks` in
 * components/Timer/intervals.ts.
 *
 * ## What the page fills in by itself
 *
 * Three things are claimed without anybody being asked to confirm them, which
 * is the reason each is narrow.
 *
 * The **replay** draws the sitting along its own length with the pauses where
 * they fell, and says the same thing in a line of text — the strip is
 * decoration to a screen reader and the sentence is not.
 *
 * The **accounting** names the tasks finished inside the sitting's own window
 * and the goals the server had already linked them to. Nothing is matched or
 * guessed here: a task closed four minutes after the clock ran out was closed
 * in the break, and claiming it would be the page taking credit for it. A
 * sitting that closed nothing says nothing rather than printing a zero.
 *
 * The **next move** is one suggestion, only when a run of sittings says the
 * same thing, always with the figures it fired on. Its rule order is a
 * priority — see `nextMove` — and "you could go longer" is last, because it is
 * the only move that fires on everything going well.
 *
 * ## Kinds change what is asked, not what is measured
 *
 * Tagging a sitting deep work or a speed run changes which of the three
 * readings leads and which slice of the record the recommendation is drawn
 * from. It does not change the clock, the score or what is stored. Two
 * sittings of the same length stay comparable whatever they were tagged,
 * because every reading on this page rests on that.
 */
import type { ReactElement } from 'react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Range } from '@/components';
import {
  timerTitle, useApi, useAuth, useDocumentTitle, usePageEntrance, useSettings, useStats,
  useSubjectIndex, useUserData,
} from '@/hooks';
import { fmtHM, useFocusSession } from '@/hooks/useFocusSession';
import { usePomodoro } from '@/hooks/usePomodoro';
import { focus as focusService, goals as goalService, growth as growthService } from '@/services';
import { StyleGrid } from '@/components/Timer/Styles';
import { QuoteScene } from '@/components/Timer/art';
import {
  LEVELS, NEARBY, PHASE_LABEL, RECOMMENDED, SITTINGS, STYLES, clock, styleFor,
  type Phase, type Sitting,
} from '@/components/Timer/pomodoro';
import {
  KINDS, MIN_INTERVALS, READINESS, execution, focusScore, kindOf, marks, nextMove, pace,
  ranFrom, readinessEffect, recommend, tasksPerHour, unanswered, verdict, wasJustNow,
  type Interval, type Kind, type Move, type Readiness, type ReadinessRead, type Recommendation,
} from '@/components/Timer/intervals';
import { currentStone } from '@/utils/goalStage';
import { goalIdsOf } from '@/utils/goalLinks';
import type { Goal, Milestone, Task } from '@/types';
import * as format from '@/utils/format';
import '@/styles/timer.css';
import { Icon, type IconName } from '@/components/Icon';

const SETUP_KEY = 'pomodoro:setup';
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The four windows the Progress panel offers, and what each one spans. */
const RANGES = [
  { id: '7D', days: 7 },
  { id: '30D', days: 30 },
  { id: '3M', days: 90 },
  { id: '1Y', days: 365 },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

const GRAINS = ['Daily', 'Weekly', 'Monthly'] as const;
type Grain = (typeof GRAINS)[number];

/**
 * The tones a row of goals or a column of tags rotates through.
 *
 * The names are the `pom-tone-*` classes in styles/timer.css, which is where
 * each one is bound to a colour — the same vocabulary the ten method cards and
 * the stat tiles already use, so nothing here invents a palette of its own.
 */
const TONES = ['blue', 'green', 'amber', 'purple', 'teal', 'rose', 'indigo', 'violet'] as const;

/**
 * A stable tone for a subject.
 *
 * Hashed rather than counted, so the second Maths tag on the list is the same
 * blue as the first. A rotation by row index would colour the same subject
 * differently depending on what happened to be above it, which is worse than
 * no colour at all: it looks like it means something and it does not.
 */
function toneFor(name: string): string {
  let sum = 0;
  for (let at = 0; at < name.length; at += 1) {
    sum = (sum * 31 + name.charCodeAt(at)) >>> 0;
  }
  return TONES[sum % TONES.length]!;
}

/** A due date as the reader thinks of it, rather than as it is stored. */
function due(date: string | null | undefined, today: Date): string {
  if (!date) return 'No date';
  const day = date.slice(0, 10);
  if (day === iso(today)) return 'Today';
  if (day === iso(shift(today, 1))) return 'Tomorrow';
  if (day === iso(shift(today, -1))) return 'Yesterday';
  const at = new Date(`${day}T00:00:00`);
  return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Whether this browser remembers the setup being done.
 *
 * The account's own answer is `timer_setup_done` in its preferences, and that
 * is what this reads now. This flag is what it used to be — a localStorage key
 * per username — which made "have I set the timer up" a fact about the browser
 * rather than about the account, so the questions came back on every new
 * device and on every cleared cache.
 *
 * Kept only to be read once. An account that set the timer up before the
 * preference existed has this and not that, and asking it the questions again
 * to collect an answer it already gave would be the migration doing harm. So
 * the page treats either as done and writes the preference when it sees only
 * the flag — see `setup` below. Nothing writes the flag any more.
 */
function legacySetupDone(user: string): boolean {
  try {
    return window.localStorage.getItem(`${SETUP_KEY}:${user}`) === '1';
  } catch { return false; }
}

function iso(date: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
function shift(from: Date, days: number): Date {
  const out = new Date(from);
  out.setDate(out.getDate() + days);
  out.setHours(0, 0, 0, 0);
  return out;
}
/** Monday of the week `date` falls in. */
function weekStart(date: Date): Date {
  return shift(date, -((date.getDay() + 6) % 7));
}
function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
/** The change against the period before, or null when there is nothing to compare. */
function change(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

// --------------------------------------------------------------------------
// The setup
// --------------------------------------------------------------------------
function Setup({ onPick, onSkip }: { onPick: (id: string) => void; onSkip: () => void }) {
  const [sitting, setSitting] = useState<Sitting | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  if (!sitting) {
    return (
      <section className="pom-setup">
        <p className="pom-steps"><span className="is-on" /><span /></p>
        <h2>How long can you sit?</h2>
        <div className="pom-choices">
          {SITTINGS.map((option) => (
            <button key={option.id} type="button" className="pom-choice"
              onClick={() => { setSitting(option.id); setChosen(RECOMMENDED[option.id]); }}>
              <span className="pom-choice-label">{option.label}</span>
              <span className="pom-choice-hint">{option.hint}</span>
            </button>
          ))}
        </div>
        <button type="button" className="pom-link" onClick={onSkip}>Skip</button>
      </section>
    );
  }

  return (
    <section className="pom-setup">
      <p className="pom-steps"><span /><span className="is-on" /></p>
      <h2>Start with one of these.</h2>
      <div className="pom-choices">
        {NEARBY[sitting].map((id) => {
          const style = styleFor(id);
          return (
            <button key={id} type="button"
              className={`pom-choice${chosen === id ? ' is-on' : ''}`}
              aria-pressed={chosen === id} onClick={() => setChosen(id)}>
              <span className="pom-choice-label">
                {style.name}
                {RECOMMENDED[sitting] === id && <em className="pom-tag">Suggested</em>}
              </span>
              <span className="pom-choice-nums">{style.focus} work · {style.rest} break</span>
              <span className="pom-choice-hint">{style.who}</span>
            </button>
          );
        })}
      </div>
      <div className="pom-setup-foot">
        <button type="button" className="pom-link" onClick={() => setSitting(null)}>← Back</button>
        <button type="button" className="pom-btn is-primary" disabled={!chosen}
          onClick={() => chosen && onPick(chosen)}>Start</button>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
// Pieces
// --------------------------------------------------------------------------
function Ring({ percent, phase }: { percent: number; phase: Phase }) {
  const r = 92;
  const c = 2 * Math.PI * r;
  return (
    <svg className="pom-ring" viewBox="0 0 220 220" aria-hidden="true">
      <defs>
        {(['focus', 'break', 'long'] as Phase[]).map((name) => (
          <linearGradient key={name} id={`pom-g-${name}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={`var(--pom-${name}-2)`} />
            <stop offset="100%" stopColor={`var(--pom-${name})`} />
          </linearGradient>
        ))}
      </defs>
      <circle className="pom-ring-track" cx="110" cy="110" r={r} />
      <circle className="pom-ring-run" cx="110" cy="110" r={r}
        stroke={`url(#pom-g-${phase})`} strokeDasharray={c}
        strokeDashoffset={c * (1 - percent / 100)} />
    </svg>
  );
}

function Donut({ percent, sub }: { percent: number; sub: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="pom-donut">
      <svg viewBox="0 0 130 130" aria-hidden="true">
        <defs>
          <linearGradient id="pom-donut-g" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--pom-focus-2)" />
            <stop offset="100%" stopColor="var(--pom-focus)" />
          </linearGradient>
        </defs>
        <circle className="pom-donut-track" cx="65" cy="65" r={r} />
        <circle className="pom-donut-run" cx="65" cy="65" r={r}
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, percent) / 100)} />
      </svg>
      <div className="pom-donut-text">
        <strong>{percent}%</strong>
        <span>Daily Goal</span>
        <em>{sub}</em>
      </div>
    </div>
  );
}

function Tile({ tone, glyph, label, value, delta }: {
  tone: string; glyph: IconName; label: string; value: string; delta: number | null;
}) {
  return (
    <div className="pom-tile">
      <span className={`pom-tile-icon pom-tone-${tone}`} aria-hidden="true"><Icon name={glyph} /></span>
      <span className="pom-tile-label">{label}</span>
      <strong className="pom-tile-value">{value}</strong>
      {delta === null ? (
        <span className="pom-tile-delta is-flat">no earlier period</span>
      ) : (
        <span className={`pom-tile-delta${delta < 0 ? ' is-down' : ''}`}>
          {delta < 0 ? '↓' : '↑'} {Math.abs(delta)}% <i>vs previous</i>
        </span>
      )}
    </div>
  );
}

/**
 * The line, smoothed, with its best point marked the way the design does.
 *
 * The smoothing is a horizontal-control-point curve rather than a spline: each
 * segment bends toward its own two readings and nothing else, so the line
 * cannot invent a peak between two days that never happened.
 */
function Line({ points }: { points: { label: string; hours: number }[] }) {
  const w = 560;
  const h = 176;
  const pad = { top: 16, right: 12, bottom: 26, left: 36 };
  const peak = Math.max(1, ...points.map((p) => p.hours));
  const stepX = points.length > 1 ? (w - pad.left - pad.right) / (points.length - 1) : 0;
  const xy = points.map((p, at) => ({
    x: pad.left + at * stepX,
    y: pad.top + (1 - p.hours / peak) * (h - pad.top - pad.bottom),
    ...p,
  }));
  if (!xy.length) return null;

  const path = xy.map((p, at) => {
    if (at === 0) return `M${p.x} ${p.y}`;
    const prev = xy[at - 1]!;
    const cx = (prev.x + p.x) / 2;
    return `C${cx} ${prev.y} ${cx} ${p.y} ${p.x} ${p.y}`;
  }).join(' ');

  const best = xy.reduce((a, b) => (b.hours > a.hours ? b : a), xy[0]!);
  const every = Math.max(1, Math.ceil(xy.length / 7));

  return (
    <svg className="pom-line" viewBox={`0 0 ${w} ${h}`} role="img"
      aria-label={`Focus time. Best: ${best.label}, ${best.hours.toFixed(1)} hours.`}>
      <defs>
        <linearGradient id="pom-line-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--pom-focus)" stopOpacity=".30" />
          <stop offset="100%" stopColor="var(--pom-focus)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((f) => {
        const y = pad.top + f * (h - pad.top - pad.bottom);
        return (
          <g key={f}>
            <line className="pom-line-rule" x1={pad.left} x2={w - pad.right} y1={y} y2={y} />
            <text className="pom-line-tick" x={pad.left - 9} y={y + 3} textAnchor="end">
              {Math.round(peak * (1 - f))}h
            </text>
          </g>
        );
      })}
      <path className="pom-line-area"
        d={`${path} L${xy[xy.length - 1]!.x} ${h - pad.bottom} L${pad.left} ${h - pad.bottom} Z`} />
      <path className="pom-line-run" d={path} />
      <circle className="pom-line-halo" cx={best.x} cy={best.y} r="8" />
      <circle className="pom-line-dot" cx={best.x} cy={best.y} r="4.5" />
      {/* The best day, labelled. The dot alone marks the peak without saying
          what it was worth, and the one figure a reader wants off this chart
          is the size of their best day — which otherwise has to be estimated
          against an axis. Nudged inboard at the ends so the box cannot hang
          off the side of the chart. */}
      <g className="pom-line-tip"
        transform={`translate(${Math.min(w - pad.right - 34, Math.max(pad.left + 34, best.x))} ${Math.max(30, best.y - 14)})`}>
        <rect x="-34" y="-30" width="68" height="34" rx="8" />
        <text className="pom-line-tip-day" y="-16" textAnchor="middle">{best.label}</text>
        <text className="pom-line-tip-num" y="-3" textAnchor="middle">{fmtHM(best.hours * 3600)}</text>
      </g>
      {xy.map((p, at) => (at % every === 0 ? (
        <text key={`${p.label}-${at}`} className="pom-line-tick" x={p.x} y={h - 7}
          textAnchor="middle">{p.label}</text>
      ) : null))}
    </svg>
  );
}

/**
 * The recommendation, or the reason there is not one yet.
 *
 * Both states are on purpose. A picker that silently starts suggesting things
 * once enough has been recorded is a page that changes shape for reasons the
 * reader cannot see, so the waiting state says what it is waiting for and how
 * far along it is — and it counts *sittings*, because that is the unit that
 * moves the number and "use the app more" is not an instruction anybody can
 * act on.
 *
 * The verdict names its own sample size for the same reason. "50 min, from 8
 * sittings" is a claim a reader can weigh; "50 min" is one they can only take
 * or leave.
 */
function Recommend({ at, sittings, current, onUse }: {
  at: Recommendation | null;
  sittings: number;
  current: string;
  onUse: (styleId: string) => void;
}) {
  if (!at) {
    const togo = Math.max(0, MIN_INTERVALS - sittings);
    return (
      <p className="pom-rec is-waiting">
        <span className="pom-rec-icon" aria-hidden="true"><Icon name="sparkles" /></span>
        {togo > 0
          ? `Recommended lengths start after ${MIN_INTERVALS} recorded sittings — ${togo} to go.`
          : 'Run a couple of different lengths and this will recommend one.'}
      </p>
    );
  }

  const style = styleFor(at.styleId);
  return (
    <div className="pom-rec">
      <span className="pom-rec-icon" aria-hidden="true"><Icon name="sparkles" /></span>
      <span className="pom-rec-text">
        <b>
          Recommended focus · {at.minutes} min
          {/* Which question this answers. "50 min for deep work" and "50 min"
              are different claims, and a reader who tags their sittings should
              be told which one they have been given. */}
          {at.kind && <> for {kindOf(at.kind)?.label.toLowerCase()}</>}
        </b>
        <i>
          {at.low === at.high
            ? `Your ${at.minutes}-minute sittings run cleanest, over ${at.sample} recorded.`
            : `You work best between ${at.low} and ${at.high} minutes, over ${at.sample} recorded.`}
        </i>
      </span>
      {current === at.styleId ? (
        // Not "{name} in use" — the method grid's header already says exactly
        // that further down the page, and one page saying one sentence twice
        // reads as two facts.
        <span className="pom-rec-on">Already your pick</span>
      ) : (
        <button type="button" className="pom-btn" onClick={() => onUse(at.styleId)}>
          Use {style.name}
        </button>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// The climb
// --------------------------------------------------------------------------
/** A goal whose own target this page's minutes advance. */
export interface Counting {
  goal: Goal;
  /** Minutes recorded against it, and the minutes it asks for. */
  now: number;
  target: number;
  next: Milestone | null;
  /** Subject names the goal names, resolved. Empty when it names none. */
  subjects: string[];
}

/** A goal today's finished tasks counted toward, and how many did. */
export interface Working {
  goal: Goal;
  tasks: number;
}

/**
 * What this time is for.
 *
 * ## Why a timer page draws goals at all
 *
 * A clock can tell you a sitting was fifty minutes and cannot tell you whether
 * it was worth having. The account already holds the other half — goals with
 * checkpoints in execution order, and tasks that count toward them — and until
 * now the Timer page did not read it: you could spend an afternoon on this page
 * without the page ever saying what the afternoon was for.
 *
 * ## Two lists, because there are two different claims
 *
 * The first is **minutes**: a goal measured in focus time is advanced by this
 * page directly, and the figure under it is that goal's own arithmetic —
 * `current_focus` against `target_focus`, which is the same pair the Goals page
 * prints. Running the timer moves it, so saying so is a statement of fact.
 *
 * The second is **work**: the goals that today's finished tasks counted toward,
 * by `goalIdsOf` (utils/goalLinks) rather than by any matching of our own. Time
 * spent here is not counted toward those goals in minutes, and they are under a
 * heading that says what they are instead of being blended into one list. A
 * page that showed them together would be claiming the clock feeds a goal that
 * only counts finished tasks.
 *
 * `why` is printed when the goal has one because it is the account's own answer
 * to the question this panel asks, written when the goal was created — better
 * than anything this page could compose.
 */
function Climb({ counting, working }: { counting: Counting[]; working: Working[] }) {
  // Named, so it is a landmark rather than a plain box: this is the panel a
  // reader goes looking for to answer one question, and a section with no
  // accessible name is not reachable that way at all.
  const heading = useId();

  return (
    <section className="pom-panel pom-climb" aria-labelledby={heading}>
      <header className="pom-panel-head">
        <div className="pom-panel-title">
          <h2 id={heading}><Icon name="target" /> Today&apos;s Climb</h2>
          <p>What this time is for</p>
        </div>
        <Link className="pom-link" to="/goals">All goals</Link>
      </header>

      {counting.length === 0 && working.length === 0 ? (
        <p className="pom-empty">
          Nothing counts this page&apos;s minutes yet. A goal measured in focus
          time would — <Link className="pom-link" to="/goals">set one</Link>.
        </p>
      ) : (
        <div className="pom-climb-body">
          {counting.length > 0 && (
            <div className="pom-climb-group">
              <h3>Counting your minutes</h3>
              {counting.map((row) => (
                <ol className="pom-chain" key={row.goal.id}>
                  {row.subjects.length > 0 && (
                    <li className="pom-chain-step is-quiet">{row.subjects.join(' · ')}</li>
                  )}
                  <li className="pom-chain-step is-goal">
                    <Link to="/goals">{row.goal.title}</Link>
                    <em>{Math.round(row.goal.progress)}%</em>
                  </li>
                  {row.next && <li className="pom-chain-step is-now">{row.next.title}</li>}
                  <li className="pom-chain-step is-quiet">
                    {fmtHM(row.now * 60)} of {fmtHM(row.target * 60)} recorded
                  </li>
                  {row.goal.why && <li className="pom-chain-why">“{row.goal.why}”</li>}
                </ol>
              ))}
            </div>
          )}

          {working.length > 0 && (
            <div className="pom-climb-group">
              <h3>What today&apos;s finished work fed</h3>
              <ul className="pom-climb-fed">
                {working.map((row) => (
                  <li key={row.goal.id}>
                    <Link to="/goals">{row.goal.title}</Link>
                    <em>{row.tasks} task{row.tasks === 1 ? '' : 's'} today</em>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// --------------------------------------------------------------------------
// The intention
// --------------------------------------------------------------------------
/**
 * What success looks like for this sitting.
 *
 * One line, and a number when the line has one. Deliberately not a required
 * field and not a modal in front of Start: most sittings do not need an
 * objective written down, and a timer that would not start until one was typed
 * would collect a lot of "work" and mean nothing by it.
 *
 * The number is what makes the result scoreable — see `execution` in
 * components/Timer/intervals.ts — and it is optional for the same reason the
 * whole thing is: "understand integration by parts" is a real objective and
 * has no number, and demanding one would turn every intention into a count of
 * something countable instead.
 */
function IntentField({ intent, target, unit, onSet }: {
  intent: string;
  target: number | null;
  /** What the account's own goal counts in — "problems" — or null. */
  unit: string | null;
  onSet: (intent: string, target: number | null) => void;
}) {
  const [text, setText] = useState(intent);
  const [count, setCount] = useState(target === null ? '' : String(target));

  if (intent) {
    return (
      <div className="pom-intent is-set">
        <span className="pom-intent-icon" aria-hidden="true"><Icon name="pin" /></span>
        <span className="pom-intent-text">
          <b>{intent}</b>
          {target !== null && <i>target {target}{unit ? ` ${unit}` : ''}</i>}
        </span>
        <button type="button" className="pom-btn" onClick={() => { setText(''); setCount(''); onSet('', null); }}>
          Clear
        </button>
      </div>
    );
  }

  return (
    <form
      className="pom-intent"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = Number(count);
        onSet(text, count.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : null);
      }}
    >
      <label className="pom-intent-label" htmlFor="pom-intent-text">
        What does success look like?
      </label>
      <div className="pom-intent-row">
        <input id="pom-intent-text" className="pom-intent-input" type="text" maxLength={80}
          placeholder="Finish 15 problems" value={text}
          onChange={(event) => setText(event.target.value)} />
        <input className="pom-intent-count" type="number" min="1" max="999"
          aria-label={unit ? `How many ${unit}` : 'How many'} placeholder="15"
          value={count} onChange={(event) => setCount(event.target.value)} />
        <button type="submit" className="pom-btn is-primary" disabled={!text.trim()}>Set</button>
      </div>
    </form>
  );
}

/**
 * What kind of work this is.
 *
 * Seven chips, and pressing the chosen one again clears it — the same
 * affordance readiness has, for the same reason. Nothing about the timer
 * changes when one is picked: the reasoning is on `Kind` in
 * components/Timer/intervals.ts, and the short version is that a "mode" which
 * measured different things would stop two sittings of the same length being
 * comparable, which is the whole value of the record.
 */
function KindPicker({ kind, onSet }: {
  kind: Kind | null;
  onSet: (kind: Kind | null) => void;
}) {
  return (
    <div className="pom-kinds">
      <span className="pom-ready-label" id="pom-kind-label">What kind of work?</span>
      <div className="pom-kind-row" role="group" aria-labelledby="pom-kind-label">
        {KINDS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={kind === option.id ? 'is-on' : ''}
            aria-pressed={kind === option.id}
            onClick={() => onSet(kind === option.id ? null : option.id)}
          >
            <span aria-hidden="true">{option.glyph}</span> {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The sitting, drawn along its own length, with the pauses where they fell.
 *
 * ## What a count cannot say
 *
 * "Three pauses" describes a sitting interrupted in its first five minutes and
 * a sitting that fell apart in its last ten equally, and those are not the same
 * afternoon: the first is someone settling in, the second is someone who
 * should have stopped. The positions are the only part of this record that can
 * tell them apart, so they are kept — see `breaks` in
 * components/Timer/intervals.ts.
 *
 * ## Why it is this small
 *
 * A strip a couple of hundred pixels wide, with no axis but its own length and
 * no interaction. Everything a bigger chart would add — a scale, a tooltip, a
 * click target per mark — would be inviting the reader to study one
 * twenty-five minute sitting, and there is nothing in one sitting worth that
 * much attention. The pattern across many of them is what the marks panel and
 * the next move are for.
 */
function Replay({ sitting }: { sitting: Interval }) {
  const breaks = sitting.breaks ?? [];
  const span = Math.max(sitting.planned, sitting.minutes, 1);

  return (
    <div className="pom-replay">
      <span className="pom-replay-track" aria-hidden="true">
        <span className="pom-replay-ran" style={{ width: `${Math.min(100, (sitting.minutes / span) * 100)}%` }} />
        {breaks.map((at, index) => (
          <span
            key={`${at}-${index}`}
            className="pom-replay-mark"
            style={{ left: `${Math.min(100, (at / span) * 100)}%` }}
          />
        ))}
      </span>
      <span className="pom-replay-scale" aria-hidden="true">
        <i>0m</i>
        <i>{span}m</i>
      </span>
      {/* The same thing in words, because the strip above is decoration to a
          screen reader and this is the only form of it that is not. */}
      <span className="pom-replay-said">
        {breaks.length === 0
          ? `${sitting.minutes} min, no pauses.`
          : `${sitting.minutes} min, paused at ${breaks.map((at) => `${at}m`).join(', ')}.`}
      </span>
    </div>
  );
}

/**
 * How ready you are, asked once a day.
 *
 * ## What it is for, and what it is not
 *
 * It is one half of a pair: this, and the focus score of the sittings that
 * follow it. On its own it is worth nothing — nobody needs an app to tell them
 * they felt tired — and the page prints no encouragement, no advice and no
 * emoji-coded judgement in response to an answer. The whole return on it
 * arrives weeks later, as one sentence in the marks panel that either says
 * readiness has made a difference for this account or says it has not.
 *
 * ## Why it can be un-answered
 *
 * Pressing the chosen level again clears it. An answer given by mis-clicking
 * is worse than no answer: it goes into the comparison with the same weight as
 * a considered one, and there is no other way to take it back.
 */
function ReadinessPicker({ readiness, onSet }: {
  readiness: Readiness | null;
  onSet: (readiness: Readiness | null) => void;
}) {
  return (
    <div className="pom-ready">
      <span className="pom-ready-label" id="pom-ready-label">How ready are you?</span>
      <div className="pom-ready-row" role="group" aria-labelledby="pom-ready-label">
        {READINESS.map((level) => (
          <button
            key={level.id}
            type="button"
            className={readiness === level.id ? 'is-on' : ''}
            aria-pressed={readiness === level.id}
            onClick={() => onSet(readiness === level.id ? null : level.id)}
          >
            <span aria-hidden="true">{level.glyph}</span> {level.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The account's high-water marks, and what readiness has been worth.
 *
 * ## Why none of these is a streak
 *
 * The reasoning is on `marks` in components/Timer/intervals.ts: a record
 * cannot be lost by taking a week off, which is what makes it safe to show
 * somebody who is tired. The account's real day streak is a real fact and it is
 * already on this page, in the hero, counted by the server — this panel is
 * deliberately not a second one.
 *
 * ## The readiness line says nothing three ways
 *
 * Not enough answers, enough answers but no difference worth stating, and a
 * difference. The middle one is the sentence that would never get written by
 * accident, and it is the one most likely to be true: "it made no difference
 * for you" is a finding, and leaving it out would turn the panel into a page
 * that can only ever agree with the idea that readiness matters.
 */
function MarksPanel({ log, effect, move }: {
  log: Interval[];
  effect: ReadinessRead | null;
  move: Move | null;
}) {
  const heading = useId();
  const best = marks(log);
  const answered = log.filter((row) => row.readiness).length;

  const rows = [
    {
      key: 'unbroken',
      label: 'Longest unbroken sitting',
      value: best.unbroken ? fmtHM(best.unbroken.minutes * 60) : '—',
      note: best.unbroken
        ? `${styleFor(best.unbroken.styleId).name}, start to finish, no pauses`
        : 'no sitting has run clean through yet',
    },
    {
      key: 'best',
      label: 'Best focus score',
      value: best.best ? `${focusScore(best.best)}%` : '—',
      note: best.best
        ? `${best.best.minutes} min, ${best.best.pauses === 0 ? 'unbroken' : `${best.best.pauses} pause${best.best.pauses === 1 ? '' : 's'}`}`
        : 'nothing recorded yet',
    },
    {
      key: 'run',
      label: 'Longest run seen through',
      value: best.run > 0 ? `${best.run}` : '—',
      note: best.run > 0
        ? `sitting${best.run === 1 ? '' : 's'} in a row, none abandoned`
        : 'a run starts with one finished sitting',
    },
  ];

  return (
    <section className="pom-panel pom-marks" aria-labelledby={heading}>
      <header className="pom-panel-head">
        <div className="pom-panel-title">
          <h2 id={heading}><Icon name="medal" /> Your Best Sittings</h2>
          <p>Records, not streaks — none of these can be lost by taking a week off</p>
        </div>
      </header>

      <dl className="pom-mark-row">
        {rows.map((row) => (
          <div className="pom-mark" key={row.key}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
            <span>{row.note}</span>
          </div>
        ))}
      </dl>

      {/* Only when there is one. A page that produced a suggestion after every
          sitting would be generating them from an empty record, and the reader
          would learn inside a week that they mean nothing. See `nextMove`. */}
      {move && (
        <div className="pom-move">
          <span className="pom-move-icon" aria-hidden="true"><Icon name="sparkles" /></span>
          <span className="pom-move-text">
            <b>{move.move}</b>
            <i>{move.because}</i>
          </span>
        </div>
      )}

      <p className="pom-marks-note">
        {effect === null
          ? `Readiness is logged on ${answered} sitting${answered === 1 ? '' : 's'}. Answer it at two different levels and this will say whether it makes any difference for you.`
          : effect.clear
            ? `Sittings you start on ${effect.best} readiness run cleaner — ${effect.bestScore}% against ${effect.worstScore}% on ${effect.worst}, over ${effect.sample} sittings.`
            : `Readiness has made no real difference to how cleanly your sittings run — ${effect.bestScore}% against ${effect.worstScore}%, over ${effect.sample}. Worth knowing.`}
      </p>
    </section>
  );
}

/**
 * The one question after a sitting that had an objective, then the answer.
 *
 * ## Why it asks instead of counting
 *
 * Nothing in the app knows how many problems got worked. It knows how many
 * *tasks* were closed, which is a different measurement, and quietly printing
 * that under "Finish 15 problems" would be the page answering a question it was
 * not asked. So the number comes from the person who was there, and the panel
 * says so.
 *
 * ## Why it is a strip and not a dialog
 *
 * The sitting ended, which means a break has already started. A modal over the
 * break would take the break: somebody who stepped away comes back to a box
 * demanding a number before they can see their own timer. The strip waits, and
 * `unanswered` stops it waiting past the point where the answer would be a
 * guess — the reasoning is on `wasJustNow` in components/Timer/intervals.ts.
 */
function Outcome({ sitting, asking, fed, onReport, onSkip }: {
  sitting: Interval;
  asking: boolean;
  /** What was closed while it ran, and what that counted toward. */
  fed: { tasks: Task[]; goals: string[] };
  onReport: (result: { done?: number; met?: boolean }) => void;
  onSkip: () => void;
}) {
  const [count, setCount] = useState('');
  const scored = execution(sitting);

  if (asking) {
    return (
      <section className="pom-outcome is-asking">
        <span className="pom-outcome-head">
          <b>You set out to</b>
          <i>{sitting.intent}</i>
        </span>
        {sitting.target === undefined ? (
          <span className="pom-outcome-answer">
            <button type="button" className="pom-btn is-primary" onClick={() => onReport({ met: true })}>
              Did it
            </button>
            <button type="button" className="pom-btn" onClick={() => onReport({ met: false })}>
              Not this time
            </button>
          </span>
        ) : (
          <form
            className="pom-outcome-answer"
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = Number(count);
              if (!count.trim() || !Number.isFinite(parsed) || parsed < 0) return;
              onReport({ done: parsed });
            }}
          >
            <label htmlFor="pom-outcome-count">How many of the {sitting.target}?</label>
            <input id="pom-outcome-count" className="pom-intent-count" type="number" min="0" max="999"
              value={count} onChange={(event) => setCount(event.target.value)} />
            <button type="submit" className="pom-btn is-primary" disabled={!count.trim()}>Log it</button>
          </form>
        )}
        <button type="button" className="pom-link" onClick={onSkip}>Skip</button>
      </section>
    );
  }

  return (
    <section className="pom-outcome">
      <span className="pom-outcome-head">
        <b>{sitting.minutes} min on</b>
        <i>{sitting.intent}</i>
      </span>
      <dl className="pom-outcome-bars" aria-label="How that sitting went">
        {scored !== null && (
          <div className="pom-outcome-bar">
            <dt>Execution <b>{scored}%</b></dt>
            <dd>
              <span className="pom-outcome-track">
                <span style={{ width: `${Math.min(100, scored)}%` }} />
              </span>
              {/* The numbers behind the bar, because a percentage with no
                  numerator is a figure nobody can check. */}
              <em>{sitting.done} of {sitting.target}, your count</em>
            </dd>
          </div>
        )}
        <div className="pom-outcome-bar">
          <dt>Focus <b>{focusScore(sitting)}%</b></dt>
          <dd>
            <span className="pom-outcome-track">
              <span style={{ width: `${focusScore(sitting)}%` }} />
            </span>
            <em>
              {sitting.pauses === 0 ? 'unbroken' : `${sitting.pauses} pause${sitting.pauses === 1 ? '' : 's'}`}
              {sitting.finished ? '' : ', cut short'}
            </em>
          </dd>
        </div>
      </dl>
      <div className="pom-outcome-foot">
        <Replay sitting={sitting} />
        {/* What the sitting did, without anybody filing it anywhere. The
            window is the sitting's own — see `ranFrom` — and the goals are the
            ones the server already linked those tasks to, so nothing here is
            matched, guessed or asked for. A sitting that closed nothing says
            nothing rather than printing a zero. */}
        {fed.tasks.length > 0 && (
          <p className="pom-outcome-fed">
            <b>{fed.tasks.length} task{fed.tasks.length === 1 ? '' : 's'}</b> finished while it ran
            {fed.goals.length > 0 && <> → {fed.goals.join(', ')}</>}
          </p>
        )}
      </div>
      <p className="pom-outcome-verdict">{verdict(sitting)}</p>
    </section>
  );
}

/**
 * What the goal did while you sat there.
 *
 * Only for a goal measured in focus time, and only while a focus phase runs,
 * because that is the only arrangement in which this page moves a goal's own
 * figure. `minutes` is the session's own total for today — the focus session
 * is the ledger, not this page — added to the goal's recorded standing, which
 * is what the same figure will say once the server has heard about today.
 *
 * It is a line rather than a panel. The reader is working; the ring is the
 * thing on screen, and this is a note under it.
 */
function LiveGoal({ goal, minutes }: { goal: Counting; minutes: number }) {
  const now = goal.now + minutes;
  const pct = goal.target > 0 ? Math.min(100, Math.round((now / goal.target) * 100)) : 0;

  return (
    <p className="pom-live" aria-live="off">
      <span className="pom-live-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="pom-live-text">
        <b>{fmtHM(now * 60)}</b> of {fmtHM(goal.target * 60)} toward {goal.goal.title}
        {minutes > 0 && <i> · {fmtHM(minutes * 60)} of it today</i>}
      </span>
    </p>
  );
}

export interface Reading {
  label: string;
  /** The figure, or a dash when it cannot honestly be given. */
  value: string;
  /** What the figure is of. Always present: a bare number invites a guess. */
  note: string;
}

/**
 * The three readings under the ring.
 *
 * A definition list rather than a row of divs because that is what it is, and
 * a screen reader reading "Focus, 85 per cent, on course if seen through" gets
 * the same three-part thing a sighted reader gets from the stack.
 *
 * Every reading can be a dash, and each one says what it is of rather than
 * carrying a bare number — "Pace +12%" means nothing without "against your own
 * normal", and a reader who has to guess what a percentage is against will
 * guess wrong.
 *
 * The list is named because "Focus" is the phase above it as well as a reading
 * inside it, and a screen reader meeting the second one with no context has no
 * way to tell which of the two it has landed on.
 */
function Hud({ readings }: { readings: Reading[] }) {
  return (
    <dl className="pom-hud" aria-label="This session">
      {readings.map((reading) => (
        <div className="pom-hud-stat" key={reading.label}>
          <dt>{reading.label}</dt>
          <dd>{reading.value}</dd>
          <span>{reading.note}</span>
        </div>
      ))}
    </dl>
  );
}

function Rating({ name, grade, score }: { name: string; grade: string; score: number }) {
  return (
    <div className={`pom-rating pom-grade-${grade.replace('+', 'plus').toLowerCase()}`}>
      <span className="pom-rating-disc">{grade}</span>
      <span className="pom-rating-name">{name}</span>
      <span className="pom-rating-score">{score}%</span>
    </div>
  );
}

const CHEVRON: ReactElement = (
  <svg className="pom-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 6 6 6-6 6" />
  </svg>
);

// --------------------------------------------------------------------------
export default function Timer() {
  const { username } = useAuth();
  const user = username || 'Default';
  const account = useUserData();
  const { stats } = useStats();
  const { displayName, prefs, ready, update: updatePrefs } = useSettings();
  const session = useFocusSession(username);
  const pomodoro = usePomodoro(username, session);

  /* The tab counts down with the ring.
   *
   * Below the pomodoro rather than at the top of the component, because it now
   * reads from it — the hooks are all unconditional, so the order is stable
   * across renders, which is the only thing React asks.
   *
   * Only while it is *running*. A paused timer that goes on announcing a
   * number in the tab is telling every other tab you are working when you are
   * not, and the phase is in there because a break and an interval are not the
   * same news at a glance. See hooks/useDocumentTitle. */
  useDocumentTitle(
    pomodoro.running
      ? timerTitle(pomodoro.remaining, PHASE_LABEL[pomodoro.phase])
      : 'Timer',
  );

  /* The questions, and whether they are still to be asked.
     `ready` gates it: before the account's preferences have arrived every
     preference reads as its default, and the default here is false — so
     without this the setup screen would flash in front of everybody on every
     load, including accounts that finished it a year ago. */
  const [setup, setSetup] = useState(false);
  useEffect(() => {
    if (!ready || !user) return;
    if (prefs.timer_setup_done) {
      setSetup(false);
      return;
    }
    // The preference says no and this browser says yes: an account from before
    // the preference existed. Take its word and record it, rather than asking
    // again for an answer it has already given.
    if (legacySetupDone(user)) {
      setSetup(false);
      void updatePrefs({ timer_setup_done: true });
      return;
    }
    setSetup(true);
  }, [prefs.timer_setup_done, ready, updatePrefs, user]);

  const [range, setRange] = useState<RangeId>('7D');
  const [grain, setGrain] = useState<Grain>('Daily');

  const today = useMemo(() => new Date(), []);
  const span = RANGES.find((r) => r.id === range)!.days;

  // Twice the window, so "vs previous" compares the period on screen with the
  // one immediately before it rather than with nothing.
  const historyCall = useCallback(
    () => focusService.history(iso(shift(today, -span * 2)), iso(today)),
    [today, span],
  );
  const history = useApi(historyCall, [span]);
  const ratings = useApi(useCallback(() => growthService.ratings(), []), []);
  const goals = useApi(useCallback(() => goalService.getGoals(), []), []);

  const entering = usePageEntrance(true);

  const finish = useCallback((styleId?: string) => {
    if (styleId) pomodoro.choose(styleId);
    void updatePrefs({ timer_setup_done: true });
    setSetup(false);
  }, [pomodoro, updatePrefs]);

  const {
    style, phase, running, remaining, percent, level, doneToday, pauses, intervals,
  } = pomodoro;
  const days = history.data?.days ?? {};

  const hoursOn = useCallback(
    (date: Date) => (Number(days[iso(date)]?.seconds) || 0) / 3600,
    [days],
  );

  /** The window on screen, and the one before it, day by day. */
  const [current, previous] = useMemo(() => {
    const read = (offset: number) => Array.from({ length: span }, (_, at) => {
      const date = shift(today, -offset - (span - 1 - at));
      return { date, hours: hoursOn(date) };
    });
    return [read(0), read(span)];
  }, [span, today, hoursOn]);

  const totalNow = current.reduce((sum, d) => sum + d.hours, 0);
  const totalBefore = previous.reduce((sum, d) => sum + d.hours, 0);
  const workedNow = current.filter((d) => d.hours > 0).length;
  const workedBefore = previous.filter((d) => d.hours > 0).length;

  const tasks = account.data?.tasks ?? [];
  const doneIn = useCallback((from: Date, to: Date) => tasks.filter((task) => {
    const at = (task.completed_at ?? '').slice(0, 10);
    return task.status === 'done' && at >= iso(from) && at <= iso(to);
  }).length, [tasks]);
  const tasksNow = doneIn(shift(today, -(span - 1)), today);
  const tasksBefore = doneIn(shift(today, -(span * 2 - 1)), shift(today, -span));

  // ---- The three readings under the ring -----------------------------------
  /* The pace baseline, on a window of its own.
   *
   * Thirty days ending yesterday, asked for separately rather than sliced out
   * of the Progress panel's history: that one's span follows the range control,
   * and a reading that moved when somebody pressed 30D would be reporting the
   * control rather than the work. Today is left out because today is the thing
   * being compared against it. */
  const baselineCall = useCallback(
    () => focusService.history(iso(shift(today, -30)), iso(shift(today, -1))),
    [today],
  );
  const baseline = useApi(baselineCall, []);

  const baselineRate = useMemo(() => {
    const seen = baseline.data?.days ?? {};
    const seconds = Object.values(seen)
      .reduce((sum, day) => sum + (Number(day?.seconds) || 0), 0);
    return tasksPerHour(doneIn(shift(today, -30), shift(today, -1)), seconds);
  }, [baseline.data, doneIn, today]);

  const tasksToday = doneIn(today, today);
  const pacePct = pace(tasksPerHour(tasksToday, session.focused), baselineRate);

  /* Difficulty is the account's own rating of the work it finished today, and
   * an unrated task is left out rather than counted as easy — absent is not
   * zero, which is the rule for this field wherever it is read. See `difficulty`
   * in types/models.ts. */
  const ratedToday = useMemo(() => tasks.filter((task) => task.status === 'done'
    && (task.completed_at ?? '').slice(0, 10) === iso(today)
    && typeof task.difficulty === 'number'), [tasks, today]);
  const difficulty = ratedToday.length
    ? ratedToday.reduce((sum, task) => sum + (task.difficulty ?? 0), 0) / ratedToday.length
    : null;

  /* The focus score this interval is *on course for*, taken as seen through.
   *
   * The recorded score weighs how much of the interval ran, so a live reading
   * that counted the minutes not yet sat would start every sitting at thirty
   * and climb — which reads as a second progress bar beside the ring rather
   * than as quality. Holding the length constant and moving only with the
   * interruptions makes the number on screen the number that gets written down
   * if the sitting is finished. Between sittings it shows the last one, because
   * an empty panel says less than the thing that just happened. */
  const lastSitting: Interval | undefined = intervals[intervals.length - 1];
  const onCourse = focusScore({
    day: iso(today),
    styleId: style.id,
    planned: style.focus,
    minutes: style.focus,
    pauses,
    finished: true,
  });
  const focusReading: Reading = running && phase === 'focus'
    ? {
      label: 'Focus',
      value: `${onCourse}%`,
      note: pauses === 0
        ? 'on course · unbroken'
        : `on course · ${pauses} pause${pauses === 1 ? '' : 's'}`,
    }
    : lastSitting
      ? {
        label: 'Focus',
        value: `${focusScore(lastSitting)}%`,
        note: `last sitting · ${lastSitting.minutes}m${lastSitting.finished ? '' : ', cut short'}`,
      }
      : { label: 'Focus', value: '—', note: 'no sitting recorded yet' };

  const unordered: Reading[] = [
    focusReading,
    {
      label: 'Pace',
      value: pacePct === null ? '—' : `${pacePct >= 0 ? '+' : ''}${pacePct}%`,
      note: pacePct === null
        ? 'needs 15 min today and a month behind it'
        : 'tasks an hour, against your own normal',
    },
    {
      label: 'Difficulty',
      value: difficulty === null ? '—' : `${difficulty.toFixed(1)} / 5`,
      note: difficulty === null
        ? 'nothing rated today'
        : `your rating of ${ratedToday.length} finished today`,
    },
  ];

  /* All three are always shown; the kind decides which goes first. Pace is the
     interesting one on a speed run and difficulty is the interesting one when
     the work is new, and the leftmost column is where a reader looks. Hiding
     the other two would make two sittings of different kinds report different
     things, which is what `Kind` exists not to do. */
  const lead = kindOf(pomodoro.kind)?.lead;
  const readings = lead
    ? [...unordered].sort((a, b) => Number(b.label === lead) - Number(a.label === lead))
    : unordered;

  /* Asked about the kind of work in hand first, and about everything only if
     that has nothing to say. The answers are different claims — "50 min for
     deep work" against "50 min" — so `Recommendation` carries which one it is
     and the strip prints it. */
  const suggestion = useMemo(
    () => recommend(intervals, pomodoro.kind) ?? recommend(intervals),
    [intervals, pomodoro.kind],
  );
  const effect = useMemo(() => readinessEffect(intervals), [intervals]);
  const move = useMemo(() => nextMove(intervals), [intervals]);

  // ---- The climb -----------------------------------------------------------
  const subjectIndex = useSubjectIndex(username);
  const allGoals = goals.data?.goals ?? [];

  /* Goals this page's minutes advance: measured in focus time, still open, and
     actually asking for some. `subject_ids` is stored comma-separated — split
     at the call site, as the field's own note says. */
  const counting = useMemo<Counting[]>(() => allGoals
    .filter((goal) => goal.status === 'active' && goal.measure === 'focus' && goal.target_focus > 0)
    .map((goal) => ({
      goal,
      now: goal.current_focus,
      target: goal.target_focus,
      next: currentStone(goal),
      subjects: (goal.subject_ids || '')
        .split(',')
        .map((id) => subjectIndex.get(id.trim())?.name)
        .filter((name): name is string => Boolean(name)),
    })), [allGoals, subjectIndex]);

  /* Goals today's finished tasks counted toward, read from the links the
     server put on the task rather than matched here. */
  const working = useMemo<Working[]>(() => {
    const counts = new Map<string, number>();
    tasks
      .filter((task) => task.status === 'done'
        && (task.completed_at ?? '').slice(0, 10) === iso(today))
      .forEach((task) => goalIdsOf(task)
        .forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)));
    return allGoals
      .filter((goal) => counts.has(goal.id))
      .map((goal) => ({ goal, tasks: counts.get(goal.id) ?? 0 }))
      .sort((a, b) => b.tasks - a.tasks);
  }, [allGoals, tasks, today]);

  /* What the account's own goal counts in — "problems", "users" — for the
     intention's number to be labelled with. The first counting goal's unit,
     because that is the goal this page's minutes are going into; null when it
     has none, and then the field just says "how many". */
  const unit = counting.find((row) => row.goal.unit)?.goal.unit ?? null;

  // ---- The sitting just finished -------------------------------------------
  const [skippedAt, setSkippedAt] = useState<number | null>(null);
  const asking = unanswered(lastSitting, Date.now());
  /* Shown while the sitting is still the one in somebody's head: either to ask
     about it, or — once answered — to show what came of it. Skipping hides it
     without writing anything, because "I would rather not say" is not a
     result. */
  const outcome = lastSitting?.intent
    && lastSitting.at !== skippedAt
    && wasJustNow(lastSitting, Date.now())
    ? lastSitting
    : null;

  /* What was finished while that sitting ran, and what it counted toward.
     Nobody files anything: the window is the sitting's own, and the goals are
     the ones already linked to those tasks. A task closed in a break falls
     outside the window and is not claimed. */
  const fed = useMemo(() => {
    const span = outcome ? ranFrom(outcome) : null;
    if (!span) return { tasks: [] as Task[], goals: [] as string[] };
    const closed = tasks.filter((row) => {
      if (row.status !== 'done' || !row.completed_at) return false;
      const at = new Date(row.completed_at).getTime();
      return Number.isFinite(at) && at >= span.from && at <= span.to;
    });
    const titles = new Set<string>();
    closed.forEach((row) => goalIdsOf(row).forEach((id) => {
      const found = allGoals.find((goal) => goal.id === id);
      if (found) titles.add(found.title);
    }));
    return { tasks: closed, goals: [...titles] };
  }, [outcome, tasks, allGoals]);

  // This week's seven bars, whatever the range control above is set to.
  const week = useMemo(() => {
    const monday = weekStart(today);
    return DAY_NAMES.map((name, at) => ({ name, hours: hoursOn(shift(monday, at)) }));
  }, [today, hoursOn]);
  const weekPeak = Math.max(1, ...week.map((d) => d.hours));

  /** The line's points, grouped to the chosen grain. */
  const line = useMemo(() => {
    const size = grain === 'Daily' ? 1 : grain === 'Weekly' ? 7 : 30;
    if (size === 1) {
      return current.map((d) => ({
        label: DAY_NAMES[(d.date.getDay() + 6) % 7]!,
        hours: d.hours,
      }));
    }
    const out: { label: string; hours: number }[] = [];
    for (let at = 0; at < current.length; at += size) {
      const chunk = current.slice(at, at + size);
      out.push({
        label: chunk[0]!.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        hours: chunk.reduce((sum, d) => sum + d.hours, 0),
      });
    }
    return out;
  }, [current, grain]);

  const upcoming = useMemo(() => tasks
    .filter((task) => task.status !== 'done')
    .sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))
    .slice(0, 5), [tasks]);

  const activeGoals = (goals.data?.goals ?? []).filter((g) => g.status === 'active').slice(0, 4);
  const levelNow = stats ? format.levelForTotalXp(stats.xp) : null;
  const metrics = ratings.data?.metrics;
  const goalSeconds = session.goalHours * 3600;
  const goalPercent = goalSeconds
    ? Math.min(100, Math.round((session.focused / goalSeconds) * 100)) : 0;

  return (
    <div className={`pom-page${entering ? ' pg-enter' : ''}`}>
      <header className="pom-head">
        <span className="pom-head-sun" aria-hidden="true"><Icon name="sun" /></span>
        <div className="pom-head-text">
          <h1>{greeting(today.getHours())}, {displayName || username || 'there'}</h1>
          <p>Focus today. Build the future you want.</p>
        </div>
        <span className="pom-date">
          <Icon name="calendar" />
          {today.toLocaleDateString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
          })}
        </span>
      </header>

      {setup ? (
        <Setup onPick={(id) => finish(id)} onSkip={() => finish()} />
      ) : (
        <>
          {/* ---- What just happened ------------------------------------ */}
          {outcome && (
            <Outcome
              sitting={outcome}
              asking={asking !== null}
              fed={fed}
              onReport={pomodoro.report}
              onSkip={() => setSkippedAt(outcome.at ?? null)}
            />
          )}

          {/* ---- Hero -------------------------------------------------- */}
          <section className={`pom-hero is-${phase}`}>
            {/* The one hero in the app that does not take a tone: its three
                colours follow the phase, set on `.pom-hero.is-*` in
                styles/timer.css, so the range turns green on a break with the
                ring and the button. See components/Range.tsx. */}
            <Range variant="focus" />
            <div className="pom-hero-left">
              <span className="pom-badge"><span aria-hidden="true">◎</span> Focus mode</span>
              <h2>Pick your focus</h2>
              <p>Choose how hard you want to work and what type of pomodoro fits your goals.</p>

              <div className="pom-picks">
                <label className="pom-pick">
                  <span className="pom-pick-glyph" aria-hidden="true"><Icon name="flame" /></span>
                  <span className="pom-pick-top">
                    <b>{level.name}</b>
                    <i>{level.hint}</i>
                  </span>
                  <select value={level.id} aria-label="Intensity"
                    onChange={(e) => pomodoro.setLevel(Number(e.target.value))}>
                    {LEVELS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
                <label className="pom-pick">
                  <span className="pom-pick-glyph" aria-hidden="true"><Icon name="target" /></span>
                  <span className="pom-pick-top">
                    <b>{style.name}</b>
                    <i>{style.focus} min work · {style.rest} min break</i>
                  </span>
                  <select value={style.id} aria-label="Pomodoro style"
                    onChange={(e) => pomodoro.choose(e.target.value)}>
                    {STYLES.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
              </div>

              <Recommend at={suggestion} sittings={intervals.length}
                current={style.id} onUse={pomodoro.choose} />

              <ReadinessPicker readiness={pomodoro.readiness} onSet={pomodoro.setReadiness} />

              <KindPicker kind={pomodoro.kind} onSet={pomodoro.setKind} />

              <IntentField intent={pomodoro.intent} target={pomodoro.target}
                unit={unit} onSet={pomodoro.setIntent} />

              <button type="button" className="pom-start"
                onClick={running ? pomodoro.pause : pomodoro.start}>
                <Icon name={running ? 'pause' : 'play'} />
                {running ? 'Pause Focus' : 'Start Focus'}
              </button>

              <ul className="pom-perks">
                <li><span aria-hidden="true">✦</span> Earns XP</li>
                <li><Icon name="trend" /> Tracks progress</li>
                <li><Icon name="flame" /> Builds streak</li>
              </ul>
            </div>

            <div className="pom-hero-mid">
              <div className="pom-ring-wrap">
                <Ring percent={percent} phase={phase} />
                <div className="pom-ring-text" aria-live="polite">
                  <span className="pom-ring-phase">{PHASE_LABEL[phase]}</span>
                  <span className="pom-ring-time">{clock(remaining)}</span>
                  <span className="pom-ring-sub">
                    {phase === 'focus' ? 'Work Session' : 'Rest'}
                  </span>
                </div>
              </div>
              <div className="pom-ring-controls">
                <button type="button" className="pom-round is-primary"
                  onClick={running ? pomodoro.pause : pomodoro.start}
                  aria-label={running ? 'Pause' : 'Start'}>
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    {running ? <path d="M8 5h3v14H8zm5 0h3v14h-3z" /> : <path d="M7 4.5v15l13-7.5z" />}
                  </svg>
                </button>
                <button type="button" className="pom-round" onClick={pomodoro.reset} aria-label="Reset">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 12a8 8 0 1 0 2.5-5.8" /><path d="M4 4v4h4" />
                  </svg>
                </button>
                <button type="button" className="pom-round" onClick={() => setSetup(true)}
                  aria-label="Set up again">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" />
                  </svg>
                </button>
              </div>
              <Hud readings={readings} />
              {running && phase === 'focus' && counting[0] && (
                <LiveGoal goal={counting[0]} minutes={Math.round(session.focused / 60)} />
              )}
            </div>

            <div className="pom-hero-side">
              <div className="pom-side-card">
                <span className="pom-side-icon pom-tone-amber" aria-hidden="true"><Icon name="flame" /></span>
                <span className="pom-side-label">Today&apos;s Focus</span>
                <strong>{doneToday} / {level.target}</strong>
                <em>pomodoros</em>
              </div>
              <div className="pom-side-card">
                <span className="pom-side-icon pom-tone-rose" aria-hidden="true"><Icon name="flame" /></span>
                <span className="pom-side-label">Current Streak</span>
                <strong>{stats?.current_streak ?? 0}</strong>
                <em>days</em>
              </div>
              <div className="pom-side-card">
                <span className="pom-side-icon pom-tone-violet" aria-hidden="true"><Icon name="star" /></span>
                <span className="pom-side-label">Next Level</span>
                <strong>Level {(levelNow?.level ?? 1) + 1}</strong>
                <em>{levelNow
                  ? `${(levelNow.xpRequired - levelNow.xpInLevel).toLocaleString()} XP to go`
                  : '—'}</em>
              </div>
            </div>
          </section>

          {/* ---- The climb --------------------------------------------- */}
          <Climb counting={counting} working={working} />

          {/* ---- Marks ------------------------------------------------- */}
          <MarksPanel log={intervals} effect={effect} move={move} />

          {/* ---- Progress ---------------------------------------------- */}
          <section className="pom-panel">
            <header className="pom-panel-head">
              <h2><Icon name="chart" /> Your Progress</h2>
              <div className="pom-toggle" role="group" aria-label="Range">
                {RANGES.map((option) => (
                  <button key={option.id} type="button"
                    className={range === option.id ? 'is-on' : ''}
                    aria-pressed={range === option.id}
                    onClick={() => setRange(option.id)}>{option.id}</button>
                ))}
              </div>
            </header>

            <div className="pom-progress">
              <Donut percent={goalPercent}
                sub={`${fmtHM(session.focused)} / ${fmtHM(goalSeconds)}`} />
              <div className="pom-tiles">
                <Tile tone="blue" glyph="clock" label="Total Focus Time"
                  value={fmtHM(totalNow * 3600)} delta={change(totalNow, totalBefore)} />
                <Tile tone="rose" glyph="timer" label="Pomodoros Today"
                  value={String(doneToday)} delta={null} />
                <Tile tone="amber" glyph="zap" label="Avg. Focus / Day"
                  value={workedNow ? fmtHM((totalNow / workedNow) * 3600) : '0m'}
                  delta={change(
                    workedNow ? totalNow / workedNow : 0,
                    workedBefore ? totalBefore / workedBefore : 0,
                  )} />
                <Tile tone="green" glyph="check" label="Tasks Completed"
                  value={String(tasksNow)} delta={change(tasksNow, tasksBefore)} />
              </div>
            </div>

            <div className="pom-lower">
              <div className="pom-week">
                <h3>Focus Time This Week</h3>
                <div className="pom-bars">
                  {week.map((day) => (
                    <div className="pom-bar" key={day.name}>
                      <span className="pom-bar-fill"
                        style={{ height: `${Math.round((day.hours / weekPeak) * 100)}%` }}
                        title={`${day.name}: ${fmtHM(day.hours * 3600)}`} />
                      <span className="pom-bar-name">{day.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <figure className="pom-quote">
                <QuoteScene />
                <blockquote>
                  “Discipline is the bridge between your goals and your reality.”
                </blockquote>
                <figcaption>— Summit</figcaption>
              </figure>
            </div>
          </section>

          {/* ---- The ten ----------------------------------------------- */}
          <section className="pom-panel">
            <header className="pom-panel-head">
              <h2><Icon name="lightbulb" /> Ten Ways to Divide an Hour</h2>
              <span className="pom-quiet">{style.name} in use</span>
            </header>
            <StyleGrid current={style.id} onPick={pomodoro.choose} />
          </section>

          {/* ---- Analytics and ratings --------------------------------- */}
          <div className="pom-split">
            <section className="pom-panel">
              <header className="pom-panel-head">
                <h2><Icon name="trend" /> Focus Analytics</h2>
                <div className="pom-toggle" role="group" aria-label="Grain">
                  {GRAINS.map((option) => (
                    <button key={option} type="button"
                      className={grain === option ? 'is-on' : ''}
                      aria-pressed={grain === option}
                      onClick={() => setGrain(option)}>{option}</button>
                  ))}
                </div>
              </header>
              <Line points={line} />
            </section>

            <section className="pom-panel">
              <header className="pom-panel-head">
                <div className="pom-panel-title">
                  <h2><Icon name="calendar" /> Growth Ratings</h2>
                  <p>Your overall growth this week</p>
                </div>
                <Link className="pom-link" to="/analytics">View details →</Link>
              </header>
              {metrics ? (
                <>
                  <div className="pom-ratings">
                    <Rating name="Consistency" grade={metrics.consistency.grade} score={metrics.consistency.score} />
                    <Rating name="Quality" grade={metrics.quality.grade} score={metrics.quality.score} />
                    <Rating name="Productivity" grade={metrics.productivity.grade} score={metrics.productivity.score} />
                    <Rating name="Efficiency" grade={metrics.efficiency.grade} score={metrics.efficiency.score} />
                  </div>
                  <div className="pom-overall">
                    <span>Overall Score</span>
                    <strong>{ratings.data?.overall.score}%</strong>
                    <div className="pom-overall-bar">
                      <span style={{ width: `${ratings.data?.overall.score ?? 0}%` }} />
                    </div>
                  </div>
                </>
              ) : (
                <p className="pom-empty">
                  {ratings.error ? 'Could not read your ratings.' : 'Reading your ratings…'}
                </p>
              )}
            </section>
          </div>

          {/* ---- Goals and tasks --------------------------------------- */}
          <div className="pom-split">
            <section className="pom-panel">
              <header className="pom-panel-head">
                <h2><Icon name="target" /> Active Goals</h2>
                <Link className="pom-link" to="/goals">View all</Link>
              </header>
              {activeGoals.length ? (
                <ul className="pom-goals">
                  {activeGoals.map((goal, at) => (
                    <li key={goal.id}>
                      <span className={`pom-goal-icon pom-tone-${TONES[at % TONES.length]}`}
                        aria-hidden="true">◈</span>
                      <span className="pom-goal-main">
                        <span className="pom-goal-title">{goal.title}</span>
                        <span className="pom-goal-bar">
                          <span style={{ width: `${Math.min(100, goal.progress)}%` }} />
                        </span>
                      </span>
                      <span className="pom-goal-pct">{Math.round(goal.progress)}%</span>
                      {CHEVRON}
                    </li>
                  ))}
                </ul>
              ) : <p className="pom-empty">Nothing you are aiming at yet.</p>}
            </section>

            <section className="pom-panel">
              <header className="pom-panel-head">
                <h2><Icon name="clipboard" /> Upcoming Tasks</h2>
                <Link className="pom-link" to="/tasks">View all</Link>
              </header>
              {upcoming.length ? (
                <ul className="pom-tasks">
                  {upcoming.map((task) => (
                    <li key={task.id}>
                      <span className="pom-check" aria-hidden="true" />
                      <span className="pom-tasks-title">{task.title}</span>
                      {task.subject && (
                        <span className={`pom-tasks-tag pom-tone-${toneFor(task.subject)}`}>
                          {task.subject}
                        </span>
                      )}
                      <span className="pom-tasks-when">{due(task.due_date, today)}</span>
                      {CHEVRON}
                    </li>
                  ))}
                </ul>
              ) : <p className="pom-empty">Nothing on your plate.</p>}
            </section>
          </div>

          {/* ---- Level ------------------------------------------------- */}
          <div className="pom-split is-level">
            <section className="pom-level">
              <span className="pom-level-gem" aria-hidden="true"><Icon name="gem" /></span>
              <div className="pom-level-text">
                <h2>Level Up Your Focus</h2>
                <p>Complete focus sessions, earn XP, and get closer to your goals.</p>
              </div>
              <Link className="pom-level-cta" to="/achievements">View Rewards</Link>
            </section>
            <section className="pom-panel pom-levelcard">
              <span className="pom-level-trophy" aria-hidden="true"><Icon name="trophy" /></span>
              <div className="pom-levelcard-body">
                <div className="pom-levelcard-top">
                  <strong>Level {levelNow?.level ?? 1}</strong>
                  <span>
                    {(levelNow?.xpInLevel ?? 0).toLocaleString()} / {(levelNow?.xpRequired ?? 0).toLocaleString()} XP
                  </span>
                </div>
                <div className="pom-level-bar">
                  <span style={{ width: `${levelNow?.percent ?? 0}%` }} />
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
