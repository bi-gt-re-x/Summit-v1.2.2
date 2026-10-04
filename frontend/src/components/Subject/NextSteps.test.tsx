/**
 * One recommended session, drawn as a dropdown.
 */
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('a step that is only its title', () => {
  it('draws with no time, pace, problems or source', () => {
    const { container } = draw([step(1, {
      title: 'Practice Bach Concerto intonation',
      problems: '', pace: '', resource: '', resources: [], minutes: null,
    })]);
    expect(screen.getByText('Practice Bach Concerto intonation')).toBeInTheDocument();
    expect(screen.queryByText(/min$/)).toBeNull();
    expect(container.querySelector('.sx-step-what')).toBeNull();
    expect(container.querySelector('.sx-step-resource')).toBeNull();
  });
});

describe('opening a step', () => {
  it('opens and shuts from anywhere on the card, not only its head', () => {
    const { container } = draw([step(1), step(2)]);
    const second = container.querySelectorAll<HTMLLIElement>('.sx-step')[1]!;
    const fold = second.querySelector('details')!;
    expect(fold.open).toBe(false);
    fireEvent.click(second.querySelector('.sx-step-rank')!);
    expect(fold.open).toBe(true);
    fireEvent.click(second);
    expect(fold.open).toBe(false);
  });

  it('leaves the fold alone when a button inside is pressed', () => {
    const made: string[] = [];
    const { container } = render(
      <NextSteps steps={[step(1)]} taken={new Set()} busy=""
        onMakeTask={(s) => made.push(s.id)} onDidIt={() => {}} />,
    );
    const fold = container.querySelector('details')!;
    expect(fold.open).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Make it a task' }));
    expect(made).toEqual(['r1']);
    expect(fold.open).toBe(true);
  });

  it('leaves the fold alone when a link inside is followed', () => {
    const { container } = draw([step(1, { resources: [{ name: 'IMSLP', url: 'https://imslp.org/' }] })]);
    const fold = container.querySelector('details')!;
    fireEvent.click(screen.getByRole('link', { name: 'IMSLP' }));
    expect(fold.open).toBe(true);
  });
});

describe('where to get it', () => {
  const links = [
    { name: 'Bach A minor score', url: 'https://imslp.org/wiki/BWV_1041', yours: true },
    { name: 'Henle edition', url: 'https://www.henle.de/en/' },
    { name: 'Recording', url: 'https://www.youtube.com/watch?v=x' },
    { name: 'A fourth', url: 'https://example.org/4' },
  ];

  it('links up to three, best first, straight to the page in a new tab', () => {
    draw([step(1, { resources: links })]);
    const anchors = screen.getAllByRole('link');
    expect(anchors.map((a) => a.textContent)).toEqual(['Bach A minor score', 'Henle edition', 'Recording']);
    expect(anchors[0]).toHaveAttribute('href', 'https://imslp.org/wiki/BWV_1041');
    expect(anchors[0]).toHaveAttribute('target', '_blank');
    expect(anchors[0]).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Best')).toBeInTheDocument();
  });

  it('marks the ones the reader already keeps', () => {
    draw([step(1, { resources: links })]);
    expect(screen.getAllByText('Yours')).toHaveLength(1);
  });

  it('never draws a link that is not http(s)', () => {
    draw([step(1, { resources: [{ name: 'bad', url: 'javascript:alert(1)' }] })]);
    expect(screen.queryByRole('link')).toBeNull();
    // Falls back to the old named source.
    expect(screen.getByText('James Stewart, Calculus, 8th edition')).toBeInTheDocument();
  });

  it('names a link after its site when it has no name', () => {
    draw([step(1, { resources: [{ name: '', url: 'https://www.mathcounts.org/x' }] })]);
    expect(screen.getByRole('link', { name: 'mathcounts.org' })).toBeInTheDocument();
  });
});
