/**
 * Creating, editing and deleting from the grid.
 *
 * The Week and Day views offer the same four actions on the same two kinds of
 * thing, so the state machine behind their dialogs is written once here and
 * the dialogs themselves are rendered by components/Calendar/BlockDialogs.
 *
 * Where a change lands depends on what it is. An **event** is the browser's:
 * it goes to the localStorage store, and "all occurrences" means every copy of
 * it, because a recurrence is a copy rather than a reference. A **task** is
 * the account's: it is created, edited and deleted through the API, and an
 * edit is a delete-then-create because a task's start time is its `created_at`
 * and that is not a field the edit endpoint will move.
 *
 * Writes are chained rather than fired together. The datastore is a file the
 * backend rewrites per call, so twelve parallel creates is twelve reads of the
 * same starting state and eleven lost tasks.
 *
 * **Nothing here re-reads the account.** A write used to be followed by
 * `reload()`, which put the view back through its loading state and cost the
 * reader their scroll position and their place on the grid every time they
 * renamed, resized, dragged or finished something. The rows the API writes are
 * the rows this file just described to it, so the same change is applied to
 * the list on screen (`patch`) and the page simply shows it. `recover` is the
 * exception and the safety net: if a write comes back a failure, what is on
 * screen can no longer be trusted, so the account is re-read after all.
 */
import { useCallback, useState } from 'react';
import { tasks as taskService } from '@/services';
import { xpToPriority, type TaskDraft } from '@/components/Calendar/TaskModal';
import type { EventDraft, Scope, UseCalendarStore } from './useCalendarStore';
import type { TaskPatch } from './useCalendarTasks';
import { monthKey, type CalendarSection } from '@/utils/calendarStore';
import { columnStamp, isoStamp } from '@/utils/calendarGrid';
import { dates } from '@/utils';
import type { ApiResult, Task } from '@/types';

export type BlockDialog =
  | { type: 'add-event'; iso: string; defaults?: TimeDefaults }
  | { type: 'add-task'; iso: string; defaults?: TimeDefaults }
  | { type: 'edit-event'; iso: string; section: CalendarSection }
  | { type: 'edit-task'; iso: string; task: Task }
  | { type: 'delete-event'; iso: string; section: CalendarSection }
  | { type: 'delete-task'; iso: string; task: Task }
  | null;

export interface TimeDefaults {
  startTime: string;
  endTime: string;
  /** Seeded into the name field. The bar under the grid opens dialogs with it. */
  name?: string;
}

export interface UseBlockActions {
  dialog: BlockDialog;
  open: (dialog: NonNullable<BlockDialog>) => void;
  close: () => void;
  saveEvent: (draft: EventDraft, scope: Scope) => void;
  saveTask: (draft: TaskDraft, scope: Scope) => void;
  removeEvent: (scope: Scope) => void;
  removeTask: (scope: Scope) => void;
  /** How many days this event lands on. */
  eventOccurrences: (section: CalendarSection) => number;
  /** The tasks that repeat with this one, itself included. */
  taskOccurrences: (task: Task) => Task[];
  /**
   * Give a block new times without asking anything — what a drag commits.
   *
   * One occurrence only, and no dialog: the reader has already said what they
   * want by dragging it there, and a confirmation would make moving a block a
   * two-step operation. `fromIso` is the day it was on and `toIso` the day it
   * landed on; they differ when a block was dragged across the week.
   */
  retime: (retime: Retime) => void;
}

export interface Retime {
  fromIso: string;
  toIso: string;
  /** The event entry, for an event. */
  section?: CalendarSection;
  /** The task, for a task. */
  task?: Task;
  /** "HH:MM", 24-hour, for an event. */
  startTime?: string;
  endTime?: string;
  /** The real moments, for a task — which can run past midnight into `toIso+1`. */
  startAt?: Date;
  endAt?: Date;
}

/** "18:40" for the time-of-day part of a stored timestamp. */
function hmOf(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Tasks store no recurrence of their own, so a series is what looks like one:
 * the same name at the same times on different days — exactly how events group.
 */
function identityOf(task: Task): string {
  return `${task.title || ''}|${hmOf(task.created_at)}|${hmOf(task.due_date)}`;
}

/**
 * Every date a repeat lands on, over the twelve months after the base day.
 *
 * **The base day is included only when the pattern would have chosen it**, which
 * is the rule `addEvent` has always followed and this did not: asking for
 * "Mondays" from a Thursday means Mondays, not Mondays and this one Thursday.
 * A task and an event set up from the same slot with the same pattern now
 * produce the same set of days, which they did not before — the task got an
 * extra one on the day the dialog happened to be opened.
 *
 * The rest matches `recurringDateKeys` in utils/calendarStore: from the day
 * after the base, twelve months from the base date, and a day of the month that
 * a short month does not have is skipped rather than rolled into the next one.
 */
function taskDates(baseIso: string, draft: TaskDraft): string[] {
  const base = dates.fromIsoDate(baseIso);
  const onPattern =
    draft.recurrence === 'none' || !draft.recurrenceDays.length
      ? true
      : draft.recurrence === 'weekly'
        ? draft.recurrenceDays.includes(base.getDay())
        : draft.recurrenceDays.includes(base.getDate());

  const out = onPattern ? [baseIso] : [];
  if (draft.recurrence === 'none' || !draft.recurrenceDays.length) return out;

  const end = new Date(base.getFullYear(), base.getMonth() + 12, base.getDate());
  const cursor = new Date(base);
  cursor.setDate(cursor.getDate() + 1);

  while (cursor <= end) {
    const matches =
      draft.recurrence === 'weekly'
        ? draft.recurrenceDays.includes(cursor.getDay())
        : draft.recurrenceDays.includes(cursor.getDate());
    if (matches) out.push(dates.isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/**
 * Run promise-returning steps one after another, stopping at the first that
 * comes back a failure.
 *
 * The envelope is turned into a rejection on purpose: the caller's `.catch` is
 * then the one place a half-applied write is handled, rather than every step
 * having to remember to check.
 */
function inSequence(steps: Array<() => Promise<ApiResult<unknown>>>): Promise<void> {
  return steps.reduce(
    (chain, step) =>
      chain
        .then(() => step())
        .then((result) => {
          if (!result.success) throw new Error(result.message);
        }),
    Promise.resolve(),
  );
}

/**
 * A task row exactly as the backend writes one (backend/api/tasks.py `_create`),
 * so the list on screen holds what a re-read would have returned.
 *
 * The one field that can differ is the subject: the backend drops an id its
 * catalogue does not recognise. Every subject the dialogs offer comes from that
 * catalogue, so this is a discrepancy only a hand-posted value could produce,
 * and the next refresh settles it.
 */
function localTask(
  id: string,
  username: string,
  fields: {
    title: string;
    priority: Task['priority'];
    xp: number;
    createdAt: string;
    dueDate: string;
    subject?: string | null;
  },
): Task {
  return {
    id,
    user_id: username,
    title: fields.title,
    description: '',
    priority: fields.priority,
    status: 'todo',
    xp_value: fields.xp,
    due_date: fields.dueDate,
    show_on_calendar: true,
    created_at: fields.createdAt,
    ...(fields.subject ? { subject: fields.subject } : {}),
  };
}

export function useBlockActions(
  username: string | null,
  store: UseCalendarStore,
  allTasks: Task[],
  { patch, recover }: TaskPatch,
): UseBlockActions {
  const [dialog, setDialog] = useState<BlockDialog>(null);

  const close = useCallback(() => setDialog(null), []);
  const open = useCallback((next: NonNullable<BlockDialog>) => setDialog(next), []);

  const taskOccurrences = useCallback(
    (task: Task) => {
      const identity = identityOf(task);
      return allTasks.filter((other) => identityOf(other) === identity);
    },
    [allTasks],
  );

  const saveEvent = useCallback(
    (draft: EventDraft, scope: Scope) => {
      if (!dialog) return;
      const key = monthKey(dialog.iso);
      if (dialog.type === 'add-event') store.addEvent(key, draft);
      else if (dialog.type === 'edit-event') {
        store.editEvent(key, dialog.section, draft, scope);
      }
      close();
    },
    [close, dialog, store],
  );

  const saveTask = useCallback(
    (draft: TaskDraft, scope: Scope) => {
      if (!dialog || !username) return;
      if (dialog.type !== 'add-task' && dialog.type !== 'edit-task') return;

      const priority = xpToPriority(draft.xp);
      const steps: Array<() => Promise<ApiResult<unknown>>> = [];

      // An edit replaces: the old rows go, and the new ones are written from
      // the pattern — which is what lets a weekly repeat become a monthly one.
      const replacing =
        dialog.type === 'edit-task'
          ? scope === 'all'
            ? taskOccurrences(dialog.task)
            : [dialog.task]
          : [];
      const dropped = new Set(replacing.map((task) => String(task.id)));
      replacing.forEach((task) => {
        steps.push(() => taskService.deleteTaskWithoutTracking(String(task.id)));
      });

      const days =
        dialog.type === 'edit-task' && scope === 'one'
          ? [dialog.iso]
          : taskDates(dialog.iso, draft);

      // Filled in as the creates come back, then applied in one go — so a
      // twelve-month repeat moves the list once instead of twelve times.
      const written: Task[] = [];

      days.forEach((iso, index) => {
        const id = `${Date.now()}-${index}`;
        // Not `${iso}T${time}` — the small hours belong to the column that
        // opened the evening before, so a block drawn 23:00 to 05:00 on the 4th
        // is due at 05:00 on the *5th*. Stamped the flat way, its due date came
        // out eighteen hours before its start, and a task starting at 2 AM was
        // written onto the previous day's column. See `columnStamp`.
        const createdAt = columnStamp(iso, draft.startTime);
        const dueDate = columnStamp(iso, draft.endTime);
        steps.push(() =>
          taskService
            .createTask({
              id,
              name: draft.name,
              priority,
              xp_reward: draft.xp,
              created_at: createdAt,
              due_date: dueDate,
              show_on_calendar: true,
              subject: draft.subject,
              // Absent when the reader left the field alone, which is what
              // hands the task to the matcher. See `GoalField`.
              ...(draft.goalId ? { goal_id: draft.goalId } : {}),
            })
            .then((result) => {
              if (result.success) {
                written.push(
                  localTask(result.task_id || id, username, {
                    title: draft.name,
                    priority,
                    xp: draft.xp,
                    createdAt,
                    dueDate,
                    subject: draft.subject,
                  }),
                );
              }
              return result;
            }),
        );
      });

      void inSequence(steps)
        .then(() =>
          patch((list) => [
            ...list.filter((task) => !dropped.has(String(task.id))),
            ...written,
          ]),
        )
        .catch(recover);
      close();
    },
    [close, dialog, patch, recover, taskOccurrences, username],
  );

  const removeEvent = useCallback(
    (scope: Scope) => {
      if (dialog?.type !== 'delete-event') return;
      store.removeEvent(monthKey(dialog.iso), dialog.section, scope);
      close();
    },
    [close, dialog, store],
  );

  const removeTask = useCallback(
    (scope: Scope) => {
      if (dialog?.type !== 'delete-task' || !username) return;
      const targets = scope === 'all' ? taskOccurrences(dialog.task) : [dialog.task];
      const gone = new Set(targets.map((task) => String(task.id)));
      void inSequence(
        targets.map(
          (task) => () => taskService.deleteTask(String(task.id)),
        ),
      )
        .then(() => patch((list) => list.filter((task) => !gone.has(String(task.id)))))
        .catch(recover);
      close();
    },
    [close, dialog, patch, recover, taskOccurrences, username],
  );

  /**
   * Commit a drag.
   *
   * An event is the browser's, so it is carried across in the store. A task is
   * the account's and its start time is its `created_at`, which the edit
   * endpoint will not move — so, exactly as `saveTask` does, it is deleted
   * (without XP tracking: it was not completed, it was moved) and written back
   * on its new slot.
   */
  const retime = useCallback(
    ({ fromIso, toIso, section, task, startTime, endTime, startAt, endAt }: Retime) => {
      if (section && startTime && endTime) {
        store.retimeSection(monthKey(fromIso), section, monthKey(toIso), startTime, endTime);
        return;
      }
      if (!task || !username || !startAt || !endAt) return;

      const oldId = String(task.id);
      const xp = Number(task.xp_value) || 0;
      const priority = task.priority || xpToPriority(xp);
      const newId = `${Date.now()}-drag`;
      const createdAt = isoStamp(startAt);
      const dueDate = isoStamp(endAt);
      /** One entry once the create lands; empty if it never did. */
      const moved: Task[] = [];

      void inSequence([
        () => taskService.deleteTaskWithoutTracking(oldId),
        () =>
          taskService
            .createTask({
              id: newId,
              name: task.title || '',
              priority,
              xp_reward: xp,
              created_at: createdAt,
              due_date: dueDate,
              show_on_calendar: true,
              // Moving a block rewrites the task, so everything not being moved
              // has to be carried over — a drag that quietly cleared the subject
              // would be a drag that edited the task.
              subject: task.subject ?? null,
            })
            .then((result) => {
              if (result.success) {
                moved.push(
                  localTask(result.task_id || newId, username, {
                    title: task.title || '',
                    priority,
                    xp,
                    createdAt,
                    dueDate,
                    subject: task.subject ?? null,
                  }),
                );
              }
              return result;
            }),
      ])
        .then(() =>
          patch((list) => [
            ...list.filter((entry) => String(entry.id) !== oldId),
            ...moved,
          ]),
        )
        .catch(recover);
    },
    [patch, recover, store, username],
  );

  return {
    dialog,
    open,
    close,
    saveEvent,
    saveTask,
    removeEvent,
    removeTask,
    eventOccurrences: store.occurrenceCount,
    taskOccurrences,
    retime,
  };
}
