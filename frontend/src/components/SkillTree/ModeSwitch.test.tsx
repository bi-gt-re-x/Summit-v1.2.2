/**
 * Three states of one setting, and the part of that which is not decoration.
 *
 * The switch itself is three buttons and would not be worth a test, except
 * that it claims to be a radio group — and that claim is the whole of what a
 * screen reader is told about this control. Three buttons that look chosen and
 * announce nothing is the usual way a segmented control goes wrong, so the
 * `aria-checked` state is pinned here.
 *
 * What each mode *does* is tested where it is decided: `pathOf` in
 * skills/route for what Path leaves out, and the stylesheet for what Progress
 * recolours.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ModeSwitch, TREE_MODES } from './ModeSwitch';

function draw(over: Partial<React.ComponentProps<typeof ModeSwitch>> = {}) {
  const onMode = vi.fn();
  render(<ModeSwitch mode="map" onMode={onMode} say="Every skill in Mathematics." {...over} />);
  return { onMode };
}

describe('the mode switch', () => {
  it('is one choice with one answer, not three buttons', () => {
    draw({ mode: 'path' });
    const options = screen.getAllByRole('radio');

    expect(options).toHaveLength(TREE_MODES.length);
    expect(options.filter((one) => one.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Path' })).toBeChecked();
  });

  it('reports the mode that was pressed', async () => {
    const user = userEvent.setup();
    const { onMode } = draw();

    await user.click(screen.getByRole('radio', { name: 'Progress' }));
    expect(onMode).toHaveBeenCalledWith('progress');
  });

  it('says what the canvas is showing', () => {
    // The line is what makes the second press deliberate rather than a guess
    // between three one-word labels.
    draw({ say: '12 of 63 skills — what is behind you.' });
    expect(screen.getByText('12 of 63 skills — what is behind you.')).toBeInTheDocument();
  });
});
