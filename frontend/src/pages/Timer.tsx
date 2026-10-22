/**
 * Timer — the focus page: pick what you are working on, run the clock, and see
 * where today's sittings went.
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
 * ## Four panels, and only four
 *
 * The clock, the task it is for, the method, and today's sittings. That is the
 * whole page, and each is something no other page has.
 *
 * It used to be eleven. Below the clock sat the optional questions (readiness,
 * kind of work, an intention), the goals the minutes fed, the best sittings,
 * a progress block with tiles and a week of bars, a catalog of all ten
 * methods, a focus line chart and an upcoming task list. Streak, level,
 * focus hours, tasks done and the chart are the Dashboard's and Analytics'
 * own subjects; the goals are the Goals page's; and the questions asked for
 * effort before every sitting and paid back weeks later, if ever. The page
 * read as a second dashboard with a clock buried in it. Anything added from
 * here needs a reason it belongs on the focus page and nowhere else.
 *
 * The hooks still keep readiness, kind and intention on the cycle and the
 * rows, and a row that carries an answered intention still shows it after the
 * sitting. Nothing on this page asks for them any more.
 *
 * ## A sitting is for something
 *
 * The task picker is the reason the page exists. A pick is held on the cycle
 * (hooks/usePomodoro) and copied onto every row the cycle writes, so the
 * sittings panel can say "50m on Revise integrals" instead of "50m". It is
 * carried across breaks and resets, because an afternoon on one task is
 * several pomodoros, and cleared once that task is finished and no focus
 * phase is running — clearing it mid-sitting would strip the task off the
 * very row it was finished in.
 *
 * `?task=<id>` picks one on arrival. It is how the task row's "Focus on this"
 * gets here, and the parameter is dropped once read so a reload does not
 * re-pick a task somebody has since changed.
 *
 * ## The rows are the account's
 *
 * The sittings, the task each was for and the recommendation all come from
 * the interval log — hooks/useIntervals holds it and keeps it in step with
 * `/api/focus/sittings`, components/Timer/intervals.ts is the arithmetic. So
 * a second device sees the same sittings. The hours are a separate ledger,
 * one total per day, in the hero's "Focused today" card.
 *
 * ## What the page fills in by itself
 *
 * After a sitting the strip at the top says what it was: how long, on what,
 * how cleanly, with a replay of where the pauses fell, and the tasks finished
 * inside the sitting's own window with the goals the server had already
 * linked them to. Nothing is matched or guessed: a task closed four minutes
 * after the clock ran out was closed in the break, and claiming it would be
 * the page taking credit for it.
 *
 * ## The hero shows the clock and nothing else
 *
 * The clock, the primary button, reset and set-up, and three cards beside it
 * that are about today's focus: the task in hand, the pomodoro count against
 * the level's target, and the hours against the day's goal.
 *
 * ## While a focus phase runs, this page is something else
 *
 * Press Start Focus and the page is replaced by components/Timer/FocusView —
 * the clock, one pause, the task in hand, what today is adding up to, what is
 * next, and a quote — over a tinted window with the drifting field behind it.
 * Pausing brings this page back, and so does Escape, which pauses.
 *
 * `running && phase === 'focus'` is the whole condition. There is no flag,
 * because a flag can disagree with the clock, and a page that is "in focus
 * mode" while nothing is running is a page telling a story about work nobody
 * is doing. A break brings this page back on its own, which is right: a break
 * is when the things the sitting hides are worth looking at again.
 *
 * Fenced by Timer.sitting.test.tsx, which pins what has to be gone, what has
 * to stay, and both ways back — none of which a type checker can see.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Ambient, Range } from '@/components';
import {
  timerTitle, useApi, useAuth, useDocumentTitle, useHandover, usePageEntrance, useSettings,
  useSubjectIndex, useUserData,
} from '@/hooks';
import { fmtHM, useFocusSession } from '@/hooks/useFocusSession';
import { usePomodoro } from '@/hooks/usePomodoro';
import { goals as goalService, notes as noteService, tasks as taskService } from '@/services';
import { announceStatsChanged } from '@/utils/statsBus';
import { reduced } from '@/utils/homePlay';
import {
  NEARBY, PHASE_LABEL, RECOMMENDED, SITTINGS, clock, styleFor,
  type Phase, type Sitting,
} from '@/components/Timer/pomodoro';
import {
  byTask, execution, focusScore, ranFrom, recommend, verdict, wasJustNow,
  type Interval,
} from '@/components/Timer/intervals';
import { currentStone } from '@/utils/goalStage';
import { goalIdsOf } from '@/utils/goalLinks';
import type { Goal, Milestone, Task } from '@/types';
import '@/styles/timer.css';
import { Icon } from '@/components/Icon';
import { FocusSitting } from '@/components/Timer/FocusSitting';
import { daySummary } from '@/components/Dashboard/summary';
import {
  MethodPicker, Recommend, Replay, TaskPicker, TodaySittings, iso,
} from '@/components/Timer/panels';

const SETUP_KEY = 'pomodoro:setup';

/** How long the page and the sitting take to leave. Equal to `pomSitOut` and
    `pomPageOut` in styles/timer.css; see the note where it is used. */
const SWAP_MS = 200;




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

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
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
        <h2>How long can you focus?</h2>
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




// --------------------------------------------------------------------------
// The goal the sitting's minutes count toward
// --------------------------------------------------------------------------
/**
 * A goal whose own target this page's minutes advance.
 *
 * Not drawn on this page any more. The sitting's live goal line reads it — see
 * components/Timer/FocusView — and so does the dashboard's.
 */
export interface Counting {
  goal: Goal;
  /** Minutes recorded against it, and the minutes it asks for. */
  now: number;
  target: number;
  next: Milestone | null;
  /** Subject names the goal names, resolved. Empty when it names none. */
  subjects: string[];
}

// --------------------------------------------------------------------------
// What the sittings are for
// --------------------------------------------------------------------------




/**
 * The sitting that just ended: how long, on what, and how cleanly.
 *
 * ## Why it is a strip and not a dialog
 *
 * The sitting ended, which means a break has already started. A modal over the
 * break would take the break: somebody who stepped away comes back to a box
 * in front of their own timer. The strip waits, goes once the sitting is no
 * longer "just now" (see `wasJustNow` in components/Timer/intervals.ts), and
 * can be hidden sooner.
 *
 * An execution bar appears only for a row that carries an answered intention.
 * The page no longer asks for one, but rows written before that still have
 * them, and dropping an answer somebody gave would be the cut doing harm.
 *
 * ## A line about it, while it is fresh
 *
 * The clock can say a sitting was fifty clean minutes and cannot say what
 * got figured out in them. The box at the bottom takes that sentence and
 * files it as a note tied to the sitting's task, its subject and its day, so
 * it turns up on the task's row, the subject page and the Notes page without
 * anybody filing anything. Optional, and one line by default: a form in front
 * of the break would be taking the break.
 */
function Outcome({ sitting, fed, onHide, onJot }: {
  sitting: Interval;
  /** What was closed while it ran, and what that counted toward. */
  fed: { tasks: Task[]; goals: string[] };
  onHide: () => void;
  /** Save a note about the sitting. The new note's id, or null if it failed. */
  onJot: (text: string) => Promise<string | null>;
}) {
  const scored = execution(sitting);
  const [text, setText] = useState('');
  const [jotting, setJotting] = useState(false);
  const [jotted, setJotted] = useState<string | null>(null);
  const [jotFailed, setJotFailed] = useState(false);
  const about = sitting.taskTitle ?? sitting.intent;
  const said = verdict(sitting);

  return (
    <section className="pom-outcome" aria-label="Your last session">
      <span className="pom-outcome-head">
        <b>{sitting.minutes} min {about ? 'on' : 'of focus'}</b>
        {about && <i>{about}</i>}
      </span>
      <dl className="pom-outcome-bars" aria-label="How that session went">
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
      {said && <p className="pom-outcome-verdict">{said}</p>}
      {jotted ? (
        <p className="pom-jot-done" role="status">
          Saved to your notes. <Link className="pom-link" to={`/notes?note=${encodeURIComponent(jotted)}`}>Open it</Link>
        </p>
      ) : (
        <form
          className="pom-jot"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim() || jotting) return;
            setJotting(true);
            setJotFailed(false);
            void onJot(text.trim()).then((id) => {
              setJotting(false);
              if (id) setJotted(id);
              else setJotFailed(true);
            });
          }}
        >
          <label className="pom-jot-label" htmlFor="pom-jot-text">
            Jot a note about this session
          </label>
          <div className="pom-jot-row">
            <textarea id="pom-jot-text" className="pom-jot-text" rows={1} maxLength={2000}
              placeholder={sitting.taskTitle ? `What clicked on ${sitting.taskTitle}?` : 'What clicked?'}
              value={text} onChange={(event) => setText(event.target.value)} />
            <button type="submit" className="pom-btn" disabled={!text.trim() || jotting}>
              {jotting ? 'Saving…' : 'Save note'}
            </button>
          </div>
          {jotFailed && <p className="pom-jot-error" role="alert">That didn&apos;t save. Try again in a moment.</p>}
        </form>
      )}
      <button type="button" className="pom-link pom-outcome-hide" onClick={onHide}>Hide</button>
    </section>
  );
}

// --------------------------------------------------------------------------
export default function Timer() {
  const { username } = useAuth();
  const user = username || 'Default';
  const account = useUserData();
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

  const today = useMemo(() => new Date(), []);
  const goals = useApi(useCallback(() => goalService.getGoals(), []), []);

  const entering = usePageEntrance(true);

  const finish = useCallback((styleId?: string) => {
    if (styleId) pomodoro.choose(styleId);
    void updatePrefs({ timer_setup_done: true });
    setSetup(false);
  }, [pomodoro, updatePrefs]);

  const {
    style, phase, running, remaining, percent, level, doneToday, intervals, setTask,
  } = pomodoro;
  const tasks = account.data?.tasks ?? [];
  const focusing = running && phase === 'focus';

  /* Asked about the kind of work in hand first, and about everything only if
     that has nothing to say. The answers are different claims — "50 min for
     deep work" against "50 min" — so `Recommendation` carries which one it is
     and the strip prints it. */
  const suggestion = useMemo(
    () => recommend(intervals, pomodoro.kind) ?? recommend(intervals),
    [intervals, pomodoro.kind],
  );

  // ---- What the sittings are for -------------------------------------------
  const picked = pomodoro.task;

  /* `?task=<id>` picks one on arrival, then leaves the address bar. A task
     that is finished or not this account's is ignored rather than picked. */
  const [params, setParams] = useSearchParams();
  const wanted = params.get('task');
  useEffect(() => {
    if (!wanted || !account.data) return;
    const row = account.data.tasks.find((task) => task.id === wanted);
    if (row && row.status !== 'done') setTask({ id: row.id, title: row.title });
    setParams((was) => {
      const next = new URLSearchParams(was);
      next.delete('task');
      return next;
    }, { replace: true });
  }, [wanted, account.data, setTask, setParams]);

  /* Let go of a pick once its task is finished or gone, but never mid-sitting:
     the row that sitting writes is the one the task was finished in, and it
     should say so. Follows a rename too, so the label is the task's own. */
  useEffect(() => {
    if (!picked || !account.data || focusing) return;
    const row = account.data.tasks.find((task) => task.id === picked.id);
    if (!row || row.status === 'done') setTask(null);
    else if (row.title !== picked.title) setTask({ id: row.id, title: row.title });
  }, [picked, account.data, focusing, setTask]);

  const upcoming = useMemo(() => tasks
    .filter((task) => task.status !== 'done')
    .sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))
    .slice(0, 5), [tasks]);

  /** The picked task first, then the next few due. */
  const choices = useMemo(() => {
    const row = picked ? tasks.find((task) => task.id === picked.id && task.status !== 'done') : undefined;
    return row ? [row, ...upcoming.filter((task) => task.id !== row.id)] : upcoming;
  }, [picked, tasks, upcoming]);

  const sittingsToday = useMemo(() => byTask(intervals, iso(today)), [intervals, today]);

  // ---- The goal the minutes count toward -----------------------------------
  const subjectIndex = useSubjectIndex(username);
  const allGoals = goals.data?.goals ?? [];

  /* Goals this page's minutes advance: measured in focus time, still open, and
     actually asking for some. `subject_ids` is stored comma-separated — split
     at the call site, as the field's own note says. Drawn by the sitting's
     live goal line, not on this page. */
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

  // ---- The sitting just finished -------------------------------------------
  const lastSitting: Interval | undefined = intervals[intervals.length - 1];
  const [hiddenAt, setHiddenAt] = useState<number | null>(null);
  /* Shown while the sitting is still the one in somebody's head. Hiding it
     writes nothing; it only stops this sitting's strip coming back. */
  const outcome = lastSitting
    && lastSitting.at !== hiddenAt
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

  const goalSeconds = session.goalHours * 3600;

  /* A note about a sitting: tied to its task, the task's subject and its day,
     so it shows up on the task row, the subject page and in Notes. Titled by
     the task, since that is what somebody scanning their notes will look for. */
  const jot = useCallback(async (row: Interval, text: string): Promise<string | null> => {
    const task = row.taskId ? tasks.find((entry) => entry.id === row.taskId) : undefined;
    try {
      const result = await noteService.save({
        title: row.taskTitle ?? 'Focus session',
        body: text,
        note_date: row.day,
        task_id: task ? task.id : '',
        subject_ids: task?.subject ?? '',
      });
      return result.success ? result.note.id : null;
    } catch {
      return null;
    }
  }, [tasks]);

  /* ---- The sitting --------------------------------------------------------
   *
   * A running focus phase *is* the collapsed view — there is no third piece of
   * state saying whether to show it, because a mode that could disagree with
   * the clock is a mode that will. Pausing leaves it and so does Escape, which
   * pauses; a break brings the page back on its own, which is right, because a
   * break is when the things this view hides are worth looking at again.
   *
   * See components/Timer/FocusView for what it holds and why that is the list.
   */
  const sitting = focusing;

  /* The swap between the two, in both directions.
   *
   * `sitting` flips the instant the button is pressed, and rendering off it
   * directly means the page it is replacing gets no exit: the reader sees the
   * whole screen disappear and then a clock fade up into the gap where it was.
   * `useHandover` holds the outgoing side on screen for the length of its own
   * fade and swaps when that is done, so leaving looks like arriving played
   * backwards instead of like a cut.
   *
   * `SWAP_MS` is the length of `pomSitOut` and `pomPageOut` in
   * styles/timer.css and has to stay equal to them — shorter and the swap
   * happens mid-fade, longer and the screen sits finished-and-blank waiting
   * for a timer. Zero under `prefers-reduced-motion`, which is also what takes
   * both animations off. */
  const swap = useHandover(sitting, reduced ? 0 : SWAP_MS);

  /* The page cascades back in when the sitting lets go of it, the same arrival
   * it gets on a fresh load — see styles/page-enter.css. `usePageEntrance`
   * cannot do this one: it fires once per mount and the page never unmounted,
   * the sitting was rendered in front of it. */
  const [returning, setReturning] = useState(false);
  const sat = useRef(false);
  useEffect(() => {
    if (swap.shown) { sat.current = true; return; }
    if (!sat.current) return;
    sat.current = false;
    if (reduced) return;
    setReturning(true);
    const settled = window.setTimeout(() => setReturning(false), 900);
    return () => window.clearTimeout(settled);
  }, [swap.shown]);

  /* Ticked here, and not yet reloaded.
   *
   * `completeTask` returns before the account's task list is refetched, and
   * the row has to leave the list on the click rather than a round trip later
   * — a checkbox that waits is a checkbox somebody presses twice. Cleared when
   * the reload lands and the task is genuinely `done`. */
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [ticking, setTicking] = useState(false);

  const finishTask = useCallback(async (task: Task) => {
    if (ticking) return;
    setTicking(true);
    setTicked((was) => new Set(was).add(task.id));
    const result = await taskService.completeTask(task.id);
    setTicking(false);
    if (!result.success) {
      // Put it back. The list is the truth and the optimistic row was a guess.
      setTicked((was) => {
        const next = new Set(was);
        next.delete(task.id);
        return next;
      });
      return;
    }
    // The rail's level and the bell did not hear about completions made here.
    // See utils/statsBus, and the same call on pages/Goals.tsx.
    announceStatsChanged();
    await account.reload();
  }, [account, ticking]);

  /** Today's plate, which is what the sitting's first bar counts: the same
      figures the dashboard's Today's Progress card draws. */
  const plate = useMemo(() => daySummary(tasks, iso(today)), [tasks, today]);

  /* Drop the optimistic ids the reload has caught up with, so a long sitting
     does not accumulate a set of every task it ever ticked. */
  useEffect(() => {
    setTicked((was) => {
      if (!was.size) return was;
      const open = new Set(tasks.filter((t) => t.status !== 'done').map((t) => t.id));
      const next = new Set([...was].filter((id) => open.has(id)));
      return next.size === was.size ? was : next;
    });
  }, [tasks]);

  if (swap.shown) {
    return (
      <FocusSitting
        leaving={swap.leaving}
        phase={phase}
        percent={percent}
        remaining={remaining}
        onPause={pomodoro.pause}
        tasksDone={plate.done}
        tasksTotal={plate.total}
        focused={session.focused}
        focusGoal={goalSeconds}
        upcoming={choices}
        onComplete={(task) => void finishTask(task)}
        busy={ticking}
        done={ticked}
        goal={counting[0] ?? null}
        goalMinutes={Math.round(session.focused / 60)}
        task={picked}
      />
    );
  }

  return (
    <div
      className={`pom-page${entering || returning ? ' pg-enter' : ''}${swap.leaving ? ' is-going' : ''}`}
    >
      {/* This page's own, because the shell stands down for `/timer` — the
          sitting's field runs the surge cycle and two canvases would be two
          loops. See the note on <Ambient /> in App.tsx. */}
      <Ambient />
      <header className="pom-head">
        <span className="pom-head-sun" aria-hidden="true"><Icon name="sun" /></span>
        <div className="pom-head-text">
          <h1>{greeting(today.getHours())}, {displayName || username || 'there'}</h1>
          <p>Pick a task and start the clock.</p>
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
              key={outcome.id ?? outcome.at}
              sitting={outcome}
              fed={fed}
              onHide={() => setHiddenAt(outcome.at ?? null)}
              onJot={(text) => jot(outcome, text)}
            />
          )}

          {/* ---- The clock --------------------------------------------- */}
          <section className={`pom-hero is-${phase}`}>
            {/* The one hero in the app that does not take a tone: its three
                colours follow the phase, set on `.pom-hero.is-*` in
                styles/timer.css, so the range turns green on a break with the
                ring and the button. See components/Range.tsx. */}
            <Range variant="focus" />
            <div className="pom-hero-mid">
              <div className="pom-ring-wrap">
                <Ring percent={percent} phase={phase} />
                <div className="pom-ring-text" aria-live="polite">
                  <span className="pom-ring-phase">{PHASE_LABEL[phase]}</span>
                  <span className="pom-ring-time">{clock(remaining)}</span>
                  <span className="pom-ring-sub">
                    {phase === 'focus' ? 'Work session' : 'Rest'}
                  </span>
                </div>
              </div>

              <button type="button" className="pom-start"
                onClick={running ? pomodoro.pause : pomodoro.start}>
                <Icon name={running ? 'pause' : 'play'} />
                {running ? 'Pause focus' : 'Start focus'}
              </button>

              {/* Reset and set-up-again only. The round play button that used
                  to lead this row was the same action as the button directly
                  above it, a hundred pixels apart — two primaries for one
                  decision, which is the cramming this layout was pulled apart
                  to fix. */}
              <div className="pom-ring-controls">
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
                <span className="pom-side-icon pom-tone-violet" aria-hidden="true"><Icon name="clipboard" /></span>
                <span className="pom-side-label">Working on</span>
                <strong className="pom-side-task">{picked ? picked.title : 'No task'}</strong>
                <em>{picked ? 'logged on each session' : 'pick one below'}</em>
              </div>
              <div className="pom-side-card">
                <span className="pom-side-icon pom-tone-amber" aria-hidden="true"><Icon name="flame" /></span>
                <span className="pom-side-label">Today&apos;s focus</span>
                <strong>{doneToday} / {level.target}</strong>
                <em>pomodoros</em>
              </div>
              <div className="pom-side-card">
                <span className="pom-side-icon pom-tone-blue" aria-hidden="true"><Icon name="clock" /></span>
                <span className="pom-side-label">Focused today</span>
                <strong>{fmtHM(session.focused)}</strong>
                <em>of {fmtHM(goalSeconds)} goal</em>
              </div>
            </div>
          </section>

          {/* ---- What it is for ---------------------------------------- */}
          <TaskPicker tasks={choices} picked={picked?.id ?? null} onPick={setTask} today={today} />

          {/* ---- Method ------------------------------------------------ */}
          {/* The two decisions that shape the cycle, on their own. They used
              to sit in the hero's left column above five more controls, which
              made one panel answer four unrelated questions. */}
          <section className="pom-panel pom-method">
            <header className="pom-panel-head">
              <div className="pom-panel-title">
                <h2><Icon name="target" /> Pick your focus</h2>
                <p>How hard you're going and how long each session runs</p>
              </div>
            </header>

            <MethodPicker levelId={level.id} styleId={style.id}
              onLevel={pomodoro.setLevel} onStyle={pomodoro.choose} />

            <Recommend at={suggestion} sittings={intervals.length}
              current={style.id} onUse={pomodoro.choose} />
          </section>

          {/* ---- Today ------------------------------------------------- */}
          <TodaySittings rows={sittingsToday} />
        </>
      )}
    </div>
  );
}

