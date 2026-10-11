/**
 * The sign-up and log-in flow, at the seams found walking it end to end on
 * 2026-10-11: About you must survive a reload (the login page used to send a
 * finished profile straight on, past it), a signed-out visitor on a panel
 * that saves to an account is asked to log in, every panel names itself in
 * the tab, and sign-up refreshes the account before it shows the profile
 * panel (without that, the panel's own guard read the account as signed out
 * and showed Log in).
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';
import { renderWithProviders } from '@/test/render';
import type { AuthValue } from '@/context/contexts';

vi.mock('@/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services')>();
  return {
    ...actual,
    auth: {
      ...actual.auth,
      providers: vi.fn(async () => ({ success: true, google: false })),
      signup: vi.fn(),
      verifyStatus: vi.fn(async () => ({ success: true, verified: false, signed_in: true })),
    },
  };
});

const { auth: authService } = await import('@/services');

function open(route: string, auth: Partial<AuthValue>) {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<p>The dashboard</p>} />
    </Routes>,
    { route, auth },
  );
}

const heading = () => document.getElementById('authHeading')?.textContent;

beforeEach(() => {
  vi.mocked(authService.signup).mockReset();
});

describe('the login page', () => {
  it('keeps About you open for a signed-in account with a finished profile', () => {
    open('/login?auth=about', { status: 'signed-in', profileComplete: true });
    expect(heading()).toBe('About you');
    expect(screen.queryByText('The dashboard')).not.toBeInTheDocument();
  });

  it('still sends a finished account on from the log-in panel', () => {
    open('/login?auth=login&next=/dashboard', { status: 'signed-in', profileComplete: true });
    expect(screen.getByText('The dashboard')).toBeInTheDocument();
  });

  it('asks a signed-out visitor on About you or the profile panel to log in', () => {
    open('/login?auth=about', { status: 'signed-out', profileComplete: false });
    expect(heading()).toBe('Log in');
  });

  it.each([
    ['create', 'Create account'],
    ['profile', 'Finish your profile'],
    ['about', 'About you'],
    ['inbox', 'Check your inbox'],
  ])('names the %s panel in the tab', (step, title) => {
    open(`/login?auth=${step}`, { status: 'signed-in', profileComplete: false });
    expect(document.title).toContain(title);
  });

  it('refreshes the account before it shows the profile panel after sign-up', async () => {
    const refresh = vi.fn(async () => {});
    vi.mocked(authService.signup).mockResolvedValue({
      success: true, email: 'new@example.test', dev_link: null, mail_failed: false,
    } as never);
    open('/login?auth=create', { status: 'signed-out', profileComplete: false, refresh });
    const form = document.querySelector('[data-step="create"] form')!;
    fireEvent.change(form.querySelector('[name=name]')!, { target: { value: 'New Reader' } });
    fireEvent.change(form.querySelector('[name=email]')!, { target: { value: 'new@example.test' } });
    fireEvent.change(document.getElementById('createPassword')!, { target: { value: 'A-long-password-1' } });
    fireEvent.click(form.querySelector('[name=consent]')!);
    fireEvent.click(form.querySelector('button[type=submit]')!);
    await waitFor(() => expect(authService.signup).toHaveBeenCalled());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
