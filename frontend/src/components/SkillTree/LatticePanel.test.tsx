/**
 * The panel, and the three kinds of claim it makes.
 *
 * The restructure this tests is not cosmetic. A panel that ran account state,
 * authored curriculum and derived advice together in one column left a reader
 * unable to tell which sentences were about the subject and which were about
 * them — and that distinction is the one the whole feature is built on. So the
 * headings are asserted like any other behaviour: they are the feature.
 *
 * The rest is the sentence that replaced a percentage. "One prerequisite away"
 * and "open now, nothing in the way" are the two states `0%` was printing
 * identically, and they are the two a reader acts on most differently.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LatticePanel } from './LatticePanel';
import type { GraphNode, NodeStatus, SkillGraph } from '@/utils/skillGraph';

function node(id: string, status: NodeStatus, over: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    name: id,
    blurb: `About ${id}.`,
    category: 'Maths',
    difficulty: 'beginner',
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

/** Fractions and Negatives under Algebra, which opens Linear. */
function graph(over: Record<string, Partial<GraphNode>> = {}): SkillGraph {
  const rows = [
    node('fractions', 'complete'),
    node('negatives', 'complete'),
    node('algebra', 'available', { requires: ['fractions', 'negatives'] }),
    node('linear', 'locked', { requires: ['algebra'] }),
    node('sets', 'available', { recommends: ['algebra'] }),
  ];
  return {
    id: 'mathematics',
    name: 'Mathematics',
    nodes: rows.map((row) => ({ ...row, ...(over[row.id] ?? {}) })),
  };
}

function draw(id: string, over: Record<string, Partial<GraphNode>> = {}) {
  const built = graph(over);
  const picked = built.nodes.find((one) => one.id === id)!;
  const onSelect = vi.fn();
  render(<LatticePanel graph={built} node={picked} onSelect={onSelect} gain={250} />);
  return { onSelect };
}

describe('the lattice panel', () => {
  it('separates the three kinds of claim', () => {
    draw('algebra');
    expect(screen.getByRole('heading', { name: 'Your progress' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The curriculum' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your next move' })).toBeInTheDocument();
  });

  it('says where the reader stands before it says a percentage', () => {
    draw('algebra');
    expect(screen.getByText(/Open now — nothing is in the way/)).toBeInTheDocument();
  });

  it('counts what is in the way rather than printing a nought', () => {
    draw('linear');
    expect(screen.getByText(/1 prerequisite away/)).toBeInTheDocument();
  });

  it('answers "why this skill" on an open node, not only a blocked one', () => {
    // The reason an open node is open is the better half of this question and
    // was the half that went unsaid.
    draw('algebra');
    expect(screen.getByText(/Open because all 2 of these are done/)).toBeInTheDocument();
    const why = screen.getByLabelText('What this skill sits on');
    expect(within(why).getByText('fractions')).toBeInTheDocument();
    expect(within(why).getByText('negatives')).toBeInTheDocument();
  });

  it('says so when a node sits on nothing', () => {
    draw('fractions');
    expect(screen.getByText(/A foundation of this subject/)).toBeInTheDocument();
  });

  it('tells a gate apart from a suggestion', () => {
    draw('algebra');
    // `linear` requires it; `sets` merely recommends it.
    expect(screen.getByRole('heading', { name: /Finishing this opens a skill/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Worth exploring' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Related Skills' })).toBeNull();
  });

  it('gives "done when" its own weight', () => {
    draw('algebra');
    expect(screen.getByText('Done when')).toBeInTheDocument();
  });
});
