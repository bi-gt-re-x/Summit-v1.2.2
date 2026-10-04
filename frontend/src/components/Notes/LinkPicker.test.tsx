/**
 * The picker behind a note's link button.
 *
 * What it promises is small and easy to break quietly: only work that is still
 * ahead is offered, every row carries an address the router already serves,
 * and the whole thing can be done from the keyboard — type, press Return, and
 * the top row is the link.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { task } from '@/test/factories';
import type { Goal } from '@/types';

const today = new Date().toISOString().slice(0, 10);

function goal(id: string, title: string, overrides: Partial<Goal> = {}): Goal {
  return { id, title, status: 'active', progress: 42.6, ...overrides } as unknown as Goal;
}

const TASKS = [
  task({ id: 'a b/1', title: 'Revise integrals', due_date: today }),
  task({ id: 't2', title: 'Read chapter four' }),
  task({ id: 't3', title: 'Finished essay', status: 'done' }),
];

const GOALS = [
  goal('g1', 'Finish Calculus I'),
  goal('g2', 'Old reading goal', { status: 'completed' } as Partial<Goal>),
];

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    tasks: {
      ...(real.tasks as object),
      listTasks: () => Promise.resolve({ success: true, tasks: TASKS }),
    },
    goals: {
      ...(real.goals as object),
      getGoals: () => Promise.resolve({ success: true, goals: GOALS }),
    },
  };
});

import { LinkPicker } from './LinkPicker';

function open() {
  const onPick = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(<LinkPicker onPick={onPick} onClose={onClose} />);
  return { onPick, onClose, search: screen.getByLabelText('Search for something to link to') };
}

describe('the link picker', () => {
  it('opens on a few of each kind, under headings, with nothing typed', async () => {
    open();
    expect(await screen.findByText('Revise integrals')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Goals' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pages' })).toBeInTheDocument();
  });

  it('offers open tasks and active goals only', async () => {
    open();
    await screen.findByText('Revise integrals');
    expect(screen.getByText('Read chapter four')).toBeInTheDocument();
    expect(screen.getByText('Finish Calculus I')).toBeInTheDocument();
    expect(screen.queryByText('Finished essay')).not.toBeInTheDocument();
    expect(screen.queryByText('Old reading goal')).not.toBeInTheDocument();
  });

  it('says when a task is due, and a goal how far along it is', async () => {
    open();
    const due = (await screen.findByText('Revise integrals')).closest('button')!;
    expect(due).toHaveTextContent('Today');
    expect(screen.getByText('Read chapter four').closest('button')).toHaveTextContent('No date');
    expect(screen.getByText('Finish Calculus I').closest('button')).toHaveTextContent('43%');
  });

  it('hands back a deep link when a task is clicked, with the id escaped', async () => {
    const { onPick } = open();
    await userEvent.click(await screen.findByText('Revise integrals'));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'task', label: 'Revise integrals', href: '/tasks?task=a%20b%2F1' }),
    );
  });

  it('hands back the goal panel address when a goal is clicked', async () => {
    const { onPick } = open();
    await userEvent.click(await screen.findByText('Finish Calculus I'));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'goal', href: '/goals?goal=g1' }),
    );
  });

  it('narrows to what is typed', async () => {
    const { search } = open();
    await screen.findByText('Revise integrals');
    await userEvent.type(search, 'integ');
    await waitFor(() => expect(screen.queryByText('Read chapter four')).not.toBeInTheDocument());
    expect(screen.getByText('Revise integrals')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Goals' })).not.toBeInTheDocument();
  });

  it('takes the closest match on Return, ranking an exact name first', async () => {
    const { onPick, search } = open();
    await screen.findByText('Revise integrals');
    // "Goals" is a page by exactly that name, so it outranks any page or
    // goal that merely starts with or contains the word.
    await userEvent.type(search, 'goals{Enter}');
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'page', href: '/goals' }));
  });

  it('does nothing on Return when nothing matches, and says so', async () => {
    const { onPick, search } = open();
    await screen.findByText('Revise integrals');
    await userEvent.type(search, 'zzqqxx{Enter}');
    expect(await screen.findByText('Nothing here by that name.')).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const { onClose, search } = open();
    await userEvent.type(search, '{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
