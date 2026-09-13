/**
 * The two sections the subject page opens on, as they are drawn.
 *
 * The shift these sections *are* is that a claim leads and the figure follows.
 * That is a layout decision, so it is testable here and nowhere else: the
 * arithmetic in ./objective cannot tell whether the number ended up in the
 * headline. Each test below is one half of that contract —
 *
 *   the claim is the heading text, the figures are beneath it in a list,
 *   and the page says whether a card was read or counted.
 *
 * The last one matters most. A counted card is chosen by rule and cannot know
 * what kind of goal this is; a read card is chosen against the goal and can be
 * wrong in a way arithmetic cannot. A reader deciding how much to trust a
 * claim needs to know which they are looking at.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BottleneckPanel, ObjectiveBand, WhatMatters } from './Opening';
import type { EvidenceCard, NamedBottleneck, Objective } from './objective';

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

function cardWith(over: Partial<EvidenceCard> = {}): EvidenceCard {
  return {
    id: 'c1',
    claim: 'Execution is improving across this window.',
    direction: 'helps',
    evidence: ['62 to 70 on execution'],
    relevance: 'Whatever is being done now is worth keeping.',
    source: 'counted',
    ...over,
  };
}

// ---------------------------------------------------------------------------
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
describe('WhatMatters', () => {
  it('draws nothing at all when there is nothing to say', () => {
    const { container } = render(<WhatMatters cards={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('leads with the claim and puts the figures underneath it', () => {
    const { container } = render(<WhatMatters cards={[cardWith()]} />);

    expect(screen.getByText('Execution is improving across this window.'))
      .toHaveClass('so-card-claim');

    // The figure is present and is not the headline — it is a line in the
    // evidence list under the claim, which is the whole of what this section
    // changed about the page.
    const evidence = container.querySelector('.so-card-evidence');
    expect(within(evidence as HTMLElement).getByText('62 to 70 on execution'))
      .toBeInTheDocument();
  });

  it('carries a word as well as a colour for the direction', () => {
    render(<WhatMatters cards={[cardWith({ direction: 'hurts' })]} />);
    expect(screen.getByText('In the way')).toBeInTheDocument();
  });

  it('says the cards were chosen by rule when no reading has been made', () => {
    render(<WhatMatters cards={[cardWith()]} />);
    expect(screen.getByText(/chosen by rule/i)).toBeInTheDocument();
  });

  it('says they were read against the goal once one has', () => {
    render(<WhatMatters cards={[cardWith({ source: 'read' })]} />);
    expect(screen.getByText(/read against your goal/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
describe('BottleneckPanel', () => {
  function neckWith(over: Partial<NamedBottleneck> = {}): NamedBottleneck {
    return {
      name: 'Reliable execution under time pressure',
      evidence: ['Hard: execution 64 over 9 rated tasks'],
      reading: 'Your ceiling is ahead of your reliability.',
      ruled_out: 'Harder material is not the next move.',
      confidence: 0.8,
      source: 'read',
      ...over,
    };
  }

  it('draws nothing when nothing was named', () => {
    const { container } = render(<BottleneckPanel bottleneck={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names one thing and shows what it rests on', () => {
    render(<BottleneckPanel bottleneck={neckWith()} />);

    expect(screen.getByRole('heading', { name: /reliable execution/i })).toBeInTheDocument();
    expect(screen.getByText('Hard: execution 64 over 9 rated tasks')).toBeInTheDocument();
    expect(screen.getByText('Your ceiling is ahead of your reliability.')).toBeInTheDocument();
  });

  it('carries the line that tells somebody to stop doing something', () => {
    render(<BottleneckPanel bottleneck={neckWith()} />);

    expect(screen.getByText('Ruled out')).toBeInTheDocument();
    expect(screen.getByText('Harder material is not the next move.')).toBeInTheDocument();
  });

  it('omits it rather than reassuring when nothing supports ruling out', () => {
    render(<BottleneckPanel bottleneck={neckWith({ ruled_out: '' })} />);
    expect(screen.queryByText('Ruled out')).not.toBeInTheDocument();
  });

  it('says how sure it is in words rather than as a decimal', () => {
    render(<BottleneckPanel bottleneck={neckWith({ confidence: 0.45 })} />);

    expect(screen.getByText(/low confidence/)).toBeInTheDocument();
    expect(screen.queryByText(/0\.45/)).not.toBeInTheDocument();
  });

  it('says whether the naming was read or counted', () => {
    render(<BottleneckPanel bottleneck={neckWith({ source: 'counted' })} />);
    expect(screen.getByText(/named by rule from your record/)).toBeInTheDocument();
  });
});
