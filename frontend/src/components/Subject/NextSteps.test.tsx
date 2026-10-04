/**
 * One recommended session, drawn as a dropdown.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MAX_STEPS, NextSteps } from './NextSteps';
import type { NextStep } from '@/services/analytics';

const step = (n: number, over: Partial<NextStep> = {}): NextStep => ({
  id: `r${n}`,
  title: `Stewart Ch. 7 integrals #${n}, 8 min each`,
  problems: `Stewart Calculus, Chapter 7, problems ${n}-${n + 7}`,
  pace: '8 min per problem',
  resource: 'James Stewart, Calculus, 8th edition',
  focus: 'Calculus',
  type: 'targeted_practice',
  difficulty: 3,
  minutes: 64,
  reason: '',
  signal: '',
  drills: [],
  ...over,
});

function draw(steps: NextStep[]) {
  return render(
    <NextSteps steps={steps} taken={new Set()} busy="" onMakeTask={() => {}} onDidIt={() => {}} />,
  );
}

describe('a recommended session', () => {
  it('says what to work, how fast and where to get it', () => {
    draw([step(1)]);
    expect(screen.getByText('Stewart Calculus, Chapter 7, problems 1-8')).toBeInTheDocument();
    expect(screen.getByText('8 min per problem')).toBeInTheDocument();
    expect(screen.getByText('James Stewart, Calculus, 8th edition')).toBeInTheDocument();
  });

  it('does not print the problems twice when the title already says them', () => {
    const { container } = draw([step(1, { title: 'Putnam 2025 A1-A5, 12 min each', problems: 'Putnam 2025 A1-A5' })]);
    expect(container.querySelector('.sx-step-what')).toBeNull();
  });

  it('draws at most six', () => {
    const { container } = draw(Array.from({ length: 9 }, (_, n) => step(n + 1)));
    expect(container.querySelectorAll('.sx-step-fold')).toHaveLength(MAX_STEPS);
  });

  it('still draws a step written before the three fields existed', () => {
    const { container } = draw([step(1, { problems: undefined, pace: undefined, resource: undefined })]);
    expect(container.querySelector('.sx-step-what')).toBeNull();
    expect(container.querySelector('.sx-step-resource')).toBeNull();
    expect(screen.getByText(/Stewart Ch. 7/)).toBeInTheDocument();
  });
});
