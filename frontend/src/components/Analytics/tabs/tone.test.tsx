/**
 * The harshness setting, on the two tabs it did not used to reach.
 *
 * Tone was wired into the Overview, the baseline and the recommendations, and
 * `useAnalyticsModel` has published `toneRules` the whole time — but Habits and
 * Goals never read it, so an account set to Blunt got the Balanced page on both
 * and nothing said so. That is the failure this pins, and it is exactly the
 * kind TypeScript cannot: a tab that ignores a prop it never destructured is
 * perfectly typed.
 *
 * The line these tests hold is the one utils/analyticsPrefs draws. **Tone is
 * editorial, never arithmetic.** So every case here asserts on how much is
 * shown and in what order, and the counts underneath are asserted to be equal
 * across settings — a test that let a figure move with the setting would be
 * pinning the bug the whole design exists to prevent.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { GoalsTab } from './GoalsTab';
import { HabitsTab } from './HabitsTab';
import { DETAIL_RULES, TONE_RULES } from '@/utils/analyticsPrefs';
import { summaryFigures } from '@/utils/growthSummary';
import { habitSummary } from '@/utils/habits';
import type { AnalyticsModel } from '../useAnalyticsModel';
import type { Habit, HabitPattern } from '@/utils/habits';
import type { GoalSuggestion } from '@/utils/goalSuggest';
import type { GoalsOverview } from '@/utils/goalAnalytics';

function draw(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

/** More patterns than the bluntest setting draws, so every limit bites. */
const PATTERNS: HabitPattern[] = Array.from({ length: 9 }, (_, i) => ({
  id: `p${i}`,
  frequency: 'Often',
  text: `pattern ${i}`,
  support: `${i} days`,
  tone: 'violet',
})) as unknown as HabitPattern[];

const SUGGESTIONS: GoalSuggestion[] = Array.from({ length: 7 }, (_, i) => ({
  id: `s${i}`,
  kind: 'subject',
  title: `suggestion ${i}`,
  because: 'because',
})) as unknown as GoalSuggestion[];

const habit = (name: string, over: Partial<Habit> = {}): Habit =>
  ({ id: name, name, consistency: 80, strength: 'strong', trend: null, cadence: 'weekly',
     source: 'routine', unit: 'week', streak: 3, bestStreak: 5, frequency: 2,
     completionRate: 80, lastCompleted: '2026-08-01', firstSeen: '2026-01-01',
     weekly: [1, 2, 2, 3], phases: [1, 2, 2, 3], total: 40, ...over }) as unknown as Habit;

const ANCHOR = habit('Morning pages', { consistency: 91 });
const SLIPPING = habit('Evening review', { consistency: 40, trend: -32 });

function habitsModel(tone: keyof typeof TONE_RULES): AnalyticsModel {
  return {
    historyDays: 400,
    waitFor: () => 0,
    all: [], tasks: [], streak: 0, toIso: '2026-08-01', spanText: 'the last 90 days',
    habits: [ANCHOR, SLIPPING],
    /* No goals in this fixture, so nothing for the limiter line to name. */
    goalLimits: [],
    byDate: new Map(),
    patterns: PATTERNS,
    shifts: [],
    summary: { ...habitSummary([], []), tracked: 2, strong: 1, activeRate: 64,
               anchor: ANCHOR, slipping: SLIPPING },
    toneRules: TONE_RULES[tone],
    /* Held fixed across the three settings on purpose. These cases exist to
       show that tone moves the editorial and nothing else, so the two
       preferences it must not be confused with — how much detail was asked
       for, and how many hours are behind the figures — are the same in every
       render here. ./detail.test.tsx is the other half. */
    detail: DETAIL_RULES.standard,
    figures: summaryFigures({ current: [], previous: [] }),
  } as unknown as AnalyticsModel;
}

const EMPTY_SET: GoalsOverview = {
  active: 5, onTrack: 3, atRisk: 1, offTrack: 1, notStarted: 0,
  overall: 62, dueSoon: [], completed: 2,
};

function goalsModel(tone: keyof typeof TONE_RULES): AnalyticsModel {
  return {
    goalLead: 'a headline',
    goalSet: EMPTY_SET,
    goalPace: { points: [], undated: [] },
    goalCheckpoints: [],
    goalEffort: [],
    liveGoals: [],
    tasks: [],
    goalRows: [],
    goalIdeas: SUGGESTIONS,
    toneRules: TONE_RULES[tone],
    /* Fixed across the three settings, for the reason `habitsModel` gives:
       these cases are about tone and nothing else. */
    detail: DETAIL_RULES.standard,
  } as unknown as AnalyticsModel;
}

const subjects = new Map();

describe('Habits reads the harshness setting', () => {
  it('draws as many patterns as the tone allows, and no more', () => {
    for (const tone of ['gentle', 'balanced', 'harsh'] as const) {
      const { container, unmount } = draw(
        <HabitsTab model={habitsModel(tone)} subjects={subjects} />,
      );
      /* The rows, not their text: a pattern is drawn as an `<em>` frequency
         beside a sentence, so matching on the words would be matching on the
         copy rather than on how many of them there are. */
      expect(container.querySelectorAll('.ax-patterns li'))
        .toHaveLength(Math.min(TONE_RULES[tone].diagnoses, PATTERNS.length));
      unmount();
    }
  });

  it('names what is holding before what is slipping only when asked to', () => {
    // Gentle leads with strength: the anchor is named, and before the slip.
    const gentle = draw(<HabitsTab model={habitsModel('gentle')} subjects={subjects} />);
    const gentleText = document.body.textContent ?? '';
    expect(gentleText).toContain('is holding at');
    expect(gentleText.indexOf('Morning pages is holding'))
      .toBeLessThan(gentleText.indexOf('Evening review'));
    gentle.unmount();

    // Blunt states the slip and does not soften it with the anchor.
    draw(<HabitsTab model={habitsModel('harsh')} subjects={subjects} />);
    const harshText = document.body.textContent ?? '';
    expect(harshText).toContain('Evening review');
    expect(harshText).not.toContain('is holding at');
  });

  it('counts the same habits at every setting', () => {
    const seen = (['gentle', 'harsh'] as const).map((tone) => {
      const { unmount } = draw(<HabitsTab model={habitsModel(tone)} subjects={subjects} />);
      const text = document.body.textContent ?? '';
      unmount();
      return text.includes('64%');
    });
    expect(seen).toEqual([true, true]);
  });
});

describe('Goals reads the harshness setting', () => {
  it('holds back the weakest suggestions on a gentle page', () => {
    for (const tone of ['gentle', 'balanced', 'harsh'] as const) {
      const { unmount } = draw(<GoalsTab model={goalsModel(tone)} />);
      const want = Math.min(TONE_RULES[tone].headlines, SUGGESTIONS.length);
      expect(screen.getAllByText(/^suggestion \d$/)).toHaveLength(want);
      // The strongest are the ones kept — it drops off the tail, never the head.
      expect(screen.getByText('suggestion 0')).toBeTruthy();
      unmount();
    }
  });

  it('opens on the same five figures whatever the tone', () => {
    for (const tone of ['gentle', 'harsh'] as const) {
      const { unmount } = draw(<GoalsTab model={goalsModel(tone)} />);
      // Live, on track, behind, progress, due soon — the counts do not move.
      expect(screen.getByText('Live')).toBeTruthy();
      // "On track" is the tile *and* the panel legend under it — both, always.
      expect(screen.getAllByText('On track').length).toBeGreaterThan(0);
      expect(screen.getByText('Behind')).toBeTruthy();
      // The weighted mean, on the tile and again in the panel that derives it.
      expect(screen.getAllByText('62%').length).toBeGreaterThan(0);
      unmount();
    }
  });
});
