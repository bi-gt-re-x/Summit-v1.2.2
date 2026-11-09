/**
 * The dashboard's goals card: which two goals it picks, and that a goal with
 * a broken stored number can't break the card.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { GoalsCard } from './GoalsCard';
import type { Goal } from '@/types';

function goal(over: Record<string, unknown> = {}): Goal {
  return {
    id: 'g',
    title: 'A goal',
    status: 'active',
    measure: 'number',
    current_value: 50,
    target_number: 100,
    start_date: '2026-07-01',
    created_at: '2026-07-01T09:00:00',
    ...over,
  } as unknown as Goal;
}

function show(goals: Goal[]) {
  render(
    <MemoryRouter>
      <GoalsCard goals={goals} />
    </MemoryRouter>,
  );
}

describe('the goals card', () => {
  it('shows 0% rather than NaN% for a value that is not a number', () => {
    show([goal({ id: 'a', title: 'Broken', current_value: 'abc' })]);
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('still picks two when goals tie or are already full', () => {
    show([
      goal({ id: 'a', title: 'Full one', current_value: 100 }),
      goal({ id: 'b', title: 'Tied one', current_value: 40 }),
      goal({ id: 'c', title: 'Tied two', current_value: 40 }),
    ]);
    // Least finished first among undated goals; the full one has no slot.
    expect(screen.getByText('Tied one')).toBeInTheDocument();
    expect(screen.getByText('Tied two')).toBeInTheDocument();
    expect(screen.queryByText('Full one')).not.toBeInTheDocument();
  });

  it('says so when there are no active goals', () => {
    show([goal({ status: 'completed' })]);
    expect(screen.getByText(/No goals yet/)).toBeInTheDocument();
  });
});
