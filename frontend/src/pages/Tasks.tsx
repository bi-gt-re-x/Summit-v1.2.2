/**
 * Tasks — everything you have on, in one place.
 *
 * ## What this page is for, and what it is not
 *
 * The dashboard already lists tasks, and the line between the two is the same
 * line the rest of the app is drawn on: the dashboard answers *what should I do
 * right now*, so its list is short, ordered for today, and hard to get lost in.
 * This answers *what have I got on* — which needs the things the dashboard
 * refuses to grow: a search, filters that stack, a sort the reader chooses, and
 * selection so a dozen tasks can be dealt with at once.
 *
 * The calendar answers *when*, and this page does not try to: there is no grid
 * here and no drag. A due date is a field on a row.
 *
 * ## Where the truth lives
 *
 * The server. Every figure on the page is counted from the task list the
 * account already serves (`/api/get_user_data`), and every write goes through
 * services/tasks.ts — the same calls the dashboard makes, so a task completed
 * here and a task completed there move exactly the same numbers.
 *
 * Writes are applied to what is on screen rather than re-fetched, because the
 * page knows what it just changed; the server is asked again only when the
 * reader presses Refresh, or when a write fails and the page can no longer
 * vouch for what it is showing. That is `useApi`'s contract and the dashboard's
 * rule, kept here so the two pages cannot drift.
 *
 * ## The right-hand column
 *
 * The list answers "what have I got on"; the rail beside it answers "what about
 * right now" — the sitting in progress, the next three things, what is on a
 * run, and a one-line way in. None of it takes the page's filters, because
 * searching for "physics" should not empty the panel telling you what is due at
 * four o'clock.
 *
 * ## What is reconstructed rather than recorded
 *
 * Three things on this page are derived from the task list because nothing
 * records them: the trend line under each stat card (from `created_at` and
 * `completed_at`), a task's time estimate (the median `completion_seconds` of
 * its previously finished namesakes), and the streaks (consecutive completion
 * days per title). Each is honest about the past that still exists in the list
 * and no further — see the notes in components/Tasks/board.ts.
 *
 * ## What is deliberately not here yet
 *
 * Editing a task's date, priority or XP after it is made — the row renames
 * only — and the goal/milestone link. Stars are kept in this browser rather
 * than on the account, because the task record has no field for one.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BulkBar,
  Composer,
  DayComplete,
  EMPTY_QUERY,
  RatePrompt,
  Sidebar,
  StatCards,
  TaskRow,
  Toolbar,
  plannedSeconds,
  groupTasks,
  beyondHorizon,
  bucketOf,
  statSeries,
  streaks,
  taskCounts,
  upcoming,
  type GroupKey,
  type TaskQuery,
} from '@/components/Tasks';
import { ErrorState, Loading, PageHero, RefreshButton } from '@/components';
import { measureOf } from '@/components/Goals';
import { useDocumentTitle, usePageEntrance, useSettings, useSubjects, useUserData } from '@/hooks';
import { goals as goalService, tasks as taskService } from '@/services';
import type { NewTask } from '@/services/tasks';
import type { Goal, Task } from '@/types';
import { isoStamp } from '@/utils/calendarGrid';
import { useConfirm } from '@/components/ui';
import '@/styles/tasks.css';
import { announceStatsChanged } from '@/utils/statsBus';

/**
 * How many rows a heading draws before it asks.
 *
 * The filters decide what belongs on the page; this decides how much of it is
 * built at once, and they are not the same question. Even with the horizon
 * bounding both directions, "Everything dated" over "Everything" is every task
 * the account has ever had — four thousand of them here, five years deep — and
 * a TaskRow is a couple of dozen nodes with a checkbox, badges and three icons
 * in it. Mounting the lot cost seconds, and it cost them again on every click
 * of Filter, Group or Sort, because changing any of those rebuilds the list.
 * The controls were doing exactly what they said; the page was too busy
 * building rows nobody had scrolled to for the result to arrive.
 *
 * So a heading draws a screenful or two and offers the rest. The count beside
 * the heading is still the whole group — what is being withheld is the drawing
 * of the rows, never the fact of them.
 */
const PAGE = 60;

/**
 * Starred task ids, kept in this browser.
 *
 * **Not on the account, because the task record has no field for one.** Adding
 * a column, a migration and an endpoint to remember which rows a reader likes
 * the look of is a bigger change than the feature is worth, and a star that
 * lives in localStorage is honest about what it is: a mark on this machine, for
 * pinning a handful of rows to the top of a long list while you work through
 * it. If it ever needs to follow the account, this hook is the one thing that
 * changes.
 */
function useStars(username: string | null): [Set<string>, (id: string) => void] {
  const key = `tasks:starred:${username ?? 'anon'}`;
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || '[]') as string[];
      setIds(new Set(Array.isArray(raw) ? raw : []));
    } catch {
      setIds(new Set());
    }
  }, [key]);

  const toggle = useCallback(
    (id: string) => {
      setIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          // A browser refusing storage is not a reason to refuse the click.
        }
        return next;
      });
    },
    [key],
  );

  return [ids, toggle];
}

export default function Tasks() {
  useDocumentTitle('Tasks');

  const { data, error, loading, refreshing, reload, mutate, username } = useUserData();
  const subjects = useSubjects(username);
  const { prefs } = useSettings();
  const [confirm, confirmDialog] = useConfirm();

  /* The account's outcome goals, for the link control on each row. Read once
     rather than through useApi: nothing on this page writes a goal, and a
     failed read means the row offers no goals rather than the page failing. */
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

  /** Only outcome goals: a counter goal advances itself and has no work to name. */
  const linkable = useMemo(
    () => goals.filter((goal) => ['number', 'milestones'].includes(measureOf(goal))),
    [goals],
  );

  /**
   * The view this page opens on, from the account's preferences.
   *
   * Four of the controls above the list have a preference behind them
   * (Settings, Tasks) and this is where the two meet. It is what the page
   * starts on and what "Reset the view" goes back to — not what the page stays
   * on: every control still changes the view for this visit, and none of them
   * writes a preference. Somebody narrowing to one subject for a minute has
   * not changed their mind about how the page should open.
   *
   * `EMPTY_QUERY` still supplies the rest — the search, the subject and
   * priority filters, the direction — because those are about one list at one
   * moment and there is nothing to remember.
   */
  const opening = useMemo<TaskQuery>(
    () => ({
      ...EMPTY_QUERY,
      status: prefs.task_status,
      sort: prefs.task_sort,
      horizon: prefs.task_horizon,
    }),
    [prefs.task_horizon, prefs.task_sort, prefs.task_status],
  );

  const [query, setQuery] = useState<TaskQuery>(opening);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState<GroupKey>(prefs.task_group);

  /* The preferences arrive a moment after the page does, so what it opened on
     may have been the built-in defaults rather than the account's. This
     corrects that — and stops the moment the reader touches a control, because
     from then on what is on screen is their answer and not a stale guess. */
  const viewChosen = useRef(false);
  useEffect(() => {
    if (viewChosen.current) return;
    setQuery(opening);
    setGroup(prefs.task_group);
  }, [opening, prefs.task_group]);

  const changeQuery = useCallback((next: TaskQuery) => {
    viewChosen.current = true;
    setQuery(next);
  }, []);

  const [shut, setShut] = useState<Set<string>>(new Set());
  /** Per heading, how many rows it has been asked to draw. See `PAGE`. */
  const [drawn, setDrawn] = useState<Record<string, number>>({});
  const [composing, setComposing] = useState(false);
  const [starred, setStarred] = useStars(username);
  const [pageMenu, setPageMenu] = useState(false);
  const pageMenuRef = useRef<HTMLDivElement>(null);

  // The header's overflow closes the same way every other menu on the page
  // does. Kept here rather than in a shared hook because it is the only one
  // outside components/Tasks/Toolbar.
  useEffect(() => {
    if (!pageMenu) return;
    const away = (event: MouseEvent) => {
      if (pageMenuRef.current && !pageMenuRef.current.contains(event.target as Node)) {
        setPageMenu(false);
      }
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [pageMenu]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const list = useMemo(() => data?.tasks ?? [], [data]);
  const counts = useMemo(() => taskCounts(list), [list]);
  const series = useMemo(() => statSeries(list), [list]);
  const nextUp = useMemo(() => upcoming(list, 3), [list]);
  const beyond = useMemo(() => beyondHorizon(list, query), [list, query]);
  const runs = useMemo(() => streaks(list, 3), [list]);
  const subjectName = useCallback(
    (id: string | undefined) => subjects.find((entry) => entry.id === id)?.label ?? null,
    [subjects],
  );

  // Grouping is the reader's to choose, and it composes with the sort — the
  // one pairing that cannot is date headings under a non-date order, which
  // flattens and says so. See `groupTasks`.
  const groups = useMemo(
    () => groupTasks(list, query, new Date(), group, subjectName),
    [group, list, query, subjectName],
  );
  const showing = useMemo(
    () => groups.reduce((sum, group) => sum + group.tasks.length, 0),
    [groups],
  );

  /**
   * Today's still-open tasks, and how many of them the filters are hiding.
   *
   * Counted off `list` rather than off `groups`, which is the one place on this
   * page that deliberately looks past the reader's filters: "today" is a fact
   * about the account, and a button offering to finish the day has to mean the
   * whole day or it means nothing. What keeps that honest is `dayHidden`, which
   * the dialog prints — see components/Tasks/DayComplete.
   *
   * Overdue work is not today's. It is a real question whether a button called
   * "finish today" should sweep up what was due on Tuesday, and the answer here
   * is no: those tasks are already grouped and labelled apart on this page, and
   * quietly banking XP and a streak for them under a heading that says "today"
   * is the kind of surprise this page is built to avoid.
   */
  const dayTasks = useMemo(
    () => list.filter((task) => task.status !== 'done' && bucketOf(task) === 'today'),
    [list],
  );
  const dayHidden = useMemo(() => {
    if (dayTasks.length === 0) return 0;
    const onPage = new Set<string>();
    groups.forEach((entry) => entry.tasks.forEach((task) => onPage.add(String(task.id))));
    return dayTasks.reduce((sum, task) => sum + (onPage.has(String(task.id)) ? 0 : 1), 0);
  }, [dayTasks, groups]);

  /**
   * The subjects worth a chip, the ones on the current list first.
   *
   * `subject.used` is a lifetime count, and ordering the chips by it put an
   * account's biggest-ever subjects in the row while the two subjects every
   * open task actually carries sat behind "+ More". A filter row is for cutting
   * down what is on screen, so it is ordered by what is on screen — with the
   * lifetime count as the tiebreak, so the tail past the open list is still in
   * a sensible order rather than an arbitrary one.
   */
  const used = useMemo(() => {
    const here = new Map<string, number>();
    list.forEach((task) => {
      if (task.status === 'done' || !task.subject) return;
      here.set(task.subject, (here.get(task.subject) ?? 0) + 1);
    });
    return subjects
      .filter((subject) => subject.used > 0 || here.has(subject.id))
      .sort(
        (a, b) => (here.get(b.id) ?? 0) - (here.get(a.id) ?? 0) || b.used - a.used,
      );
  }, [subjects, list]);

  // ---- Writes -------------------------------------------------------------
  /**
   * Every write is the same four steps: mark the row busy, call, put the
   * change on screen, and on failure say so and re-read. `run` is those steps
   * once rather than five times.
   */
  const run = useCallback(
    async (id: string | null, action: () => Promise<boolean>) => {
      setBusyId(id);
      setFailure(null);
      try {
        const ok = await action();
        if (!ok) reload();
        return ok;
      } catch (cause) {
        setFailure(cause instanceof Error ? cause.message : 'That did not work.');
        reload();
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [reload],
  );

  /**
   * Finish one task.
   *
   * `ask` is how the day button borrows this without the dialog firing on every
   * row: it completes the day one task at a time like everything else, and puts
   * the whole day's prompts up at the end as one queue instead of a dozen that
   * overwrite each other. Every other caller leaves it alone.
   */
  const complete = useCallback(
    (task: Task, ask = true) => {
      if (!username) return Promise.resolve(false);
      return run(task.id, async () => {
        const result = await taskService.completeTask(task.id);
        if (!result.success) {
          setFailure(result.message);
          return false;
        }
        const at = new Date();
        mutate((current) => ({
          ...current,
          stats: {
            ...current.stats,
            xp: (Number(current.stats.xp) || 0) + (Number(result.xp_earned) || 0),
            level: result.new_level,
            tasks_completed: result.new_tasks_completed,
            current_streak: result.current_streak,
            best_streak: result.best_streak,
          },
          tasks: current.tasks.map((entry) =>
            String(entry.id) === String(task.id)
              ? { ...entry, status: 'done' as const, completed_at: isoStamp(at) }
              : entry,
          ),
        }));
        // The rail carries the level and the XP total and never re-reads on its
        // own. This is what moves them.
        announceStatsChanged();
        // Ask, now that the work is banked and nothing depends on the answer —
        // unless the reader has turned the questions off in Settings. How many
        // are asked is that same preference: see components/Tasks/RatePrompt.
        if (ask && prefs.rating_depth !== 'none') {
          setReviews([{ id: String(task.id), name: task.title }]);
        }
        return true;
      });
    },
    [username, mutate, run, prefs.rating_depth],
  );

  /**
   * Finish many tasks as one action: one request, one state update, one
   * signal to the rail.
   *
   * What the bulk bar and "finish the day" use. Each used to call `complete`
   * per task — sixty tasks was sixty requests, sixty `mutate`s re-rendering the
   * whole list, and sixty "stats changed" events each making the rail re-read.
   * Now the server does the sixty completions in one transaction and the page
   * applies the result once.
   *
   * Returns the tasks that were actually finished by this call, which is what
   * the review queue should ask about — not ones that were already done, and
   * not ones the server could not write.
   */
  const completeMany = useCallback(
    async (tasks: readonly Task[]): Promise<Task[]> => {
      const open = tasks.filter((task) => task.status !== 'done');
      if (!username || open.length === 0) return [];
      const result = await taskService.completeTasks(open.map((task) => String(task.id)));
      if (!result.success) {
        setFailure(result.message);
        return [];
      }
      if (result.failed.length > 0) {
        setFailure(
          `${result.failed.length} ${result.failed.length === 1 ? 'task' : 'tasks'} did not save. Try again.`,
        );
      }
      const stamps = new Map(result.completed.map((row) => [String(row.task_id), row.completed_at]));
      if (stamps.size > 0) {
        mutate((current) => ({
          ...current,
          stats: {
            ...current.stats,
            xp: (Number(current.stats.xp) || 0) + (Number(result.xp_earned) || 0),
            level: result.new_level,
            tasks_completed: result.new_tasks_completed,
            current_streak: result.current_streak,
            best_streak: result.best_streak,
          },
          tasks: current.tasks.map((entry) => {
            const at = stamps.get(String(entry.id));
            return at ? { ...entry, status: 'done' as const, completed_at: at } : entry;
          }),
        }));
        announceStatsChanged();
      }
      return open.filter((task) => stamps.has(String(task.id)));
    },
    [username, mutate],
  );

  // ---- Rating a finished task ---------------------------------------------
  /**
   * The tasks still to be asked about. The dialog shows the head of the queue.
   *
   * Filled *after* a completion has landed, so the dialog is never open over a
   * task that failed to complete. Nothing downstream waits on it: the row is
   * already done, the XP is already banked, and every route out of the dialog —
   * Save, Skip, Escape, the backdrop — drops the head and moves on.
   *
   * A queue rather than the single task it used to be, because finishing the
   * day can produce a dozen of these at once and they have to be asked one
   * after another rather than each replacing the last. A single completion puts
   * exactly one thing in it, which is what it always did.
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
        // Onto the local copy, so a re-render of the row shows what was said
        // without a round trip for the whole list.
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
   * Re-open a finished task.
   *
   * Deliberately not the inverse of completing: `completeTask` awards XP,
   * extends the streak and counts toward goals, and none of that is given back
   * here. The backend owns that decision — this only asks for the status.
   */
  const reopen = useCallback(
    (task: Task) => {
      if (!username) return;
      void run(task.id, async () => {
        const result = await taskService.updateTask(task.id, { completed: false });
        if (!result.success) {
          setFailure(result.message);
          return false;
        }
        mutate((current) => ({
          ...current,
          tasks: current.tasks.map((entry) =>
            String(entry.id) === String(task.id)
              ? { ...entry, status: 'todo' as const, completed_at: undefined }
              : entry,
          ),
        }));
        return true;
      });
    },
    [username, mutate, run],
  );

  const rename = useCallback(
    (task: Task, title: string) => {
      if (!username) return;
      void run(task.id, async () => {
        const result = await taskService.updateTask(task.id, { name: title });
        if (!result.success) {
          setFailure(result.message);
          return false;
        }
        mutate((current) => ({
          ...current,
          tasks: current.tasks.map((entry) =>
            String(entry.id) === String(task.id) ? { ...entry, title } : entry,
          ),
        }));
        return true;
      });
    },
    [username, mutate, run],
  );

  /* Linking a task to a goal after the fact. `null` unlinks. The milestone is
     cleared alongside it: a checkpoint only means anything against its own
     goal, and the backend would drop a mismatched one anyway. */
  const link = useCallback(
    (task: Task, goalId: string | null) => {
      if (!username) return;
      void run(task.id, async () => {
        const result = await taskService.updateTask(task.id, {
          goal_id: goalId,
          milestone_id: null,
        });
        if (!result.success) {
          setFailure(result.message);
          return false;
        }
        mutate((current) => ({
          ...current,
          tasks: current.tasks.map((entry) =>
            String(entry.id) === String(task.id)
              ? { ...entry, goal_id: goalId ?? undefined, milestone_id: undefined }
              : entry,
          ),
        }));
        return true;
      });
    },
    [mutate, run, username],
  );

  const drop = useCallback(
    async (task: Task, ask = true) => {
      if (!username) return;
      // The confirmation is a preference; off means the click is the decision.
      // `ask` is how the bulk bar opts out of it: twelve selected rows used to
      // mean twelve separate confirm dialogs, one per task, which is not asking
      // a question — it is charging for the answer. It asks once, up there,
      // for all of them.
      if (
        ask
        && prefs.confirm_delete
        && !(await confirm({ title: `Delete “${task.title}”?`, confirmLabel: 'Delete', danger: true }))
      ) {
        return;
      }
      void run(task.id, async () => {
        const result = await taskService.deleteTask(task.id);
        if (!result.success) {
          setFailure(result.message);
          return false;
        }
        mutate((current) => ({
          ...current,
          tasks: current.tasks.filter((entry) => String(entry.id) !== String(task.id)),
        }));
        setPicked((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
        return true;
      });
    },
    [username, mutate, run, prefs.confirm_delete, confirm],
  );

  const add = useCallback(
    (draft: NewTask) => {
      if (!username) return;
      setSaving(true);
      setFailure(null);
      void (async () => {
        try {
          // `show_on_calendar` is stated rather than left out. The backend's
          // default for it is `True` (backend/api/tasks.py), so a draft that
          // stayed quiet — which is every draft this page makes, from the
          // composer and from Quick Add alike — landed on the calendar as a
          // block running from the moment it was typed to whenever it was due.
          // Type "History essay", due Friday, and a four-day bar appeared
          // across a grid the reader keeps for things they actually scheduled.
          // pages/Dashboard.tsx found the same hole and states the same field;
          // tasks reach the calendar by being made on it.
          //
          // The optimistic row below has always said `false`, so until the
          // next reload the page also disagreed with what it had just stored.
          const result = await taskService.createTask({
            show_on_calendar: false,
            ...draft,
          });
          if (!result.success) {
            setFailure(result.message);
            return;
          }
          // The row the backend wrote is the row just described to it, so it is
          // put on the list rather than fetched back. See the same note in
          // pages/Dashboard.tsx.
          mutate((current) => ({
            ...current,
            tasks: [
              ...current.tasks,
              {
                id: result.task_id,
                user_id: username,
                title: draft.name,
                description: '',
                priority: draft.priority ?? 'medium',
                status: 'todo' as const,
                xp_value: Number(draft.xp_reward) || 0,
                due_date: draft.due_date ?? undefined,
                show_on_calendar: draft.show_on_calendar ?? false,
                created_at: isoStamp(new Date()),
                ...(draft.subject ? { subject: draft.subject } : {}),
              },
            ],
          }));
        } catch (cause) {
          setFailure(cause instanceof Error ? cause.message : 'Could not add that task.');
          reload();
        } finally {
          setSaving(false);
        }
      })();
    },
    [username, mutate, reload],
  );

  // ---- Selection ----------------------------------------------------------
  const select = useCallback((task: Task, on: boolean) => {
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(task.id);
      else next.delete(task.id);
      return next;
    });
  }, []);

  /**
   * The selection, cut down to what the filters actually left on the page.
   *
   * `picked` outlives the list it was made from — tick two rows, then search,
   * change the subject chip, or pull the horizon back to the week, and those
   * rows leave the page while their ids stay in the set. Read raw, that gave a
   * bar reading "2 selected" over a list showing neither of them, and a Delete
   * button that reached past the filter and removed two tasks the reader could
   * not see. An irreversible action has to be about what is on screen.
   *
   * Intersected rather than pruned, so the filter is a lens and not a
   * guillotine: clearing the search brings the rows back still ticked, which is
   * what someone who narrowed the list to find a third one expects. Collapsing
   * a section does not hide a row for this purpose — the heading is still
   * there, still counting them, and folding it away is not deselection.
   */
  const chosen = useMemo(() => {
    if (picked.size === 0) return [];
    const onPage = new Set<string>();
    groups.forEach((entry) => entry.tasks.forEach((task) => onPage.add(String(task.id))));
    return list.filter((task) => picked.has(task.id) && onPage.has(String(task.id)));
  }, [groups, list, picked]);

  /**
   * A bulk action is the single action, repeated in order.
   *
   * Only deleting still goes this way. Completing has its own batch endpoint
   * and goes through `completeMany`, as one request. Serial rather than
   * parallel: every action moves the same account.
   */
  const bulk = useCallback(
    async (action: (task: Task) => Promise<unknown>) => {
      setSaving(true);
      for (const task of chosen) {
        await action(task);
      }
      // Only what was acted on lets go of its tick. A selection sitting behind
      // the current filter was not part of this action and clearing it here
      // would be the same reach past the filter, in the other direction.
      setPicked((current) => {
        const next = new Set(current);
        chosen.forEach((task) => next.delete(task.id));
        return next;
      });
      setSaving(false);
      // One re-read at the end rather than one per task: the page has applied
      // every change already, and this is the cheap way to be sure.
      reload();
    },
    [chosen, reload],
  );

  /**
   * The bulk bar's Complete: the picked tasks as one batch, then the same
   * ticks-off and re-read `bulk` does.
   *
   * One review prompt, not one per task. Each per-task completion used to
   * raise its own and each replaced the last, so a reader finishing twenty
   * rows was asked once; queueing all twenty would turn a bulk action into
   * twenty dialogs. "Finish the day" is where asking about every task is the
   * point, and it does.
   */
  const completePicked = useCallback(async () => {
    setSaving(true);
    const done = await completeMany(chosen);
    setPicked((current) => {
      const next = new Set(current);
      chosen.forEach((task) => next.delete(task.id));
      return next;
    });
    setSaving(false);
    const first = done[0];
    if (first && prefs.rating_depth !== 'none') {
      setReviews([{ id: String(first.id), name: first.title }]);
    }
    reload();
  }, [chosen, completeMany, prefs.rating_depth, reload]);

  /**
   * Finish the day: every task due today, in order, then the reviews.
   *
   * One batch — see `completeMany` — then the prompts raised together at the
   * end, so the reader confirms once, watches the list empty, and is then
   * asked about the tasks that actually landed. A task whose completion failed
   * is not in the queue: there is nothing to rate about work the server did
   * not record.
   *
   * `reload` at the end for the same reason `bulk` does it — the page has
   * applied every change already and this is the cheap way to be sure.
   */
  const completeDay = useCallback(
    async (review: boolean) => {
      const todo = dayTasks;
      if (todo.length === 0) return;
      setSaving(true);
      const done = (await completeMany(todo)).map((task) => ({ id: String(task.id), name: task.title }));
      setSaving(false);
      if (review && prefs.rating_depth !== 'none' && done.length > 0) setReviews(done);
      reload();
    },
    [completeMany, dayTasks, prefs.rating_depth, reload],
  );

  const toggleGroup = useCallback((key: string) => {
    setShut((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // A heading expanded to a thousand rows must not carry that expansion onto
  // whatever the next query puts under the same key — "done" and "all" are
  // reused across groupings, and inheriting a large draw count is how the
  // freeze `PAGE` exists to prevent would come back through the side door.
  useEffect(() => {
    setDrawn({});
  }, [query, group]);

  /**
   * `?task=<id>` — a row somebody was sent to, from the top bar's search.
   *
   * Getting them to the page is the easy half. The row may be inside a heading
   * they collapsed, past the sixty a heading draws, or filtered out of the
   * board entirely by the status and horizon this page opened on — and a
   * search that lands on a screen where the thing it found is not visible has
   * not answered anything.
   *
   * So this opens the heading, raises that heading's draw count past the row,
   * and — only when the task is genuinely not on the board — widens the query
   * enough for it to be. The widening is deliberately the last resort and
   * deliberately total (`status: 'all'`, `horizon: 'all'`): a half-widened
   * board is one where the reader cannot tell why they are looking at what
   * they are looking at.
   *
   * `marked` is what the row is painted with once it is found. It clears on a
   * timer rather than on a click, because the reader has already done the
   * clicking; what they need is a second of "there it is".
   */
  const [params, setParams] = useSearchParams();
  const wanted = params.get('task');
  const [marked, setMarked] = useState<string | null>(null);

  useEffect(() => {
    if (!wanted) {
      setMarked(null);
      return;
    }
    // Not this account's, or not loaded yet. Nothing to reveal either way.
    if (!list.some((task) => task.id === wanted)) return;

    const holding = groups.find((entry) =>
      entry.tasks.some((task) => task.id === wanted),
    );

    if (!holding) {
      // Filtered off the board. The only fix that always works is to stop
      // filtering; see the note above on why it is all or nothing.
      viewChosen.current = true;
      setQuery((current) =>
        current.status === 'all' && current.horizon === 'all'
          ? current
          : { ...EMPTY_QUERY, sort: current.sort, status: 'all', horizon: 'all' },
      );
      return;
    }

    setShut((current) => {
      if (!current.has(holding.key)) return current;
      const next = new Set(current);
      next.delete(holding.key);
      return next;
    });

    const index = holding.tasks.findIndex((task) => task.id === wanted);
    setDrawn((current) => {
      const cap = current[holding.key] ?? PAGE;
      return index < cap ? current : { ...current, [holding.key]: index + 1 };
    });

    setMarked(wanted);
  }, [wanted, list, groups]);

  /* Scroll to it once it is actually rendered, and drop the mark a moment
     later. The frame matters: the effect above may have just opened a heading,
     and the row does not exist until that render has happened.

     `behavior: 'auto'` — an instant jump — rather than a smooth one, and that
     is not a style preference. A smooth scroll is silently a no-op in some
     engines (it is one in the browser this was tested in), which turns "we
     took you to the row" into "we took you to the page and the row is
     somewhere below" with nothing to show for it. The ring the row is painted
     with is what draws the eye; the scroll only has to land. */
  useEffect(() => {
    if (!marked) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-task="${CSS.escape(marked)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
    const timer = window.setTimeout(() => {
      setMarked(null);
      /* The parameter goes with the highlight. Left in the URL it would
         re-reveal the row on every reload, and would still be there long after
         the search that put it there was closed. Replaced, so it does not
         become a history entry of its own. */
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('task');
          return next;
        },
        { replace: true },
      );
    }, 2200);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [marked, setParams]);

  const drawMore = useCallback((key: string, from: number) => {
    setDrawn((current) => ({ ...current, [key]: from + PAGE }));
  }, []);

  /**
   * Changing what the headings are opens all of them again.
   *
   * `shut` holds group keys, and the keys are not unique across groupings —
   * "done" is a due-date bucket and a status group, "all" is every flat list.
   * Collapsing Completed under date headings and then switching to status
   * headings brought the collapse along with it, so a heading the reader had
   * never touched arrived shut. New headings are new sections; they open.
   */
  const chooseGroup = useCallback((key: GroupKey) => {
    viewChosen.current = true;
    setGroup(key);
    setShut(new Set());
  }, []);

  /** Back to the view the account opens on, not to the app's built-in one. */
  const resetView = useCallback(() => {
    viewChosen.current = false;
    setQuery(opening);
    setGroup(prefs.task_group);
    setShut(new Set());
  }, [opening, prefs.task_group]);

  /** Quick Add's three fields, through the same create the full form uses.
   *  The XP is the account's default rather than a number picked here: this
   *  form does not ask for one, and 25 was a third answer to a question the
   *  composer and both task dialogs already agreed on. */
  const quickAdd = useCallback(
    (name: string, due: string | null, priority: 'high' | 'medium' | 'low') => {
      add({ name, priority, due_date: due, xp_reward: prefs.default_xp });
    },
    [add, prefs.default_xp],
  );

  // ---- The shell ----------------------------------------------------------
  /* The arrival cascade. Bound to the read rather than to mount, so it
     starts when there is something to animate — see hooks/usePageEntrance. */
  const entering = usePageEntrance(!loading);

  if (loading) return <Loading label="Reading your tasks" />;
  if (!data) {
    return <ErrorState message={error ?? 'No tasks yet.'} onRetry={username ? reload : undefined} />;
  }

  return (
    <div className="tk-page">
      <div className={`tk-shell page-shell${entering ? ' pg-enter' : ''}`}>
        {/* Teal: the rail puts Analytics above Tasks and Goals below it, and the
            tone is the one thing that says which of the three is open before
            the title has been read. See components/Hero.tsx. */}
        <PageHero variant="tasks" tone="teal">
          <header className="tk-head">
            <div className="tk-head-title">
              <h1>
                <span className="tk-head-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3 8-8" />
                    <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
                  </svg>
                </span>
                Tasks
              </h1>
              <p className="tk-quiet">What is on your plate.</p>
            </div>
            <div className="tk-head-tools">
              <button
                type="button"
                className="tk-new"
                aria-expanded={composing}
                onClick={() => setComposing(!composing)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New Task
                <i className={`tk-new-caret${composing ? ' is-open' : ''}`} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </i>
              </button>
              {/* The overflow: the things that act on the page rather than on a
                  task, which is why they are not in the toolbar with the filters. */}
              <div className="tk-row-menu" ref={pageMenuRef}>
                <button
                  type="button"
                  className="tk-more is-page"
                  aria-label="More for this page"
                  aria-expanded={pageMenu}
                  onClick={() => setPageMenu(!pageMenu)}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="1.7" />
                    <circle cx="12" cy="12" r="1.7" />
                    <circle cx="19" cy="12" r="1.7" />
                  </svg>
                </button>
                {pageMenu && (
                  <div className="tk-menu-panel is-row">
                    <button
                      type="button"
                      className="tk-menu-item"
                      onClick={() => { setPageMenu(false); changeQuery({ ...query, status: query.status === 'all' ? 'open' : 'all' }); }}
                    >
                      {query.status === 'all' ? 'Hide completed' : 'Show completed'}
                    </button>
                    <button
                      type="button"
                      className="tk-menu-item"
                      onClick={() => { setPageMenu(false); setShut(shut.size > 0 ? new Set() : new Set(groups.map((group) => group.key))); }}
                    >
                      {shut.size > 0 ? 'Expand all' : 'Collapse all'}
                    </button>
                    <button
                      type="button"
                      className="tk-menu-item"
                      onClick={() => { setPageMenu(false); resetView(); }}
                    >
                      Reset the view
                    </button>
                    <button
                      type="button"
                      className="tk-menu-item"
                      onClick={() => { setPageMenu(false); reload(); }}
                    >
                      Refresh
                    </button>
                  </div>
                )}
              </div>
              <RefreshButton busy={refreshing} onRefresh={reload} />
            </div>
          </header>
        </PageHero>

        {(failure || error) && (
          <p className="tk-failure" role="alert">
            {failure ?? error}
          </p>
        )}

        <div className="tk-body">
          <div className="tk-main">
            <StatCards counts={counts} series={series} />

            {composing && (
              <Composer
                subjects={subjects}
                goals={linkable}
                busy={saving}
                onAdd={add}
                defaultXp={prefs.default_xp}
                defaultPriority={prefs.default_priority}
              />
            )}

            <Toolbar
              query={query}
              onQuery={changeQuery}
              subjects={used}
              showing={showing}
              total={list.length}
              group={group}
              onGroup={chooseGroup}
            />

            <BulkBar
              count={chosen.length}
              busy={saving}
              onComplete={() => void completePicked()}
              onDelete={async () => {
                if (
                  prefs.confirm_delete
                  && !(await confirm({
                    title:
                      chosen.length === 1
                        ? `Delete “${chosen[0]?.title}”?`
                        : `Delete ${chosen.length} tasks?`,
                    confirmLabel: 'Delete',
                    danger: true,
                  }))
                ) {
                  return;
                }
                void bulk((task) => Promise.resolve(drop(task, false)));
              }}
              onClear={() => setPicked(new Set())}
            />

            {/* Above the list rather than under it: it is the offer you want
                before you start working down the day, not after you already
                have. It sits below the bulk bar so the two actions that change
                many rows at once are together, and above the first heading so
                it is never mistaken for belonging to one. */}
            <DayComplete
              tasks={dayTasks}
              hidden={dayHidden}
              busy={saving}
              canReview={prefs.rating_depth !== 'none'}
              onConfirm={(review) => void completeDay(review)}
            />

            {groups.length === 0 ? (
              <p className="tk-empty">
                {list.length === 0
                  ? 'Nothing here yet. Quick Add is the fastest way to change that.'
                  : 'No task matches. Clear the filters to see the rest.'}
              </p>
            ) : (
              groups.map((group) => {
                const closed = shut.has(group.key);
                const cap = drawn[group.key] ?? PAGE;
                const rest = group.tasks.length - cap;
                return (
                  <section className={`tk-group is-${group.key}`} key={group.key}>
                    <header className="tk-group-head">
                      <button
                        type="button"
                        className="tk-group-toggle"
                        aria-expanded={!closed}
                        onClick={() => toggleGroup(group.key)}
                      >
                        <h2>
                          {group.label}
                          <span className="tk-group-count">{group.tasks.length}</span>
                        </h2>
                        <i className={`tk-group-caret${closed ? ' is-shut' : ''}`} aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </i>
                      </button>
                      <p className="tk-quiet">{group.hint}</p>
                    </header>
                    {!closed && (
                      <ul className="tk-list">
                        {group.tasks.slice(0, cap).map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            marked={task.id === marked}
                            subject={subjectName(task.subject)}
                            goals={linkable}
                            onLink={link}
                            estimate={plannedSeconds(task)}
                            selected={picked.has(task.id)}
                            starred={starred.has(task.id)}
                            busy={busyId === task.id || saving}
                            onSelect={select}
                            onComplete={(entry) => void complete(entry)}
                            onReopen={reopen}
                            onRename={rename}
                            onDelete={drop}
                            onStar={(entry) => setStarred(entry.id)}
                          />
                        ))}
                      </ul>
                    )}
                    {!closed && rest > 0 && (
                      <button
                        type="button"
                        className="tk-more-rows"
                        onClick={() => drawMore(group.key, cap)}
                      >
                        Show {Math.min(rest, PAGE).toLocaleString()} more
                        <span> of {rest.toLocaleString()} left in {group.label}</span>
                      </button>
                    )}
                  </section>
                );
              })
            )}

            {/* The horizon, stated where the list stops rather than only in
                the menu that set it — a list that quietly ends seven days out
                is a list a reader assumes is all of it. */}
            {query.horizon === 'week' && beyond > 0 && (
              <p className="tk-horizon">
                {beyond.toLocaleString()} more outside this week.{' '}
                <button type="button" onClick={() => changeQuery({ ...query, horizon: 'all' })}>
                  Show everything
                </button>
              </p>
            )}
          </div>

          <Sidebar
            username={username}
            upcoming={nextUp}
            streaks={runs}
            busy={saving}
            defaultPriority={prefs.default_priority}
            subjectName={subjectName}
            onAdd={quickAdd}
            onOpenFull={() => setComposing(true)}
            onShowUpcoming={() => {
              changeQuery({ ...EMPTY_QUERY, sort: 'due' });
              chooseGroup('due');
            }}
            onShowStreaks={() =>
              changeQuery({ ...EMPTY_QUERY, status: 'done', sort: 'created', descending: true })
            }
          />
        </div>
      </div>

      {/* Over everything, after the completion has landed. See `rating`. */}
      {rating && (
        <RatePrompt
          taskName={rating.name}
          depth={prefs.rating_depth}
          onSubmit={saveRating}
          onClose={nextReview}
        />
      )}
      {confirmDialog}
    </div>
  );
}
