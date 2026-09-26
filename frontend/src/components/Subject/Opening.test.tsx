/**
 * The band the subject page opens its argument on, as it is drawn.
 *
 * The shift this section *is* is that a claim leads and the figure follows.
 * That is a layout decision, so it is testable here and nowhere else: the
 * arithmetic in ./objective cannot tell whether the number ended up in the
 * headline.
 *
 * The evidence cards and the bottleneck panel that used to sit under this
 * are gone — all four were chosen out of the same arithmetic and argued one
 * finding up to four times. Their tests went with them. What the bottleneck
 * still feeds is the "Focus area" card, covered in ./Cards.test.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ObjectiveBand } from './Opening';
import type { Objective } from './objective';

function bandWith(over: Partial<Objective> = {}): Objective {
  return {
    objective: 'Qualify for AIME',
    kind: 'unstated',
    whyKind: '',
    focus: '',
    aim: '',
    level: '',
    source: 'counted',
    marks: [],
    ...over,
  };
}

describe('ObjectiveBand', () => {
  it('puts the goal at the top as the heading', () => {
    render(<ObjectiveBand subject="Mathematics" objective={bandWith()} />);

    expect(screen.getByRole('heading', { name: 'Qualify for AIME' })).toBeInTheDocument();
    expect(screen.getByText('Mathematics')).toBeInTheDocument();
  });

  it('says nobody has set one rather than drawing nothing', () => {
    // The page's first question is "what is this for", and "nobody has said"
    // is an answer somebody can act on. A missing section is not.
    render(<ObjectiveBand subject="Mathematics" objective={bandWith({ objective: '' })} />);

    expect(screen.getByRole('heading', { name: /no goal set/i })).toBeInTheDocument();
  });

  it('draws no kind chip until something knows the kind', () => {
    render(<ObjectiveBand subject="Mathematics" objective={bandWith()} />);
    expect(screen.queryByText(/progress is/i)).not.toBeInTheDocument();
  });

  it('says what progress means once the kind is known', () => {
    // The page saying out loud which measure it is about to weigh everything
    // against, so a reader who disagrees can see the call was made.
    render(
      <ObjectiveBand
        subject="Mathematics"
        objective={bandWith({ kind: 'competition', whyKind: 'The goal names a contest.' })}
      />,
    );

    expect(screen.getByText('Competition')).toBeInTheDocument();
    expect(screen.getByText(/under a clock/i)).toBeInTheDocument();
  });

  it("keeps the reader's own sentence beside the model's rewrite of it", () => {
    render(
      <ObjectiveBand
        subject="Mathematics"
        objective={bandWith({
          objective: 'Qualify for AIME by turning solving into contest execution',
          aim: 'Get to AIME',
          level: 'AMC 10 at 96',
          source: 'read',
        })}
      />,
    );

    expect(screen.getByText(/Get to AIME/)).toBeInTheDocument();
    expect(screen.getByText(/AMC 10 at 96/)).toBeInTheDocument();
  });

  it('does not repeat the reader back to themselves when nothing rewrote it', () => {
    render(
      <ObjectiveBand
        subject="Mathematics"
        objective={bandWith({ objective: 'Get to AIME', aim: 'Get to AIME' })}
      />,
    );

    expect(screen.queryByText('You wrote')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
