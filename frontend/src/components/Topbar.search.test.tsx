/**
 * The search panel opens from three places: the magnifier in the bar, the
 * search bus (utils/searchBus, which any part of the app can call), and ⌘K.
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Topbar } from './Topbar';
import { renderWithProviders } from '@/test/render';
import { openSearch } from '@/utils/searchBus';

function magnifier() {
  return screen.getByRole('button', { name: 'Search tasks and pages' });
}

describe('opening the search', () => {
  it('opens when the rail asks for it', () => {
    renderWithProviders(<Topbar />);
    expect(magnifier()).toHaveAttribute('aria-expanded', 'false');
    act(() => openSearch());
    expect(magnifier()).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens and shuts on ⌘K, and on Ctrl+K off a Mac', () => {
    renderWithProviders(<Topbar />);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(magnifier()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(magnifier()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(document, { key: 'K', ctrlKey: true });
    expect(magnifier()).toHaveAttribute('aria-expanded', 'true');
  });

  it('ignores a plain K', () => {
    renderWithProviders(<Topbar />);
    fireEvent.keyDown(document, { key: 'k' });
    expect(magnifier()).toHaveAttribute('aria-expanded', 'false');
  });
});
