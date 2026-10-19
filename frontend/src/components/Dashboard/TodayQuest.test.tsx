/**
 * Today's quest card: when it shows, what the row lets you do, and the
 * Analytics countdown under it.
 *
 * The pick, the tick and the once-a-day claim are the server's and are pinned
 * in tests/test_quests.py.
 */
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DailyQuest, QuestLine } from '@/services/quests';
import { days } from '@/test/factories';
import { dates } from '@/utils';
import { dataMaturity } from '@/utils/dataMaturity';

const list = vi.fn();
const series = vi.fn();

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    quests: { ...(real.quests as object), list: (day: string) => list(day) },
    growth: { ...(real.growth as object), series: (n: number) => series(n) },
  };
});

import { useFirstWeek } from './FirstWeek';
import { DAILY_DAYS, TodayQuest, showTodayQuest, stageCountdown } from './TodayQuest';

function daily(over: Partial<DailyQuest> = {}): DailyQuest {
  return {
    id: 'daily:2026-10-20',
    day: '2026-10-20',
    action: 'focus15',
    title: 'Focus for 15 minutes',
    hint: 'One timer or a few short ones.',
    to: '/timer',
    xp: 30,
    done: false,
    claimed: false,
    head_start: 0,
    ...over,
  };
}

function line(quest: DailyQuest | null = daily(), retired = true): QuestLine {
  return { quests: [], retired, joined: '2026-10-15', daily: quest };
}

/** `count` days ending today, the first `active` of them with a task done. */
function record(count: number, active: number) {
  const from = dates.isoDate(dates.addDays(new Date(), -(count - 1)));
  const all = days(from, count);
  return all.map((day, index) => (index < active ? { ...day, tasks_completed: 1 } : day));
}

function card(quest: DailyQuest, todayActive = false, onClaim = vi.fn()) {
  render(
    <MemoryRouter>
      <TodayQuest
        quest={quest}
        maturity={dataMaturity(record(4, 3))}
        todayActive={todayActive}
        busy={false}
        popped={false}
        onClaim={onClaim}
      />
    </MemoryRouter>,
  );
  return onClaim;
}

afterEach(() => {
  list.mockReset();
  series.mockReset();
});

describe('when the card shows', () => {
  const young = {
    line: line(), activeDays: 3, touring: false, firstWeekShowing: false, dailyHere: false,
  };

  it('shows once the first week is out of the way', () => {
    expect(showTodayQuest(young)).toBe(true);
  });

  it('waits its turn while the first-week card is up', () => {
    expect(showTodayQuest({ ...young, firstWeekShowing: true })).toBe(false);
  });

  it('hides while the Mango tour runs', () => {
    expect(showTodayQuest({ ...young, touring: true })).toBe(false);
  });

  it('hides when the server sent no quest', () => {
    expect(showTodayQuest({ ...young, line: line(null) })).toBe(false);
  });

  it('waits for the active-day count rather than guessing', () => {
    expect(showTodayQuest({ ...young, activeDays: null })).toBe(false);
  });

  it('stops when Performance opens, unless a claim just happened here', () => {
    expect(DAILY_DAYS).toBe(10);
    expect(showTodayQuest({ ...young, activeDays: DAILY_DAYS - 1 })).toBe(true);
    expect(showTodayQuest({ ...young, activeDays: DAILY_DAYS })).toBe(false);
    expect(showTodayQuest({ ...young, activeDays: DAILY_DAYS, dailyHere: true })).toBe(true);
  });
});

describe('the countdown', () => {
  it('names the next stage and the days it needs', () => {
    expect(stageCountdown(dataMaturity(record(5, 3)))).toBe('2 more active days and Analytics opens Trends.');
    expect(stageCountdown(dataMaturity(record(5, 4)))).toBe('1 more active day and Analytics opens Trends.');
    expect(stageCountdown(dataMaturity(record(9, 7)))).toBe('3 more active days and Analytics opens Performance.');
  });

  it('counts the head start the way Analytics does', () => {
    // 3 real days and a head start of 6: 3 of it counts so far, so 6 counted
    // and 4 to go for Performance. Each new day earns one more of head start,
    // so that's 2 real days.
    expect(stageCountdown(dataMaturity(record(5, 3), 6))).toBe(
      '2 more active days and Analytics opens Performance.',
    );
  });

  it('says nothing without a series', () => {
    expect(stageCountdown(null)).toBeNull();
  });
});

describe('the card', () => {
  it('links an open quest to the page where it is done', () => {
    card(daily());
    expect(screen.getByRole('link', { name: /Focus for 15 minutes/ })).toHaveAttribute('href', '/timer');
    expect(screen.getByText('2 more active days and Analytics opens Trends.')).toBeInTheDocument();
    expect(screen.getByText(/This quest makes today count/)).toBeInTheDocument();
  });

  it('offers a claim once the quest is done', async () => {
    const onClaim = card(daily({ done: true }));
    expect(screen.queryByRole('link')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: "Claim +30 XP for today's quest" }));
    expect(onClaim).toHaveBeenCalledOnce();
  });

  it('shows a claimed quest as paid, with nothing left to tap', () => {
    card(daily({ done: true, claimed: true }), true);
    expect(screen.getByText('Done. See you tomorrow.')).toBeInTheDocument();
    expect(screen.getByText('Done for today')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/Today already counts/)).toBeInTheDocument();
  });

  it('carries the tour anchor', () => {
    card(daily());
    expect(document.querySelector('[data-tour="today-quest"]')).not.toBeNull();
  });
});

describe('useFirstWeek with a daily quest', () => {
  it("sends the reader's day and reads the series even with the first week retired", async () => {
    list.mockResolvedValue({ success: true, ...line() });
    series.mockResolvedValue({ success: true, created_date: '', days_since_creation: 4, growth_data: record(4, 3) });
    const { result } = renderHook(() => useFirstWeek('newbie', 0));
    await waitFor(() => expect(result.current.activeDays).toBe(3));
    expect(list).toHaveBeenCalledWith(dates.isoDate());
    expect(result.current.todayActive).toBe(false);
  });

  it('skips the series once the server has nothing left to show', async () => {
    list.mockResolvedValue({ success: true, ...line(null) });
    const { result } = renderHook(() => useFirstWeek('veteran', 0));
    await waitFor(() => expect(result.current.line).not.toBeNull());
    expect(series).not.toHaveBeenCalled();
  });

  it('counts today as soon as the daily claim lands', async () => {
    list.mockResolvedValue({ success: true, ...line(daily({ done: true })) });
    series.mockResolvedValue({ success: true, created_date: '', days_since_creation: 4, growth_data: record(4, 3) });
    const { result } = renderHook(() => useFirstWeek('newbie', 0));
    await waitFor(() => expect(result.current.activeDays).toBe(3));

    act(() => result.current.markDailyClaimed(30));
    expect(result.current.activeDays).toBe(4);
    expect(result.current.todayActive).toBe(true);
    expect(result.current.dailyHere).toBe(true);
    expect(result.current.line?.daily?.claimed).toBe(true);
  });
});
