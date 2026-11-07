/**
 * A to-do on a page that's also a real task.
 *
 * "Add to my tasks" (the block's menu) makes the to-do a task on the Tasks page and
 * keeps its id on the block. From then on the checkbox is the task's: ticking it
 * completes the task (XP, streak and all), unticking reopens it, and when the page
 * opens it reads the task's state, so a task finished on the Tasks page shows ticked
 * here too. A task deleted elsewhere quietly turns the to-do back into a plain one.
 */
import { useEffect, useState } from 'react';
import { completeTask, createTask, getTaskStatus, updateTask } from '@/services/tasks';
import { announceStatsChanged } from '@/utils/statsBus';
import { plainOf } from './inline';
import type { Block } from './blocks';

/** Make the to-do a task. Returns the task's id, or an error to show. */
export async function makeTask(one: Block): Promise<{ id?: string; error?: string }> {
  const name = plainOf(one.text).trim();
  if (!name) return { error: 'Write the to-do first.' };
  const result = await createTask({ name: name.slice(0, 200), priority: 'medium' });
  if (!result.success) return { error: result.message || "Couldn't add it to your tasks." };
  announceStatsChanged();
  return { id: result.task_id };
}

export function TaskCheck({
  one,
  disabled,
  onPatch,
}: {
  one: Block;
  disabled: boolean;
  onPatch: (change: Partial<Block>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const task = one.task ?? '';

  useEffect(() => {
    if (!task) return;
    let live = true;
    void getTaskStatus(task).then((result) => {
      if (!live) return;
      if (!result.success) {
        // Gone from the Tasks page: a plain to-do again. Anything else is a hiccup.
        if (/not found/i.test(result.message ?? '')) onPatch({ task: undefined });
        return;
      }
      if (result.completed !== Boolean(one.checked)) onPatch({ checked: result.completed });
    });
    return () => {
      live = false;
    };
    // Only when the link changes: re-reading on every tick would fight the reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  const toggle = async (checked: boolean) => {
    setBusy(true);
    setError('');
    const result = checked ? await completeTask(task) : await updateTask(task, { completed: false });
    setBusy(false);
    if (!result.success) {
      setError(result.message || "Couldn't update the task.");
      return;
    }
    onPatch({ checked });
    announceStatsChanged();
  };

  return (
    <span className="sp-task-check">
      <input
        type="checkbox"
        className="sp-check"
        aria-label={`Done: ${plainOf(one.text) || 'task'}`}
        checked={Boolean(one.checked)}
        disabled={disabled || busy}
        onChange={(event) => void toggle(event.target.checked)}
      />
      <span className="sp-task-chip" title={error || 'This to-do is a task on your Tasks page. Ticking it here completes it there.'}>
        {error ? '!' : 'Task'}
      </span>
    </span>
  );
}
