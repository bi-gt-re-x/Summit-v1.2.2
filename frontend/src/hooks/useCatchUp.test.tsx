/**
 * When the dashboard asks about the days it did not see, and when it stays
 * quiet.
 *
 * Almost all of this hook's behaviour is *not* asking, which is the half with
 * no visible symptom: a prompt that appears one time too many looks the same
 * as a prompt that is working until it is the reader's second load of the day,
 * or their first day on the app, or a day they spent two hours timing.
 *
 * Every path also stamps `catchup_seen_on`, and that is checked as carefully
 * as the asking is. A path that forgets to stamp is a prompt that comes back
 * on the next page load, which is how a question becomes something people
 * click past without reading.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCatchUp } from './useCatchUp';
import { SettingsContext } from '@/context/contexts';
import { settingsValue } from '@/test/render';
import type { ReactNode } from 'react';
import type { Prefs } from '@/services/settings';

vi.mock('@/services', () => ({
  focus: { history: vi.fn(), logDay: vi.fn() },
}));

const { focus: focusService } = await import('@/services');
const history = vi.mocked(focusService.history);
const logDay = vi.mocked(focusService.logDay);

/** Frozen, because "which days" is entirely a function of what today is. */
const TODAY = new Date('2026-08-29T10:00:00');

function mount(prefs: Partial<Prefs>, username: string | null = 'myles', onSaved?: () => void) {
  const update = vi.fn(async () => null);
  function Providers({ children }: { children: ReactNode }) {
    return (
      <SettingsContext.Provider value={settingsValue({ prefs, update })}>
        {children}
      </SettingsContext.Provider>
    );
  }
  const view = renderHook(() => useCatchUp(username, onSaved), { wrapper: Providers });
  return { ...view, update };
}

/** A history reply with nothing recorded in it. */
function noHistory() {
  history.mockResolvedValue({ success: true, days: {} });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TODAY);
  noHistory();
  logDay.mockResolvedValue({ success: true, focus: { seconds: 3600, goal_hours: 2 } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the catch-up prompt', () => {
  it('asks about the days since the last visit', async () => {
    const { result } = mount({ catchup_seen_on: '2026-08-27' });
    await waitFor(() => expect(result.current.days).not.toBeNull());
    expect(result.current.days!.map((day) => day.iso)).toEqual(['2026-08-28', '2026-08-27']);
  });

  it('records the day and asks nothing on an account it has never met', async () => {
    const { result, update } = mount({ catchup_seen_on: '' });
    await waitFor(() => expect(update).toHaveBeenCalledWith({ catchup_seen_on: '2026-08-29' }));
    expect(result.current.days).toBeNull();
    // And it does not go looking, either: there is no gap to look into.
    expect(history).not.toHaveBeenCalled();
  });

  it('says nothing at all when the account has turned it off', async () => {
    const { result, update } = mount({ catchup_prompt: false, catchup_seen_on: '2026-08-20' });
    await waitFor(() => expect(result.current.days).toBeNull());
    expect(update).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });

  it('does not ask twice in a day', async () => {
    const { result, update } = mount({ catchup_seen_on: '2026-08-29' });
    await waitFor(() => expect(result.current.days).toBeNull());
    // Already today: nothing to write and nothing to ask.
    expect(update).not.toHaveBeenCalled();
  });

  it('leaves alone a day that already has focus on it', async () => {
    history.mockResolvedValue({
      success: true,
      days: { '2026-08-28': { seconds: 5400, goal_hours: 2 } },
    });
    const { result } = mount({ catchup_seen_on: '2026-08-27' });
    await waitFor(() => expect(result.current.days).not.toBeNull());
    expect(result.current.days!.map((day) => day.iso)).toEqual(['2026-08-27']);
  });

  it('stamps the day and stays quiet when the gap holds nothing to ask', async () => {
    history.mockResolvedValue({
      success: true,
      days: { '2026-08-28': { seconds: 900, goal_hours: 2 } },
    });
    const { result, update } = mount({ catchup_seen_on: '2026-08-28' });
    await waitFor(() => expect(update).toHaveBeenCalledWith({ catchup_seen_on: '2026-08-29' }));
    expect(result.current.days).toBeNull();
  });

  it('writes each answered day, at the account\'s own default goal', async () => {
    const { result } = mount({ catchup_seen_on: '2026-08-27', focus_goal_hours: 3 });
    await waitFor(() => expect(result.current.days).not.toBeNull());

    result.current.submit([
      { iso: '2026-08-28', minutes: 90 },
      { iso: '2026-08-27', minutes: 45 },
    ]);

    await waitFor(() => expect(logDay).toHaveBeenCalledTimes(2));
    expect(logDay).toHaveBeenCalledWith('2026-08-28', 90, 3);
    expect(logDay).toHaveBeenCalledWith('2026-08-27', 45, 3);
    await waitFor(() => expect(result.current.days).toBeNull());
  });

  it('tells the page to re-read once the hours land', async () => {
    const onSaved = vi.fn();
    const { result } = mount({ catchup_seen_on: '2026-08-28' }, 'myles', onSaved);
    await waitFor(() => expect(result.current.days).not.toBeNull());

    result.current.submit([{ iso: '2026-08-28', minutes: 60 }]);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('does not re-read the page when nothing was written', async () => {
    logDay.mockResolvedValue({ success: false, message: 'no' });
    const onSaved = vi.fn();
    const { result } = mount({ catchup_seen_on: '2026-08-28' }, 'myles', onSaved);
    await waitFor(() => expect(result.current.days).not.toBeNull());

    result.current.submit([{ iso: '2026-08-28', minutes: 60 }]);
    await waitFor(() => expect(result.current.failure).not.toBeNull());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('keeps the prompt up when nothing could be written', async () => {
    logDay.mockResolvedValue({ success: false, message: 'no' });
    const { result } = mount({ catchup_seen_on: '2026-08-28' });
    await waitFor(() => expect(result.current.days).not.toBeNull());

    result.current.submit([{ iso: '2026-08-28', minutes: 60 }]);
    await waitFor(() => expect(result.current.failure).not.toBeNull());
    // The one case worth a second ask: the reader said something and it was
    // not kept, so the day is deliberately left unstamped.
    expect(result.current.days).not.toBeNull();
  });

  it('stamps the day when it is dismissed unanswered', async () => {
    const { result, update } = mount({ catchup_seen_on: '2026-08-28' });
    await waitFor(() => expect(result.current.days).not.toBeNull());

    result.current.dismiss();
    await waitFor(() => expect(update).toHaveBeenCalledWith({ catchup_seen_on: '2026-08-29' }));
    expect(result.current.days).toBeNull();
    expect(logDay).not.toHaveBeenCalled();
  });

  it('waits for an account before it does anything', async () => {
    const { result, update } = mount({ catchup_seen_on: '2026-08-27' }, null);
    await waitFor(() => expect(result.current.days).toBeNull());
    expect(update).not.toHaveBeenCalled();
  });
});
