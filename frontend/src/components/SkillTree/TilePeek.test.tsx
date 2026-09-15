/**
 * The hover card, and the two rules that make it worth having.
 *
 * It says what a tile cannot: how much of the gate is behind you, by name, and
 * how much is not. The way that goes wrong is by saying it *badly* — a locked
 * node's percentage is always nought, so printing it is a confident figure
 * answering no question, and a node with eleven prerequisites would otherwise
 * render a card taller than the canvas.
 *
 * Placement is not tested and cannot usefully be: jsdom does no layout, so
 * every rectangle in it is zero and the card's own arithmetic would only be
 * checking itself.
 *
 * The card is `aria-hidden`, on purpose — see the note in ./TilePeek — so the
 * queries below are by text and by class rather than by role. A role query
 * would find nothing here, which is the point of the attribute.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TilePeek } from './TilePeek';
import { focusOn } from '@/skills/route';
import type { GraphNode, NodeStatus, SkillGraph } from '@/utils/skillGraph';

function node(id: string, status: NodeStatus, over: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    name: id,
    blurb: '',
    category: 'Maths',
    difficulty: 'advanced',
    status,
    percent: status === 'complete' ? 100 : 0,
    xp: 1000,
    have: 0,
    need: 1000,
    unit: 'XP',
    on: '',
    requires: [],
    gate: '',
    ...over,
  };
}

/** Quadratics, waiting on three things, two of which are done. */
function graph(): SkillGraph {
  return {
    id: 'mathematics',
    name: 'Mathematics',
    nodes: [
      node('fractions', 'complete'),
      node('negatives', 'complete'),
      node('ratios', 'progress', { percent: 40 }),
      node('quad', 'locked', { name: 'Quadratics', requires: ['fractions', 'negatives', 'ratios'] }),
      node('conics', 'locked', { requires: ['quad'] }),
    ],
  };
}

const RECT = { top: 300, bottom: 364, left: 200, width: 64 };

function draw(id: string, over: Partial<React.ComponentProps<typeof TilePeek>> = {}) {
  const read = focusOn(graph(), id)!;
  render(<TilePeek read={read} rect={RECT} {...over} />);
}

describe('the hover card', () => {
  it('counts the gate instead of printing a locked nought', () => {
    draw('quad');
    expect(screen.getByText('2 of 3 prerequisites done')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('names what is done and what is not', () => {
    draw('quad');
    // The tick and the ring are the difference, and they are on the row.
    expect(screen.getByText('fractions').closest('li')).toHaveClass('is-done');
    expect(screen.getByText('ratios').closest('li')).not.toHaveClass('is-done');
  });

  it('says what the node opens', () => {
    draw('quad');
    expect(screen.getByText('Unlocks 1 skill')).toBeInTheDocument();
  });

  it('shows how far along anything that is not locked is', () => {
    draw('ratios');
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('stops listing prerequisites before the card becomes a page', () => {
    const many = graph();
    const needs = ['a', 'b', 'c', 'd', 'e', 'f'];
    many.nodes = [
      ...needs.map((id) => node(id, 'complete')),
      node('big', 'locked', { requires: needs }),
    ];
    render(<TilePeek read={focusOn(many, 'big')!} rect={RECT} />);

    expect(document.querySelectorAll('.stx-peek-needs li')).toHaveLength(5);
    expect(screen.getByText('and 2 more')).toBeInTheDocument();
  });

  it('says a diamond is a doorway rather than counting its prerequisites', () => {
    draw('quad', { nav: true });
    expect(screen.getByText('Opens a lattice of its own.')).toBeInTheDocument();
    expect(screen.queryByText(/prerequisites done/)).not.toBeInTheDocument();
  });
});
