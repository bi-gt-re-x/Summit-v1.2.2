/**
 * The one request function announces a change to the task list whenever the
 * server marks a response with it (backend/middleware/writes.py), whoever
 * made the request.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushStatsChanged } from '@/utils/statsBus';
import { onLiveChanged } from '@/utils/liveBus';
import { LIVE_HEADER, TASKS_CHANGED_HEADER, get, post } from './api';

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

describe('a response that says live data moved', () => {
  it('names the sources to the live blocks', async () => {
    vi.stubGlobal('fetch', answer({ [LIVE_HEADER]: 'goal,productivity' }));
    const heard: string[][] = [];
    const off = onLiveChanged((sources) => heard.push(sources));
    await post('/api/complete_task', { task_id: 't1' });
    off();
    expect(heard).toEqual([['goal', 'productivity']]);
  });

  it('says nothing without the header', async () => {
    vi.stubGlobal('fetch', answer());
    const heard = vi.fn();
    const off = onLiveChanged(heard);
    await get('/api/spaces/live/revisions');
    off();
    expect(heard).not.toHaveBeenCalled();
  });
});
