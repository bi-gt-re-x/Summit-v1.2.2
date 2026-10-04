/**
 * The model, driven end to end over a whole account.
 *
 * Every other test around this page checks one function or one tab. The
 * assembly between them — seventy-nine memos, two windows that deliberately
 * differ, a subject filter that narrows some figures and must not narrow others
 * — had nothing on it, and it is where the failure that matters lives: not a
 * panel that crashes, which anybody notices, but a panel that confidently
 * states a wrong number, which nobody does.
 *
 * So these assert *values*, not renders. Each one is a figure a reader can see
 * on the page, checked against arithmetic done here rather than against the
 * model's own output — see ../../test/seed for the two rules the account is
 * built from and why they were chosen to make that possible.
 *
 * The hook is rendered rather than called: it holds state (the window, the
 * subject, the budget) and half the point is what happens when those move.
 */
import { act, renderHook } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useAnalyticsModel } from './useAnalyticsModel';
import { SettingsContext } from '@/context/contexts';
import type { SettingsValue } from '@/context/contexts';
import type { AnalyticsData } from './useAnalyticsData';
import type { SubjectIndex } from '@/hooks/useSubjects';
import type { Subject } from '@/services/subjects';
import { NO_PLAN } from '@/services/next';
import {
  AFTER,
  BEFORE,
  FINISHED,
  PER_DAY,
  SUBJECTS,
  TODAY,
  TOTAL,
  activeBetween,
  dayAt,
  seedDays,
  seedGoals,
  seedPrefs,
  seedRatings,
  seedScoreLog,
  seedTasks,
} from '@/test/seed';

/*
 * The clock, held at the seed's last day.
 *
 * `since` reads today off `isoDate()` rather than off the series, deliberately
 * — see the note on that memo. That is right for the page and it means a test
 * over a fixed account has to fix the clock too, or these assertions start
 * failing tomorrow for a reason that has nothing to do with the model.
 */
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
});
afterAll(() => vi.useRealTimers());

// --------------------------------------------------------------------------
// Driving the real hook
// --------------------------------------------------------------------------
const subjects: SubjectIndex = new Map(
  SUBJECTS.map((id, index) => [
    id,
    {
      id,
      name: id === 'code' ? 'Computer Science' : id,
      abbr: null,
      label: id,
      icon: '',
      group: 'Core',
      used: 10 + index,
      family: null,
      custom: false,
    } as Subject,
  ]),
);

/** A `useApi` result that has already answered. */
const answered = <T,>(data: T) => ({
  data,
  error: null,
  loading: false,
  refreshing: false,
  reload: () => {},
  mutate: () => {},
});

function seedData(): AnalyticsData {
  return {
    stats: { stats: { current_streak: 4, best_streak: 11 }, username: 'seed' },
    tasks: answered({ tasks: seedTasks() }),
    series: answered({ growth_data: seedDays() }),
    ratings: answered(seedRatings()),
    goals: answered({ goals: seedGoals() }),
    scoreLog: answered({ metric: 'overall', points: seedScoreLog() }),
    gradedLog: answered({ histories: {} }),
    adopted: answered({ adopted: [] }),
    baseline: answered({ baseline: null }),
    // The plan is decided on the server; see backend/tracking/next_actions.py.
    next: answered({ plan: NO_PLAN, lens: null }),
    setBudget: () => {},
    setNudge: () => {},
    nudge: 0,
    username: 'seed',
  } as unknown as AnalyticsData;
}

function drive(prefs = seedPrefs()) {
  const settings = {
    prefs,
    ready: true,
    update: async () => {},
    dailyGoal: 200,
    displayName: 'Seed',
    loading: false,
    error: null,
    reload: () => {},
  } as unknown as SettingsValue;

  return renderHook(() => useAnalyticsModel(seedData(), subjects), {
    wrapper: ({ children }) => (
      <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>
    ),
  });
}

// The two windows the seed is built around, counted here rather than read off
// the model. `sliceWindow` counts back from the end, so a 1y window over 750
// days is indices 385..749 and its previous is 20..384.
const CURRENT_FROM = TOTAL - 365;
const CURRENT_ACTIVE = activeBetween(CURRENT_FROM, TOTAL);
const PREVIOUS_ACTIVE = activeBetween(CURRENT_FROM - 365, CURRENT_FROM);

describe('the window', () => {
  it('opens on the account\'s preference and slices it as an equal pair', () => {
    const { result } = drive();
    expect(result.current.span).toBe('1y');
    expect(result.current.slice.current).toHaveLength(365);
    // Equal length, or every "vs previous" figure reports the difference in
    // length as a change in behaviour.
    expect(result.current.slice.previous).toHaveLength(365);
    expect(result.current.fromIso).toBe(dayAt(CURRENT_FROM));
    expect(result.current.toIso).toBe(dayAt(TOTAL - 1));
  });

  it('moves every figure when the picker moves, in step', () => {
    const { result } = drive();
    const before = result.current.figures.xp.value;

    act(() => result.current.chooseSpan('90d'));

    expect(result.current.slice.current).toHaveLength(90);
    expect(result.current.figures.xp.value).toBeLessThan(before);
    // The window and the sentence about it cannot disagree.
    expect(result.current.spanText).toContain('2026');
  });
});

describe('the figures', () => {
  it('states the XP the day series actually holds', () => {
    const { result } = drive();
    // Every active day in the window is after the step, so all of them earn
    // AFTER. That is the whole year, and it is checkable by hand.
    expect(result.current.figures.xp.value).toBe(CURRENT_ACTIVE * AFTER);
  });

  it('counts the finished tasks, not the days', () => {
    const { result } = drive();
    expect(result.current.figures.tasks.value).toBe(CURRENT_ACTIVE * PER_DAY);
  });

  it('reports the step up against the previous period rather than a flat line', () => {
    const { result } = drive();
    /* The one assertion a flat account could not make. Before the step an
       active day earned BEFORE and after it AFTER, over the same number of
       active days either side — so the change is exactly the ratio. */
    expect(PREVIOUS_ACTIVE).toBe(CURRENT_ACTIVE);
    const expected = Math.round((AFTER / BEFORE - 1) * 100);
    expect(result.current.figures.xp.delta).toBe(expected);
  });

  it('reads consistency off four days in five', () => {
    const { result } = drive();
    expect(result.current.rhythmRate.rate).toBe(80);
  });
});

describe('the subject filter', () => {
  it('narrows what counts tasks', () => {
    const { result } = drive();
    const all = result.current.breakdown.rows.reduce((sum, row) => sum + row.xp, 0);

    act(() => result.current.setSubject('maths'));

    const one = result.current.breakdown.rows.reduce((sum, row) => sum + row.xp, 0);
    expect(one).toBeGreaterThan(0);
    expect(one).toBeLessThan(all);
    // Four subjects, round robin over an even number of tasks a day.
    expect(one).toBeCloseTo(all / SUBJECTS.length, -1);
  });

  it('leaves the day-series figures alone, because XP is not recorded per subject', () => {
    const { result } = drive();
    const xp = result.current.figures.xp.value;
    const days = result.current.rhythmRate.rate;

    act(() => result.current.setSubject('maths'));

    /* The comment on `bySubject` promises exactly this: the filter narrows the
       tasks a panel counts and nothing else, because XP and focus minutes are
       recorded per day. A model that quietly filtered the series here would
       show a quarter of the XP under a filter the reader thinks is cosmetic. */
    expect(result.current.figures.xp.value).toBe(xp);
    expect(result.current.rhythmRate.rate).toBe(days);
  });
});

describe('the two windows', () => {
  it('keeps the advice window off the picker', () => {
    const { result } = drive();
    const recent = result.current.recent.fromIso;

    act(() => result.current.chooseSpan('7d'));

    /* The single most surprising thing in the model, and the one most likely
       to be "fixed" by somebody tidying up: the advice half deliberately reads
       a fixed recent window rather than the picker, so that pressing 7D cannot
       change what the page recommends. */
    expect(result.current.recent.fromIso).toBe(recent);
  });
});

describe('the gates', () => {
  it('opens all three on an account with two years of record', () => {
    const { result } = drive();
    expect(result.current.waitFor('habits')).toBe(0);
    expect(result.current.waitFor('insights')).toBe(0);
    expect(result.current.waitFor('recommendations')).toBe(0);
    /* Days with work on them, not rows in the series — which is the honest
       measure for a gate: an account that opened the app daily and did nothing
       has not earned the Habits tab. Four in five, over the whole record. */
    expect(result.current.historyDays).toBe(activeBetween(0, TOTAL));
  });
});

describe('the score', () => {
  it('prints the report card at both of its scales without disagreeing', () => {
    const { result } = drive();
    // `growthScore` is out of ten and `analyticalScore` out of a hundred, and
    // they are one calculation shown twice. Ten times one is the other.
    expect(result.current.analytical.value).toBeCloseTo(result.current.score! * 10, 0);
  });
});

describe('the tasks', () => {
  it('takes the whole record, not the window', () => {
    const { result } = drive();
    // Several panels are unscoped by the picker on purpose — the habit history
    // and the goal-aimed share both look at everything.
    expect(result.current.tasks.filter((task) => task.status === 'done')).toHaveLength(FINISHED);
  });

  it('names a subject through the index rather than printing its id', () => {
    const { result } = drive();
    expect(result.current.nameOf('code')).toBe('Computer Science');
  });
});

describe('what the tabs are handed', () => {
  it('fills every tab that this account has the record for', () => {
    const { result } = drive();
    const m = result.current;
    // Not an assertion about any one figure — an assertion that the assembly
    // produced something for each tab, which is the failure a fixture-driven
    // tab test cannot see.
    expect(m.habits.length).toBeGreaterThan(0);
    expect(m.breakdown.rows.length).toBe(SUBJECTS.length);
    expect(m.week.stats).toHaveLength(7);
    expect(m.clock.hours).toHaveLength(24);
    expect(m.liveGoals).toHaveLength(2);
    expect(m.advice.length).toBeGreaterThan(0);
  });

  it('honours the detail preference the account chose', () => {
    /* `detail` is the resolved rules rather than the stored word — which is the
       thing worth pinning, because a preference that reached the model and then
       resolved to the same rules either way would be a setting that does
       nothing, and this page's rule is that every question it asks changes
       something. */
    const brief = drive(seedPrefs({ analytics_detail: 'essentials' })).result.current.detail;
    const all = drive(seedPrefs({ analytics_detail: 'everything' })).result.current.detail;
    expect(brief).not.toEqual(all);
    expect(Object.values(all).filter(Boolean).length).toBeGreaterThan(
      Object.values(brief).filter(Boolean).length,
    );
  });
});
