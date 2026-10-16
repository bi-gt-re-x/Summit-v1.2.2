/**
 * The day button's two guarantees: it cannot fire by accident, and it says what
 * it is about to do.
 *
 * The interesting cases are all about the dialog rather than the button — that
 * confirming is required, that the reviews question appears only when the
 * account rates its work at all, and that filtered-away tasks are disclosed
 * rather than silently swept up. The last one is the reason this component is
 * allowed to look past the page's filters in the first place, so it is the one
 * worth a test that fails loudly.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DayComplete } from './DayComplete';
import { task } from '@/test/factories';

const THREE = [
  task({ id: '1', title: 'Calculus problem set' }),
  task({ id: '2', title: 'Read chapter four' }),
  task({ id: '3', title: 'Physics lab writeup' }),
];

function setup(over: Partial<React.ComponentProps<typeof DayComplete>> = {}) {
  const onConfirm = vi.fn();
  render(
    <DayComplete
      tasks={THREE}
      hidden={0}
      busy={false}
      canReview
      onConfirm={onConfirm}
      {...over}
    />,
  );
  return { onConfirm, user: userEvent.setup() };
}

describe('the finish-the-day button', () => {
  it('is not there when the day has nothing left in it', () => {
    setup({ tasks: [] });
    expect(screen.queryByRole('button', { name: /today/i })).not.toBeInTheDocument();
  });

  it('counts the day in its label', () => {
    setup();
    expect(screen.getByRole('button', { name: "Complete all 3 of today's tasks" })).toBeInTheDocument();
  });

  it('reads as one task, not "1 tasks", when the day holds one', () => {
    setup({ tasks: [THREE[0]!] });
    expect(screen.getByRole('button', { name: "Complete today's task" })).toBeInTheDocument();
  });

  it('completes nothing until the dialog is confirmed', async () => {
    const { onConfirm, user } = setup();
    await user.click(screen.getByRole('button', { name: /today/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Complete 3' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('backs out on Cancel, having done nothing', async () => {
    const { onConfirm, user } = setup();
    await user.click(screen.getByRole('button', { name: /today/i }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('backs out on Escape too', async () => {
    const { onConfirm, user } = setup();
    await user.click(screen.getByRole('button', { name: /today/i }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('names the tasks it is about to complete', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /today/i }));
    expect(screen.getByText('Calculus problem set')).toBeInTheDocument();
    expect(screen.getByText('Read chapter four')).toBeInTheDocument();
    expect(screen.getByText('Physics lab writeup')).toBeInTheDocument();
  });

  it('stops naming them past the fourth and counts the rest', async () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      task({ id: String(i), title: `Task ${i}` }),
    );
    const { user } = setup({ tasks: many });
    await user.click(screen.getByRole('button', { name: /today/i }));
    expect(screen.getByText('and 3 more')).toBeInTheDocument();
  });

  it('asks about reviews, on by default, and passes the answer', async () => {
    const { onConfirm, user } = setup();
    await user.click(screen.getByRole('button', { name: /today/i }));
    const box = screen.getByRole('checkbox');
    expect(box).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Complete 3' }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('takes no for an answer on the reviews', async () => {
    const { onConfirm, user } = setup();
    await user.click(screen.getByRole('button', { name: /today/i }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Complete 3' }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('never offers reviews to an account that has them switched off', async () => {
    const { onConfirm, user } = setup({ canReview: false });
    await user.click(screen.getByRole('button', { name: /today/i }));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Complete 3' }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('says so when some of what it will complete is off screen', async () => {
    const { user } = setup({ hidden: 2 });
    await user.click(screen.getByRole('button', { name: /today/i }));
    expect(screen.getByText("2 of these aren't shown in the list.")).toBeInTheDocument();
  });

  it('keeps quiet when nothing is hidden', async () => {
    const { user } = setup({ hidden: 0 });
    await user.click(screen.getByRole('button', { name: /today/i }));
    expect(screen.queryByText(/not shown in the list/)).not.toBeInTheDocument();
  });
});
