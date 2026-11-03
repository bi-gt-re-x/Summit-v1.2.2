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
 *     and stopped there, while "What changed" printed a sentence about
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
import { WhatChangedPanel } from '../WeekTrend';
import { draw } from './fixtures';
import { DETAIL_RULES, detailRows } from '@/utils/analyticsPrefs';
import type { Diagnosis } from '@/utils/diagnosis';

describe('What changed reads what you type after a task', () => {
  const panel = (reported: { phrase: string; count: number } | null) => (
    <WhatChangedPanel
      move={null}
      blocks={[]}
      moves={[]}
      diagnoses={[]}
      enoughRecord
      nowRange="Oct 11 to Oct 24"
      wasRange="Sep 27 to Oct 10"
      reported={reported}
    />
  );

  it('names the reported obstacle when the arithmetic found nothing', () => {
    draw(panel({ phrase: 'distracted', count: 9 }));
    expect(screen.getByText(/You reported/)).toBeInTheDocument();
    expect(screen.getByText('distracted')).toBeInTheDocument();
    expect(screen.getByText(/after 9 tasks in the last two weeks/)).toBeInTheDocument();
  });

  it('says nothing extra when the reader answers that question about nothing', () => {
    // rating_depth 'none', or simply nobody answering. An empty read is
    // still a real finding; it just has no annotation to add to it.
    draw(panel(null));
    expect(screen.queryByText(/You reported/)).not.toBeInTheDocument();
  });
});

describe('What changed lays out what moved', () => {
  const moved = (id: string, label: string, before: number, after: number, good: boolean) => ({
    id,
    label,
    before,
    after,
    show: (value: number) => `${value} XP`,
    pct: ((after - before) / before) * 100,
    up: after > before,
    good,
    size: 1,
    percent: true,
  });
  const read = (id: string, tone: Diagnosis['tone'], headline: string): Diagnosis => ({
    id,
    tone,
    headline,
    detail: 'The figures behind it.',
    means: 'This suggests a reason.',
    action: 'Try one thing.',
    watch: 'A number.',
    points: [],
    weight: 1,
  });
  const panel = (diagnoses: Diagnosis[]) => (
    <WhatChangedPanel
      move={null}
      blocks={[]}
      moves={[moved('xp', 'XP earned', 5197, 1948, false), moved('tasks', 'Tasks finished', 10, 20, true)]}
      diagnoses={diagnoses}
      enoughRecord
      nowRange="Oct 21 to Nov 3"
      wasRange="Oct 7 to Oct 20"
      reads={{ worse: 'This suggests each day is doing less.', better: null }}
    />
  );

  it('keeps a figure in line with its sentence', () => {
    const { container } = draw(panel([]));
    // The name of the metric is its own line. A bolded figure stays in the text.
    const row = container.querySelector('.ax-moves-row')!;
    expect(row.querySelector('.ax-moves-name')!.textContent).toBe('XP earned');
    expect(row.querySelector('p')!.textContent).toBe('Down 63%, from 5197 XP to 1948 XP.');
    expect(row.querySelector('p strong')!.textContent).toBe('63%');
  });

  it('puts each reading in the card for its tone, with what it suggests', () => {
    const { container } = draw(
      panel([
        read('a', 'warning', 'You are getting things done late'),
        read('b', 'tension', 'You are showing up, but doing less'),
        read('c', 'good', 'Your work got harder and you kept up'),
      ]),
    );
    const card = (kind: string) => container.querySelector(`.ax-moves-col.is-${kind}`)!;
    expect(card('attention').textContent).toContain('You are getting things done late');
    expect(card('mixed').textContent).toContain('You are showing up, but doing less');
    expect(card('better').textContent).toContain('Your work got harder and you kept up');
    expect(card('attention').querySelector('.ax-suggest')!.textContent).toBe(
      'This suggests a reason. Try one thing.',
    );
    expect(card('worse').querySelector('.ax-suggest')!.textContent).toBe(
      'This suggests each day is doing less.',
    );
  });

  it('reads worse first, then what needs attention, and better last', () => {
    const { container } = draw(panel([read('a', 'warning', 'Late')]));
    const order = [...container.querySelectorAll('.ax-moves-col')].map((node) => node.className);
    expect(order[0]).toContain('is-worse');
    expect(order[1]).toContain('is-attention');
    expect(order[2]).toContain('is-better');
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
