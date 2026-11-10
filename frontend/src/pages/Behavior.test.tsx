/**
 * The Behavior page: the opening asks how many named mistakes came back, each pattern
 * shows how often, whether it comes back, its fix and whether the fix worked, and you can
 * name one, track one Summit noticed, log a session, and start a fix. The figures are the
 * server's (tests/test_behavior.py); this pins how they're drawn and what's sent.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import type { Behavior as Pattern, BehaviorPage } from '@/services/behavior';

const service = vi.hoisted(() => ({
  read: vi.fn(), add: vi.fn(), logSession: vi.fn(), startFix: vi.fn(), endFix: vi.fn(),
  setStatus: vi.fn(), remove: vi.fn(), update: vi.fn(),
}));

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return { ...real, behavior: service };
});

import Behavior from './Behavior';

const PATTERN: Pattern = {
  id: 'b1', title: 'Impulsive answers on tests', detail: '', scope: 'tests', scope_label: 'Tests and contests',
  subject: '', words: [], source: 'own', source_label: 'You named it', from_record: false,
  stored_status: 'open', status: 'improving', status_label: 'Improving',
  identified_on: '2026-10-01', identified_label: 'Oct 1', resolved_label: null, came_back: 0, returned_label: null,
  frequency: { times: 4, sessions: 3, checked: 9, days: 30, line: '4 times in the last 30 days, in 3 of 9 checked sessions.' },
  recurrence: { hits: 5, of: 12, percent: 42, evidence: 'Emerging pattern', line: '' },
  fix: { id: 'f1', title: 'Answer-confidence checkpoint', how: 'Mark sure or unsure.', started_on: '2026-10-20',
    started_label: 'Oct 20', days: 21, used: { done: 6, of: 7 } },
  effect: {
    before: { hits: 4, of: 5, percent: 80 }, during: { hits: 1, of: 7, percent: 14 }, used: { done: 6, of: 7 },
    evidence: 'Preliminary signal', split: null, verdict: 'leaning_better', tone: 'good',
    headline: "Looks like it's helping", tip: 'Not proven yet. Keep it going a little longer.',
  },
  past_fixes: [],
  when: {
    found: {
      key: 'evening', line: 'It came up in 4 of 5 evening and late sessions, and 1 of 7 earlier ones.',
      suggests: "It's early, but this may mean it shows up when you're tired.", evidence: 'Preliminary signal',
      chart: { type: 'compare', max: 100, unit: '%', rows: [
        { label: 'Evening and late sessions', value: 80, text: '4/5' }, { label: 'Earlier ones', value: 14, text: '1/7' }] },
    },
    quiet: ['hard tasks'], need: 0, linked: 12,
  },
  recent: [
    { id: 'c1', day: '2026-11-08', day_label: 'Nov 8', times: 0, used: true, from: 'task', label: 'AMC mock 3' },
    { id: 'c2', day: '2026-11-09', day_label: 'Nov 9', times: 2, used: false, from: 'logged', label: 'School quiz' },
  ],
  checks: 12, ready_to_resolve: false,
  fixes: [{ key: 'confidence', title: 'Answer-confidence checkpoint', how: 'Mark sure or unsure.' }],
};

function page(over: Partial<BehaviorPage> = {}): BehaviorPage {
  return {
    behaviors: [PATTERN],
    summary: {
      named: 1, counts: { identified: 0, intervening: 0, improving: 1, resolved: 0 },
      repeat: { hits: 1, of: 1, percent: 100 }, fixes: { working: 1, of: 1 },
      headline: "Naming a mistake hasn't stopped it yet.",
      figures: '1 of the 1 pattern you named at least a week ago came back afterward.',
      suggests: "This suggests the fixes you're doing are worth keeping.",
    },
    suggestions: [{ source: 'reason', source_ref: 'no-time', title: 'Ran out of time', detail: '',
      based_on: '"Ran out of time" came up in 5 of your 20 rated sessions in the last 45 days.',
      scope: 'study', scope_label: 'All study work', fixes: [{ title: 'Book 50% more time', how: 'Half again.' }] }],
    today: [{ behavior_id: 'b1', title: 'Impulsive answers on tests', fix: 'Answer-confidence checkpoint', how: 'Mark sure or unsure.', tasks: ['AMC mock 4'], more: 0 }],
    scopes: [], statuses: [
      { key: 'identified', label: 'Identified' }, { key: 'intervening', label: 'Intervening' },
      { key: 'improving', label: 'Improving' }, { key: 'resolved', label: 'Resolved' }],
    library: [],
    ...over,
  };
}

beforeEach(() => {
  service.read.mockResolvedValue({ success: true, ...page() });
  for (const name of ['add', 'logSession', 'startFix', 'endFix', 'setStatus', 'remove', 'update'] as const) {
    service[name].mockResolvedValue({ success: true, id: 'x' });
  }
});

afterEach(() => vi.clearAllMocks());

describe('the behavior page', () => {
  it('opens with how many named mistakes came back, and the fixes', async () => {
    renderWithProviders(<Behavior />);
    expect(await screen.findByRole('heading', { name: "Naming a mistake hasn't stopped it yet." })).toBeInTheDocument();
    expect(screen.getByText('came back after you named them')).toBeInTheDocument();
    expect(screen.getByText(/worth keeping/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: "Before today's sessions" })).toHaveTextContent('On "AMC mock 4"');
  });

  it('shows a pattern with each of its figures and its stage', async () => {
    renderWithProviders(<Behavior />);
    const card = (await screen.findByRole('heading', { name: 'Impulsive answers on tests' })).closest('article')!;
    expect(within(card).getByText('4 times')).toBeInTheDocument();
    expect(within(card).getByText('42%')).toBeInTheDocument();
    expect(within(card).getByText('Answer-confidence checkpoint')).toBeInTheDocument();
    expect(within(card).getByText("Looks like it's helping")).toBeInTheDocument();
    expect(within(card).getByRole('list', { name: 'Stage: Improving' })).toBeInTheDocument();
    expect(within(card).getByText(/4 of 5 evening and late sessions/)).toBeInTheDocument();
    expect(within(card).getByLabelText('Nov 9: School quiz, happened 2 times, fix skipped')).toBeInTheDocument();
  });

  it('tracks a pattern Summit noticed, with the suggestion behind it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Behavior />);
    await user.click(await screen.findByRole('button', { name: 'Track it' }));
    const form = screen.getByRole('form', { name: 'Track this pattern' });
    expect(within(form).getByLabelText('What keeps happening?')).toHaveValue('Ran out of time');
    await user.click(within(form).getByRole('button', { name: /Halfway pace check/ }));
    await user.click(within(form).getByRole('button', { name: 'Start tracking' }));
    await waitFor(() => expect(service.add).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Ran out of time', source: 'reason', source_ref: 'no-time', fix_title: 'Halfway pace check',
    })));
  });

  it('logs a session by hand', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Behavior />);
    await user.click(await screen.findByRole('button', { name: /Log a session/ }));
    const form = screen.getByRole('form', { name: 'Log a session' });
    await user.type(within(form).getByLabelText('What was it?'), 'Chem quiz');
    await user.click(within(within(form).getByRole('group', { name: /Did it happen/ })).getByRole('button', { name: 'Yes' }));
    fireEvent.change(within(form).getByLabelText('How many times'), { target: { value: '2' } });
    await user.click(within(within(form).getByRole('group', { name: /Did you do/ })).getByRole('button', { name: 'No' }));
    await user.click(within(form).getByRole('button', { name: /Save the session/ }));
    await waitFor(() => expect(service.logSession).toHaveBeenCalledWith(expect.objectContaining({
      behavior_id: 'b1', label: 'Chem quiz', times: 2, used: false,
    })));
    expect(service.read).toHaveBeenCalledTimes(2);
  });

  it('starts from the patterns people already know, when there are none', async () => {
    service.read.mockResolvedValue({ success: true, ...page({ behaviors: [], suggestions: [], today: [],
      summary: { named: 0, counts: { identified: 0, intervening: 0, improving: 0, resolved: 0 }, repeat: null,
        fixes: { working: 0, of: 0 }, headline: null, figures: null, suggests: null } }) });
    const user = userEvent.setup();
    renderWithProviders(<Behavior />);
    await user.click(await screen.findByRole('button', { name: 'I overlook problems that look easy' }));
    const form = screen.getByRole('form', { name: 'Name a pattern' });
    expect(within(form).getByLabelText('What keeps happening?')).toHaveValue('I overlook problems that look easy');
    // The fix that fits the words comes first.
    expect(within(form).getAllByRole('button', { pressed: false })[0]).toHaveTextContent('Easy-problem recheck');
  });
});
