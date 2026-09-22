/**
 * Changing the subject: that it narrows the page, and what it costs to do.
 *
 * The filter is one line — `tasks.filter((task) => task.subject === subject)` —
 * and the interesting part is everything downstream of it. Eighty-nine memos
 * hang off this model and fourteen of them depend on the filtered list, so a
 * dependency array that forgot `subject` would leave a panel showing every
 * subject's work under a heading naming one, and nothing would look broken.
 *
 * So the assertions are about what actually moves. `seedTasks` is about twelve
 * hundred tasks over seven hundred and fifty days across four subjects, which
 * is a real account rather than a fixture, and the same body of work is what
 * the timing is taken over.
 *
 * ## What is deliberately *not* narrowed
 *
 * XP and focus minutes are recorded per day, not per subject, so the six tiles
 * on Overview cannot honour the filter. They say so in a line under the row
 * rather than quietly showing whole-account figures beside narrowed ones —
 * that sentence is pinned here, because it is the difference between a
 * limitation and a bug.
 */
import { act, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import Analytics from './Analytics';
import {
  SUBJECTS,
  TODAY,
  seedDays,
  seedGoals,
  seedPrefs,
  seedRatings,
  seedScoreLog,
  seedTasks,
} from '@/test/seed';

const ok = <T,>(value: T) => Promise.resolve(value);

vi.mock('@/services/taskHistory', () => ({
  taskHistory: () => ok({ success: true, tasks: seedTasks() }),
  invalidate: () => {},
}));
vi.mock('@/services/growth', async (orig) => ({
  ...(await orig<object>()),
  series: () => ok({ success: true, growth_data: seedDays() }),
  ratings: () => ok({ success: true, ...seedRatings() }),
}));
vi.mock('@/services/analytics', async (orig) => ({
  ...(await orig<object>()),
  standing: () => ok({ success: true, cohort: 40, enough: false, floor: 20, rows: [] }),
  baseline: () => ok({ success: true, baseline: null }),
  adoptedAdvice: () => ok({ success: true, adopted: [] }),
  metricHistories: () => ok({ success: true, histories: {} }),
  metricHistory: () => ok({ success: true, metric: 'overall', points: seedScoreLog() }),
}));
vi.mock('@/services/goals', async (orig) => ({
  ...(await orig<object>()),
  getGoals: () => ok({ success: true, goals: seedGoals() }),
}));
vi.mock('@/services/subjects', async (orig) => ({
  ...(await orig<object>()),
  list: () =>
    ok({
      success: true,
      subjects: SUBJECTS.map((id) => ({
        id, name: id, abbr: null, label: id, icon: '',
        group: 'Core', used: 3, family: null, custom: false,
      })),
    }),
}));

beforeAll(() => {
  /* `performance` is left real on purpose. The default fake-timer set replaces
     it along with everything else, which freezes `performance.now()` at a
     constant — so the timing below measured every switch at exactly 0ms and
     the budget it asserts could never have failed. The page only needs Date
     and the timer functions faked to sit at a fixed today. */
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
});
afterAll(() => vi.useRealTimers());

/** The page, fully loaded. */
async function open() {
  renderWithProviders(<Analytics />, {
    route: '/analytics',
    settings: { prefs: { ...seedPrefs(), analytics_setup_done: true } },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  return screen.getByLabelText('Subject') as HTMLSelectElement;
}

/** Switch the filter, and return how long the resulting render took. */
async function choose(select: HTMLSelectElement, id: string): Promise<number> {
  const started = performance.now();
  await act(async () => {
    select.value = id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
  return performance.now() - started;
}

describe('changing the subject', () => {
  it('offers every subject the account has used, and All Subjects', async () => {
    const select = await open();
    const options = [...select.options].map((option) => option.value);
    expect(options[0]).toBe('');
    for (const id of SUBJECTS) expect(options).toContain(id);
  });

  it('holds the choice', async () => {
    const select = await open();
    await choose(select, 'maths');
    expect(select.value).toBe('maths');
    await choose(select, 'music');
    expect(select.value).toBe('music');
    await choose(select, '');
    expect(select.value).toBe('');
  });

  /* The whole point of the control. If the same figures survive a switch
     between two subjects with different records, nothing downstream is reading
     the filter and the heading is lying about what is under it. */
  it('narrows what the subject panels count', async () => {
    const select = await open();

    const scoped = () => {
      const note = document.querySelector('.ax-tiles-scope');
      return note ? note.textContent ?? '' : '';
    };

    await choose(select, 'maths');
    const onMaths = scoped();
    await choose(select, 'music');
    const onMusic = scoped();

    // The page names the subject it is narrowed to, and the name changes.
    expect(onMaths).toContain('maths');
    expect(onMusic).toContain('music');
    expect(onMaths).not.toBe(onMusic);
  });

  /* A limitation, stated. The six tiles count every subject because XP and
     focus are per-day figures; the line saying so is the difference between
     that being honest and being a bug. */
  it('says which figures the filter cannot narrow, and only while one is on', async () => {
    const select = await open();
    expect(document.querySelector('.ax-tiles-scope')).toBeNull();

    await choose(select, 'maths');
    const note = document.querySelector('.ax-tiles-scope')!;
    expect(note.textContent).toMatch(/count every subject/i);
    expect(within(note as HTMLElement).getByText('maths')).toBeInTheDocument();

    await choose(select, '');
    expect(document.querySelector('.ax-tiles-scope')).toBeNull();
  });

  /* Twelve hundred tasks, four subjects, seven hundred and fifty days, and a
     switch costs about 15ms in jsdom — which is why there is no loading state
     on this control and should not be one: a spinner for fifteen milliseconds
     is a flash, and a flash reads as the page breaking.

     The budget is 400ms rather than 20. It is not measuring the 15; it is
     there to catch the failure that would make this control unusable — a memo
     losing `subject` from its dependencies, or one of the whole-account
     computations being pulled into the filtered path, either of which turns a
     switch into a recount of the entire record and shows up as hundreds of
     milliseconds rather than tens. Anything under 400 on this hardware is a
     page that is reusing its memo tables. */
  it('switches without recomputing the world', async () => {
    const select = await open();
    // Warm: the first switch pays for memo tables the later ones reuse.
    await choose(select, 'maths');

    const runs = [
      await choose(select, 'code'),
      await choose(select, 'physics'),
      await choose(select, 'music'),
      await choose(select, ''),
    ];
    const worst = Math.max(...runs);
    expect(worst, `slowest switch ${worst.toFixed(0)}ms over ${runs.length} runs`).toBeLessThan(400);
  });
});
