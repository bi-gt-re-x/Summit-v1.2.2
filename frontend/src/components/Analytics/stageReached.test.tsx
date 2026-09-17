/**
 * The overlay that announces a new stage, and the rule deciding when it fires.
 *
 * The rule is a comparison between the stage the record *is* at and the highest
 * one the account has been told about — which is the part worth pinning,
 * because getting it wrong in either direction is bad in a different way: a
 * missed announcement wastes every countdown the page has shown, and a repeated
 * one is an interruption that says nothing.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { StageReached } from './StageReached';
import { MILESTONES } from './milestones';
import { STAGES, STAGE_LABEL, type Stage } from '@/utils/dataMaturity';

/** The page's own test, lifted so it can be checked without the page. */
const climbed = (seen: string, now: Stage) =>
  seen !== '' && STAGES.indexOf(now) > STAGES.indexOf(seen as Stage);

describe('when it fires', () => {
  it('does not greet an account it has never seen', () => {
    // Every account that existed before the key did lands here.
    expect(climbed('', 'full')).toBe(false);
  });

  it('stays quiet on a stage already announced', () => {
    expect(climbed('weekly', 'weekly')).toBe(false);
  });

  it('fires on the way up', () => {
    expect(climbed('early', 'weekly')).toBe(true);
  });

  it('fires once for a climb that crossed two thresholds', () => {
    // Someone who worked through a fortnight without opening the page.
    expect(climbed('early', 'full')).toBe(true);
  });

  it('never fires backwards, because stages are floors', () => {
    expect(climbed('full', 'weekly')).toBe(false);
  });
});

describe('what it says', () => {
  const draw = (stage: Stage, activeDays: number) =>
    render(
      <MemoryRouter>
        <StageReached stage={stage} activeDays={activeDays} onDone={() => {}} />
      </MemoryRouter>,
    );

  it('names the stage and what the record behind it is', () => {
    draw('weekly', 8);
    expect(screen.getByText(STAGE_LABEL.weekly)).toBeInTheDocument();
    expect(screen.getByText(/8 days of your work are on record/)).toBeInTheDocument();
  });

  it('promises the same thing the countdown promised', () => {
    /* The reward comes from the one table the countdown reads, so arriving
       reads as a promise kept rather than as a fresh announcement. */
    draw('weekly', 8);
    const weekly = MILESTONES.find((step) => step.need === 7);
    expect(screen.getByText(weekly!.reward)).toBeInTheDocument();
  });

  it('is a dialog, so it is announced as one', () => {
    draw('developing', 15);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes on the button', async () => {
    const onDone = vi.fn();
    render(
      <MemoryRouter>
        <StageReached stage="weekly" activeDays={8} onDone={onDone} />
      </MemoryRouter>,
    );
    screen.getByRole('button', { name: /have a look/i }).click();
    expect(onDone).toHaveBeenCalled();
  });
});
