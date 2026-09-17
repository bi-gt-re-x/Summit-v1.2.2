/**
 * Coming back after a long gap.
 *
 * The rule under test is the awkward consequence of stages being floors: an
 * account that reached `full` keeps it while nobody is looking, so a reader who
 * stops for two months returns to every panel drawn over an empty window. The
 * notice is what stops that reading as broken — so what is worth pinning is
 * when it speaks, when it stays quiet, and that it never claims anything was
 * reset.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AwayNotice } from './Collecting';
import { DORMANT_AFTER, dataMaturity } from '@/utils/dataMaturity';
import type { GrowthDay } from '@/types';

/**
 * `worked` active days, then `quiet` days of nothing.
 *
 * Real consecutive dates rather than a day-of-month counter: `quietDays` is
 * measured with `Date.parse`, so a series that skips from the 28th to the 1st
 * is a series with a hole in it and the figure under test comes out wrong.
 */
function record(worked: number, quiet: number): GrowthDay[] {
  const start = Date.parse('2026-01-01T00:00:00');
  const day = (n: number) => new Date(start + n * 86_400_000).toISOString().slice(0, 10);

  const out: GrowthDay[] = [];
  for (let i = 0; i < worked; i += 1) {
    out.push({ date: day(i), tasks_completed: 2, focus_minutes: 30, xp_earned: 20 } as GrowthDay);
  }
  for (let i = 0; i < quiet; i += 1) {
    out.push({ date: day(worked + i), tasks_completed: 0, focus_minutes: 0, xp_earned: 0 } as GrowthDay);
  }
  return out;
}

const draw = (worked: number, quiet: number) =>
  render(<AwayNotice maturity={dataMaturity(record(worked, quiet))} />);

describe('quietDays', () => {
  it('is zero while the record is current', () => {
    expect(dataMaturity(record(10, 0)).quietDays).toBe(0);
  });

  it('counts calendar days since the last day worked', () => {
    expect(dataMaturity(record(10, 20)).quietDays).toBe(20);
  });

  it('is zero on an empty record rather than undefined', () => {
    expect(dataMaturity([]).quietDays).toBe(0);
  });
});

describe('the notice', () => {
  it('stays quiet through a holiday', () => {
    const { container } = draw(20, DORMANT_AFTER - 1);
    expect(container.innerHTML).toBe('');
  });

  it('speaks once the gap is long enough to explain the zeros', () => {
    draw(20, 47);
    expect(screen.getByText(/You have been away for/)).toBeInTheDocument();
    expect(screen.getByText('47 days')).toBeInTheDocument();
  });

  it('says the record is intact rather than that anything was lost', () => {
    draw(20, 47);
    expect(screen.getByText(/nothing has been reset/i)).toBeInTheDocument();
    expect(screen.getByText('20 days')).toBeInTheDocument();
  });

  it('does not chide', () => {
    const { container } = draw(20, 47);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/streak|should|failed|lost/i);
  });

  it('has nothing to say to an account that never started', () => {
    const { container } = draw(0, 60);
    expect(container.innerHTML).toBe('');
  });
});

describe('maturity is not reset by a gap', () => {
  it('keeps the stage it reached', () => {
    /* The whole reason the notice exists rather than a demotion. */
    const away = dataMaturity(record(40, 90));
    expect(away.stage).toBe('full');
    expect(away.activeDays).toBe(40);
  });
});
