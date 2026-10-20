/**
 * Plan rows whose work is done somewhere else: the review list and a skill tree.
 * See ./NextActions.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { NextAction, Plan } from '@/services/next';
import { NextActions } from './NextActions';

const row = (over: Partial<NextAction>): NextAction => ({
  id: 'r', kind: 'misses', title: 'Redo 2 problems you missed', because: 'All from Quadratics.',
  minutes: 6, weight: 760, ...over,
});

const plan = (actions: NextAction[]): Plan => ({
  budget: 45, actions, more: [], spare: 0, planned: actions.reduce((sum, one) => sum + one.minutes, 0), top: actions[0] ?? null,
});

describe('NextActions rows that point elsewhere', () => {
  it('a skill tree row links to the skill', () => {
    render(
      <MemoryRouter>
        <NextActions
          plan={plan([row({ id: 's', kind: 'skill', title: 'Algebra: step back to Arithmetic', to: '/skill-trees?node=m.arith' })])}
          onBudget={vi.fn()}
          onRefresh={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Skill tree')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open it' })).toHaveAttribute('href', '/skill-trees?node=m.arith');
  });

  it('the redo row scrolls to the review list on this page', () => {
    window.history.pushState({}, '', '/recommendations');
    const target = document.createElement('div');
    target.id = 'review';
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);
    render(
      <MemoryRouter>
        <NextActions plan={plan([row({ to: '/recommendations#review' })])} onBudget={vi.fn()} onRefresh={vi.fn()} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(target.scrollIntoView).toHaveBeenCalled();
    target.remove();
  });
});
