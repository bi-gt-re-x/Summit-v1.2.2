/**
 * The engine button in the top bar, where the light/dark switch used to be.
 *
 * A padlock for everyone until the account has earned the admin title in the
 * hidden chain. Then it opens the engine room, and leaves a pass for this
 * account in the tab's sessionStorage so frontend/secret/engine.js lets a
 * title holder in without today's unlock.
 */
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Topbar } from './Topbar';
import { renderWithProviders } from '@/test/render';

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('the engine button', () => {
  it('is locked without the title, and pressing it goes nowhere', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    renderWithProviders(<Topbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Locked' }));
    expect(assign).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('summit:engine-pass')).toBeNull();
  });

  it('opens the engine for an account that has earned the title', () => {
    localStorage.setItem('summitTitle:myles', 'Admin');
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    renderWithProviders(<Topbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Open the engine' }));
    expect(sessionStorage.getItem('summit:engine-pass')).toBe('myles');
    expect(assign).toHaveBeenCalledWith('/engine');
  });

  it("doesn't count somebody else's title", () => {
    localStorage.setItem('summitTitle:someone', 'Admin');
    renderWithProviders(<Topbar />);
    expect(screen.getByRole('button', { name: 'Locked' })).toBeInTheDocument();
  });

  it('has no light/dark switch any more', () => {
    renderWithProviders(<Topbar />);
    expect(screen.queryByLabelText(/dark mode/i)).not.toBeInTheDocument();
  });
});
