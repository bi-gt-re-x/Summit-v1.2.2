/**
 * The page while a focus phase is running.
 *
 * Not a mode you turn on. Pressing Start Focus is the whole gesture: the
 * sitting begins and the page becomes this, and pausing or pressing Escape
 * puts the full page back. A sitting you have to arrange the furniture for is
 * one more decision in front of the only button on this page that matters, and
 * pages/Timer.tsx has spent several commits taking decisions *out* of the way
 * of that button.
 *
 * ## What is here, and what is not
 *
 * The clock, the pause, what today is adding up to, what is next, and a line
 * worth reading. That is the list, and everything else the page holds — the
 * method pickers, the readiness questions, the climb, the marks, the record,
 * the ten styles, the chart — is gone for the duration rather than dimmed,
 * because a control that is visible is a control that will be used, and each
 * one of those asks the reader to stop working and decide something.
 *
 * The side cards go too. Today's count, the streak and the level are facts
 * about the account rather than about the next twenty-five minutes, and a
 * streak counter over a running clock is an argument for not stopping that
 * nobody asked for.
 *
 * There is exactly one control: pause. Reset and set-up-again are destructive
 * to a sitting in progress and are a scroll away the moment it is paused.
 *
 * ## The tasks are tickable, and that is the point of the bar
 *
 * The list is the same Upcoming Tasks the full page shows, except that here a
 * row can be finished. It goes through `completeTask` exactly as the dashboard
 * and the tasks page do — a second door onto the same act, not a second
 * implementation of it — so the XP, the streak and any goal the task feeds all
 * move the way they would have anywhere else. See the handler in
 * pages/Timer.tsx.
 *
 * ## Two bars, because they are two different measures
 *
 * Tasks finished today against the account's daily goal, and focused time
 * against today's hours goal. They share a block and a heading but not a
 * track: one is counted in tasks and the other in minutes, and a single bar
 * blending them would be a number with no unit that neither halves could be
 * read back out of.
 *
 * Both are *today*, not this sitting. A bar that reset at the top of every
 * sitting would spend most of the day near empty and would say nothing about
 * the day, which is the thing the reader is actually building.
 *
 * A third line joins them when the account has a goal measured in focus time:
 * that goal's own standing, moving with the session. It used to sit under the
 * hero's readings, shown on exactly the condition that now renders this view
 * instead — so it lives here, unchanged, rather than nowhere. It is the only
 * arrangement in which this page advances a goal's figure, which is why it
 * appears in no other.
 */
import { useEffect, useId, useState } from 'react';
import { Icon } from '@/components/Icon';
import { PHASE_LABEL, clock, type Phase } from '@/components/Timer/pomodoro';
import { fmtHM } from '@/hooks/useFocusSession';
import { quote as quoteService } from '@/services';
import type { Counting } from '@/pages/Timer';
import type { Task } from '@/types';

/**
 * Shown on first paint and if the call never lands.
 *
 * The same shape the dashboard's footer uses, and for the same reason — a
 * blank space where a line should be costs more than a line somebody has read
 * before. The markup is not shared with components/Dashboard/DailyQuote
 * because that component's element ids are a contract with the hidden-quote
 * easter egg in styles/dashboard.css, and this page is not part of it.
 */
const PLACEHOLDER = {
  quote: 'It is not that we have a short time to live, but that we waste a lot of it.',
  author: 'Seneca',
};

export interface FocusViewProps {
  phase: Phase;
  /** How much of the interval has run, 0-100. */
  percent: number;
  /** Seconds left on the clock. */
  remaining: number;
  /** Pause the sitting, which is also what leaves this view. */
  onPause: () => void;
  /** Tasks finished today, and the account's daily goal. */
  tasksDone: number;
  tasksGoal: number;
  /** Seconds focused today, and today's goal in seconds. */
  focused: number;
  focusGoal: number;
  /** The next few unfinished tasks, newest due first. */
  upcoming: Task[];
  /** Finish one. Disabled while another is in flight. */
  onComplete: (task: Task) => void;
  busy: boolean;
  /** Ids of tasks this view has ticked, so a row can show it before the reload. */
  done: ReadonlySet<string>;
  /** The first goal counted in focus time, or null when there is none. */
  goal: Counting | null;
  /** Minutes focused today, which is what this sitting is adding to it. */
  goalMinutes: number;
}

export function FocusView({
  phase, percent, remaining, onPause,
  tasksDone, tasksGoal, focused, focusGoal,
  upcoming, onComplete, busy, done, goal, goalMinutes,
}: FocusViewProps) {
  const gradient = useId();
  const [line, setLine] = useState(PLACEHOLDER);

  useEffect(() => {
    let live = true;
    void quoteService.daily().then((result) => {
      if (!live || !result.success || !result.quote) return;
      setLine({ quote: result.quote, author: result.author });
    }).catch(() => {
      /* offline: the placeholder is already on screen and is the fallback */
    });
    return () => { live = false; };
  }, []);

  /* Escape pauses rather than doing anything of its own.
   *
   * There is no separate "leave" state to manage — this view *is* a running
   * focus phase — so the key has to act on the sitting, and the reader who
   * hits it wants out of the clock as much as out of the layout. Bound to the
   * document because there is nothing here that holds focus by default and a
   * key that only worked after clicking the right thing would not be a way
   * out. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onPause();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onPause]);

  const r = 118;
  const c = 2 * Math.PI * r;
  const taskPct = tasksGoal ? Math.min(100, Math.round((tasksDone / tasksGoal) * 100)) : 0;
  const focusPct = focusGoal ? Math.min(100, Math.round((focused / focusGoal) * 100)) : 0;
  const goalNow = goal ? goal.now + goalMinutes : 0;
  const goalPct = goal && goal.target > 0
    ? Math.min(100, Math.round((goalNow / goal.target) * 100)) : 0;
  const left = upcoming.filter((task) => !done.has(task.id));

  return (
    <div className={`pom-sit is-${phase}`}>
      <div className="pom-sit-clock">
        <div className="pom-sit-ring">
          <svg viewBox="0 0 280 280" aria-hidden="true">
            <defs>
              <linearGradient id={gradient} x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--pom-now-2)" />
                <stop offset="100%" stopColor="var(--pom-now)" />
              </linearGradient>
            </defs>
            <circle className="pom-sit-track" cx="140" cy="140" r={r} />
            <circle className="pom-sit-run" cx="140" cy="140" r={r}
              stroke={`url(#${gradient})`} strokeDasharray={c}
              strokeDashoffset={c * (1 - percent / 100)} />
          </svg>
          <div className="pom-sit-read" aria-live="polite">
            <span className="pom-sit-phase">{PHASE_LABEL[phase]}</span>
            <span className="pom-sit-time">{clock(remaining)}</span>
          </div>
        </div>

        <button type="button" className="pom-sit-pause" onClick={onPause}>
          <Icon name="pause" /> Pause
        </button>
        <p className="pom-sit-esc">
          <span className="pom-kbd">Esc</span> to come back
        </p>
      </div>

      <div className="pom-sit-aside">
        <section className="pom-sit-card pom-sit-bars" aria-label="Today">
          <h2>Today</h2>
          <div className="pom-sit-bar">
            <span className="pom-sit-bar-head">
              <b>Tasks</b>
              <i>{tasksDone} of {tasksGoal}</i>
            </span>
            <span className="pom-sit-track-2">
              <span style={{ width: `${taskPct}%` }} />
            </span>
          </div>
          <div className="pom-sit-bar">
            <span className="pom-sit-bar-head">
              <b>Focus</b>
              <i>{hm(focused)} of {hm(focusGoal)}</i>
            </span>
            <span className="pom-sit-track-2">
              <span style={{ width: `${focusPct}%` }} />
            </span>
          </div>
          {goal && (
            <div className="pom-sit-bar" aria-live="off">
              <span className="pom-sit-bar-head">
                <b>Toward {goal.goal.title}</b>
                <i>
                  {fmtHM(goalNow * 60)} of {fmtHM(goal.target * 60)}
                  {goalMinutes > 0 && ` · ${fmtHM(goalMinutes * 60)} of it today`}
                </i>
              </span>
              <span className="pom-sit-track-2">
                <span style={{ width: `${goalPct}%` }} />
              </span>
            </div>
          )}
        </section>

        <section className="pom-sit-card" aria-labelledby="pom-sit-next">
          <h2 id="pom-sit-next">Up next</h2>
          {left.length ? (
            <ul className="pom-sit-tasks">
              {left.map((task) => (
                <li key={task.id}>
                  <button type="button" onClick={() => onComplete(task)} disabled={busy}>
                    <span className="pom-sit-check" aria-hidden="true" />
                    <span className="pom-sit-task-title">{task.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="pom-sit-empty">Nothing left on the list.</p>}
        </section>

        <p className="pom-sit-quote">
          <span>{line.quote}</span>
          <i>{line.author}</i>
        </p>
      </div>
    </div>
  );
}

/** Seconds as the reader says them. Local rather than imported so this file
    does not pull the focus-session hook in for one formatter. */
function hm(seconds: number): string {
  const mins = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
