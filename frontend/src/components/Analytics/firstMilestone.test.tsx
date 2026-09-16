/**
 * The handover between the first-milestone card and the running countdown.
 *
 * They count to the same threshold, so the thing worth pinning is that exactly
 * one of them is on screen at a time — two meters for one number is the page
 * arguing with itself, and none is a new account with no objective at all.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Collecting, FirstMilestone } from './Collecting';
import { MILESTONES } from './milestones';
import { dataMaturity } from '@/utils/dataMaturity';
import type { GrowthDay } from '@/types';

const FIRST = MILESTONES[0]!;

function days(active: number, span = 10): GrowthDay[] {
  return Array.from({ length: Math.max(active, span) }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    tasks_completed: i < active ? 2 : 0,
    focus_minutes: 0,
    xp_earned: 0,
  })) as GrowthDay[];
}

const draw = (active: number) =>
  render(
    <MemoryRouter>
      <Collecting maturity={dataMaturity(days(active))} stats={[]} />
    </MemoryRouter>,
  );

describe('before the first rung', () => {
  it('gives a brand new account one objective', () => {
    draw(0);
    expect(screen.getByText('Your first analytics milestone')).toBeInTheDocument();
    expect(screen.getByText(String(FIRST.need))).toBeInTheDocument();
    expect(screen.getByText(FIRST.reward)).toBeInTheDocument();
  });

  it('shows how far along that one objective is', () => {
    draw(1);
    expect(screen.getByLabelText(`1 of ${FIRST.need} active days`)).toBeInTheDocument();
  });

  it('does not also run the countdown', () => {
    draw(1);
    expect(screen.queryByText(/more work day/i)).not.toBeInTheDocument();
  });

  it('still explains what Summit counts as a day', () => {
    /* The countdown block that normally carries this note is suppressed here,
       and a reader on their first morning is exactly who has not learned the
       rule yet. */
    draw(1);
    expect(screen.getByText(/A day counts as soon as you/i)).toBeInTheDocument();
  });

  it('holds back the reasoned list of everything else', () => {
    draw(1);
    // The track is still drawn; the thresholds under it are not.
    expect(screen.getByText('Your analytics are developing')).toBeInTheDocument();
    expect(screen.queryByText(FIRST.why)).not.toBeInTheDocument();
  });
});

describe('once it is reached', () => {
  it('stops celebrating and starts counting', () => {
    draw(FIRST.need);
    expect(screen.queryByText('Your first analytics milestone')).not.toBeInTheDocument();
    expect(screen.getByText(/more work day/i)).toBeInTheDocument();
  });

  it('brings back the thresholds still ahead', () => {
    draw(FIRST.need);
    const next = MILESTONES[1]!;
    expect(screen.getByText(next.why)).toBeInTheDocument();
  });

  it('renders nothing on its own past the rung', () => {
    const { container } = render(
      <MemoryRouter>
        <FirstMilestone maturity={dataMaturity(days(FIRST.need))} />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe('');
  });
});
