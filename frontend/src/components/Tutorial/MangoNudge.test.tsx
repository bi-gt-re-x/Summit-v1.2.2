/**
 * Mango's note for the day. See ./MangoNudge.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { bookSessions, nextActions, NO_PLAN, type NextAction } from '@/services/next';
import { STATS_CHANGED } from '@/utils/statsBus';
import { MangoPet } from './MangoPet';
import { generalTips, MAX_TIPS, nudgeMove, pickNudge, pickTips, shortWhy } from './MangoNudge';

vi.mock('@/services/next', async (original) => {
  const real = await original<typeof import('@/services/next')>();
  return { ...real, nextActions: vi.fn(), bookSessions: vi.fn() };
});

const action = (over: Partial<NextAction> = {}): NextAction => ({
  id: 'overdue-1',
  kind: 'overdue',
  title: 'Finish “Chapter 7”',
  because: 'It was due 3 days ago.',
  minutes: 25,
  weight: 900,
  taskId: 't1',
  ...over,
});

const serve = (top: NextAction | null) =>
  vi.mocked(nextActions).mockResolvedValue({
    success: true,
    plan: { ...NO_PLAN, top, actions: top ? [top] : [] },
    lens: null,
  });

function show(nudges = true) {
  return renderWithProviders(
    <>
      <div className="dash-hero" />
      <MangoPet anchor=".dash-hero" energy="still" username="alpha" nudges={nudges} />
    </>,
    { auth: { username: 'alpha' } },
  );
}

const note = () => screen.findByRole('status', { name: 'A note from Mango' }, { timeout: 3000 });

beforeEach(() => {
  localStorage.clear();
  vi.mocked(nextActions).mockReset();
  vi.mocked(bookSessions).mockReset();
});

describe('what Mango picks', () => {
  it('takes the top of the plan', () => {
    const top = action();
    expect(pickNudge({ ...NO_PLAN, top })).toBe(top);
  });

  it('skips small wins for the next thing worth saying', () => {
    const xp = action({ id: 'xp', kind: 'xp' });
    const goal = action({ id: 'goal', kind: 'goal' });
    expect(pickNudge({ ...NO_PLAN, top: xp, actions: [xp, goal] })).toBe(goal);
  });

  it('has nothing to say when nothing is worth saying', () => {
    expect(pickNudge({ ...NO_PLAN, top: action({ kind: 'momentum' }) })).toBeNull();
    expect(pickNudge(NO_PLAN)).toBeNull();
  });
});

describe('the loop', () => {
  it('puts the plan first, then fills with general tips', () => {
    const top = action();
    const goal = action({ id: 'goal', kind: 'goal', title: 'Work on Spanish' });
    const tips = pickTips({ ...NO_PLAN, top, actions: [top, goal] });
    expect(tips.map((tip) => tip.title).slice(0, 2)).toEqual(['Finish "Chapter 7"', 'Work on Spanish']);
    expect(tips.length).toBeGreaterThanOrEqual(3);
    expect(tips.length).toBeLessThanOrEqual(MAX_TIPS);
    expect(new Set(tips.map((tip) => tip.id)).size).toBe(tips.length);
  });

  it('never runs past five, however long the plan', () => {
    const rows = Array.from({ length: 9 }, (_, i) => action({ id: `r${i}`, title: `Task ${i}` }));
    expect(pickTips({ ...NO_PLAN, top: rows[0]!, actions: rows })).toHaveLength(4);
  });

  it('has a few good tips with no plan at all, morning or night', () => {
    for (const hour of [8, 14, 21]) {
      const tips = pickTips(null, new Date(2026, 10, 10, hour));
      expect(tips.length).toBeGreaterThanOrEqual(3);
      for (const tip of tips) expect(`${tip.title} ${tip.why}`).not.toMatch(/[—“”‘’]/);
    }
    expect(pickTips(null, new Date(2026, 10, 10, 21)).map((tip) => tip.id)).toContain('tip-tomorrow');
    expect(pickTips(null, new Date(2026, 10, 10, 8)).map((tip) => tip.id)).toContain('tip-hard-first');
  });
});

describe('how it says it', () => {
  it('leaves a short reason alone', () => {
    expect(shortWhy('It was due 3 days ago.')).toBe('It was due 3 days ago.');
  });

  it('cuts a long reason at a sentence', () => {
    const first = 'At this pace you finish Nov 30, which is twelve days after the date you set for this goal back in the summer.';
    const why = shortWhy(`${first} This week needs 3 more sessions, so there's still plenty of time to fix it before then.`);
    expect(why).toBe(first);
  });

  it('never returns a cut-off word', () => {
    expect(shortWhy('word '.repeat(60))).toMatch(/word\.\.\.$/);
  });
});

describe('the button', () => {
  it('books when the row can be booked', () => {
    const item = action({ goalId: 'g1', book: { count: 3, minutes: 45, title: 'Set' } });
    expect(nudgeMove(item)).toEqual({ type: 'book', label: 'Book 3 sessions', goalId: 'g1' });
  });

  it('goes where the work is, then the task, then the goal, then the plan', () => {
    expect(nudgeMove(action({ to: '/recommendations#review' }))).toMatchObject({ to: '/recommendations#review' });
    expect(nudgeMove(action())).toMatchObject({ to: '/tasks?task=t1', label: 'Open it' });
    expect(nudgeMove(action({ taskId: undefined, goalId: 'g1' }))).toMatchObject({ to: '/goals' });
    expect(nudgeMove(action({ taskId: undefined }))).toMatchObject({ to: '/recommendations' });
  });
});

describe('Mango with something to say', () => {
  it('speaks up by itself, with the plain words and a way to act', async () => {
    serve(action());
    show();
    const card = await note();
    expect(card).toHaveTextContent('Finish "Chapter 7"');
    expect(card).toHaveTextContent('It was due 3 days ago.');
    expect(screen.getByRole('link', { name: 'Open it' })).toHaveAttribute('href', '/tasks?task=t1');
  });

  it('only speaks up once a day, but comes back when clicked', async () => {
    serve(action());
    const first = show();
    await note();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('status', { name: 'A note from Mango' })).not.toBeInTheDocument();
    first.unmount();

    show();
    await waitFor(() => expect(nextActions).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('status', { name: 'A note from Mango' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Mango/ }));
    expect(await note()).toHaveTextContent('Chapter 7');
  });

  it('stays quiet with nothing worth saying, but a click still gives a tip', async () => {
    serve(action({ kind: 'xp' }));
    show();
    await waitFor(() => expect(nextActions).toHaveBeenCalled(), { timeout: 3000 });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('status', { name: 'A note from Mango' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Mango/ }));
    expect(await note()).toHaveTextContent(generalTips()[0]!.title);
  });

  it('loops through different tips, and holding still to say them', async () => {
    serve(action());
    show();
    const card = await note();
    expect(card).toHaveTextContent('Chapter 7');
    const seen = new Set<string>();
    const titleNow = () => screen.getByRole('status', { name: 'A note from Mango' }).querySelector('.mango-nudge-title')!.textContent!;
    seen.add(titleNow());
    const count = screen.getByLabelText(/Tip 1 of \d/).getAttribute('aria-label')!;
    const total = Number(count.match(/of (\d)/)![1]);
    expect(total).toBeGreaterThanOrEqual(3);
    expect(total).toBeLessThanOrEqual(MAX_TIPS);
    for (let i = 1; i < total; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next tip' }));
      seen.add(titleNow());
    }
    expect(seen.size).toBe(total);
    // Clicking Mango moves it on too, and it comes round to the start.
    fireEvent.click(screen.getByRole('button', { name: /Mango/ }));
    expect(titleNow()).toContain('Chapter 7');
  });

  it('books from the note, and says so', async () => {
    serve(action({ kind: 'deadline', goalId: 'g1', book: { count: 2, minutes: 45, title: 'Set' } }));
    vi.mocked(bookSessions).mockResolvedValue({
      success: true,
      booked: [{ task_id: 'a', start: 's', end: 'e' }, { task_id: 'b', start: 's', end: 'e' }],
      title: 'Set',
      minutes: 45,
    });
    show();
    await note();
    fireEvent.click(screen.getByRole('button', { name: 'Book 2 sessions' }));
    expect(await screen.findByText("Booked 2 sessions. They're on your calendar.")).toBeInTheDocument();
    expect(bookSessions).toHaveBeenCalledWith('g1');
    fireEvent.click(screen.getByRole('button', { name: 'Nice' }));
    expect(screen.queryByRole('status', { name: 'A note from Mango' })).not.toBeInTheDocument();
  });

  it('closes once the thing is done', async () => {
    serve(action());
    show();
    await note();
    serve(null);
    window.dispatchEvent(new Event(STATS_CHANGED));
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: 'A note from Mango' })).not.toBeInTheDocument(),
    );
  });

  it('never asks when it is turned off', async () => {
    serve(action());
    show(false);
    await new Promise((resolve) => setTimeout(resolve, 1700));
    expect(nextActions).not.toHaveBeenCalled();
  });

  it('waits while you type', async () => {
    serve(action());
    show();
    fireEvent.keyDown(window, { key: 'a' });
    await new Promise((resolve) => setTimeout(resolve, 1700));
    expect(nextActions).not.toHaveBeenCalled();
  });

  it('has no dashes or curly quotes in what it says', async () => {
    serve(action());
    show();
    expect((await note()).textContent).not.toMatch(/[—“”‘’]/);
  });
});
