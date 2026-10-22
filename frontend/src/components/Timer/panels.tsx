/**
 * The Timer page's panels, each one usable on its own.
 *
 * pages/Timer draws all of these, and a space's page draws any of them as a
 * panel block (components/Spaces/PanelBlock) beside whatever else is on it —
 * which is why they live here rather than inside the page, and why each takes
 * what it shows as props rather than reading the clock itself. The one clock
 * on a page is hooks/usePomodoro, run once by whoever hosts it.
 */
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { fmtHM } from '@/hooks/useFocusSession';
import type { PickedTask } from '@/hooks/usePomodoro';
import { LEVELS, STYLES, styleFor } from './pomodoro';
import { MIN_INTERVALS, kindOf, verdict, type Interval, type Recommendation, type TaskTime } from './intervals';
import type { Task } from '@/types';

/**
 * The tones a row of goals or a column of tags rotates through.
 *
 * The names are the `pom-tone-*` classes in styles/timer.css, which is where
 * each one is bound to a colour — the same vocabulary the ten method cards and
 * the stat tiles already use, so nothing here invents a palette of its own.
 */
export const TONES = ['blue', 'green', 'amber', 'purple', 'teal', 'rose', 'indigo', 'violet'] as const;

/**
 * A stable tone for a subject.
 *
 * Hashed rather than counted, so the second Maths tag on the list is the same
 * blue as the first. A rotation by row index would colour the same subject
 * differently depending on what happened to be above it, which is worse than
 * no colour at all: it looks like it means something and it does not.
 */
export function toneFor(name: string): string {
  let sum = 0;
  for (let at = 0; at < name.length; at += 1) {
    sum = (sum * 31 + name.charCodeAt(at)) >>> 0;
  }
  return TONES[sum % TONES.length]!;
}

/** A due date as the reader thinks of it, rather than as it is stored. */
export function due(date: string | null | undefined, today: Date): string {
  if (!date) return 'No date';
  const day = date.slice(0, 10);
  if (day === iso(today)) return 'Today';
  if (day === iso(shift(today, 1))) return 'Tomorrow';
  if (day === iso(shift(today, -1))) return 'Yesterday';
  const at = new Date(`${day}T00:00:00`);
  return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function iso(date: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function shift(from: Date, days: number): Date {
  const out = new Date(from);
  out.setDate(out.getDate() + days);
  out.setHours(0, 0, 0, 0);
  return out;
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
export function Recommend({ at, sittings, current, onUse }: {
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
          ? `Suggested lengths show up after ${MIN_INTERVALS} sessions. ${togo} to go.`
          : "Try a couple of different lengths and we'll suggest one."}
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
            ? `Your ${at.minutes}-minute sessions go best, out of ${at.sample} logged.`
            : `You work best between ${at.low} and ${at.high} minutes, out of ${at.sample} logged.`}
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

/**
 * The open tasks, as things a sitting can be for.
 *
 * Pressing a row picks it and pressing the picked row again clears it, the
 * same toggle the rest of the page's chips use. The picked task is listed
 * first even when it is not among the next few due — it may have come from
 * the tasks page by `?task=`, and a pick that is not on screen is a pick
 * nobody can see or undo.
 *
 * Finishing a task is not offered here. That is a different act with XP
 * behind it, and a row that both picked and ticked would do one when somebody
 * meant the other. The sitting's own list ticks.
 */
export function TaskPicker({ tasks, picked, onPick, today }: {
  tasks: Task[];
  picked: string | null;
  onPick: (task: PickedTask | null) => void;
  today: Date;
}) {
  const head = `pom-picker-head-${useId()}`;
  return (
    <section className="pom-panel pom-picker" aria-labelledby={head}>
      <header className="pom-panel-head">
        <div className="pom-panel-title">
          <h2 id={head}><Icon name="clipboard" /> What are you working on?</h2>
          <p>Pick a task and each session gets logged to it</p>
        </div>
        <Link className="pom-link" to="/tasks">All tasks</Link>
      </header>
      {tasks.length ? (
        <ul className="pom-tasks">
          {tasks.map((task) => {
            const on = task.id === picked;
            return (
              <li key={task.id}>
                <button type="button" className={`pom-task-pick${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => onPick(on ? null : { id: task.id, title: task.title })}>
                  <span className="pom-check" aria-hidden="true" />
                  <span className="pom-tasks-title">{task.title}</span>
                  {task.subject && (
                    <span className={`pom-tasks-tag pom-tone-${toneFor(task.subject)}`}>
                      {task.subject}
                    </span>
                  )}
                  <span className="pom-tasks-when">{due(task.due_date, today)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pom-empty">
          Nothing on your plate. <Link className="pom-link" to="/tasks">Add a task</Link> to
          focus on.
        </p>
      )}
    </section>
  );
}

/**
 * Where today's sittings went, by task.
 *
 * Read off the interval log — see the note at the top of the page. Minutes
 * are what the clock actually ran, cut-short
 * sittings included, because a sitting abandoned at minute nineteen was still
 * nineteen minutes on that task.
 */
export function TodaySittings({ rows, days = 1 }: {
  rows: TaskTime[];
  /** How many days `rows` covers. One is today, which is what the Timer page shows. */
  days?: number;
}) {
  const minutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  const sittings = rows.reduce((sum, row) => sum + row.sittings, 0);
  /* Unique per panel: a space's page can hold this list more than once. */
  const head = `pom-today-head-${useId()}`;

  return (
    <section className="pom-panel pom-today" aria-labelledby={head}>
      <header className="pom-panel-head">
        <div className="pom-panel-title">
          <h2 id={head}><Icon name="timer" /> {days === 1 ? "Today's sessions" : `Sessions, last ${days} days`}</h2>
          <p>
            {sittings
              ? `${fmtHM(minutes * 60)} across ${sittings} session${sittings === 1 ? '' : 's'}`
              : days === 1 ? 'Where your focus time went today' : 'Where your focus time went'}
          </p>
        </div>
      </header>
      {rows.length ? (
        <ul className="pom-today-list">
          {rows.map((row) => (
            <li key={row.id ?? 'none'} className={row.id ? undefined : 'is-none'}>
              <span className="pom-today-title">{row.title ?? 'No task picked'}</span>
              <span className="pom-today-count">
                {row.sittings} session{row.sittings === 1 ? '' : 's'}
              </span>
              <strong className="pom-today-time">{fmtHM(row.minutes * 60)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pom-empty">
          {days === 1 ? 'No sessions yet today.' : `No sessions in the last ${days} days.`} Pick a task and press Start focus.
        </p>
      )}
    </section>
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
export function Replay({ sitting }: { sitting: Interval }) {
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
 * How hard the day is and how long each session runs: the two picks that
 * shape the cycle. The Timer page's "Pick your focus" panel, and a timer
 * panel's method row on a space's page.
 */
export function MethodPicker({ levelId, styleId, onLevel, onStyle }: {
  levelId: number;
  styleId: string;
  onLevel: (levelId: number) => void;
  onStyle: (styleId: string) => void;
}) {
  const level = LEVELS.find((one) => one.id === levelId) ?? LEVELS[0]!;
  const style = styleFor(styleId);
  return (
    <div className="pom-picks">
      <label className="pom-pick">
        <span className="pom-pick-glyph" aria-hidden="true"><Icon name="flame" /></span>
        <span className="pom-pick-top">
          <b>{level.name}</b>
          <i>{level.hint}</i>
        </span>
        <select value={level.id} aria-label="Intensity"
          onChange={(e) => onLevel(Number(e.target.value))}>
          {LEVELS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      <label className="pom-pick">
        <span className="pom-pick-glyph" aria-hidden="true"><Icon name="target" /></span>
        <span className="pom-pick-top">
          <b>{style.name}</b>
          <i>{style.focus} min work · {style.rest} min break</i>
        </span>
        <select value={style.id} aria-label="Timer style"
          onChange={(e) => onStyle(e.target.value)}>
          {STYLES.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
    </div>
  );
}

/**
 * The last few sessions, newest first: how long, on what, when, and the
 * replay strip of where the pauses fell. The sessions panel says where the
 * time went; this says how each one went.
 */
export function RecentSessions({ rows, limit, now = Date.now() }: { rows: Interval[]; limit: number; now?: number }) {
  const shown = [...rows].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, limit);
  const head = `pom-recent-head-${useId()}`;
  return (
    <section className="pom-panel pom-recent" aria-labelledby={head}>
      <header className="pom-panel-head">
        <div className="pom-panel-title">
          <h2 id={head}><Icon name="clock" /> Recent sessions</h2>
          <p>{shown.length ? 'How each of your last sessions went' : 'Your sessions show up here'}</p>
        </div>
      </header>
      {shown.length ? (
        <ul className="pom-recent-list">
          {shown.map((row, at) => (
            <li key={row.id ?? `${row.at}-${at}`}>
              <span className="pom-recent-top">
                <b>{row.minutes} min</b>
                <span className="pom-recent-on">{row.taskTitle ? `on ${row.taskTitle}` : 'no task picked'}</span>
                <span className="pom-recent-when">{whenOf(row, now)}</span>
              </span>
              <Replay sitting={row} />
              {verdict(row) && <span className="pom-recent-said">{verdict(row)}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pom-empty">No sessions yet. Pick a task and press Start focus.</p>
      )}
    </section>
  );
}

/** "Today, 3:40 PM", "Yesterday", or "Oct 12" for a session. */
function whenOf(row: Interval, now: number): string {
  const today = iso(new Date(now));
  const time = row.at ? new Date(row.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  if (row.day === today) return time ? `Today, ${time}` : 'Today';
  if (row.day === iso(shift(new Date(now), -1))) return 'Yesterday';
  return new Date(`${row.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
