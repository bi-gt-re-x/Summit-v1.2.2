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
    problems: [],
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
    title: 'Recognize a Quadratic',
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
    expect(row('Recognize a Quadratic')).toBeInTheDocument();
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

/** The row for a step, by its title. The whole row is the control.
 *
 *  There are now two buttons carrying a step's title — the row and the
 *  "Problems for ..." link beside it — so the row is picked out by the thing
 *  only it has: an aria-expanded. */
const row = (title: string) =>
  screen
    .getAllByRole('button', { name: new RegExp(title) })
    .find((one) => one.hasAttribute('aria-expanded'))!;

/** The link beside a step that gives its problems the whole page. */
const workLink = (title: string) =>
  screen.getByRole('button', { name: new RegExp(`Problems for ${title}`) });

describe('opening a step', () => {

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
    expect(row('Recognize a Quadratic')).toHaveAttribute('aria-expanded', 'true');
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

  it('draws the written program the moment there is one', () => {
    draw(PROGRAMME);
    expect(screen.getAllByText('Try:').length).toBeGreaterThan(0);
  });
});

describe('the whole program', () => {
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
    expect(slot).toHaveTextContent('Recognize a Quadratic');
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
    await userEvent.click(row('Use the Formula'));
    expect(screen.getByText('Compute b^2 - 4ac first and on its own.')).toBeInTheDocument();
  });
});

describe('the problems screen', () => {
  it('is reached by a link beside the step, not by the row itself', async () => {
    draw(PROGRAMME);
    await userEvent.click(workLink('Expand Binomials'));
    expect(screen.getByRole('heading', { name: 'Expand Binomials' })).toBeInTheDocument();
  });

  it('clears everything else away', async () => {
    draw(PROGRAMME);
    // The other steps and the rest of the panel are on screen beforehand.
    expect(screen.getByText('Your progress')).toBeInTheDocument();
    await userEvent.click(workLink('Expand Binomials'));
    expect(screen.queryByText('Your progress')).not.toBeInTheDocument();
    expect(screen.queryByText('The curriculum')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Recognise a Quadratic/ })).not.toBeInTheDocument();
  });

  it('takes the section over, so the canvas goes too', async () => {
    const { onExpand } = draw(PROGRAMME);
    onExpand.mockClear();
    await userEvent.click(workLink('Expand Binomials'));
    expect(onExpand).toHaveBeenLastCalledWith(true);
  });

  it('opens light and ends heavy, with the bands named', async () => {
    draw(PROGRAMME);
    await userEvent.click(workLink('Expand Binomials'));
    const headings = screen.getAllByRole('heading', { level: 3 }).map((one) => one.textContent);
    expect(headings[0]).toMatch(/Warm-up/);
    expect(headings[headings.length - 1]).toMatch(/Stretch/);
  });

  it('leaves the problems themselves as slots for now', async () => {
    draw(PROGRAMME);
    await userEvent.click(workLink('Expand Binomials'));
    // 20 minutes buys four problems; see countFor in utils/problemSet.
    expect(screen.getAllByText(/will appear here/)).toHaveLength(4);
  });

  it('goes back to the steps it came from', async () => {
    draw(PROGRAMME);
    await userEvent.click(workLink('Expand Binomials'));
    await userEvent.click(screen.getByRole('button', { name: /Back to Steps/ }));
    expect(screen.getByText('Your progress')).toBeInTheDocument();
  });

  it('offers a way out of the takeover without climbing back', async () => {
    const { onExpand } = draw(PROGRAMME);
    await userEvent.click(workLink('Expand Binomials'));
    onExpand.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /Back to Tree/ }));
    expect(onExpand).toHaveBeenLastCalledWith(false);
  });

  it('is reachable from the expanded list as well as from the panel', async () => {
    draw(PROGRAMME);
    await userEvent.click(screen.getByRole('button', { name: /All 5 steps/ }));
    await userEvent.click(workLink('Use the Formula'));
    expect(screen.getByRole('heading', { name: 'Use the Formula' })).toBeInTheDocument();
  });

  it('does not replace expanding a step in place', async () => {
    draw(PROGRAMME);
    await userEvent.click(row('Expand Binomials'));
    expect(row('Expand Binomials')).toHaveAttribute('aria-expanded', 'true');
    // Still on the programme, not on the problems screen.
    expect(screen.getByText('Your progress')).toBeInTheDocument();
  });
});

describe('a node with nothing written for it', () => {
  /* Most of the library is still answered by the derived ladder in
     skills/improve, so this is the path the majority of readers are on. The
     problems have to be reachable from it or the feature is one almost nobody
     ever finds. */

  it('still offers a way into the problems', () => {
    draw(null);
    expect(screen.getAllByRole('button', { name: /Problems for/ }).length)
      .toBeGreaterThan(0);
  });

  it('opens the same screen, with the same slope', async () => {
    draw(null);
    const [first] = screen.getAllByRole('button', { name: /Problems for/ });
    await userEvent.click(first!);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((one) => one.textContent);
    expect(headings[0]).toMatch(/Warm-up/);
    expect(headings[headings.length - 1]).toMatch(/Stretch/);
    expect(screen.getAllByText(/will appear here/).length).toBeGreaterThan(0);
  });

  it('clears the page down the same way', async () => {
    draw(null);
    const [first] = screen.getAllByRole('button', { name: /Problems for/ });
    await userEvent.click(first!);
    expect(screen.queryByText('Your progress')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to Steps/ })).toBeInTheDocument();
  });

  it('takes the section over, as the written path does', async () => {
    const { onExpand } = draw(null);
    onExpand.mockClear();
    const [first] = screen.getAllByRole('button', { name: /Problems for/ });
    await userEvent.click(first!);
    expect(onExpand).toHaveBeenLastCalledWith(true);
  });

  it('titles the screen from the step rather than showing half a sentence', async () => {
    draw(null);
    const [first] = screen.getAllByRole('button', { name: /Problems for/ });
    await userEvent.click(first!);
    const heading = screen.getByRole('heading', { level: 2 });
    // A clause, not the whole instruction, and never trailing punctuation.
    expect(heading.textContent!.length).toBeLessThan(45);
    expect(heading.textContent).not.toMatch(/[,.;:]$/);
  });
});

describe('a written problem', () => {
  const withProblems = () => {
    const steps = PROGRAMME.map((step) => ({ ...step }));
    steps[1] = {
      ...steps[1]!,
      problems: [
        { slot: 1, weight: 'warmup' as const, prompt: 'Expand (x + 2)(x + 5).', answer: 'x^2 + 7x + 10.', hint: '' },
        { slot: 2, weight: 'core' as const, prompt: 'Expand (2x - 3)(x + 7).', answer: '2x^2 + 11x - 21.', hint: 'The middle term is 14x - 3x.' },
        { slot: 3, weight: 'stretch' as const, prompt: 'Expand (x + 5)^2.', answer: 'x^2 + 10x + 25.', hint: '' },
      ],
    };
    return steps;
  };
  const workLinkFor = (title: string) =>
    screen.getByRole('button', { name: new RegExp(`Problems for ${title}`) });

  it('shows the question and not the answer', async () => {
    draw(withProblems());
    await userEvent.click(workLinkFor('Expand Binomials'));
    expect(screen.getByText('Expand (2x - 3)(x + 7).')).toBeInTheDocument();
    expect(screen.queryByText('2x^2 + 11x - 21.')).not.toBeInTheDocument();
  });

  it('reveals the answer only when it is asked for', async () => {
    draw(withProblems());
    await userEvent.click(workLinkFor('Expand Binomials'));
    const [first] = screen.getAllByRole('button', { name: 'Show answer' });
    await userEvent.click(first!);
    expect(screen.getByText('x^2 + 7x + 10.')).toBeInTheDocument();
  });

  it('hides it again', async () => {
    draw(withProblems());
    await userEvent.click(workLinkFor('Expand Binomials'));
    const [first] = screen.getAllByRole('button', { name: 'Show answer' });
    await userEvent.click(first!);
    await userEvent.click(screen.getByRole('button', { name: 'Hide answer' }));
    expect(screen.queryByText('x^2 + 7x + 10.')).not.toBeInTheDocument();
  });

  it('offers a hint only where one was written', async () => {
    draw(withProblems());
    await userEvent.click(workLinkFor('Expand Binomials'));
    // Only the middle problem has a hint.
    expect(screen.getAllByRole('button', { name: 'Hint' })).toHaveLength(1);
  });

  it('spends the hint without giving the answer away', async () => {
    draw(withProblems());
    await userEvent.click(workLinkFor('Expand Binomials'));
    await userEvent.click(screen.getByRole('button', { name: 'Hint' }));
    expect(screen.getByText('The middle term is 14x - 3x.')).toBeInTheDocument();
    expect(screen.queryByText('2x^2 + 11x - 21.')).not.toBeInTheDocument();
  });

  it('draws the written questions in place of the slots', async () => {
    draw(withProblems());
    await userEvent.click(workLinkFor('Expand Binomials'));
    expect(screen.queryByText(/will appear here/)).not.toBeInTheDocument();
  });

  it('still shows slots for a step nobody has written problems for', async () => {
    draw(withProblems());
    await userEvent.click(workLinkFor('Recognize a Quadratic'));
    expect(screen.getAllByText(/will appear here/).length).toBeGreaterThan(0);
  });
});
