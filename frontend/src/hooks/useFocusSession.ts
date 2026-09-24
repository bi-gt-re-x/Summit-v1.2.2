/**
 * The focus session — the port of focus.js.
 *
 * Elapsed time is **timestamp-based**, and that is the whole design. Starting
 * a session records `runningSince` (epoch ms); the focused total is
 * `accumulatedSeconds + (now - runningSince)`. Nothing counts ticks, so a
 * session keeps running while the tab is hidden, the laptop is shut or the
 * browser is closed, and a display that was not updating catches up the moment
 * anyone looks at it. Stopping banks the segment into `accumulatedSeconds` and
 * clears `runningSince`.
 *
 * State lives in localStorage under `focus:<user>:<date>` — so a session
 * started on the dashboard is visible on the calendar's Focus card without
 * either of them talking to the other. The date is carried in the hook's own
 * state rather than read off the clock at each write, and `rollOver` below is
 * what turns it: read from the clock, a tab left open past midnight wrote
 * yesterday's banked seconds under today's key and the new day opened already
 * won.
 *
 * The day's **goal** is not this hook's to invent. A goal set on the day with
 * the panel's +/- wins; under it is whatever the account's chosen pomodoro
 * method implies, which is the usual answer (utils/pomodoroChoice); under that
 * is `focus_goal_hours` in Settings, for an account that has never opened the
 * timer.
 *
 * **`html.focus-mode` is set here**, and that is new. A running session is
 * supposed to clear the page down to the work: the dashboard folds its
 * greeting, its stat cards, its summary row and its quote away and leaves the
 * Focus panel over the task list. That clearing-away is a preference now
 * (Settings, Focus): turned off, the timer runs and the page stays where it
 * was. Every one of those rules was written and none
 * of them ever fired, because the class they hang off was set by
 * focus-theme.js — a vanilla file deleted with the rest of the old front end —
 * and what replaced it was a `focusmodechange` event dispatched to nobody.
 * Starting a session therefore did nothing but change a button's label. The
 * class is a fact about the session, so it is set by the thing that owns the
 * session.
 *
 * It is deliberately not removed on unmount. The class describes the account's
 * day and not this component's lifetime: navigating from the dashboard to the
 * calendar mid-session must not undim the app, and the next page to mount the
 * hook re-states it either way.
 *
 * The server copy is a mirror, not the truth: `syncDay` never lowers a day's
 * recorded total, so syncing too often or with a stale value is harmless.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { POMODORO_CHANGED, chosenGoalHours } from '@/utils/pomodoroChoice';
import { focus as focusService } from '@/services';
import { MAX_GOAL_HOURS, MIN_GOAL_HOURS } from '@/services/constants';

/** How often a running session mirrors itself to the server. */
const SYNC_MS = 60_000;
/** How often the display re-reads the clock while running. */
const TICK_MS = 1000;
/** How often the hook checks whether the day has turned over under it. */
const ROLLOVER_MS = 60_000;

export interface FocusState {
  /**
   * The goal this day was given, or null for one that has not been given one.
   *
   * The distinction is the whole reason it is nullable. A day with no goal of
   * its own follows the account's default, so changing that default in Settings
   * moves today as well as tomorrow — while a day the reader has actually set a
   * goal on keeps it, which is what setting it meant.
   */
  goalHours: number | null;
  accumulatedSeconds: number;
  /** Epoch ms the current segment began, or null when stopped. */
  runningSince: number | null;
}

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The day is an argument everywhere below, and never read from the clock.
 *
 * It used to be `todayStr()` inside the key, which is correct at the moment a
 * tab loads and wrong at every moment after midnight: the state in memory
 * still held yesterday's banked seconds, and the next `save` wrote them under
 * *today's* key. A dashboard left open overnight woke up having already
 * focused for six hours. Passing the day in means a write can only ever land
 * on the day the state belongs to, and rolling over becomes a thing the hook
 * does on purpose rather than a thing the clock does behind it.
 */
function storageKey(user: string, day: string): string {
  return `focus:${user}:${day}`;
}

function load(user: string, day: string): FocusState {
  let raw: Partial<FocusState> = {};
  try {
    raw = JSON.parse(
      localStorage.getItem(storageKey(user, day)) || '{}',
    ) as Partial<FocusState>;
  } catch {
    raw = {};
  }
  return {
    goalHours:
      typeof raw.goalHours === 'number' && !Number.isNaN(raw.goalHours)
        ? raw.goalHours
        : null,
    accumulatedSeconds:
      typeof raw.accumulatedSeconds === 'number' ? raw.accumulatedSeconds : 0,
    runningSince:
      typeof raw.runningSince === 'number' ? raw.runningSince : null,
  };
}

function save(user: string, day: string, state: FocusState): void {
  try {
    localStorage.setItem(storageKey(user, day), JSON.stringify(state));
  } catch {
    /* private mode: the session is just not remembered across reloads */
  }
}

/** Total focused seconds, banked plus whatever the running segment has run. */
export function focusedSeconds(state: FocusState): number {
  const live = state.runningSince
    ? Math.max(0, (Date.now() - state.runningSince) / 1000)
    : 0;
  return state.accumulatedSeconds + live;
}

/** "1h 30m" — the format the focus panel and the calendar both print. */
export function fmtHM(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export interface UseFocusSession {
  goalHours: number;
  focused: number;
  percent: number;
  running: boolean;
  start: () => void;
  stop: () => void;
  setGoalHours: (hours: number) => void;
}

export function useFocusSession(username: string | null): UseFocusSession {
  const user = username || 'Default';
  const { prefs } = useSettings();

  /** The day the state below belongs to. See `storageKey`, and `rollOver`. */
  const [day, setDay] = useState(todayStr);
  const [state, setState] = useState<FocusState>(() => load(user, todayStr()));

  /**
   * The goal the chosen pomodoro method implies, or null for an account that
   * has never opened the timer.
   *
   * A level names a number of sittings and a style says how long a sitting is,
   * so between them they are already a statement about how much of the day
   * this account means to spend. Reading the goal off them is what stops the
   * dashboard asking for two hours while the timer is set up for seven — see
   * utils/pomodoroChoice.
   */
  const [chosen, setChosen] = useState<number | null>(() => chosenGoalHours(user));

  /**
   * This day's own goal, then the method's, then the figure in Settings.
   *
   * Three sources and the order is the point. A goal set on the day with the
   * panel's +/- is a thing the reader said about today and outranks
   * everything. Below it is the method, because choosing Level 4 Classic is
   * choosing three and a half hours whether or not anybody thought of it that
   * way. `focus_goal_hours` is last and is still the answer for an account
   * that has never set the timer up.
   */
  const goalHours = state.goalHours ?? chosen ?? prefs.focus_goal_hours;

  // Bumped on a tick so the derived figures re-read the clock. The state
  // itself does not change while running — that is the point of timestamps.
  const [, setTick] = useState(0);
  const latest = useRef(state);
  latest.current = state;
  /* Read inside callbacks that must not be rebuilt every time the day is
     re-stated, and written by `rollOver` before it sets the state. */
  const dayNow = useRef(day);
  dayNow.current = day;

  // Re-read when the account changes, or the panel would show the last
  // account's day — and the last account's method.
  useEffect(() => {
    const today = todayStr();
    dayNow.current = today;
    setDay(today);
    setState(load(user, today));
    setChosen(chosenGoalHours(user));
  }, [user]);

  /* The method is stored by a different hook, and localStorage tells nobody it
     has moved inside one tab. hooks/usePomodoro.ts says so instead. */
  useEffect(() => {
    const onChanged = () => setChosen(chosenGoalHours(user));
    window.addEventListener(POMODORO_CHANGED, onChanged);
    return () => window.removeEventListener(POMODORO_CHANGED, onChanged);
  }, [user]);

  const write = useCallback(
    (next: FocusState) => {
      save(user, dayNow.current, next);
      setState(next);
    },
    [user],
  );

  /**
   * Midnight: bank what was earned yesterday, and start today at nothing.
   *
   * Without this a tab open across midnight kept yesterday's total in memory
   * and wrote it under today's key on the next save, so the day began already
   * won. The reset is per account as well as per day, because the key carries
   * both and the state is reloaded from it rather than merely zeroed.
   *
   * A session that was running does not stop at midnight — it is one sitting
   * and the reader is still at it. What happens is that it is cut in two: the
   * part before midnight is banked against the day it was earned on, and the
   * new day picks the session up from its own midnight. The boundary is
   * computed from the *stored* day rather than from the clock, so a tab that
   * slept through the whole of Sunday still credits Saturday with Saturday.
   * Days passed over entirely are not written at all, which is the honest
   * answer: nobody was there.
   */
  const rollOver = useCallback(() => {
    const today = todayStr();
    const was = dayNow.current;
    if (today === was) return;

    const ended = new Date(`${was}T00:00:00`).getTime() + 86_400_000;
    const carried = latest.current.runningSince !== null;
    if (carried) {
      const s = latest.current;
      save(user, was, {
        ...s,
        accumulatedSeconds:
          s.accumulatedSeconds + Math.max(0, (ended - (s.runningSince ?? ended)) / 1000),
        runningSince: null,
      });
    }

    const fresh = load(user, today);
    const next: FocusState = carried
      ? { ...fresh, runningSince: new Date(`${today}T00:00:00`).getTime() }
      : fresh;

    dayNow.current = today;
    latest.current = next;
    setDay(today);
    setState(next);
    if (carried) save(user, today, next);
  }, [user]);

  /* Checked on a slow timer rather than on the running tick, because a tab
     sitting on the dashboard overnight with no session is the case that broke:
     nothing ticks, nothing re-renders, and the first thing to happen in the
     morning is a write under the wrong key. A minute is far finer than a day
     and costs a string comparison. */
  useEffect(() => {
    rollOver();
    const watch = setInterval(rollOver, ROLLOVER_MS);
    return () => clearInterval(watch);
  }, [rollOver]);

  // The resolved goal, for the mirror to the server: a day following the
  // account's default still has a goal, it just does not have one of its own.
  const goal = useRef(goalHours);
  goal.current = goalHours;

  const sync = useCallback(() => {
    if (!username) return;
    const s = latest.current;
    void focusService
      /* The day the state belongs to, not the day it is now. The two differ
         for exactly as long as it takes `rollOver` to notice midnight, and
         sending the total under the wrong one would credit a day nobody
         worked. */
      .syncDay(dayNow.current, Math.round(focusedSeconds(s)), goal.current)
      .catch(() => {
        /* offline — the next sync retries, and the server never lowers a total */
      });
  }, [username]);

  const running = state.runningSince !== null;

  // What every "while focusing" rule in the stylesheets keys off. See the note
  // at the top for why it is set here and why it is never cleaned up. Turning
  // the preference off has to take the class with it, which is why it is a
  // dependency and not a guard on the way in.
  useEffect(() => {
    document.documentElement.classList.toggle('focus-mode', running && prefs.focus_dim);
  }, [prefs.focus_dim, running]);

  // While running: re-render every second, and mirror to the server every minute.
  useEffect(() => {
    if (!running) return;
    const ticker = setInterval(() => setTick((n) => n + 1), TICK_MS);
    const syncer = setInterval(sync, SYNC_MS);
    return () => {
      clearInterval(ticker);
      clearInterval(syncer);
    };
  }, [running, sync]);

  // A tab coming back into view has time to catch up on, and a tab going away
  // is the last chance to bank what it knows.
  useEffect(() => {
    function onVisible() {
      if (document.hidden) return;
      // A tab that was away may have been away over midnight, and this is the
      // moment before anybody looks at the figure.
      rollOver();
      setTick((n) => n + 1);
    }
    function onLeave() {
      if (latest.current.runningSince) sync();
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onLeave);
    };
  }, [sync, rollOver]);

  const start = useCallback(() => {
    const s = latest.current;
    if (s.runningSince) return;
    // The `focusmodechange` event that used to be dispatched here is gone with
    // the last thing that listened for it. `running` changing is the signal,
    // and the effect above is what acts on it.
    write({ ...s, runningSince: Date.now() });
  }, [write]);

  const stop = useCallback(() => {
    const s = latest.current;
    if (!s.runningSince) return;
    const banked =
      s.accumulatedSeconds + Math.max(0, (Date.now() - s.runningSince) / 1000);
    write({ ...s, accumulatedSeconds: banked, runningSince: null });
    sync();
  }, [write, sync]);

  const setGoalHours = useCallback(
    (hours: number) => {
      const clamped = Math.max(MIN_GOAL_HOURS, Math.min(MAX_GOAL_HOURS, hours));
      write({ ...latest.current, goalHours: clamped });
    },
    [write],
  );

  const focused = focusedSeconds(state);
  const goalSec = goalHours * 3600;
  const percent =
    goalSec > 0 ? Math.min(100, Math.round((focused / goalSec) * 100)) : 0;

  return {
    goalHours,
    focused,
    percent,
    running,
    start,
    stop,
    setGoalHours,
  };
}
