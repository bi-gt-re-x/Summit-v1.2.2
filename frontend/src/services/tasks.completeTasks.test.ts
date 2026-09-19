/**
 * Completing many tasks from the client: one request per thousand, each task
 * sent once, and one merged answer however many requests it took.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
vi.mock('./api', () => ({ post: (...args: unknown[]) => post(...args), get: vi.fn(), put: vi.fn(), del: vi.fn() }));

const { completeTasks, MAX_COMPLETE } = await import('./tasks');

function reply(ids: string[], failed: string[] = []) {
  const landed = ids.filter((id) => !failed.includes(id));
  return {
    success: true,
    completed: landed.map((id) => ({ task_id: id, xp_earned: 1, completed_at: 'now' })),
    already_done: [], not_found: [], failed,
    xp_earned: landed.length, new_xp: 0, new_level: 3, new_tasks_completed: 0,
    xp_required: 10, current_streak: 1, best_streak: 1,
  };
}

beforeEach(() => {
  post.mockReset();
  post.mockImplementation((_path: string, body: { task_ids: string[] }) =>
    Promise.resolve(reply(body.task_ids)));
});

const sent = () => post.mock.calls.map((call) => (call[1] as { task_ids: string[] }).task_ids);

describe('completeTasks', () => {
  it('sends sixty tasks as one request', async () => {
    const ids = Array.from({ length: 60 }, (_, at) => `t${at}`);
    const result = await completeTasks(ids);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0]).toBe('/api/complete_tasks');
    expect(result.success && result.completed.length).toBe(60);
  });

  it('sends each task once, in the order first given', async () => {
    await completeTasks(['a', 'b', 'a', 'c', 'b']);
    expect(sent()).toEqual([['a', 'b', 'c']]);
  });

  it('sends nothing for nothing', async () => {
    const result = await completeTasks([]);
    expect(post).not.toHaveBeenCalled();
    expect(result.success && result.completed).toEqual([]);
  });

  it('splits a selection over the limit into requests one after another, and merges them', async () => {
    const ids = Array.from({ length: MAX_COMPLETE + 5 }, (_, at) => `t${at}`);
    const result = await completeTasks(ids);
    expect(sent().map((part) => part.length)).toEqual([MAX_COMPLETE, 5]);
    expect(result.success && result.completed.length).toBe(MAX_COMPLETE + 5);
    expect(result.success && result.xp_earned).toBe(MAX_COMPLETE + 5);
  });

  it('stops at the first chunk the server could not write, and names the rest as failed', async () => {
    const ids = Array.from({ length: MAX_COMPLETE + 5 }, (_, at) => `t${at}`);
    post.mockImplementationOnce((_path: string, body: { task_ids: string[] }) =>
      Promise.resolve(reply(body.task_ids, body.task_ids.slice(900))));
    const result = await completeTasks(ids);
    expect(post).toHaveBeenCalledTimes(1);
    expect(result.success && result.failed.length).toBe(100);
  });

  it('names everything unsent as failed when a later request fails outright', async () => {
    const ids = Array.from({ length: MAX_COMPLETE + 5 }, (_, at) => `t${at}`);
    post
      .mockImplementationOnce((_path: string, body: { task_ids: string[] }) => Promise.resolve(reply(body.task_ids)))
      .mockResolvedValueOnce({ success: false, message: 'Network' });
    const result = await completeTasks(ids);
    expect(result.success && result.completed.length).toBe(MAX_COMPLETE);
    expect(result.success && result.failed).toEqual(ids.slice(MAX_COMPLETE));
  });

  it('passes a failure of the very first request straight back', async () => {
    post.mockResolvedValueOnce({ success: false, message: 'Offline' });
    const result = await completeTasks(['a']);
    expect(result).toEqual({ success: false, message: 'Offline' });
  });
});
