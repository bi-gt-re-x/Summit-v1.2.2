/**
 * The first-week quest card: when it shows, what each row lets you do, and
 * that a seasoned account never pays for a growth read to find out.
 *
 * The claim rules themselves (done only when the row exists, paid once) are
 * the server's and are pinned in tests/test_quests.py.
 */
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Quest, QuestLine } from '@/services/quests';
import { days } from '@/test/factories';

const list = vi.fn();
const series = vi.fn();

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    quests: { ...(real.quests as object), list: () => list() },
    growth: { ...(real.growth as object), series: (n: number) => series(n) },
  };
});

import { FIRST_WEEK_DAYS, FirstWeek, showFirstWeek, useFirstWeek } from './FirstWeek';

function quest(id: Quest['id'], over: Partial<Quest> = {}): Quest {
  return {
    id,
    title: `Quest ${id}`,
    hint: `Hint ${id}`,
    to: id === 'back' ? null : `/${id}`,
    xp: 30,
    done: false,
    claimed: false,
    ...over,
  };
}

const ALL: Quest['id'][] = ['task', 'focus', 'practice', 'log', 'goal', 'back'];

function line(over: Partial<Record<Quest['id'], Partial<Quest>>> = {}, retired = false): QuestLine {
  return {
    quests: ALL.map((id) => quest(id, over[id])),
    retired,
    joined: '2026-10-19',
  };
}

function card(quests: Quest[], onClaim = vi.fn()) {
  render(
    <MemoryRouter>
      <FirstWeek quests={quests} busy={null} lastClaim={null} onClaim={onClaim} />
    </MemoryRouter>,
  );
  return onClaim;
}

afterEach(() => {
  list.mockReset();
  series.mockReset();
});

describe('when the card shows', () => {
  const young = { line: line(), activeDays: 2, touring: false, finishedHere: false };

  it('shows for a young account with quests left', () => {
    expect(showFirstWeek(young)).toBe(true);
  });

  it('waits for the active-day count rather than guessing', () => {
    expect(showFirstWeek({ ...young, activeDays: null })).toBe(false);
  });

  it('hides once the account has a week of active days', () => {
    expect(showFirstWeek({ ...young, activeDays: FIRST_WEEK_DAYS - 1 })).toBe(true);
    expect(showFirstWeek({ ...young, activeDays: FIRST_WEEK_DAYS })).toBe(false);
  });

  it('hides while the Mango tour runs', () => {
    expect(showFirstWeek({ ...young, touring: true })).toBe(false);
  });

  it('hides when the server has retired the line', () => {
    expect(showFirstWeek({ ...young, line: line({}, true) })).toBe(false);
  });

  it('hides when every quest is claimed, unless that just happened here', () => {
    const done = line(Object.fromEntries(ALL.map((id) => [id, { done: true, claimed: true }])));
    expect(showFirstWeek({ ...young, line: done })).toBe(false);
    expect(showFirstWeek({ ...young, line: done, finishedHere: true })).toBe(true);
  });
});

describe('the card', () => {
  it('links each open quest to the page where it is done', () => {
    card(line().quests);
    expect(screen.getByRole('link', { name: /Quest focus/ })).toHaveAttribute('href', '/focus');
    expect(screen.getByRole('link', { name: /Quest goal/ })).toHaveAttribute('href', '/goal');
    // Coming back has nowhere to go.
    expect(screen.queryByRole('link', { name: /Quest back/ })).toBeNull();
    expect(screen.getByText('0 of 6 done')).toBeInTheDocument();
    expect(screen.getByText(/180 XP to grab/)).toBeInTheDocument();
  });

  it('offers a claim once a quest is done, and says which was tapped', async () => {
    const onClaim = card(line({ task: { done: true } }).quests);
    expect(screen.queryByRole('link', { name: /Quest task/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Claim \+30 XP for quest task/ }));
    expect(onClaim).toHaveBeenCalledWith('task');
  });

  it('shows a claimed quest as paid, with nothing left to tap', () => {
    card(line({ log: { done: true, claimed: true } }).quests);
    expect(screen.getByText('Done. Nice.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link', { name: /Quest log/ })).toBeNull();
    expect(screen.getByText('1 of 6 done')).toBeInTheDocument();
  });

  it('says well done when all six are claimed', () => {
    card(line(Object.fromEntries(ALL.map((id) => [id, { done: true, claimed: true }]))).quests);
    expect(screen.getByText(/That's all six/)).toBeInTheDocument();
    expect(screen.queryByText(/to grab/)).toBeNull();
  });

  it('carries the tour anchor', () => {
    card(line().quests);
    expect(document.querySelector('[data-tour="first-week"]')).not.toBeNull();
  });
});

describe('useFirstWeek', () => {
  it('counts active days off the growth series for a young account', async () => {
    list.mockResolvedValue({ success: true, ...line() });
    series.mockResolvedValue({
      success: true,
      created_date: '2026-10-15',
      days_since_creation: 5,
      growth_data: [
        ...days('2026-10-15', 3, { tasks_completed: 1 }),
        ...days('2026-10-18', 2),
      ],
    });
    const { result } = renderHook(() => useFirstWeek('newbie', 0));
    await waitFor(() => expect(result.current.activeDays).toBe(3));
    expect(series).toHaveBeenCalledWith(0);
  });

  it('never reads the growth series once the server has retired the line', async () => {
    list.mockResolvedValue({ success: true, ...line({}, true) });
    const { result } = renderHook(() => useFirstWeek('veteran', 0));
    await waitFor(() => expect(result.current.line?.retired).toBe(true));
    expect(series).not.toHaveBeenCalled();
    expect(result.current.activeDays).toBeNull();
  });

  it('re-reads the quests when the task count moves, and marks claims in place', async () => {
    list.mockResolvedValue({ success: true, ...line() });
    series.mockResolvedValue({ success: true, created_date: '', days_since_creation: 1, growth_data: [] });
    const { result, rerender } = renderHook(({ bump }) => useFirstWeek('newbie', bump), {
      initialProps: { bump: 0 },
    });
    await waitFor(() => expect(result.current.line).not.toBeNull());
    expect(list).toHaveBeenCalledTimes(1);

    list.mockResolvedValue({ success: true, ...line({ task: { done: true } }) });
    rerender({ bump: 1 });
    await waitFor(() => expect(result.current.line?.quests[0]?.done).toBe(true));
    expect(list).toHaveBeenCalledTimes(2);
    expect(series).toHaveBeenCalledTimes(1);

    result.current.markClaimed('task');
    await waitFor(() => expect(result.current.line?.quests[0]?.claimed).toBe(true));
    expect(result.current.finishedHere).toBe(false);
  });
});
