/**
 * Whichever dialog the grid has asked for.
 *
 * One component so the Week and Day views cannot drift apart in what an edit
 * or a delete looks like: they hand it the same state object from
 * `useBlockActions` and it decides which of the four dialogs that is.
 */
import { DeleteConfirm } from './Prompts';
import { EventModal } from './EventModal';
import { TaskModal } from './TaskModal';
import { patternOf, type UseBlockActions } from '@/hooks/useBlockActions';

export interface BlockDialogsProps {
  actions: UseBlockActions;
  /** Whose subject list the task dialog offers. */
  username?: string | null;
  /** The week grid opens its dialogs at double width. */
  wide?: boolean;
  /** The Day view acts on one task at a time and never offers a repeat. */
  allowTaskRecurrence?: boolean;
}

/** "18:40" for the time-of-day part of a task's timestamp. */
function hmOf(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function BlockDialogs({
  actions,
  username,
  wide,
  allowTaskRecurrence = true,
}: BlockDialogsProps) {
  const { dialog, close, saveEvent, saveTask, removeEvent, removeTask } = actions;
  if (!dialog) return null;

  switch (dialog.type) {
    case 'add-event':
      return (
        <EventModal
          defaults={dialog.defaults}
          onSave={saveEvent}
          onClose={close}
          wide={wide}
        />
      );

    case 'edit-event':
      return (
        <EventModal
          initial={{
            name: dialog.section.task,
            startTime: dialog.section.startTime,
            endTime: dialog.section.endTime,
          }}
          recurring={actions.eventOccurrences(dialog.section) > 1}
          onSave={saveEvent}
          onClose={close}
          wide={wide}
        />
      );

    case 'add-task':
      return (
        <TaskModal
          username={username}
          defaults={dialog.defaults}
          allowRecurrence={allowTaskRecurrence}
          onSave={saveTask}
          onClose={close}
          wide={wide}
        />
      );

    case 'edit-task':
      return (
        <TaskModal
          username={username}
          initial={{
            name: dialog.task.title || '',
            startTime: hmOf(dialog.task.created_at),
            endTime: hmOf(dialog.task.due_date),
            xp: Number(dialog.task.xp_value) || 0,
            subject: dialog.task.subject ?? null,
          }}
          recurring={allowTaskRecurrence && actions.taskOccurrences(dialog.task).length > 1}
          pattern={patternOf(
            actions.taskOccurrences(dialog.task).map((task) => String(task.created_at || '').slice(0, 10)),
          )}
          allowRecurrence={allowTaskRecurrence}
          onSave={saveTask}
          onClose={close}
          wide={wide}
        />
      );

    case 'delete-event':
      return (
        <DeleteConfirm
          kind="event"
          name={dialog.section.task}
          occurrences={actions.eventOccurrences(dialog.section)}
          onConfirm={removeEvent}
          onCancel={close}
        />
      );

    case 'delete-task':
      return (
        <DeleteConfirm
          kind="task"
          name={dialog.task.title || 'this task'}
          occurrences={
            allowTaskRecurrence ? actions.taskOccurrences(dialog.task).length : 1
          }
          onConfirm={removeTask}
          onCancel={close}
        />
      );

    default:
      return null;
  }
}
