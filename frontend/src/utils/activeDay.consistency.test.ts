/**
 * Consistency is one number: the tile, the chart, the heatmap and the score all
 * read the same days.
 */
import { describe, expect, it } from 'vitest';
import { days } from '@/test/factories';
import { bucketed, consistency, metricOption } from '@/components/Analytics/data';
import { heatmapGrid, summaryFigures, tileSeries } from './growthSummary';
import { classifyDays, recoveryProfile } from './growthFocus';
import { isActiveDay } from './activeDay';
import type { GrowthDay } from '@/types';

/** Ten days: XP, then focus with no XP, then a task the ledger never saw, then off. */
function mixed(): GrowthDay[] {
  return days('2026-09-01', 10).map((day, index) => {
    if (index < 2) return { ...day, xp_earned: 50, tasks_completed: 1 };
    if (index < 4) return { ...day, focus_minutes: 30 };
    if (index === 4) return { ...day, worked: true };
    return day;
  });
}

const slice = () => ({ current: mixed(), previous: [] });

describe('one rule for a day worked', () => {
  it('takes the server at its word', () => {
    expect(isActiveDay({ ...mixed()[9]!, worked: true })).toBe(true);
    expect(isActiveDay(mixed()[9]!)).toBe(false);
  });

  it('gives the tile, the panel and the chart the same rate', () => {
    expect(summaryFigures(slice()).consistency.value).toBe(50);
    expect(consistency(slice()).rate).toBe(50);
    const whole = bucketed(mixed(), metricOption('consistency'), 'daily');
    const mean = whole.reduce((sum, point) => sum + point.value, 0) / whole.length;
    expect(mean).toBe(50);
  });

  it('counts focus with no XP in the rolling line under the tile', () => {
    expect(tileSeries(slice()).consistency[3]).toBe(100);
  });

  it('never draws a worked day like a day off on the heatmap', () => {
    const cells = heatmapGrid(mixed(), '30').flatMap((row) => row.days).filter((cell) => cell.date);
    const level = (date: string) => cells.find((cell) => cell.date === date)!.level;
    expect(level('2026-09-01')).toBe(4);
    expect(level('2026-09-03')).toBe(1);
    expect(level('2026-09-05')).toBe(1);
    expect(level('2026-09-06')).toBe(0);
  });

  it('counts a focus day as turning up in the recovery figures', () => {
    const kinds = classifyDays(mixed(), []);
    expect(kinds.get('2026-09-03')).toBe('partial');
    expect(kinds.get('2026-09-06')).toBe('missed');
    expect(recoveryProfile(mixed(), []).counts.missed).toBe(5);
  });
});
