/**
 * A task row says how many notes are about it, and is a way into them.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { task } from '@/test/factories';
import { TaskRow } from './TaskRow';

function show(notes: number, status: 'todo' | 'done' = 'todo') {
  const noop = vi.fn();
  return renderWithProviders(
    <ul>
      <TaskRow task={task({ id: 't-1', title: 'Revise integrals', status })} subject={null} goals={[]}
        estimate={null} notes={notes} selected={false} starred={false} busy={false}
        onSelect={noop} onComplete={noop} onReopen={noop} onRename={noop} onDelete={noop}
        onStar={noop} onLink={noop} />
    </ul>,
    { route: '/tasks' },
  );
}

describe('the notes on a task row', () => {
  it('counts them and links to them', () => {
    show(2);
    expect(screen.getByRole('link', { name: /2 notes/i })).toHaveAttribute('href', '/notes?task=t-1');
  });

  it('draws nothing when there are none', () => {
    show(0);
    expect(screen.queryByRole('link', { name: /note/i })).not.toBeInTheDocument();
  });

  it('offers a new one, and focus, from the menu', async () => {
    show(0);
    await userEvent.click(screen.getByRole('button', { name: /more for revise integrals/i }));
    expect(screen.getByRole('link', { name: /write a note/i })).toHaveAttribute('href', '/notes?task=t-1&new=1');
    expect(screen.getByRole('link', { name: /focus on this/i })).toHaveAttribute('href', '/timer?task=t-1');
  });
});
