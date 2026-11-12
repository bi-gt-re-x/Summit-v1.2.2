/**
 * The far end of the hidden chain, and the redirect that used to swallow it.
 *
 * The pentagon's arrow sends the reader to `/calendar#void`. Two things have
 * to hold for anything to be waiting there, and only the first is obvious:
 *
 *   * the hook has to read `#void` and empty the page, and
 *   * `/calendar` has to still be `#void` after it has redirected.
 *
 * The second is the one that broke. `/calendar` is an alias for whichever of
 * the three views the account prefers, and the redirect was rebuilding the
 * path without the fragment — so the void opened on arrival and shut again a
 * frame later, when the router came back with a URL that no longer asked for
 * it. The pentagon looked broken; it was the doorway on the other side.
 *
 * That is why the redirect is tested here, beside the hook, rather than
 * wherever else routing might be checked. The two are one behaviour.
 */
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useVoid } from './useVoid';

function Void() {
  useVoid();
  return <div>the calendar</div>;
}

afterEach(() => {
  document.documentElement.classList.remove('egg-void');
  document.getElementById('voidRiddle')?.remove();
  document.querySelectorAll('[src*="secret"], [href*="secret"]').forEach((el) => el.remove());
});

describe('arriving at #void', () => {
  it('empties the page', () => {
    render(
      <MemoryRouter initialEntries={['/calendar/week#void']}>
        <Void />
      </MemoryRouter>,
    );
    expect(document.documentElement).toHaveClass('egg-void');
  });

  it('is a normal page without the fragment', () => {
    render(
      <MemoryRouter initialEntries={['/calendar/week']}>
        <Void />
      </MemoryRouter>,
    );
    expect(document.documentElement).not.toHaveClass('egg-void');
  });

  it('hands the page back on the way out', () => {
    const view = render(
      <MemoryRouter initialEntries={['/calendar/week#void']}>
        <Void />
      </MemoryRouter>,
    );
    expect(document.documentElement).toHaveClass('egg-void');

    view.unmount();
    expect(document.documentElement).not.toHaveClass('egg-void');
  });
});

