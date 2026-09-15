/**
 * What a line says when it is asked.
 *
 * The one thing this card exists to make legible is the difference between the
 * two kinds of edge, so that is what is pinned: a gate says the far end will
 * not open, a suggestion says it is open anyway. Those two sentences are the
 * whole feature, and a copy edit that blurred them into "these are related"
 * would pass a render test and lose the point.
 *
 * A met gate is the third case and it is not cosmetic: "will not open until X
 * is finished" printed over a finished X is the card telling the reader
 * something they can see is false, which costs more trust than it buys.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EdgeCard } from './EdgeCard';
import type { GraphNode, NodeStatus, PlacedEdge } from '@/utils/skillGraph';

function node(id: string, name: string, status: NodeStatus, percent = 0): GraphNode {
  return {
    id,
    name,
    blurb: '',
    category: '',
    difficulty: 'beginner',
    status,
    percent,
    xp: 0,
    have: 0,
    need: 0,
    unit: 'XP',
    on: '',
    requires: [],
    gate: '',
  };
}

function edge(kind: PlacedEdge['kind']): PlacedEdge {
  return { id: 'e', from: 'linear', to: 'quad', state: 'locked', d: 'M0,0 L1,1', kind };
}

function draw(
  kind: PlacedEdge['kind'],
  from: GraphNode = node('linear', 'Linear Equations', 'progress', 60),
) {
  const onOpen = vi.fn();
  const onClose = vi.fn();
  render(
    <EdgeCard
      edge={edge(kind)}
      from={from}
      to={node('quad', 'Quadratics', 'locked')}
      at={{ x: 200, y: 200 }}
      onOpen={onOpen}
      onClose={onClose}
    />,
  );
  return { onOpen, onClose };
}

describe('the edge card', () => {
  it('says a prerequisite is a gate', () => {
    draw('requires');
    expect(screen.getByText('Prerequisite')).toBeInTheDocument();
    expect(screen.getByText(/will not open until/)).toBeInTheDocument();
    // And where the blocker stands, which is the part that says how far off it is.
    expect(screen.getByText(/in progress at 60%/)).toBeInTheDocument();
  });

  it('says a recommendation is not', () => {
    draw('recommends');
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText(/open whether or not/)).toBeInTheDocument();
    expect(screen.queryByText(/will not open until/)).toBeNull();
  });

  it('does not tell a reader a finished prerequisite is blocking them', () => {
    draw('requires', node('linear', 'Linear Equations', 'complete', 100));
    expect(screen.queryByText(/will not open until/)).toBeNull();
    expect(screen.getByText(/route you have already taken/)).toBeInTheDocument();
  });

  it('is a way out at both ends', async () => {
    const user = userEvent.setup();
    const { onOpen } = draw('requires');

    await user.click(screen.getByRole('button', { name: 'Quadratics' }));
    expect(onOpen).toHaveBeenCalledWith('quad');

    await user.click(screen.getByRole('button', { name: 'Linear Equations' }));
    expect(onOpen).toHaveBeenCalledWith('linear');
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = draw('requires');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
