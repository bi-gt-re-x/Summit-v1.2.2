/**
 * A closed disclosure has to be closed to everybody.
 *
 * Both collapses on this page are a CSS grid row going to `0fr` with
 * `overflow: hidden`. That hides the content from the eye and from nothing
 * else: it stayed in the accessibility tree and in the tab order, so a panel
 * group announcing `aria-expanded="false"` would have a screen reader read its
 * charts out anyway, and a keyboard user would tab into buttons that were not
 * on the screen.
 *
 * `inert` is what actually closes it, and these are the tests that say so. They
 * assert on the attribute rather than on computed styles because jsdom does not
 * lay anything out — there is no width to measure and `overflow: hidden` means
 * nothing to it. The attribute is the contract the browser then honours.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PanelGroup } from './charts';

function bodyOf(container: HTMLElement, selector: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`no ${selector} in the render`);
  return found;
}

describe('PanelGroup', () => {
  it('is inert while shut and live once open', async () => {
    const { container } = render(
      <PanelGroup title="Why it happens" note="the mechanism">
        <button type="button">A control nobody can see</button>
      </PanelGroup>,
    );

    expect(bodyOf(container, '.ax-group-body')).toHaveAttribute('inert');
    const head = screen.getByRole('button', { name: /Why it happens/ });
    expect(head).toHaveAttribute('aria-expanded', 'false');

    // Opened by pressing it, not by re-rendering with `defaultOpen` — that prop
    // only seeds the initial state, so a rerender would leave it shut and the
    // test would be asserting nothing.
    await userEvent.click(head);

    expect(bodyOf(container, '.ax-group-body')).not.toHaveAttribute('inert');
    expect(head).toHaveAttribute('aria-expanded', 'true');
  });

  it('states its title as a heading, so the groups are in the outline', () => {
    // They were a <strong> inside a button, which is not a heading and does not
    // appear when a reader moves through the page by one. The groups are what
    // organise the tab; leaving them out of the outline left fifteen equal
    // panels and no structure.
    render(
      <PanelGroup title="What is true now" note="the state of things">
        <p>evidence</p>
      </PanelGroup>,
    );
    expect(
      screen.getByRole('heading', { name: /What is true now/, level: 2 }),
    ).toBeInTheDocument();
  });
});

