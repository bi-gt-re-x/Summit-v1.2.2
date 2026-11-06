/**
 * The weekly review tab: what moved, what stalled, last week's test graded, and the
 * bet for next week. The rules are on the server (tests/test_weekly_review.py and
 * tests/test_experiments.py); this pins what reaches the page and what the buttons send.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import type { Experiment, WeeklyReview } from '@/services/experiments';

const done: Experiment = {
  id: 'x1', kind: 'time_of_day', title: 'Do study sessions in the morning', why: '', how: '',
  scope: 'All your study work', phase: 'ready', days_done: 14, days_total: 14, started_on: '2026-10-20',
  ends_on: '2026-11-02', ends_label: 'Nov 2', measure: 'How your sessions rate', design: 'split',
  verdict: 'better', tone: 'good', headline: 'It worked', tip: 'Keep doing it.',
  chart: { type: 'compare', max: 5, unit: '/ 5', rows: [
    { label: 'Other sessions', value: 3.1, text: '3.1', n: 9 }, { label: 'The new way', value: 4.2, text: '4.2', n: 8 },
  ] },
  adherence: { done: 8, of: 17 }, evidence: 'Emerging pattern', compared_with: 'Other sessions', sessions: 17, kept: null,
};

const running: Experiment = {
  ...done, id: 'x2', title: 'Phone in another room', phase: 'running', days_done: 5, ends_label: 'Nov 15',
  verdict: 'early', tone: 'flat', headline: 'Too early to tell', tip: '3 more sessions and it can start to say.',
  adherence: null, evidence: null, how: 'Put your phone in another room for every session.',
};

function review(over: Partial<WeeklyReview> = {}): WeeklyReview {
  return {
    week: { start: '2026-10-26', end: '2026-11-01', label: 'Oct 26 to Nov 1', this_week: false },
    reviewed: false, note: '', streak: 2, headline: 'A busy week, but no goal moved',
    tiles: [
      { key: 'sessions', label: 'Study sessions', value: 11, before: 17 },
      { key: 'days', label: 'Days worked', value: 2, of: 7, days: [true, false, false, false, false, true, false] },
      { key: 'output', label: 'Hard work done well', value: 0, before: 4 },
      { key: 'goals', label: 'Goals moved', value: 0 },
    ],
    moved: [{ tone: 'good', title: 'Violin ARCT', detail: '2 sessions, and it needs 2 a week.', icon: 'pace' }],
    stalled: [{ tone: 'bad', title: 'USACO Gold', detail: '4 sessions, but it needs 7 a week. Your top goal.', icon: 'pace' }],
    ready: [done], running: [running],
    proposals: [{
      kind: 'shorter', title: 'Keep sessions under 60 minutes', why: 'Sessions over 75 minutes rate 2.9, shorter ones 3.8.',
      how: 'Stop at 60 minutes.', params: { minutes: 60 }, goal: 'g1', subject: '', measure: 'How your sessions rate',
      design: 'split', scope: 'USACO Gold',
    }],
    can_start: true, past: [], reasons: [],
    ...over,
  };
}

let current = review();
const startTest = vi.fn(async () => ({ success: true, id: 'x9', ends_on: '2026-11-17' }));
const decideTest = vi.fn(async () => ({ success: true, verdict: 'better' }));
const finishReview = vi.fn(async () => ({ success: true, week_start: '2026-10-26' }));
const stopTest = vi.fn(async () => ({ success: true }));

vi.mock('@/services/experiments', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    weeklyReview: async () => ({ success: true, ...current }),
    startTest: (...args: unknown[]) => (startTest as (...a: unknown[]) => unknown)(...args),
    decideTest: (...args: unknown[]) => (decideTest as (...a: unknown[]) => unknown)(...args),
    finishReview: (...args: unknown[]) => (finishReview as (...a: unknown[]) => unknown)(...args),
    stopTest: (...args: unknown[]) => (stopTest as (...a: unknown[]) => unknown)(...args),
    extendTest: async () => ({ success: true }),
  };
});

const { ReviewTab } = await import('./ReviewTab');

async function show(over: Partial<WeeklyReview> = {}) {
  current = review(over);
  renderWithProviders(<ReviewTab />, { route: '/analytics/review', auth: { username: 'alpha' } });
  await act(async () => { await new Promise((r) => { setTimeout(r, 30); }); });
}

beforeEach(() => {
  startTest.mockClear();
  decideTest.mockClear();
  finishReview.mockClear();
  stopTest.mockClear();
});

describe('the week at a glance', () => {
  it('leads with the headline, the week, the streak and four tiles', async () => {
    await show();
    const head = within(screen.getByRole('region', { name: 'Your week' }));
    expect(head.getByRole('heading', { name: 'A busy week, but no goal moved' })).toBeInTheDocument();
    expect(head.getByText(/Last week · Oct 26 to Nov 1/)).toBeInTheDocument();
    expect(head.getByText(/2 weeks in a row/)).toBeInTheDocument();
    expect(head.getByText('Not reviewed yet')).toBeInTheDocument();
    expect(head.getByText('↓ from 17')).toBeInTheDocument();
    expect(head.getByLabelText('Worked 2 of 7 days')).toBeInTheDocument();
  });

  it('lists what moved and what stalled, with a line for an empty side', async () => {
    await show({ moved: [] });
    expect(within(screen.getByRole('region', { name: 'What moved' })).getByText('Nothing moved this week.')).toBeInTheDocument();
    const stalled = within(screen.getByRole('region', { name: 'What stalled' }));
    expect(stalled.getByText('USACO Gold')).toBeInTheDocument();
    expect(stalled.getByText('4 sessions, but it needs 7 a week. Your top goal.')).toBeInTheDocument();
  });
});

describe('last week\'s test, graded', () => {
  it('shows the verdict, the bars and how many sessions went the new way', async () => {
    await show();
    const result = within(screen.getByRole('region', { name: 'Your finished tests' }));
    expect(result.getByText('It worked')).toBeInTheDocument();
    expect(result.getByRole('img', { name: 'Other sessions 3.1, The new way 4.2' })).toBeInTheDocument();
    expect(result.getByText(/of 17 sessions done the new way/)).toBeInTheDocument();
    expect(result.getByText('Emerging')).toHaveAttribute('title', 'How sure: emerging pattern');
  });

  it('keeps or drops the change', async () => {
    await show();
    await userEvent.click(within(screen.getByRole('region', { name: 'Your finished tests' })).getByRole('button', { name: 'Keep doing it' }));
    expect(decideTest).toHaveBeenCalledWith('x1', true);
  });
});

describe('the bet for next week', () => {
  it('shows a running test with its progress, and can stop it', async () => {
    await show();
    const bet = within(screen.getByRole('region', { name: 'Your bet for next week' }));
    expect(bet.getByText('Phone in another room')).toBeInTheDocument();
    expect(bet.getByRole('img', { name: 'Day 5 of 14' })).toBeInTheDocument();
    await userEvent.click(bet.getByRole('button', { name: 'Stop this test' }));
    expect(stopTest).toHaveBeenCalledWith('x2');
  });

  it('starts a proposed test with its scope and the length picked', async () => {
    await show();
    const bet = within(screen.getByRole('region', { name: 'Your bet for next week' }));
    await userEvent.selectOptions(bet.getAllByRole('combobox', { name: 'How long' })[0]!, '21');
    await userEvent.click(bet.getByRole('button', { name: 'Bet on this' }));
    expect(startTest).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'shorter', goal: 'g1', title: 'Keep sessions under 60 minutes', days: 21,
      params: { minutes: 60, how: 'Stop at 60 minutes.' },
    }));
  });

  it('starts a test of your own idea', async () => {
    await show();
    const bet = within(screen.getByRole('region', { name: 'Your bet for next week' }));
    await userEvent.type(bet.getByLabelText('Or test your own idea'), 'Review notes the night before');
    await userEvent.selectOptions(bet.getByRole('combobox', { name: 'Measure it by' }), 'days');
    await userEvent.click(bet.getByRole('button', { name: 'Start' }));
    expect(startTest).toHaveBeenCalledWith({ kind: 'custom', params: { measure: 'days' }, title: 'Review notes the night before', days: 14 });
  });

  it('says when three tests are already running', async () => {
    await show({ can_start: false });
    expect(screen.queryByRole('button', { name: 'Bet on this' })).not.toBeInTheDocument();
    expect(screen.getByText(/Three tests at once is the most/)).toBeInTheDocument();
  });
});

describe('finishing', () => {
  it('saves the week with what you learned', async () => {
    await show();
    await userEvent.type(screen.getByLabelText(/One thing you learned/), 'Mornings work');
    await userEvent.click(screen.getByRole('button', { name: 'Finish review' }));
    expect(finishReview).toHaveBeenCalledWith('Mornings work');
  });

  it('says it is done once it is', async () => {
    await show({ reviewed: true, note: 'Mornings work' });
    expect(screen.getByText('✓ Reviewed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save note' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Mornings work')).toBeInTheDocument();
  });
});
