/**
 * A to-do tied to a real task: the checkbox completes and reopens the task, the page
 * reads its state on open, and a deleted task turns it back into a plain to-do.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskCheck, makeTask } from './TaskLink';
import { block } from './blocks';

const status = vi.fn();
const complete = vi.fn(async () => ({ success: true }));
const update = vi.fn(async () => ({ success: true }));
const create = vi.fn(async () => ({ success: true, task_id: 'task-9' }));

vi.mock('@/services/tasks', () => ({
  getTaskStatus: (...args: unknown[]) => status(...args),
  completeTask: (...args: unknown[]) => (complete as (...a: unknown[]) => unknown)(...args),
  updateTask: (...args: unknown[]) => (update as (...a: unknown[]) => unknown)(...args),
  createTask: (...args: unknown[]) => (create as (...a: unknown[]) => unknown)(...args),
}));
vi.mock('@/utils/statsBus', () => ({ announceStatsChanged: () => {} }));

beforeEach(() => {
  status.mockReset();
  complete.mockClear();
  update.mockClear();
  create.mockClear();
});

async function settle() {
  await act(async () => { await new Promise((r) => { setTimeout(r, 0); }); });
}

describe('a to-do that is a task', () => {
  it('becomes one from its words', async () => {
    expect(await makeTask(block('todo', '**Read** ch. 1'))).toEqual({ id: 'task-9' });
    expect(create).toHaveBeenCalledWith({ name: 'Read ch. 1', priority: 'medium' });
    expect(await makeTask(block('todo', '  '))).toEqual({ error: 'Write the to-do first.' });
  });

  it('completes the task when ticked, and reopens it when unticked', async () => {
    status.mockResolvedValue({ success: true, completed: false });
    const onPatch = vi.fn();
    const { rerender } = render(<TaskCheck one={block('todo', 'Read', { task: 't1' })} disabled={false} onPatch={onPatch} />);
    await settle();
    await act(async () => { fireEvent.click(screen.getByRole('checkbox')); });
    expect(complete).toHaveBeenCalledWith('t1');
    expect(onPatch).toHaveBeenCalledWith({ checked: true });
    rerender(<TaskCheck one={block('todo', 'Read', { task: 't1', checked: true })} disabled={false} onPatch={onPatch} />);
    await act(async () => { fireEvent.click(screen.getByRole('checkbox')); });
    expect(update).toHaveBeenCalledWith('t1', { completed: false });
  });

  it('shows a task finished elsewhere as ticked', async () => {
    status.mockResolvedValue({ success: true, completed: true });
    const onPatch = vi.fn();
    render(<TaskCheck one={block('todo', 'Read', { task: 't1' })} disabled={false} onPatch={onPatch} />);
    await settle();
    expect(onPatch).toHaveBeenCalledWith({ checked: true });
  });

  it('goes back to a plain to-do when the task is deleted, but not on a hiccup', async () => {
    status.mockResolvedValueOnce({ success: false, message: 'Task not found' });
    const onPatch = vi.fn();
    render(<TaskCheck one={block('todo', 'Read', { task: 'gone' })} disabled={false} onPatch={onPatch} />);
    await settle();
    expect(onPatch).toHaveBeenCalledWith({ task: undefined });

    status.mockResolvedValueOnce({ success: false, message: 'Network request failed' });
    const quiet = vi.fn();
    render(<TaskCheck one={block('todo', 'Read', { task: 't2' })} disabled={false} onPatch={quiet} />);
    await settle();
    expect(quiet).not.toHaveBeenCalled();
  });
});
