/**
 * The one request function announces a change to the task list whenever the
 * server marks a response with it (backend/middleware/writes.py), whoever
 * made the request.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushStatsChanged } from '@/utils/statsBus';
import { TASKS_CHANGED_HEADER, get, post } from './api';

function answer(headers: Record<string, string> = {}) {
  return vi.fn(async () => new Response(JSON.stringify({ success: true }), { headers }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  flushStatsChanged();
});

describe('a response that says the tasks changed', () => {
  it('is announced, whatever the call was', async () => {
    vi.stubGlobal('fetch', answer({ [TASKS_CHANGED_HEADER]: '1' }));
    const heard = vi.fn();
    window.addEventListener('summit:tasks-written', heard);
    await post('/api/subject_recommendation/plan', { id: 'r1' });
    window.removeEventListener('summit:tasks-written', heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('is not announced when the header is absent', async () => {
    vi.stubGlobal('fetch', answer());
    const heard = vi.fn();
    window.addEventListener('summit:tasks-written', heard);
    await get('/api/tasks');
    window.removeEventListener('summit:tasks-written', heard);
    expect(heard).not.toHaveBeenCalled();
  });
});
