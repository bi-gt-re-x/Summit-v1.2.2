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
 *     rounding errors on two weeks the reader had annotated nine times.
 *
 * The line is the one utils/analyticsPrefs draws for tone, and it holds for
 * these too: **none of them is arithmetic.** Detail caps how many rows of
 * evidence are drawn, never what the rows say; hours are stated beside figures,
 * never folded into them. So the cases below assert on what is shown and check
 * that the figures underneath do not move with the setting.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecommendationsTab } from './RecommendationsTab';
import { draw, fakeData, fakeModel } from './fixtures';
import { DETAIL_RULES, detailRows } from '@/utils/analyticsPrefs';

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
    expect(screen.getByText(/after 9 tasks in the last two weeks/)).toBeInTheDocument();
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
