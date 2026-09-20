/**
 * The fake model the tab tests are driven from.
 *
 * Lifted out of gates.test.tsx when a second suite needed it. The tabs are
 * presentation — they read figures and lay them out — so what is worth pinning
 * is what they do with a *given* set of figures, and building the real model
 * would mean fabricating a year of day series to move one number.
 *
 * Not a `.test.` file: it holds no cases, and naming it one would have vitest
 * collect it and report a file with nothing in it.
 */
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { ReactElement } from 'react';
import { NEED_DAYS } from '../useAnalyticsModel';
import { dataMaturity } from '@/utils/dataMaturity';
import { consistency } from '../data';
import { TONE_RULES } from '@/utils/analyticsPrefs';
import { balanceShape, clockShape, rhythmShape, weekShape } from '@/utils/behaviour';
import { habitSummary } from '@/utils/habits';
import { currentState } from '@/utils/insight';
import { summariseRatings, summariseReasons } from '@/utils/ratings';
import { summaryFigures } from '@/utils/growthSummary';
import { DETAIL_RULES } from '@/utils/analyticsPrefs';
import { goalsOverview } from '@/utils/goalAnalytics';
import { checkpointsByMonth, effortAgainstPriority, paceMap } from '@/utils/goalSuggest';
import { goalWork, linkCoverage } from '@/utils/goalWork';
import type { AnalyticsData } from '../useAnalyticsData';
import type { AnalyticsModel } from '../useAnalyticsModel';

/** Subject id to display name. The tests use ids as names. */
export const nameOf = (id: string) => id;

/*
 * The empty shapes come from the real constructors rather than from literals.
 *
 * `weekShape([])` is what the page hands these panels on an account with no
 * record, so it is the honest empty value — and, unlike a hand-written object,
 * it cannot fall out of step with the type when a field is added to it.
 */
const EMPTY = {
  week: weekShape([]),
  clock: clockShape([]),
  rhythm: rhythmShape([]),
  balance: balanceShape([], nameOf, '', ''),
  qualitySummary: summariseRatings([], '', ''),
  reasons: summariseReasons([], '', ''),
};

/**
 * A model with every figure empty, and the gates open.
 *
 * `historyDays` is the one knob most of these tests turn. `waitFor` is derived
 * from it here exactly as the real model derives it, so a test that sets
 * `historyDays` gets a consistent answer from both.
 */
export function fakeModel(over: Partial<AnalyticsModel> = {}): AnalyticsModel {
  const historyDays = over.historyDays ?? 400;
  const base = {
    historyDays,
    waitFor: (key: keyof typeof NEED_DAYS) => Math.max(0, NEED_DAYS[key] - historyDays),
    streak: 0,
    /* Derived from `historyDays` exactly as the real model derives it, so a
       test that sets one gets a consistent answer from both — the same rule
       `waitFor` above follows. `spanDays` equal to the active count is the
       honest default here: these fixtures carry no day series, so there are no
       unworked days to claim. */
    maturity: dataMaturity([]),
    /* No tasks in the fixture, so there is nothing to observe. A test that
       wants a finding on a building tab passes one in. */
    observed: [],
    all: [],
    tasks: [],
    slice: { current: [], previous: [] },
    toIso: '2026-08-01',
    spanText: 'the last 90 days',
    span: '90',
    // The year of days, and the rate drawn over it. From the real constructor
    // rather than a literal, for the reason the note above `EMPTY` gives: this
    // is what the page hands the panel on an account with no record, and it
    // cannot fall out of step with the type when a field is added.
    heatRows: [],
    rhythmRate: consistency({ current: [], previous: [] }),
    // Habits
    habits: [],
    byDate: new Map(),
    patterns: [],
    shifts: [],
    summary: habitSummary([], []),
    // Insights
    ...EMPTY,
    why: [], how: [], wins: [], links: [],
    state: currentState([], EMPTY.rhythm, EMPTY.week, EMPTY.balance),
    insights: [], discovered: [], rated: [],
    reasonRows: [], ratingDepth: 'ratings',
    breakdown: { rows: [], total: 0 }, previousBySubject: new Map(),
    aimedShare: null,
    // Recommendations
    advice: [], shown: [], projection: {}, plan: { actions: [], budget: 60 },
    diagnoses: [], recent: { current: [], previous: [] }, weekLeft: 3,
    reviews: [], reviewSummary: {}, adoptedIds: new Set(), goalAdvice: [],
    category: '', setCategory: vi.fn(), setBudget: vi.fn(), setNudge: vi.fn(),
    // Goals. From the real constructors over an empty set, for the reason
    // `EMPTY` gives: a hand-written object falls out of step with the type the
    // moment a field is added to it.
    liveGoals: [],
    goalSet: goalsOverview([], []),
    goalPace: paceMap([], () => 'on-track'),
    goalEffort: effortAgainstPriority([], []),
    goalCheckpoints: checkpointsByMonth([]),
    goalWorkRows: goalWork([], []),
    goalCoverage: linkCoverage([]),
    goalRows: [],
    /* No goals and no tasks, so no goal has a shortfall to attribute. A test
       that wants a limiter on a tab passes one in. */
    goalLimits: [],
    goalIdeas: [],
    goalLead: 'No goals yet.',
    // Subjects
    namedSubjects: { total: 0, named: 0 },
    /* The real model sets these on every render — `useAnalyticsModel` derives
       each from a stored preference and both helpers fall back to the middle
       setting — so a fake without them is a fake of a model that cannot exist.
       It went unnoticed for `toneRules` while no tab here read it, and then
       again for `detail` when Habits, Insights and Recommendations started
       reading that too. See ./tone.test.tsx and ./detail.test.tsx. */
    toneRules: TONE_RULES.balanced,
    detail: DETAIL_RULES.standard,
    /* The figures every tab now reaches into for hours logged. From the real
       builder over an empty slice, for the reason `EMPTY` gives. */
    figures: summaryFigures({ current: [], previous: [] }),
  };
  return { ...base, ...over } as unknown as AnalyticsModel;
}

export function fakeData(): AnalyticsData {
  return {
    goals: { data: { goals: [] }, loading: false },
    /* OverviewTab reads all four. Every use is optional-chained, so `null`
       data is the honest "the call has not come back" rather than a shape.

       `stats` is the provider's shape and not `useApi`'s — it carries the
       numbers under `stats.stats` rather than under `.data`, because the
       account's figures are read once near the root and shared. See
       context/StatsProvider. */
    stats: { stats: null, loading: false, username: 'test' },
    tasks: { data: null, loading: false },
    baseline: { data: null, loading: false },
    standing: { data: null, loading: false },
    adopt: vi.fn(),
    adopting: null,
    justAdopted: null,
    dropAdopted: vi.fn(),
    dropping: null,
    refresh: vi.fn(),
  } as unknown as AnalyticsData;
}

export const subjects = new Map();

export function draw(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

/**
 * A mature account: past every gate, with quality, tallies and extras on.
 *
 * `maturity.stage` is 'full' so OverviewTab takes its long branch rather than
 * the Collecting one. Everything the Overview is worth testing lives on that
 * branch — the panel groups, and the goal line under them — and the default
 * `fakeModel` above is an account on its first week, which takes the other.
 *
 * Here rather than in one of the suites for the reason this whole file exists:
 * it was local to ./groups.test.tsx until ./limiter.test.tsx needed the same
 * mature account, and two copies of a thirty-line fixture drift the first time
 * one of them is edited.
 */
export function matureOverview() {
  return fakeModel({
    historyDays: 400,
    maturity: {
      stage: 'full',
      activeDays: 120,
      spanDays: 400,
      next: null,
      toNext: null,
      progress: 1,
      lastActive: '2026-08-01',
      /* Current, so the away notice stays off this fixture — it is about the
         panel groups, not about somebody who stopped. */
      quietDays: 0,
    },
    detail: { quality: true, tallies: true, extras: true, rows: 12 },
    logStyle: 'tasks',
    showStanding: true,
    /* From the real builder over an empty slice, for the reason ./fixtures
       gives: `Tiles` reads eight fields off this and a hand-written three
       fails on the fourth. */
    figures: summaryFigures({ current: [], previous: [] }),
    rhythmRate: { rate: 0.5, previousRate: 0.4, bestMonth: null },
    card: { value: 8, factors: [] },
    score: 8,
    scoreLine: [],
    scoreMarks: [],
    heatRows: [],
    sparks: { xp: [], tasks: [], focusHours: [], consistency: [], quality: [] },
    ratingRows: [],
    ratingBands: [],
    ratingGrid: [],
    compareLabel: 'the 90 days before',
    previousSpanText: 'the 90 days before',
    grain: 'weekly',
    metric: 'tasks',
    fromIso: '2026-05-01',
  });
}
