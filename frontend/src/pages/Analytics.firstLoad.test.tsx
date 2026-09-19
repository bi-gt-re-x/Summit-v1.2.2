/**
 * The analytics page draws once, when everything has arrived.
 *
 * It makes nine calls and reads the preferences and the subject catalogue.
 * It used to open on the first answer and repaint as each of the others
 * landed — eleven paints in a quarter of a second, with panels appearing and
 * the opening sentence rewriting itself under the reader. Here every call
 * answers at a different moment, and the page has to stay on its loading
 * screen until the last one and then paint the finished page.
 */
import { act, screen } from '@testing-library/react';
import { Profiler } from 'react';
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

const later = <T,>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

vi.mock('@/services/taskHistory', () => ({
  taskHistory: () => later(40, { success: true, tasks: seedTasks() }),
  invalidate: () => {},
}));
vi.mock('@/services/growth', async (orig) => ({
  ...(await orig<object>()),
  series: () => later(10, { success: true, growth_data: seedDays() }),
  ratings: () => later(60, { success: true, ...seedRatings() }),
}));
vi.mock('@/services/analytics', async (orig) => ({
  ...(await orig<object>()),
  standing: () => later(80, { success: true, cohort: 40, enough: false, floor: 20, rows: [] }),
  baseline: () => later(100, { success: true, baseline: null }),
  adoptedAdvice: () => later(120, { success: true, adopted: [] }),
  metricHistories: () => later(140, { success: true, histories: {} }),
  metricHistory: () => later(160, { success: true, metric: 'overall', points: seedScoreLog() }),
}));
vi.mock('@/services/goals', async (orig) => ({
  ...(await orig<object>()),
  getGoals: () => later(180, { success: true, goals: seedGoals() }),
}));
vi.mock('@/services/subjects', async (orig) => ({
  ...(await orig<object>()),
  list: () =>
    later(200, {
      success: true,
      subjects: SUBJECTS.map((id) => ({ id, name: id, abbr: null, label: id, icon: '', group: 'Core', used: 3, family: null, custom: false })),
    }),
}));

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
});
afterAll(() => vi.useRealTimers());

describe('the first load', () => {
  it('waits for the last call, then paints the page once', async () => {
    // Every commit, and whether the page's content was on screen after it.
    const commits: boolean[] = [];
    renderWithProviders(
      <Profiler
        id="analytics"
        onRender={() => commits.push(!screen.queryByText(/Reading your history/))}
      >
        <Analytics />
      </Profiler>,
      { route: '/analytics', settings: { prefs: { ...seedPrefs(), analytics_setup_done: true } } },
    );

    // Everything but the catalogue (200ms) has answered: still loading.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(190);
    });
    expect(screen.getByText(/Reading your history/)).toBeInTheDocument();
    expect(commits.some(Boolean)).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(screen.queryByText(/Reading your history/)).toBeNull();
    // Content arrived in one commit, not assembled over several.
    expect(commits.indexOf(true)).toBeGreaterThan(-1);
    expect(commits.filter(Boolean).length).toBeLessThanOrEqual(2);
  }, 30000);
});
