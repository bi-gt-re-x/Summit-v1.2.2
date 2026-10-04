/**
 * The grade, and the rung above it.
 *
 * The panel's lead sentence is the largest thing on the analytics page and the
 * first thing read. It used to end at the letter's meaning — "6.2/10, two or
 * three of the five are low" — which states where the reader is and offers
 * nowhere to go. Every other row on the panel links somewhere; this one graded
 * and stopped.
 *
 * The distance to the next band already existed. It was a clause on the
 * weakest-measure row and only at the two blunter tones, which showed it to
 * the readers who had asked to be talked to bluntly and withheld it from the
 * ones who had asked for the gentle page. It is arithmetic off the band table,
 * not a judgement, so tone was never the right thing to ration it by.
 *
 * What is asserted here is that the distance is in the lead at every tone, is
 * there exactly once, and is absent only where there is genuinely no band
 * above.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Summary } from './Summary';
import type { SummaryProps } from './Summary';
import { renderWithProviders } from '@/test/render';
import type { AnalyticalScore } from '@/utils/analyticalScore';
import type { Grade, MetricName } from '@/types';

function part(name: MetricName, label: string, score: number) {
  return { name, label, score, raw: `${score} of 100`, contribution: score / 5 };
}

function scoreOf(value: number | null, grade: Grade | null): AnalyticalScore {
  // Named rather than indexed: the strongest and weakest are what the panel
  // reads, and `parts[0]` is `ScorePart | undefined` under the strict index
  // rule while the field it fills is not.
  const strongest = part('productivity', 'Productivity', 80);
  const weakest = part('consistency', 'Consistency', 40);
  return {
    value,
    grade,
    parts: [strongest, weakest],
    weakest: value === null ? null : weakest,
    strongest: value === null ? null : strongest,
  };
}

function show(overrides: Partial<SummaryProps> = {}) {
  const props: SummaryProps = {
    score: scoreOf(62, 'D'),
    movement: null,
    topAdvice: null,
    adviceCount: 0,
    goals: null,
    ...overrides,
  };
  return renderWithProviders(<Summary {...props} />);
}

/** The lead sentence, which is where the claim has to land. */
function lead() {
  return document.querySelector('.ax-summary-lead') as HTMLElement;
}

/* The clause is a number in a `strong` followed by words, so its text is split
   across elements and `getByText` cannot see it whole. Reading the span's own
   textContent asserts the same thing and says where it must be. */
function nextClause() {
  return document.querySelector('.ax-summary-next')?.textContent ?? null;
}

/** How many times the panel states the distance anywhere. */
function clauseCount() {
  return document.querySelectorAll('.ax-summary-next').length;
}

describe('the distance to the next grade', () => {
  it('is in the lead sentence', () => {
    // 62 is a D; C starts at 70.
    show({ score: scoreOf(62, 'D') });
    expect(nextClause()).toMatch(/0\.8 to C/);
  });

  it('counts from the band the letter came from', () => {
    // 88 is a B; A starts at 90.
    show({ score: scoreOf(88, 'B') });
    expect(nextClause()).toMatch(/0\.2 to A/);
  });

  it('says the distance on the ten-point scale the score is printed on', () => {
    show({ score: scoreOf(69, 'D') });
    expect(nextClause()).toMatch(/0\.1 to C/);
  });

  it('is absent at the top, where there is no band above', () => {
    show({ score: scoreOf(100, 'S') });
    expect(clauseCount()).toBe(0);
  });
});

describe('and the five measures stay on Achievements', () => {
  it('is shown once', () => {
    show({ score: scoreOf(62, 'D') });
    expect(clauseCount()).toBe(1);
  });

  it('does not name the strongest or weakest measure', () => {
    /* Those are "Biggest improvement" and "Needs attention" on the Growth
       tab of Achievements. */
    show({ score: scoreOf(62, 'D') });
    expect(screen.queryByText(/measure holding it back/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/what is carrying it/i)).not.toBeInTheDocument();
  });

  it('sends "see it over time" to the Growth tab', () => {
    show({
      score: scoreOf(62, 'D'),
      movement: { now: 62, previous: 60, days: 3, direction: 'up' },
    });
    expect(screen.getByRole('link', { name: 'See it over time' })).toHaveAttribute(
      'href',
      '/achievements/growth',
    );
  });
});

describe('what must not have changed', () => {
  it('still prints the score and what the letter means', () => {
    show({ score: scoreOf(62, 'D') });
    expect(lead().textContent).toMatch(/6\.2\/10/);
    expect(lead().textContent).toMatch(/two or three of the five are low/i);
  });

  it('still tells an account with no record what the score needs', () => {
    /* The empty state has no letter to be a verdict about, and must not
       acquire a distance to one. */
    show({ score: scoreOf(null, null) });
    expect(screen.getByText(/no score yet/i)).toBeInTheDocument();
    expect(clauseCount()).toBe(0);
  });
});
