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
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LatticePanel } from './LatticePanel';
import type { GraphNode, NodeStatus, SkillGraph } from '@/utils/skillGraph';
import type { NodeWork } from '@/services/skillProgress';

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
  render(<LatticePanel graph={built} node={picked} onSelect={onSelect} />);
  return { onSelect };
}

describe('the lattice panel', () => {
  it('separates the three kinds of claim', () => {
    draw('algebra');
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What to learn' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Steps' })).toBeInTheDocument();
  });

  it('says where the reader stands before it says a percentage', () => {
    draw('algebra');
    expect(screen.getByText(/Open now. Nothing in the way/)).toBeInTheDocument();
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
    const why = screen.getByLabelText('What you need first');
    expect(within(why).getByText('fractions')).toBeInTheDocument();
    expect(within(why).getByText('negatives')).toBeInTheDocument();
  });

  it('says so when a node sits on nothing', () => {
    draw('fractions');
    expect(screen.getByText(/A starting point/)).toBeInTheDocument();
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

describe('the short panel', () => {
  function drawBrief(id: string) {
    const built = graph();
    const picked = built.nodes.find((one) => one.id === id)!;
    render(<LatticePanel brief graph={built} node={picked} onSelect={vi.fn()} />);
  }

  it('opens with progress and steps only', () => {
    drawBrief('algebra');
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Steps' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What to learn' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Problems for/)).not.toBeInTheDocument();
    expect(screen.queryByText('Common trap')).not.toBeInTheDocument();
  });

  it('shows the rest on Show details, and hides it again', () => {
    drawBrief('algebra');
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }));
    expect(screen.getByRole('heading', { name: 'What to learn' })).toBeInTheDocument();
    expect(screen.getAllByText(/Problems for/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByRole('heading', { name: 'What to learn' })).not.toBeInTheDocument();
  });
});

describe('work, not clicks', () => {
  // The panel's buttons used to add XP for a click. They make work now: a
  // session on the calendar, or the skill check. And the bar says which
  // tasks filled it.
  function work(over: Partial<NodeWork> = {}): NodeWork {
    return {
      sessions: 2,
      target: 4,
      percent: 50,
      ready: false,
      on: '',
      last: '2026-10-21',
      planned: 0,
      goal_ids: [],
      check: null,
      work: [
        { kind: 'task', id: 't1', title: 'Algebra drills', day: '2026-10-21', sessions: 1, count: 1, done: true, how: 'named' },
        { kind: 'task', id: 't2', title: 'Algebra review', day: '2026-10-19', sessions: 1, count: 1, done: true, how: 'named' },
      ],
      tasks: 2,
      ...over,
    };
  }

  function drawWork(
    id: string,
    props: Partial<React.ComponentProps<typeof LatticePanel>> = {},
    over: Record<string, Partial<GraphNode>> = {},
  ) {
    const built = graph(over);
    const picked = built.nodes.find((one) => one.id === id)!;
    const handlers = { onBook: vi.fn(), onCheck: vi.fn(), onMoveOff: vi.fn() };
    render(
      <MemoryRouter>
        <LatticePanel graph={built} node={picked} onSelect={vi.fn()} {...handlers} {...props} />
      </MemoryRouter>,
    );
    return handlers;
  }

  it('says how many sessions are done and lists the work that counted', () => {
    drawWork('algebra', { work: work() }, { algebra: { status: 'progress', percent: 50 } });
    expect(screen.getByText(/2 of 4 sessions done. 2 more and it's mastered./)).toBeInTheDocument();
    const list = screen.getByLabelText('Work that counted');
    expect(within(list).getByText('Algebra drills')).toBeInTheDocument();
    expect(within(list).getByText('Algebra review')).toBeInTheDocument();
  });

  it('shows a repeated name once, with how many', () => {
    drawWork(
      'algebra',
      {
        work: work({
          work: [{ kind: 'task', id: 't9', title: 'Orchestra rehearsal', day: '2026-10-21', sessions: 40, count: 40, done: true, how: 'named' }],
          tasks: 43,
        }),
      },
      { algebra: { status: 'progress' } },
    );
    expect(screen.getByText('Orchestra rehearsal')).toBeInTheDocument();
    expect(screen.getByText(/40 tasks/)).toBeInTheDocument();
    expect(screen.getByText('Plus 3 earlier tasks.')).toBeInTheDocument();
  });

  it('takes a task off the skill', () => {
    const { onMoveOff } = drawWork('algebra', { work: work() }, { algebra: { status: 'progress' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Not this skill' })[0]!);
    expect(onMoveOff).toHaveBeenCalledWith('t1');
  });

  it('leads with planning a session on an open node with no check', () => {
    const { onBook } = drawWork('algebra');
    expect(screen.queryByRole('button', { name: /skill check/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Plan a session' }));
    expect(onBook).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Practice/ })).toBeNull();
  });

  it('offers the check beside the session as the way to test out', () => {
    drawWork('algebra', { checkable: true });
    const buttons = screen.getAllByRole('button', { name: /Plan a session|Take the skill check/ });
    expect(buttons.map((button) => button.textContent)).toEqual(['Plan a session', 'Take the skill check']);
    expect(buttons[1]).toHaveClass('is-second');
  });

  it('leads with the check once the sessions are in', () => {
    const { onCheck } = drawWork(
      'algebra',
      { checkable: true, work: work({ sessions: 4, percent: 100, ready: true }) },
      { algebra: { status: 'progress', percent: 100 } },
    );
    expect(screen.getByText(/Pass the skill check to master it/)).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /Plan a session|Take the skill check/ });
    expect(buttons.map((button) => button.textContent)).toEqual(['Take the skill check', 'Plan a session']);
    fireEvent.click(buttons[0]!);
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it('sends a locked node to what is in the way rather than to a check', () => {
    drawWork('linear', { checkable: true });
    expect(screen.getByRole('button', { name: 'Start with algebra' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /skill check|Plan a session/ })).toBeNull();
  });

  it('says what was booked and links to the timer', () => {
    drawWork('algebra', {
      booking: { busy: false, task: { id: 'b1', title: 'algebra: Step 1', start: '2026-10-25T16:30', end: '2026-10-25T17:00', xp: 15 } },
    });
    expect(screen.getByText('algebra: Step 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start it on the timer' })).toHaveAttribute('href', '/timer?task=b1');
  });

  it('names the goals the skill feeds', () => {
    drawWork('algebra', { work: work({ goal_ids: ['g1'] }), goals: { g1: 'Pass the AMC 10' } });
    expect(screen.getByRole('link', { name: 'For your goal: Pass the AMC 10' })).toHaveAttribute('href', '/goals?goal=g1');
  });

  it('says how to get started when nothing has counted yet', () => {
    drawWork('algebra');
    expect(screen.getByText(/Nothing counted yet. Finish a task with algebra in its name/)).toBeInTheDocument();
  });

  it('says when it was mastered and that the check was passed', () => {
    drawWork(
      'fractions',
      { work: work({ on: '2026-10-20', check: { tries: 1, best: 5, asked: 5, passed_on: '2026-10-20', last_on: '2026-10-20' } }) },
      { fractions: { on: '2026-10-20' } },
    );
    expect(screen.getByText(/Mastered on .*20.*You passed the skill check./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mastered/ })).toBeDisabled();
  });
});
