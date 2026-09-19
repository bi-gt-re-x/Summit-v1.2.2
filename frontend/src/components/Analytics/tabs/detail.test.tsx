/**
 * The three inputs the analytics tabs were not reading, and the line they sit
 * on.
 *
 * `tone.test.tsx` pins harshness. This pins the other three the page collects
 * and then spent, for a while, only on the Overview:
 *
 *   * **how much detail was asked for** — `analytics_detail`, which governed
 *     three booleans about one tab and nothing else. An account set to
 *     Essentials got the full fifteen findings on Insights and every habit card
 *     on Habits.
 *   * **hours logged** — the focus time behind the figures, which appeared as a
 *     tile on the Overview and nowhere else, so the two tabs that talk about
 *     sittings and days worked stated neither a total nor a scale.
 *   * **what gets typed after a task** — the reasons, which reached Insights
 *     and stopped there, while the Recommendations tab printed a sentence about
 *     rounding errors on a fortnight the reader had annotated nine times.
 *
 * The line is the one utils/analyticsPrefs draws for tone, and it holds for
 * these too: **none of them is arithmetic.** Detail caps how many rows of
 * evidence are drawn, never what the rows say; hours are stated beside figures,
 * never folded into them. So the cases below assert on what is shown and check
 * that the figures underneath do not move with the setting.
 */
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HabitsTab } from './HabitsTab';
import { InsightsTab } from './InsightsTab';
import { RecommendationsTab } from './RecommendationsTab';
import { draw, fakeData, fakeModel, subjects } from './fixtures';
import { DETAIL_RULES, TONE_RULES, detailRows } from '@/utils/analyticsPrefs';
import { habitSummary } from '@/utils/habits';
import { NEED_DAYS } from '../useAnalyticsModel';
import type { AnalyticsModel } from '../useAnalyticsModel';
import type { Habit } from '@/utils/habits';

const habit = (name: string): Habit =>
  ({ id: name, name, consistency: 80, strength: 'strong', trend: null, cadence: 'weekly',
     source: 'routine', unit: 'week', streak: 3, bestStreak: 5, frequency: 2,
     completionRate: 80, lastCompleted: '2026-08-01', firstSeen: '2026-01-01',
     weekly: [1, 2, 2, 3], phases: [1, 2, 2, 3], total: 40 }) as unknown as Habit;

/** More habits than the widest setting draws, so every cap bites. */
const HABITS = Array.from({ length: 14 }, (_, i) => habit(`Routine ${i}`));

function habitsModel(detail: keyof typeof DETAIL_RULES, hours = 0): AnalyticsModel {
  return fakeModel({
    historyDays: 400,
    waitFor: () => 0,
    habits: HABITS,
    summary: { ...habitSummary([], []), tracked: HABITS.length, strong: 3, activeRate: 64 },
    detail: DETAIL_RULES[detail],
    figures: {
      ...fakeModel().figures,
      focusHours: { value: hours, delta: null, previous: 0 },
    },
  } as Partial<AnalyticsModel>);
}

describe('Habits reads how much detail was asked for', () => {
  it('draws fewer habit cards on essentials than on everything', () => {
    const counts = (['essentials', 'standard', 'everything'] as const).map((level) => {
      const { container, unmount } = draw(
        <HabitsTab model={habitsModel(level)} subjects={subjects} />,
      );
      const drawn = container.querySelectorAll('.ax-habit').length;
      unmount();
      return drawn;
    });

    // Strictly increasing, and every one of them a real cap on fourteen.
    expect(counts[0]).toBeLessThan(counts[1]!);
    expect(counts[1]).toBeLessThan(counts[2]!);
    expect(counts[2]).toBeLessThan(HABITS.length);
  });

  it('never draws fewer than four, however short a page was asked for', () => {
    // A tab called Habits that draws one card on an account with fourteen is
    // not a shorter page, it is a broken one.
    const { container } = draw(
      <HabitsTab model={habitsModel('essentials')} subjects={subjects} />,
    );
    expect(container.querySelectorAll('.ax-habit').length).toBeGreaterThanOrEqual(4);
  });

  it('counts the same habits at every setting — the cap is what is drawn', () => {
    // The figure the tiles print is the whole set, not the drawn subset. A
    // detail setting that moved it would be the bug this whole design avoids.
    (['essentials', 'standard', 'everything'] as const).forEach((level) => {
      const { container, unmount } = draw(
        <HabitsTab model={habitsModel(level)} subjects={subjects} />,
      );
      const tiles = container.querySelector('.ax-tiles') as HTMLElement;
      expect(within(tiles).getByText(String(HABITS.length))).toBeInTheDocument();
      unmount();
    });
  });
});

describe('Habits states the hours behind the days', () => {
  it('puts the logged total under the days-worked rate', () => {
    draw(<HabitsTab model={habitsModel('standard', 41.4)} subjects={subjects} />);
    expect(screen.getByText(/of this range · 41h logged/)).toBeInTheDocument();
  });

  it('says only what it knows when no sessions were logged', () => {
    // Nothing logged is not "0h logged" — it is an account that does not log,
    // and inventing a zero would read as a finding about a quiet month.
    draw(<HabitsTab model={habitsModel('standard', 0)} subjects={subjects} />);
    expect(screen.getByText('of this range')).toBeInTheDocument();
    expect(screen.queryByText(/0h logged/)).not.toBeInTheDocument();
  });
});

function insightsModel(over: Partial<AnalyticsModel> = {}): AnalyticsModel {
  const finding = (id: string) =>
    ({ id, title: `finding ${id}`, detail: 'detail', tone: 'violet' }) as never;
  return fakeModel({
    historyDays: 400,
    waitFor: () => 0,
    /* `WhyPanel` and `HowPanel` draw a `Waiting` notice instead of their list
       until the window itself is long enough — `unlock` reads this length, not
       `historyDays`. An empty slice would test the notice, not the cap. */
    slice: { current: Array.from({ length: NEED_DAYS.insights }, () => ({}) as never), previous: [] },
    why: Array.from({ length: 9 }, (_, i) => finding(`w${i}`)),
    how: Array.from({ length: 9 }, (_, i) => finding(`h${i}`)),
    ...over,
  });
}

describe('Insights reads the harshness setting it used to ignore', () => {
  it('leads with what is working only when asked to', () => {
    // Both panels are drawn either way. This is the order, which is the only
    // thing tone is ever allowed to move.
    const order = (tone: keyof typeof TONE_RULES) => {
      const { container, unmount } = draw(
        <InsightsTab model={insightsModel({ toneRules: TONE_RULES[tone] })} />,
      );
      const heads = [...container.querySelectorAll('.ax-panel-title')].map((h) => h.textContent);
      unmount();
      return heads.filter((t) => /You, right now|working right now/.test(t ?? ''));
    };

    expect(order('gentle')[0]).toMatch(/working right now/);
    expect(order('harsh')[0]).toMatch(/You, right now/);
    // Both present at both settings — nothing is hidden by the ordering.
    expect(order('gentle')).toHaveLength(2);
    expect(order('harsh')).toHaveLength(2);
  });

  it('caps its findings by whichever of tone and detail is tighter', () => {
    // A reader who asks for a blunt page *and* a short one should get a short
    // blunt page, not the larger of the two numbers.
    const { container } = draw(
      <InsightsTab
        model={insightsModel({
          toneRules: TONE_RULES.harsh, // 8 diagnoses
          detail: DETAIL_RULES.essentials, // 3 rows
        })}
      />,
    );
    const why = container.querySelector('.ax-findings');
    expect(within(why as HTMLElement).getAllByRole('listitem').length).toBeLessThanOrEqual(3);
  });
});

describe('Recommendations reads what you type after a task', () => {
  const reasons = {
    struggle: [
      { key: 'distracted', label: 'Distracted', phrase: 'distracted', side: 'struggle', count: 9, share: 60 },
      { key: 'tired', label: 'Tired', phrase: 'tired', side: 'struggle', count: 3, share: 20 },
    ],
    wentWell: [],
    answered: 12,
    struggled: 12,
    succeeded: 0,
  } as never;

  it('names the reported obstacle when the arithmetic found nothing', () => {
    draw(
      <RecommendationsTab
        model={fakeModel({ historyDays: 400, waitFor: () => 0, shownDiagnoses: [], reasons })}
        data={fakeData()}
      />,
    );
    expect(screen.getByText(/You reported/)).toBeInTheDocument();
    expect(screen.getByText('distracted')).toBeInTheDocument();
    expect(screen.getByText(/after 9 tasks this fortnight/)).toBeInTheDocument();
  });

  it('says nothing extra when the reader answers that question about nothing', () => {
    // rating_depth 'none', or simply nobody answering. An empty diagnosis is
    // still a real finding; it just has no annotation to add to it.
    draw(
      <RecommendationsTab
        model={fakeModel({ historyDays: 400, waitFor: () => 0, shownDiagnoses: [] })}
        data={fakeData()}
      />,
    );
    expect(screen.queryByText(/You reported/)).not.toBeInTheDocument();
  });
});

describe('detailRows', () => {
  it('rises with the setting and respects a caller ceiling', () => {
    expect(detailRows('essentials')).toBeLessThan(detailRows('standard'));
    expect(detailRows('standard')).toBeLessThan(detailRows('everything'));
    // A caller that cannot usefully draw more than four says so, and the
    // ceiling holds at every setting.
    expect(detailRows('everything', 4)).toBe(4);
    expect(detailRows('essentials', 4)).toBe(DETAIL_RULES.essentials.rows);
  });

  it('falls back to standard on an unset preference', () => {
    expect(detailRows(undefined)).toBe(DETAIL_RULES.standard.rows);
  });
});
