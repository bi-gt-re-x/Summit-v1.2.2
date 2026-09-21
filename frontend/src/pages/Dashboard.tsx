/**
 * The dashboard — the account's day, at a glance.
 *
 * Four rows: a greeting, four stat cards, the Tasks list beside the Focus
 * panel, and three summary cards along the bottom. Every one of them is
 * counted from a single `/api/get_user_data` call, by the pure functions in
 * components/Dashboard/summary.ts — nothing on this page fetches for itself, so
 * no two panels can disagree about what a task is.
 *
 * The rule the page has always followed and still does: **the backend
 * decides.** Completing a task does not compute the new XP, level or streak
 * locally — it posts, and renders what the post came back with. The response
 * carries every figure that moved (backend/api/tasks.py), so this page never
 * has to guess at one and never has to ask for the whole account again to find
 * out. Adding a task is the same: the row written is the row described.
 *
 * What that buys is a page that does not move under the reader. A re-read used
 * to follow every write, and while it was in flight the cards were rebuilt and
 * their counters restarted from zero — a completed task read as a page flash
 * rather than as a number going up. The Refresh button in the header is the one
 * thing that asks the server again.
 *
 * The focus session is owned here rather than inside the Focus panel, because
 * two things show it: the panel and the Focus Time stat card. One
 * `useFocusSession` shared between them is what stops the two disagreeing
 * about the same day. The pomodoro over it is owned here for the same reason
 * and one stronger: it starts and stops that session, so a second copy would
 * be a second hand on the account's focus clock.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ambient, ErrorState, Loading, PageHero, RefreshButton } from '@/components';
import {
  CatchUp,
  DailyQuote,
  FocusCard,
  FocusPanel,
  GoalReached,
  GoalsCard,
  LevelUp,
  NextMove,
  NextUp,
  RecentActivity,
  StreakCard,
  TaskModal,
  TaskPanel,
  TodayCard,
  WeeklyOverview,
  XpCard,
  useCrossing,
} from '@/components/Dashboard';
import { RatePrompt } from '@/components/Tasks';
import {
  TYPICAL_DAYS,
  bucketTasks,
  dayPlan,
  daySummary,
  daysIntoWeek,
  recentActivity,
  typicalDay,
  weekBefore,
  weekSummary,
} from '@/components/Dashboard/summary';
import {
  timerTitle,
  useCatchUp,
  useDocumentTitle,
  useNow,
  usePageEntrance,
  useSettings,
  useSubjectIndex,
  useUserData,
} from '@/hooks';
import { fmtHM, useFocusSession } from '@/hooks/useFocusSession';
import { usePomodoro } from '@/hooks/usePomodoro';
import { focus as focusService, goals as goalService, tasks as taskService } from '@/services';
import { weekStartDay } from '@/services/settings';
import { dates, format } from '@/utils';
import { isoStamp } from '@/utils/calendarGrid';
import type { GoalNews, TaskTab } from '@/components/Dashboard';
import type { NewTask } from '@/services/tasks';
import type { Goal, Task } from '@/types';
import '@/styles/dashboard.css';
import '@/styles/dashboard-home.css';
import { announceStatsChanged } from '@/utils/statsBus';

export default function Dashboard() {
  const { data, error, loading, refreshing, reload, mutate, username } = useUserData();
  const session = useFocusSession(username);
  /* The cycle over the session, for the Focus panel.
   *
   * Owned here for the reason the session is: it is one account-wide record in
   * localStorage, and a second copy of it would be a second thing starting and
   * stopping the focus clock. It takes `session` because a running focus phase
   * *is* a running session — see the note at the top of hooks/usePomodoro. */
  const pomodoro = usePomodoro(username, session);

  /* The tab carries the session while it runs.
   *
   * The focus page counts a phase down; this counts the day up, which is the
   * same figure the Focus panel prints and the same one the goal is measured
   * against — a tab that disagreed with the panel under it would be worse than
   * a tab that said nothing. Below `session` rather than at the top of the
   * component because it reads from it; every hook here is unconditional, so
   * the order is stable. See hooks/useDocumentTitle. */
  useDocumentTitle(session.running ? timerTitle(session.focused, 'Focus') : 'Dashboard');
  const subjects = useSubjectIndex(username);
  const { prefs, dailyGoal, displayName } = useSettings();
  /* The days this page was not told about — see hooks/useCatchUp. Usually
     nothing: an account that runs the timer has no unrecorded days, and one
     that has already been asked today is not asked again. */
  const catchUp = useCatchUp(username);

  const [tab, setTab] = useState<TaskTab>('today');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  /** The level to celebrate, set when a completion crosses a level boundary. */
  const [levelled, setLevelled] = useState<number | null>(null);
  /** The daily goal just reached, if one has been. See GoalReached. */
  const [news, setNews] = useState<GoalNews | null>(null);

  // Today is read once per render rather than per panel, so a page left open
  // across midnight moves all of its cards over on the same tick — and it is
  // a *ticking* clock rather than `new Date()` on render, so that promise is
  // actually kept on a page nobody has touched since yesterday. It is also
  // what counts the "up next" strip down.
  const now = useNow();
  const todayIso = dates.isoDate(now);
  // The week the account counts in — Monday unless they have said Sunday.
  const opens = dates.startOfWeek(now, weekStartDay(prefs));
  const mondayIso = dates.isoDate(opens);
  const sundayIso = dates.isoDate(dates.addDays(opens, 6));

  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const buckets = useMemo(() => bucketTasks(tasks, todayIso), [tasks, todayIso]);
  const day = useMemo(() => daySummary(tasks, todayIso), [tasks, todayIso]);
  const week = useMemo(
    () => weekSummary(tasks, mondayIso, sundayIso),
    [tasks, mondayIso, sundayIso],
  );
  /* The same week before, counted to the same depth — three days of this week
     against three of last, not against seven. See `weekBefore`. */
  const weekAgo = useMemo(
    () => weekBefore(tasks, mondayIso, daysIntoWeek(mondayIso, todayIso)),
    [tasks, mondayIso, todayIso],
  );
  const activity = useMemo(() => recentActivity(tasks), [tasks]);

  /* Today as spans, for the "what now" strip. The clock above ticks each
     minute, so the countdown counts down rather than standing still until
     something else re-renders the page. */
  const plan = useMemo(() => dayPlan(tasks, todayIso), [tasks, todayIso]);

  /* The account's own average day, so the figures at the top of the page have
     something to be measured against — see `typicalDay` in Dashboard/summary
     for why every calendar day counts and today does not. */
  const usual = useMemo(() => typicalDay(tasks, todayIso), [tasks, todayIso]);
  const nowHour = useMemo(() => {
    const hours = now.getHours() + now.getMinutes() / 60;
    // The grid's day runs 6 AM to 5 AM — see `gridHour` in Dashboard/summary.
    return hours < 6 ? hours + 24 : hours;
  }, [now]);

  /**
   * Hours focused on an average day, from the record rather than the task list.
   *
   * The one figure on this page that cannot be counted off the tasks — focus is
   * its own table — so it is its own read, over the same fortnight `typicalDay`
   * uses. Null until it lands, and the card simply does not draw the line
   * until then rather than showing a zero it would have to take back.
   */
  const [usualFocus, setUsualFocus] = useState<number | null>(null);
  useEffect(() => {
    if (!username) return;
    let live = true;
    const from = dates.addDays(now, -TYPICAL_DAYS);
    const until = dates.addDays(now, -1);
    void focusService
      .history(dates.isoDate(from), dates.isoDate(until))
      .then((result) => {
        if (!live || !result.success) return;
        const days = Object.values(result.days);
        if (!days.length) {
          setUsualFocus(null);
          return;
        }
        const seconds = days.reduce((sum, day) => sum + (Number(day.seconds) || 0), 0);
        // Over the window rather than over the days that came back: a day with
        // nothing tracked is a day, and averaging only the tracked ones would
        // compare today against the reader's good days alone.
        setUsualFocus(seconds / 3600 / TYPICAL_DAYS);
      });
    return () => {
      live = false;
    };
    // `now` ticks every minute and this window only moves at midnight, so the
    // day is the dependency rather than the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayIso, username]);

  /* The account's goals, for the card that says what the day's work is for.
     Read once per account rather than with the task list: a goal is not a fact
     about today, and the page's one big read is deliberately not made twice. */
  const [goals, setGoals] = useState<Goal[]>([]);
  useEffect(() => {
    if (!username) return;
    let live = true;
    void goalService.getGoals().then((result) => {
      if (live && result.success) setGoals(result.goals ?? []);
    });
    return () => {
      live = false;
    };
  }, [username]);

  // ---- Reaching a goal ----------------------------------------------------
  /* The two figures the dashboard already draws against a target, watched for
     the moment they arrive at it. Whichever gets there first has the screen:
     `current ?? next` keeps a second crossing in the same breath — a task
     finished while the timer runs past the hour — from stacking a card on top
     of the one already up. See components/Dashboard/GoalReached. */
  const announce = useCallback((next: GoalNews) => {
    setNews((current) => current ?? next);
  }, []);

  const xpGoal = Math.max(1, Math.round(dailyGoal));
  const focusGoal = Math.max(1, Math.round(session.goalHours * 3600));

  useCrossing(
    day.xp,
    xpGoal,
    // Not before the account's tasks are on the page: today's XP reads as zero
    // until then, and the jump off that placeholder is not a day being won.
    data !== null,
    useCallback(
      () =>
        announce({
          kind: 'xp',
          target: `${format.number(xpGoal)} XP`,
          reached: `${format.number(day.xp)} XP`,
        }),
      [announce, day.xp, xpGoal],
    ),
  );

  useCrossing(
    Math.round(session.focused),
    focusGoal,
    true,
    useCallback(
      () =>
        announce({
          kind: 'focus',
          target: fmtHM(focusGoal),
          reached: fmtHM(session.focused),
        }),
      [announce, focusGoal, session.focused],
    ),
  );

  /**
   * Finish one task.
   *
   * `ask` is how the day button borrows this without a prompt firing on every
   * row: it completes the card's list one task at a time like everything else,
   * and raises the whole day's prompts at the end as one queue. Says whether
   * the completion landed, which is what lets that queue hold only the tasks
   * the server actually recorded. Every other caller leaves `ask` alone and
   * ignores the answer.
   */
  const complete = useCallback(
    async (task: Task, ask = true): Promise<boolean> => {
      if (!username) return false;
      setBusyId(task.id);
      setFailure(null);
      try {
        const result = await taskService.completeTask(task.id);
        if (!result.success) {
          setFailure(result.message);
          // The page can no longer vouch for what it is showing, so this is
          // one of the two times it asks the server again on its own.
          reload();
          return false;
        }
        // The response carries the new level, so the backend still decides what
        // the level is. Comparing against the one it replaces only notices that
        // it went up, which is what the celebration is for.
        const was = data?.stats.level ?? 0;
        if (result.new_level > was) setLevelled(result.new_level);

        // Everything that moved is in the response, so it is written onto the
        // page rather than fetched back. The stamps match the ones the backend
        // wrote — local time, `datetime.now().isoformat()`'s shape — because
        // every "is this today?" test in the app compares them as text.
        const at = new Date();
        mutate((current) => ({
          ...current,
          stats: {
            ...current.stats,
            // `new_xp` is the XP inside the new level; `stats.xp` is the
            // lifetime total, which is what the cards read off it.
            xp: (Number(current.stats.xp) || 0) + (Number(result.xp_earned) || 0),
            level: result.new_level,
            tasks_completed: result.new_tasks_completed,
            current_streak: result.current_streak,
            best_streak: result.best_streak,
          },
          tasks: current.tasks.map((entry) => {
            if (String(entry.id) !== String(task.id)) return entry;
            const created = entry.created_at ? new Date(entry.created_at) : null;
            const due = entry.due_date ? new Date(entry.due_date) : null;
            return {
              ...entry,
              status: 'done' as const,
              completed_at: isoStamp(at),
              ...(created && !Number.isNaN(created.getTime())
                ? {
                    completion_seconds: Math.round(
                      Math.max(0, (at.getTime() - created.getTime()) / 1000),
                    ),
                  }
                : {}),
              ...(due && !Number.isNaN(due.getTime()) ? { met_deadline: at <= due } : {}),
            };
          }),
        }));

        // The rail shows the level and the XP total and is mounted outside the
        // router, so it never re-reads on its own. This is the one thing that
        // moves those numbers.
        announceStatsChanged();

        // Ask how it went, now that the work is banked — unless the reader
        // has turned the questions off in Settings, which this used to ignore
        // while the tasks page honoured it. One preference, two places a task
        // is finished, and it has to mean the same thing in both. Nothing
        // waits on the answer — see `rating` below and
        // components/Tasks/RatePrompt.
        if (ask && prefs.rating_depth !== 'none') {
          setReviews([{ id: String(task.id), name: task.title }]);
        }
        return true;
      } catch (cause) {
        setFailure(
          cause instanceof Error ? cause.message : 'Could not complete that task.',
        );
        reload();
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [username, mutate, reload, data, prefs.rating_depth],
  );

  // ---- Rating a finished task ---------------------------------------------
  /**
   * The tasks still to be asked about. The prompt shows the head of the queue.
   *
   * The same prompt the tasks page raises, from the same component, because a
   * task completed here and one completed there have to ask the same question —
   * two dialogs would become two slightly different questions inside a month.
   *
   * A queue rather than the single task it used to be, for the same reason it
   * is one there: clearing the day can finish a dozen at once, and they have to
   * be asked one after another rather than each replacing the last. A single
   * completion puts exactly one thing in it, which is what it always did.
   */
  const [reviews, setReviews] = useState<{ id: string; name: string }[]>([]);
  const rating = reviews[0] ?? null;

  /** Done with the head, however it was dismissed. */
  const nextReview = useCallback(() => setReviews((queue) => queue.slice(1)), []);

  const saveRating = useCallback(
    (values: { difficulty?: number; execution?: number; reason?: string }) => {
      const target = rating;
      nextReview();
      if (!username || !target) return;
      void taskService.rateTask(target.id, values).then((result) => {
        if (!result.success) return;
        mutate((current) => ({
          ...current,
          tasks: current.tasks.map((entry) =>
            String(entry.id) === target.id ? { ...entry, ...values } : entry,
          ),
        }));
      });
    },
    [mutate, nextReview, rating, username],
  );

  /**
   * Clear today's plate: everything the Today tab holds, in order.
   *
   * `buckets.today` and not "what is due today" — on this card the two are
   * different, and the card's meaning is the one that has to win. Its Today tab
   * is the plate: due today, overdue, and undated, all the things not held to a
   * later day. The button sits directly under those rows, so completing exactly
   * them is the only reading that does not surprise. The tasks page's copy of
   * this button means the narrower thing, because there overdue work is grouped
   * and labelled apart. See components/Tasks/DayComplete.
   *
   * One call per task, like every other completion here — there is no batch
   * endpoint, and ten completions really are ten XP awards with a streak and a
   * level recalculation behind them. The prompts are held back and raised
   * together at the end, and only for the tasks that actually landed.
   */
  const completeDay = useCallback(
    async (review: boolean) => {
      const todo = buckets.today;
      if (todo.length === 0) return;
      setSaving(true);
      const done: { id: string; name: string }[] = [];
      for (const task of todo) {
        if (await complete(task, false)) done.push({ id: String(task.id), name: task.title });
      }
      setSaving(false);
      if (review && prefs.rating_depth !== 'none' && done.length > 0) setReviews(done);
      reload();
    },
    [buckets.today, complete, prefs.rating_depth, reload],
  );

  const addTask = useCallback(
    async (task: NewTask & { timer_duration?: number }) => {
      if (!username) return;
      setSaving(true);
      setFailure(null);
      try {
        const result = await taskService.createTask(task);
        if (!result.success) {
          setFailure(result.message);
          return;
        }
        setAdding(false);
        // The row the backend wrote is the row that was just described to it
        // (backend/api/tasks.py `_create`), so it is put on the list rather
        // than fetched back. `created_at` is the one field the server fills in
        // when the caller leaves it out, and it fills it in with now.
        mutate((current) => ({
          ...current,
          tasks: [
            ...current.tasks,
            {
              id: result.task_id,
              user_id: username,
              title: task.name,
              description: '',
              priority: task.priority ?? 'medium',
              status: 'todo' as const,
              xp_value: Number(task.xp_reward) || 0,
              due_date: task.due_date ?? undefined,
              show_on_calendar: task.show_on_calendar ?? false,
              created_at: task.created_at ?? isoStamp(new Date()),
              ...(task.subject ? { subject: task.subject } : {}),
              ...(task.timer_duration ? { timer_duration: task.timer_duration } : {}),
            },
          ],
        }));
      } catch (cause) {
        setFailure(cause instanceof Error ? cause.message : 'Could not add that task.');
        reload();
      } finally {
        setSaving(false);
      }
    },
    [username, mutate, reload],
  );

  // Every one of these is guarded on there being nothing to show, not on there
  // being something happening. `reload()` after a completion sets `loading`
  // again while keeping the data it already has, and the page used to answer
  // that by throwing itself away and coming back as a spinner — which is what
  // made a completed task read as a page flash rather than as a number going
  // up. Holding the last good data means the cards stay mounted across the
  // re-read, and their figures travel to the new values instead of being
  // rebuilt from zero (hooks/useCountUp.ts). A reload that fails keeps the page
  // and says so in the banner below rather than replacing it.
  /* The arrival cascade. Bound to the data rather than to `loading`, which is
     true again on every re-read — the page arrives once, when it first has
     something to show. See hooks/usePageEntrance. */
  const entering = usePageEntrance(Boolean(data));

  if (loading && !data) return <Loading label="Loading your dashboard" />;
  if (!data) return <ErrorState message={error ?? 'No data came back.'} onRetry={reload} />;

  return (
    <div className={`dash${entering ? ' pg-enter' : ''}`}>
      {/* The same background the landing page has, minus the glow that follows
          the pointer — see components/Ambient.tsx. */}
      <Ambient />

      {/* The greeting slides away with the stat row while a focus session
          runs — see html.focus-mode in styles/dashboard-home.css, which folds
          this card rather than the header inside it. Indigo, and first in the
          rail: the sky you land on when you sign in. */}
      <PageHero variant="dashboard" tone="indigo" className="dash-hero">
        <header className="dash-greeting">
          <div>
            <h1 className="dash-hello">
              {/* The display name if the account has set one, the username if
                  not — the rule public_user applies in backend/tracking/auth.py.
                  This greeted people by their username whatever they had typed
                  into Settings, which made "Display name" a field that stored a
                  value and changed nothing. */}
              {dates.greeting(now)}, {displayName || username}
            </h1>
            {/* "Here is your day." stood here and said nothing — a sentence
                under a greeting, on a page that does not fit one screen. The
                greeting keeps its line; the filler under it does not. */}
          </div>
          <div className="dash-datebar">
            <p className="dash-date">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
              {dates.formatDate(now, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
            {/* The only thing on this page that asks the server again. Adding a
                task and finishing one both render what their own call answered. */}
            <RefreshButton busy={refreshing} onRefresh={reload} />
          </div>
        </header>
      </PageHero>

      {/* Both rows are preferences. A reader who does not want the figures
          gets the task list at the top of the page rather than a gap where
          they were — see Settings, Dashboard. */}
      {prefs.show_stats && (
        <div className="dash-stats pg-stagger">
          <TodayCard day={day} xpLeft={plan.xp} usual={usual} />
          <XpCard stats={data.stats} xpToday={day.xp} dailyGoal={dailyGoal} usual={usual} />
          <FocusCard session={session} usualHours={usualFocus} />
          <StreakCard stats={data.stats} />
        </div>
      )}

      {/* Whichever went wrong last: the write the reader just asked for, or the
          re-read behind it. Both are shown here, over the page they failed to
          change, rather than in place of it. */}
      {(failure ?? error) && <ErrorState message={failure ?? error ?? ''} />}

      {/* The focus panel is a preference too, and hiding it widens the task
          list rather than leaving a hole where it was — see `.is-solo` in
          styles/dashboard-home.css. */}
      {/* What now — the one line on this page that is about the next hour
          rather than about the day so far. Above the task list because that is
          the order the questions arrive in. */}
      <NextUp plan={plan} now={nowHour} />

      <div className={`dash-main${prefs.show_focus ? '' : ' is-solo'}`}>
        <TaskPanel
          buckets={buckets}
          tab={tab}
          onTabChange={setTab}
          busyId={busyId}
          subjects={subjects}
          onComplete={(task) => void complete(task)}
          onAdd={() => setAdding(true)}
          canReview={prefs.rating_depth !== 'none'}
          onCompleteDay={(review) => void completeDay(review)}
          busy={saving}
        />
        {prefs.show_focus && <FocusPanel session={session} pomodoro={pomodoro} />}
      </div>

      {/* Three, not four. Top Priorities used to sit in this row: the same
          tasks as the panel above, re-sorted by priority, one screen lower —
          so on the common day of two or three tasks it was the list again with
          numbers on it. What it did that the list does not is order by
          priority, and that is a control the list should grow rather than a
          card of its own. */}
      {prefs.show_insights && (
        <div className="dash-insights">
          <WeeklyOverview week={week} before={weekAgo.total > 0 ? weekAgo : undefined} />
          <GoalsCard goals={goals} />
          <RecentActivity entries={activity} />
        </div>
      )}

      {/* One line about what to change, under the row that reports. It goes
          last of the page's own content because it is the only thing here the
          reader has not already asked for — everything above answers a
          question they came with. Drawn only when the record has something to
          say; see components/Dashboard/NextMove. */}
      {prefs.show_insights && (
        <NextMove
          tasks={tasks}
          goals={goals}
          todayIso={todayIso}
          doneToday={day.done}
          xpToday={day.xp}
          nameOf={(id) => subjects.get(id)?.label ?? id}
        />
      )}

      {prefs.show_quote && <DailyQuote />}

      {/* Last in the queue of overlays, and deliberately: the other three are
          all reactions to something the reader just did, and this one is the
          page asking for something. It only ever appears on the first load of
          a day, when none of the others can have been triggered yet, but the
          ordering says which would give way if that ever stopped being true. */}
      {catchUp.days && levelled === null && news === null && rating === null && (
        <CatchUp
          days={catchUp.days}
          busy={catchUp.saving}
          failure={catchUp.failure}
          onSubmit={catchUp.submit}
          onClose={catchUp.dismiss}
        />
      )}

      {levelled !== null && <LevelUp level={levelled} onDone={() => setLevelled(null)} />}

      {/* Behind the level-up for the same reason the rating prompt is behind
          both: one completion can set off all three, and a day's goal being
          reached is worth its own beat rather than a card appearing over a
          badge that is still bursting. */}
      {news && levelled === null && (
        <GoalReached
          kind={news.kind}
          target={news.target}
          reached={news.reached}
          onClose={() => setNews(null)}
        />
      )}

      {/* Held behind the level-up, not raced against it. Both are triggered by
          the same completion, and a dialog that lands on top of the
          celebration would cover the one moment the app is allowed to be
          pleased with somebody. `levelled` clears itself when the animation
          finishes, and this appears then. */}
      {rating && levelled === null && news === null && (
        <RatePrompt
          taskName={rating.name}
          depth={prefs.rating_depth}
          onSubmit={saveRating}
          onClose={nextReview}
        />
      )}

      {/* The same two defaults the tasks page's composer opens on. This dialog
          used to start every task at the floor of the XP scale, which made
          "Default XP" a preference one of the app's two Add Task forms had
          never heard of. */}
      <TaskModal
        open={adding}
        busy={saving}
        username={username}
        defaultXp={prefs.default_xp}
        defaultPriority={prefs.default_priority}
        goals={goals}
        onClose={() => setAdding(false)}
        onAdd={(task) => void addTask(task)}
      />
    </div>
  );
}
