/**
 * The written programme in the panel: what a closed step says, and what opens.
 *
 * The design this tests is a table with three columns — the skill, what mastery
 * means, and one thing to try — and the whole point of it is that the third
 * column names an object. So the first assertion here is the one that would
 * have failed before the feature existed: a step that reads "Do ten from
 * memory" is not what the panel draws any more.
 *
 * The rest is the expansion. A closed row is a decision ("is this the step I
 * want"); an open one is instructions ("here is how, here is the answer, here
 * is the trap"). Those are different jobs and the split between them is the
 * behaviour worth pinning, because the obvious regression is a refactor that
 * renders everything at once and quietly turns a seven-step programme back into
 * a wall of prose.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LatticePanel } from './LatticePanel';
import type { WrittenStep } from '@/services/skillSteps';
import type { GraphNode, NodeStatus, SkillGraph } from '@/utils/skillGraph';

function written(over: Partial<WrittenStep> = {}, ordinal = 1): WrittenStep {
  return {
    ordinal,
    title: 'Factor Simple Quadratics',
    mastery: 'Reverse FOIL to factor x^2 + bx + c.',
    practice: 'Factor x^2 - 7x + 12.',
    detail: 'Look for two numbers that multiply to c and add to b.',
    proof: 'You get (x - 3)(x - 4).',
    pitfall: 'Getting the signs wrong when b is negative.',
    minutes: 15,
    verified: {
      at: '2026-09-26T12:00:00',
      by: 'rules+authored',
      checks: ['shape', 'concrete', 'distinct'],
      model: 'authored',
      attempts: 1,
    },
    ...over,
  };
}

/* Every field differs between steps. A fixture that repeats one `detail`
   across five steps makes "is this step's detail on screen" unanswerable, which
   is exactly the question these tests ask. */
const PROGRAMME: WrittenStep[] = [
  written({
    title: 'Recognise a Quadratic',
    mastery: 'Identify whether an expression is quadratic.',
    practice: 'Say which of 3x^2 - 7x + 2 and x^3 + 1 are quadratic.',
    detail: 'Rewrite each one as ax^2 + bx + c before deciding.',
    proof: 'The first is quadratic and the second is cubic.',
    pitfall: 'Missing one written out of order, such as 4 - 9x^2.',
  }, 1),
  written({
    title: 'Expand Binomials',
    mastery: 'Expand products such as (x + 3)(x - 5) accurately.',
    practice: 'Expand (2x - 3)(x + 7).',
    detail: 'Multiply each term in the first bracket by each in the second.',
    proof: 'You get 2x^2 + 11x - 21.',
    pitfall: 'Dropping the two middle terms when the bracket is squared.',
    minutes: 20,
  }, 2),
  written({}, 3),
  written({
    title: 'Complete the Square',
    mastery: 'Rewrite a quadratic as (x + p)^2 + q.',
    practice: 'Write x^2 + 6x + 1 in completed-square form.',
    detail: 'Halve the coefficient of x, square it, add and subtract it.',
    proof: 'It comes out as (x + 3)^2 - 8.',
    pitfall: 'Forgetting to subtract the square you just added.',
  }, 4),
  written({
    title: 'Use the Formula',
    mastery: 'Solve any quadratic with the formula.',
    practice: 'Solve 2x^2 - 4x - 3 = 0.',
    detail: 'Compute b^2 - 4ac first and on its own.',
    proof: 'The discriminant is 40, so there are two real roots.',
    pitfall: 'Dropping the minus sign on b.',
  }, 5),
];

function node(id: string, status: NodeStatus, over: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    name: id,
    blurb: `About ${id}.`,
    category: 'Maths',
    difficulty: 'intermediate',
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

function draw(steps: WrittenStep[] | null, onExpand = vi.fn()) {
  const picked = node('quadratics', 'available');
  const graph: SkillGraph = { id: 'mathematics', name: 'Mathematics', nodes: [picked] };
  render(
    <LatticePanel
      graph={graph}
      node={picked}
      onSelect={vi.fn()}
      gain={250}
      written={steps}
      onExpand={onExpand}
    />,
  );
  return { onExpand };
}

describe('a written step, closed', () => {
  it('names an object to work on rather than a quantity to repeat', () => {
    draw(PROGRAMME);
    expect(screen.getByText('Expand (2x - 3)(x + 7).')).toBeInTheDocument();
    expect(screen.queryByText(/from memory/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ten in a row/i)).not.toBeInTheDocument();
  });

  it('shows the skill name and what mastery means', () => {
    draw(PROGRAMME);
    // By role rather than by text: an open step names itself again inside its
    // target-problem slot, and the row is the thing being asserted about.
    expect(screen.getByRole('button', { name: /Recognise a Quadratic/ })).toBeInTheDocument();
    expect(screen.getByText('Identify whether an expression is quadratic.')).toBeInTheDocument();
  });

  it('labels every practice line so it reads as the thing to go and do', () => {
    draw(PROGRAMME);
    // Three steps are in the panel's window: the one the reader is on and the
    // two after it.
    expect(screen.getAllByText('Try:')).toHaveLength(3);
  });

  it('keeps a closed step\'s detail out of the way until it is asked for', () => {
    draw(PROGRAMME);
    expect(
      screen.queryByText('Multiply each term in the first bracket by each in the second.'),
    ).not.toBeInTheDocument();
  });

  it('opens the step the reader is on, because that is the one they came for', () => {
    draw(PROGRAMME);
    expect(screen.getByText('Rewrite each one as ax^2 + bx + c before deciding.')).toBeInTheDocument();
  });
});

describe('opening a step', () => {
  /** The row for a step, by its title. The whole row is the control. */
  const row = (title: string) => screen.getByRole('button', { name: new RegExp(title) });

  it('is a click on the row itself', async () => {
    draw(PROGRAMME);
    const control = row('Expand Binomials');
    expect(control).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(control);
    expect(row('Expand Binomials')).toHaveAttribute('aria-expanded', 'true');
  });

  it('reveals how to do it, how to know, and the trap', async () => {
    draw(PROGRAMME);
    await userEvent.click(row('Expand Binomials'));
    expect(screen.getByText('Multiply each term in the first bracket by each in the second.'))
      .toBeInTheDocument();
    expect(screen.getByText('You get 2x^2 + 11x - 21.')).toBeInTheDocument();
    expect(screen.getByText('Dropping the two middle terms when the bracket is squared.'))
      .toBeInTheDocument();
    expect(screen.getByText('20 minutes')).toBeInTheDocument();
  });

  it('says what verified it, because the table claims every step was', async () => {
    draw(PROGRAMME);
    await userEvent.click(row('Expand Binomials'));
    // One per open step: the step the reader is on is open already.
    expect(screen.getAllByText(/Verified by rules\+authored/)).toHaveLength(2);
  });

  it('closes again on a second click', async () => {
    draw(PROGRAMME);
    await userEvent.click(row('Expand Binomials'));
    await userEvent.click(row('Expand Binomials'));
    expect(row('Expand Binomials')).toHaveAttribute('aria-expanded', 'false');
  });

  it('leaves other open steps open, so two can be compared', async () => {
    draw(PROGRAMME);
    await userEvent.click(row('Expand Binomials'));
    await userEvent.click(row('Factor Simple Quadratics'));
    expect(row('Recognise a Quadratic')).toHaveAttribute('aria-expanded', 'true');
    expect(row('Expand Binomials')).toHaveAttribute('aria-expanded', 'true');
    expect(row('Factor Simple Quadratics')).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('when nothing has been written for a node', () => {
  it('falls back to the derived advice rather than drawing an empty list', () => {
    draw(null);
    // The derived ladder always produces something, so the panel is never bare.
    expect(screen.getByText('Your next move')).toBeInTheDocument();
    expect(screen.queryByText('Try:')).not.toBeInTheDocument();
  });

  it('draws the written programme the moment there is one', () => {
    draw(PROGRAMME);
    expect(screen.getAllByText('Try:').length).toBeGreaterThan(0);
  });
});

describe('the whole programme', () => {
  it('opens from the panel and lists every step', async () => {
    draw(PROGRAMME);
    await userEvent.click(screen.getByRole('button', { name: /All 5 steps/ }));
    // The two steps past the panel's three-step window, which is what "all"
    // is for.
    expect(screen.getByText('Use the Formula')).toBeInTheDocument();
    expect(screen.getByText('Complete the Square')).toBeInTheDocument();
    expect(screen.getAllByText('Try:')).toHaveLength(5);
  });
});

describe('the target problem', () => {
  const row = (title: string) => screen.getByRole('button', { name: new RegExp(title) });

  it('is what opening a step reveals', async () => {
    draw(PROGRAMME);
    await userEvent.click(row('Expand Binomials'));
    // One per open step, and the step the reader is on opens by itself.
    expect(screen.getAllByText('Target problem to solve')).toHaveLength(2);
  });

  it('is not on a closed step', () => {
    draw(PROGRAMME);
    // Only the current step is open on arrival, so exactly one slot shows.
    expect(screen.getAllByText('Target problem to solve')).toHaveLength(1);
  });

  it('names the step it belongs to while the problem itself is still a slot', () => {
    draw(PROGRAMME);
    const slot = screen.getByText(/will appear here/);
    expect(slot).toHaveTextContent('Recognise a Quadratic');
  });
});

describe('taking the section over', () => {
  it('tells the page when the step list opens, so the grid can widen', async () => {
    const { onExpand } = draw(PROGRAMME);
    onExpand.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /All 5 steps/ }));
    expect(onExpand).toHaveBeenLastCalledWith(true);
  });

  it('offers the way back by name rather than as a bare arrow', async () => {
    draw(PROGRAMME);
    await userEvent.click(screen.getByRole('button', { name: /All 5 steps/ }));
    expect(screen.getByRole('button', { name: /Back to Tree/ })).toBeInTheDocument();
  });

  it('puts the grid back when the reader goes back to the tree', async () => {
    const { onExpand } = draw(PROGRAMME);
    await userEvent.click(screen.getByRole('button', { name: /All 5 steps/ }));
    onExpand.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /Back to Tree/ }));
    expect(onExpand).toHaveBeenLastCalledWith(false);
  });

  it('keeps every step openable in the expanded list', async () => {
    draw(PROGRAMME);
    await userEvent.click(screen.getByRole('button', { name: /All 5 steps/ }));
    await userEvent.click(screen.getByRole('button', { name: /Use the Formula/ }));
    expect(screen.getByText('Compute b^2 - 4ac first and on its own.')).toBeInTheDocument();
  });
});
