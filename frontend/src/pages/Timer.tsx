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
 * rather than estimated. There is no average *session* length here because no
 * session boundary is stored — only the day's total — so that tile is an
 * average per working day, and is labelled as one.
 */
import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Range } from '@/components';
import {
  timerTitle, useApi, useAuth, useDocumentTitle, usePageEntrance, useSettings, useStats,
  useUserData,
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

  const { style, phase, running, remaining, percent, level, doneToday } = pomodoro;
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
