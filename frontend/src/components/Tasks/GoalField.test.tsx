/**
 * Choosing what a task is for, while writing it down.
 *
 * The link has always existed and could only ever be made after the fact, from
 * the row menu — so the one moment the reader knows the answer was the one
 * moment the app did not ask. What is pinned here is that asking stayed
 * optional, and that the default says what it actually does.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GoalField, MATCH_BY_NAME, linkableGoals } from './GoalField';
import { Composer } from './Composer';
import type { Goal } from '@/types';

const goal = (id: string, over: Partial<Goal> = {}): Goal =>
  ({
    id,
    title: `Goal ${id}`,
    status: 'active',
    measure: 'milestones',
    milestones: [],
    ...over,
  }) as unknown as Goal;

describe('the goal field', () => {
  it('opens on the matcher, not on "none"', () => {
    render(<GoalField goals={[goal('g1')]} value={MATCH_BY_NAME} onChange={vi.fn()} id="t" />);

    // The wording is the point. "None" would tell the reader that skipping
    // the field means the work counts toward nothing, and it usually does not.
    const select = screen.getByRole('combobox', { name: /counts toward/i });
    expect(select).toHaveValue('');
    expect(
      screen.getByRole<HTMLOptionElement>('option', { name: 'Work it out from the name' }).selected,
    ).toBe(true);
  });

  it('offers every outcome goal', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <GoalField goals={[goal('g1'), goal('g2')]} value="" onChange={onChange} id="t" />,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: /counts toward/i }), 'g2');
    expect(onChange).toHaveBeenCalledWith('g2');
  });

  it('is not there at all when there is nothing to file against', () => {
    // A form that asks a question with no answers is a form with a dead
    // control on it.
    const { container } = render(
      <GoalField goals={[]} value="" onChange={vi.fn()} id="t" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('says what each choice means when there is room to', () => {
    const { rerender } = render(
      <GoalField goals={[goal('g1')]} value="" onChange={vi.fn()} id="t" hint />,
    );
    expect(screen.getByText(/Linked if the name matches/)).toBeInTheDocument();

    rerender(<GoalField goals={[goal('g1')]} value="g1" onChange={vi.fn()} id="t" hint />);
    expect(screen.getByText(/whatever it is called/)).toBeInTheDocument();
  });
});

describe('which goals can be filed against', () => {
  it('takes the outcome goals and leaves the counters', () => {
    // A counter goal ("500 XP this month") advances itself off the ledger, so
    // offering it here would be offering to file work against something that
    // is not counting the work.
    const rows = linkableGoals([
      goal('outcome', { measure: 'milestones' }),
      goal('number', { measure: 'number' }),
      goal('counter', { measure: 'xp' }),
      goal('done', { measure: 'milestones', status: 'completed' }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(['outcome', 'number']);
  });
});

describe('the composer', () => {
  const show = (goals: Goal[]) => {
    const onAdd = vi.fn();
    render(
      <Composer
        subjects={[]}
        goals={goals}
        busy={false}
        onAdd={onAdd}
        defaultXp={10}
        defaultPriority="medium"
      />,
    );
    return onAdd;
  };

  it('sends no goal when the reader leaves the field alone', async () => {
    const user = userEvent.setup();
    const onAdd = show([goal('g1')]);

    await user.type(screen.getByLabelText('Task name'), 'Email Mr Chen');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    // Absent, not empty: the backend reads "no goal_id" as "let the matcher
    // decide", and '' would be a link to a goal that does not exist.
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]![0]).not.toHaveProperty('goal_id');
  });

  it('sends the goal the reader chose', async () => {
    const user = userEvent.setup();
    const onAdd = show([goal('g1')]);

    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.selectOptions(screen.getByRole('combobox', { name: /counts toward/i }), 'g1');
    await user.type(screen.getByLabelText('Task name'), 'USACO practice');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAdd.mock.calls[0]![0]).toMatchObject({ goal_id: 'g1' });
  });

  it('keeps the goal for the next task', async () => {
    // The name is the only field cleared. Somebody adding three tasks for one
    // goal chooses it once — the same rule the subject and difficulty follow.
    const user = userEvent.setup();
    const onAdd = show([goal('g1')]);

    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.selectOptions(screen.getByRole('combobox', { name: /counts toward/i }), 'g1');
    await user.type(screen.getByLabelText('Task name'), 'First');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.type(screen.getByLabelText('Task name'), 'Second');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAdd.mock.calls).toHaveLength(2);
    expect(onAdd.mock.calls[1]![0]).toMatchObject({ name: 'Second', goal_id: 'g1' });
  });
});
