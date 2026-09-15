/**
 * The page's four shortcuts, and the two rules that keep them from being a
 * fault.
 *
 * A single-letter binding is a shortcut when the reader is not typing and a
 * bug when they are — the lattice has a search field, a rename field and a
 * programme editor on it, and `P` while somebody writes "Prove the identity"
 * must not start a practice session. The same goes for a modifier: ⌘R is the
 * browser's reload and taking it would be taking something that is not ours.
 *
 * Both are one-line tests and both are the kind of thing that gets lost in a
 * refactor of the handler, which is why they are here rather than assumed.
 */
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLatticeKeys, type LatticeKeys } from './useLatticeKeys';

function Harness(props: LatticeKeys) {
  useLatticeKeys(props);
  return (
    <div>
      <input aria-label="a field" />
      <div contentEditable aria-label="an editor" />
    </div>
  );
}

function draw(over: Partial<LatticeKeys> = {}) {
  const keys = {
    onClear: vi.fn(),
    onHere: vi.fn(),
    onFit: vi.fn(),
    onPractise: vi.fn(),
    ...over,
  };
  const view = render(<Harness {...keys} />);
  return { ...keys, view };
}

describe('the lattice shortcuts', () => {
  it('runs the four verbs', () => {
    const keys = draw();

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'f' });
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: 'p' });

    expect(keys.onClear).toHaveBeenCalledTimes(1);
    expect(keys.onHere).toHaveBeenCalledTimes(1);
    expect(keys.onFit).toHaveBeenCalledTimes(1);
    expect(keys.onPractise).toHaveBeenCalledTimes(1);
  });

  it('takes the capital as well as the lower case', () => {
    const keys = draw();
    fireEvent.keyDown(window, { key: 'F' });
    expect(keys.onHere).toHaveBeenCalledTimes(1);
  });

  it('stands down while the reader is typing', () => {
    const keys = draw();
    const field = keys.view.getByLabelText('a field');

    fireEvent.keyDown(field, { key: 'p' });
    fireEvent.keyDown(field, { key: 'r' });
    expect(keys.onPractise).not.toHaveBeenCalled();
    expect(keys.onFit).not.toHaveBeenCalled();
  });

  it('stands down inside a rich field too', () => {
    // A rich editor is a div, so the tag test alone would let this through.
    const keys = draw();
    fireEvent.keyDown(keys.view.getByLabelText('an editor'), { key: 'f' });
    expect(keys.onHere).not.toHaveBeenCalled();
  });

  it('leaves the browser its own keys', () => {
    const keys = draw();
    fireEvent.keyDown(window, { key: 'r', metaKey: true });
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    expect(keys.onFit).not.toHaveBeenCalled();
    expect(keys.onHere).not.toHaveBeenCalled();
  });

  it('does nothing on P while nothing is selected', () => {
    const keys = draw({ onPractise: undefined });
    fireEvent.keyDown(window, { key: 'p' });
    expect(keys.onClear).not.toHaveBeenCalled();
  });

  it('is silent while it is switched off', () => {
    const keys = draw({ enabled: false });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(keys.onClear).not.toHaveBeenCalled();
  });
});
