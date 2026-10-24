/**
 * Every overdue task in one container, every task due today in another.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NextActions, groupRows } from './NextActions';
import { draw } from './tabs/fixtures';
import type { NextAction, Plan } from '@/services/next';

const row = (id: string, kind: NextAction['kind'], title: string, because: string): NextAction => ({
  id,
  kind,
  title,
  because,
  minutes: 30,
  taskId: id,
  weight: 1,
});

const late = [
  row('o1', 'overdue', 'Finish "Problem set"', "Due 7 days ago. It's your oldest open task."),
  row('o2', 'overdue', 'Finish "Lab agenda"', "Due 3 days ago. It's your oldest open task."),
];
const today = [
  row('d1', 'due', 'Finish "Ice bath"', 'Due today.'),
  row('d2', 'due', 'Finish "Long run"', 'Due today.'),
];
const goal = row('g1', 'goal', 'Plan the next step', 'Nothing finished lately.');

describe('groupRows', () => {
  it('folds the overdue and due-today rows into one each, where the first one was', () => {
    const { top, rest } = groupRows([late[0]!, goal, today[0]!], [late[1]!, today[1]!]);
    expect(top.map((item) => (item.type === 'one' ? item.item.id : item.kind))).toEqual([
      'overdue',
      'g1',
      'due',
    ]);
    expect(rest).toEqual([]);
    const overdue = top[0]!;
    expect(overdue.type === 'group' && overdue.items.map((item) => item.id)).toEqual(['o1', 'o2']);
  });

  it('leaves a lone overdue task as a plain row', () => {
    const { top } = groupRows([late[0]!, goal], []);
    expect(top.every((item) => item.type === 'one')).toBe(true);
  });
});

describe('NextActions', () => {
  it('draws one Overdue container listing each task once', () => {
    const plan: Plan = {
      budget: 60,
      actions: [late[0]!, late[1]!, today[0]!, today[1]!],
      more: [],
      spare: 0,
      planned: 120,
      top: null,
    };
    draw(<NextActions plan={plan} onBudget={() => undefined} onRefresh={() => undefined} />);
    expect(screen.getByText('Finish 2 overdue tasks')).toBeInTheDocument();
    expect(screen.getByText('Finish 2 tasks due today')).toBeInTheDocument();
    expect(screen.getByText('Problem set')).toBeInTheDocument();
    expect(screen.getByText('Due 7 days ago')).toBeInTheDocument();
    expect(screen.queryByText(/oldest open task/)).not.toBeInTheDocument();
  });
});
