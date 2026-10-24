/**
 * The search is a field in the bar. The search bus (utils/searchBus) and ⌘K
 * put the caret in it, and matches drop down under it as you type, with no
 * second box and no help text in the way.
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Topbar } from './Topbar';
import { renderWithProviders } from '@/test/render';
import { openSearch } from '@/utils/searchBus';

function field() {
  return screen.getByRole('combobox', { name: 'Search tasks and pages' });
}

describe('the search field', () => {
  it('takes the caret when the rail asks for it', () => {
    renderWithProviders(<Topbar />);
    expect(document.activeElement).not.toBe(field());
    act(() => openSearch());
    expect(document.activeElement).toBe(field());
  });

  it('takes the caret on ⌘K, and on Ctrl+K off a Mac', () => {
    renderWithProviders(<Topbar />);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(document.activeElement).toBe(field());
    field().blur();
    fireEvent.keyDown(document, { key: 'K', ctrlKey: true });
    expect(document.activeElement).toBe(field());
  });

  it('ignores a plain K', () => {
    renderWithProviders(<Topbar />);
    fireEvent.keyDown(document, { key: 'k' });
    expect(document.activeElement).not.toBe(field());
  });

  it('shows page matches right under the field, in one box', () => {
    renderWithProviders(<Topbar />);
    act(() => field().focus());
    expect(field()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Two things are searched/)).toBeNull();

    fireEvent.change(field(), { target: { value: 'calendar' } });
    expect(field()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('clears and closes on Escape', () => {
    renderWithProviders(<Topbar />);
    act(() => field().focus());
    fireEvent.change(field(), { target: { value: 'calendar' } });
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(field()).toHaveValue('');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
