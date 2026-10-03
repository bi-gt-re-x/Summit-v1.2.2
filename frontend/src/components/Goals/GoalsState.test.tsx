/**
 * The three lines the Goals header opens with.
 *
 * It replaced a "Vision" line and a greeting that between them said the same
 * number twice, so the first thing worth pinning is that there is now one
 * count and it is the right one: the goals the Active Goals tab actually
 * draws. The old line was fed every active goal including the four system
 * counters, which was survivable while it was only prose — an account with two
 * outcome goals and four counters read "6 goals in flight" and nobody could
 * click it to find out otherwise.
 *
 * The third line can be clicked now, and that is what makes the count load
 * bearing rather than decorative. A button promising two goals has to produce
 * two goals, so every test here is really about the same property: the number
 * on the button and the set behind it are one thing.
 *
 * What is deliberately *not* counted is the goal nobody has begun. `goalHealth`
 * gives it its own state for a reason — a goal set this morning is not failing
 * — and folding it in here would fill the reader's one "show me the problem"
 * view with goals whose only problem is that they have not started.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GoalsState } from './Outcome';
import type { Goal, Task } from '@/types';

/** `n` days from today as `YYYY-MM-DD`, built from local parts rather than UTC. */
function day(offset: number): string {
  const at = new Date();
  at.setDate(at.getDate() + offset);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

/**
 * A goal measured by a number, which is the shortest route to a fixed health.
 *
 * The two states this file needs are both early returns in `goalHealth` — past
 * its date and not finished is always behind, and nothing recorded at all is
 * always not-started — so the fixtures below say what they mean.
 */
function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g-1',
    title: 'Reach USACO Gold',
    status: 'active',
    category: 'coding',
    measure: 'number',
    unit: 'points',
    target_number: 100,
    current_value: 50,
    subject_ids: 'algorithms',
    start_date: day(-60),
    created_at: `${day(-60)}T09:00:00`,
    deadline: day(30),
    milestones: [],
    ...over,
  } as unknown as Goal;
}

/** Past its date and half done: behind by the overdue rule, every time. */
const overdue = (over: Partial<Goal> = {}) => goal({ deadline: day(-3), ...over });

/** Nothing against it at all: not-started, which is not "needs attention". */
const untouched = (over: Partial<Goal> = {}) => goal({ current_value: 0, ...over });

/**
 * A goal that is genuinely fine, which takes more than a flag to build.
 *
 * Ahead of its pace and worked on recently: 90% done at the halfway point of
 * its window, with `evidence` beside it so it is not read as gone quiet.
 */
const healthy = (id: string) =>
  goal({ id, current_value: 90, start_date: day(-30), deadline: day(30) });

/** One task finished today against each of these goals. */
const evidence = (...ids: string[]): Task[] =>
  ids.map(
    (id, at) =>
      ({
        id: `t-${at}`,
        user_id: 'user-1',
        title: 'Practice set',
        description: '',
        priority: 'low',
        status: 'done',
        xp_value: 20,
        goal_id: id,
        created_at: `${day(-1)}T09:00:00`,
        completed_at: `${day(0)}T10:00:00`,
      }) as unknown as Task,
  );

const NO_TASKS: Task[] = [];

describe('what the header counts', () => {
  it('counts the goals it was given, and names their kinds', () => {
    render(
      <GoalsState
        goals={[goal({ id: 'a', category: 'coding' }), goal({ id: 'b', category: 'math' })]}
        tasks={NO_TASKS}
      />,
    );

    expect(screen.getByText(/goals in motion/)).toHaveTextContent('2 goals in motion');
    expect(screen.getByText('Coding · Math')).toBeInTheDocument();
  });

  it('says goal, singular, for one', () => {
    render(<GoalsState goals={[goal()]} tasks={NO_TASKS} />);
    expect(screen.getByText(/in motion/)).toHaveTextContent('1 goal in motion');
  });

  /* The kinds line qualifies the count; it is not a second list to read down.
     Past three it says how many more rather than growing. */
  it('names three kinds and counts the rest', () => {
    render(
      <GoalsState
        goals={[
          goal({ id: 'a', category: 'coding' }),
          goal({ id: 'b', category: 'math' }),
          goal({ id: 'c', category: 'music' }),
          goal({ id: 'd', category: 'fitness' }),
          goal({ id: 'e', category: 'personal' }),
        ]}
        tasks={NO_TASKS}
      />,
    );
    expect(screen.getByText(/Coding · Math · Music/)).toHaveTextContent('+2 more');
  });

  it('does not name the same kind twice', () => {
    render(
      <GoalsState
        goals={[goal({ id: 'a', category: 'math' }), goal({ id: 'b', category: 'math' })]}
        tasks={NO_TASKS}
      />,
    );
    expect(screen.getByText('Math')).toBeInTheDocument();
  });

  it('says what the page is for when there are no goals, and counts nothing', () => {
    render(<GoalsState goals={[]} tasks={NO_TASKS} />);
    expect(screen.getByText(/The first goal is the hard one/)).toBeInTheDocument();
    expect(screen.queryByText(/in motion/)).not.toBeInTheDocument();
  });
});

describe('the attention line', () => {
  it('offers nothing to press when nothing is wrong, and says so', () => {
    render(<GoalsState goals={[healthy('a')]} tasks={evidence('a')} onAttention={vi.fn()} />);

    expect(screen.getByText('All on track')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is a button when something needs attention, and reports how many', async () => {
    const onAttention = vi.fn();
    const user = userEvent.setup();
    render(
      <GoalsState
        goals={[overdue({ id: 'a' }), overdue({ id: 'b' }), healthy('c')]}
        tasks={evidence('c')}
        onAttention={onAttention}
      />,
    );

    const button = screen.getByRole('button', { name: /2 need attention/ });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.click(button);
    expect(onAttention).toHaveBeenCalledTimes(1);
  });

  it('says needs, singular, for one', () => {
    render(<GoalsState goals={[overdue()]} tasks={NO_TASKS} onAttention={vi.fn()} />);
    expect(screen.getByRole('button', { name: /1 needs attention/ })).toBeInTheDocument();
  });

  /* The point of the whole exercise: the number on the button is the size of
     the set the page will filter to, so a goal in one and not the other is the
     bug this test exists to catch. */
  it('leaves out the goal nobody has started, which is a different problem', () => {
    render(
      <GoalsState
        goals={[untouched({ id: 'a' }), untouched({ id: 'b' }), overdue({ id: 'c' })]}
        tasks={NO_TASKS}
        onAttention={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /1 needs attention/ })).toBeInTheDocument();
  });

  /* The label is the same string set either way, and `aria-pressed` carries
     the difference. A button that renames itself when pressed is announced as
     a different control, and the way back out is stated on the filtered list
     rather than a second time up here. */
  it('reads as pressed while the filter is on, without renaming itself', () => {
    const off = render(<GoalsState goals={[overdue()]} tasks={NO_TASKS} onAttention={vi.fn()} />);
    const name = screen.getByRole('button').textContent;
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
    off.unmount();

    render(<GoalsState goals={[overdue()]} tasks={NO_TASKS} on onAttention={vi.fn()} />);
    const pressed = screen.getByRole('button');
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    expect(pressed.textContent).toBe(name);
  });

  /* Without a handler there is nothing to press, and a button that does
     nothing is worse than a sentence — it invites a click and eats it. */
  it('is plain text when the page gives it nowhere to go', () => {
    render(<GoalsState goals={[overdue()]} tasks={NO_TASKS} />);

    expect(screen.getByText(/1 needs attention/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
