/**
 * The in-app "are you sure?" that replaced `window.confirm`.
 *
 * What it owes the caller is an answer: true for the confirm button, false for
 * every way out — Cancel, Escape, the backdrop. And for a deletion the focus
 * starts on Cancel, so an Enter pressed by habit keeps the thing.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useConfirm, type ConfirmOptions } from './Confirm';

function Harness({ options, onAnswer }: { options: ConfirmOptions; onAnswer: (answer: boolean) => void }) {
  const [confirm, dialog] = useConfirm();
  return (
    <>
      <button type="button" onClick={async () => onAnswer(await confirm(options))}>
        Ask
      </button>
      {dialog}
    </>
  );
}

const DELETE: ConfirmOptions = { title: 'Delete “Essay”?', confirmLabel: 'Delete', danger: true };

describe('useConfirm', () => {
  it('renders nothing until it is asked', () => {
    render(<Harness options={DELETE} onAnswer={() => {}} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('answers yes from the confirm button', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    render(<Harness options={DELETE} onAnswer={onAnswer} />);
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete “Essay”?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onAnswer).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('answers no from Cancel and from Escape', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    render(<Harness options={DELETE} onAnswer={onAnswer} />);

    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await user.keyboard('{Escape}');

    expect(onAnswer.mock.calls).toEqual([[false], [false]]);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('starts a deletion on Cancel, and keeps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Harness options={DELETE} onAnswer={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('gives the focus back to what opened it', async () => {
    const user = userEvent.setup();
    render(<Harness options={DELETE} onAnswer={() => {}} />);
    const ask = screen.getByRole('button', { name: 'Ask' });
    await user.click(ask);
    await user.keyboard('{Escape}');
    expect(ask).toHaveFocus();
  });
});
