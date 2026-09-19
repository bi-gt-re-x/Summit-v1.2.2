/**
 * The tasks the calendar is allowed to know about, and finishing one from it.
 *
 * ## Only calendar tasks get in
 *
 * This is the calendar's one door onto the account's tasks, and it is shut to
 * everything `show_on_calendar` does not mark. A dashboard to-do is a list
 * item — nobody chose a day or a time for it — so it is not a block, not a
 * card in a day panel, not a line in Upcoming, not a number in a day's tally,
 * not a shade on the month grid, and not a row in the week's priority chart.
 * Filtering here rather than in each of those places is the point: a view
 * cannot forget the rule if it never sees the tasks the rule excludes.
 *
 * Three layers enforce it and they are deliberately redundant, because the
 * failure is silent and the cost is one boolean test:
 *
 *   1. here, so no view holds a to-do at all;
 *   2. `dayTaskBlocks` (utils/calendarGrid), which draws nothing unplaced;
 *   3. `taskCalendarDay` (utils/calendarIntensity), which files a to-do under
 *      no day, so the shading, the month counts and the day panel skip it.
 *
 * `stats` is not filtered and should not be: the level, the XP and the streak
 * are facts about the account, not about the calendar.
 *
 * ## Nothing is re-read behind the reader
 *
 * All three views read the same call the dashboard does, so the streak, the XP
 * and the task list are the same numbers in both places — and completing a
 * task from a grid block goes through the same endpoint as ticking it off on
 * the dashboard, which is what awards the XP, stamps `completed_at`, extends
 * the streak and advances any "complete N tasks" goal. The calendar does not
 * do half of that itself.
 *
 * What it no longer does is ask for the whole account again afterwards. The
 * completion response carries every figure that moved, so the answer is
 * written onto the list already on screen (`patch`) and the grid keeps its
 * scroll, its open menus and its place. `refresh` re-reads, and the Refresh
 * button in each view's header is the only thing that calls it — apart from
 * `recover`, for the case where a write turns out to have failed and what is
 * on screen can no longer be trusted.
 *
 * One in-flight guard per id, so a double click cannot award the XP twice.
 *
 * ## And it asks the same question afterwards
 *
 * Finishing a task raises the rating prompt on the dashboard and on the tasks
 * page, and for a long time it did not here — so the same task, finished from
 * a grid block instead of a list row, went into the record with no difficulty
 * and no execution against it. That is not a missing nicety: the Quality tab
 * is built out of those two numbers, and an account that lives in the calendar
 * was quietly the account analytics could say the least about.
 *
 * The state lives here rather than in each of the three views for the reason
 * the completion does: Day, Week and Month all finish tasks and all three
 * would otherwise grow their own copy, which is three chances for them to
 * drift apart. What each view still does for itself is render the dialog —
 * a hook cannot, and a shared one they all mount is the same component from
 * components/Tasks that the other two pages raise, so there is one question
 * in the app rather than four.
 *
 * `rating_depth` is honoured here exactly as it is there: at 'none' the prompt
 * is never raised at all.
 */
import { useCallback, useMemo, useState } from 'react';
import { useSettings } from './useSettings';
import { useUserData } from './useUserData';
import { tasks as taskService } from '@/services';
import { isCalendarPlaced, isoStamp } from '@/utils/calendarGrid';
import type { RatingDepth } from '@/services/settings';
import type { Task, UserStats } from '@/types';
import { announceStatsChanged } from '@/utils/statsBus';

const NO_STATS: UserStats = {
  level: 1,
  xp: 0,
  tasks_completed: 0,
  current_streak: 0,
  best_streak: 0,
  charge: 0,
};

/** Changing the task list without re-reading it. */
export interface TaskPatch {
  /** Replace the list with the result of this. */
  patch: (update: (tasks: Task[]) => Task[]) => void;
  /** A write failed: re-read, because what is on screen may now be a lie. */
  recover: () => void;
}

export interface UseCalendarTasks extends TaskPatch {
  /** Calendar tasks only. See the note above. */
  tasks: Task[];
  stats: UserStats;
  username: string | null;
  loading: boolean;
  /**
   * An answer has come back at least once. A view guards its error state on
   * this rather than on `error`: once there is a week on screen, a refresh
   * that fails belongs in a banner, not in place of the week.
   */
  hasData: boolean;
  /** A re-read is in flight over a page that already has its data. */
  refreshing: boolean;
  error: string | null;
  /** Re-ask the server. Only the Refresh button and `recover` call this. */
  refresh: () => void;
  /** The id being completed right now, so its block can say so. */
  completing: string | null;
  complete: (taskId: string) => void;

  // ---- The question that follows a completion ------------------------------
  /** The task the prompt is asking about, or null when nothing is asked. */
  rating: { id: string; name: string } | null;
  /** How much to ask, straight from the account's preference. */
  ratingDepth: RatingDepth;
  /** Sends whatever was answered and writes it onto the list on screen. */
  saveRating: (values: { difficulty?: number; execution?: number; reason?: string }) => void;
  /** Dismissal, by any of the dialog's three routes. */
  closeRating: () => void;
}

export function useCalendarTasks(): UseCalendarTasks {
  const { data, error, loading, refreshing, reload, mutate, username } = useUserData();
  const { prefs } = useSettings();
  const [completing, setCompleting] = useState<string | null>(null);
  const [rating, setRating] = useState<{ id: string; name: string } | null>(null);

  const tasks = useMemo(
    () => (data?.tasks ?? []).filter(isCalendarPlaced),
    [data],
  );

  const patch = useCallback(
    (update: (list: Task[]) => Task[]) => {
      mutate((current) => ({ ...current, tasks: update(current.tasks) }));
    },
    [mutate],
  );

  const complete = useCallback(
    (taskId: string) => {
      if (!username || completing) return;
      setCompleting(taskId);
      void taskService
        .completeTask(taskId)
        .then((result) => {
          // A failed completion leaves the task exactly as it was, so nothing
          // is written here — but the page can no longer vouch for what it is
          // showing either, which is what the re-read is for.
          if (!result.success) {
            console.error(`Calendar: completing task ${taskId} failed`, result.message);
            reload();
            return;
          }

          // Everything the backend moved comes back in the response, so the
          // page can say what happened without asking again. The stamps are
          // the ones the backend writes (backend/api/tasks.py) computed the
          // same way, in local time, because that is the shape every date
          // comparison in the calendar is written against.
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
            tasks: current.tasks.map((task) => {
              if (String(task.id) !== String(taskId)) return task;
              const created = task.created_at ? new Date(task.created_at) : null;
              const due = task.due_date ? new Date(task.due_date) : null;
              return {
                ...task,
                status: 'done' as const,
                completed_at: isoStamp(at),
                ...(created && !Number.isNaN(created.getTime())
                  ? {
                      completion_seconds: Math.round(
                        Math.max(0, (at.getTime() - created.getTime()) / 1000),
                      ),
                    }
                  : {}),
                ...(due && !Number.isNaN(due.getTime())
                  ? { met_deadline: at <= due }
                  : {}),
              };
            }),
          }));
          // The rail and the bell re-read once the burst settles; the cached
          // task history is dropped at once. See utils/statsBus.
          announceStatsChanged();

          /* Ask how it went, now that the work is banked. Nothing waits on
             the answer — the XP is already awarded and this dialog can be
             dismissed, ignored or half-filled (components/Tasks/RatePrompt).
             The title is read off the list rather than off the response,
             because the response carries the figures that moved and not the
             task, and a prompt that cannot name what it is asking about is a
             prompt nobody answers. */
          if (prefs.rating_depth !== 'none') {
            const named = (data?.tasks ?? []).find(
              (task) => String(task.id) === String(taskId),
            );
            setRating({ id: String(taskId), name: named?.title ?? 'that task' });
          }
        })
        .catch((cause: unknown) => {
          console.error(`Calendar: completing task ${taskId} failed`, cause);
          reload();
        })
        .finally(() => setCompleting(null));
    },
    [completing, data, mutate, prefs.rating_depth, reload, username],
  );

  /* The ratings are a second call, deliberately: the task is done and its XP
     is banked before this is asked, so a failure here loses an opinion rather
     than the work. Only what was actually clicked is sent, and the answer is
     written onto the list on screen rather than re-read — the same rule the
     completion above follows. */
  const saveRating = useCallback(
    (values: { difficulty?: number; execution?: number; reason?: string }) => {
      const target = rating;
      setRating(null);
      if (!username || !target) return;
      void taskService.rateTask(target.id, values).then((result) => {
        if (!result.success) {
          console.error(`Calendar: rating task ${target.id} failed`, result.message);
          return;
        }
        mutate((current) => ({
          ...current,
          tasks: current.tasks.map((task) =>
            String(task.id) === target.id ? { ...task, ...values } : task,
          ),
        }));
      });
    },
    [mutate, rating, username],
  );

  const closeRating = useCallback(() => setRating(null), []);

  return {
    tasks,
    stats: data?.stats ?? NO_STATS,
    username,
    loading,
    hasData: data !== null,
    refreshing,
    error,
    refresh: reload,
    patch,
    recover: reload,
    completing,
    complete,
    rating,
    ratingDepth: prefs.rating_depth,
    saveRating,
    closeRating,
  };
}
