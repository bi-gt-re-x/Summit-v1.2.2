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
      checkEmail: vi.fn(async () => ({ success: true, valid: true, available: true })),
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

/** Sign-up's first half: type the email and continue to the second. */
async function startWith(email: string) {
  const start = document.getElementById('createStart')!;
  fireEvent.change(start.querySelector('[name=email]')!, { target: { value: email } });
  fireEvent.submit(start);
  await waitFor(() => expect(document.getElementById('createForm')).not.toHaveAttribute('hidden'));
}

/** Sign-up's second half, filled in and sent. */
function finishWith(name: string, password: string) {
  const form = document.getElementById('createForm')!;
  fireEvent.change(form.querySelector('[name=name]')!, { target: { value: name } });
  fireEvent.change(document.getElementById('createPassword')!, { target: { value: password } });
  fireEvent.click(form.querySelector('[name=consent]')!);
  fireEvent.click(form.querySelector('button[type=submit]')!);
}

beforeEach(() => {
  vi.mocked(authService.signup).mockReset();
});

describe('the login page', () => {
  it('keeps the contest step open for a signed-in account with a finished profile', () => {
    open('/login?auth=profile', { status: 'signed-in', profileComplete: true });
    expect(heading()).toBe('Your contest');
    expect(screen.queryByText('The dashboard')).not.toBeInTheDocument();
  });

  it('still sends a finished account on from the log-in panel', () => {
    open('/login?auth=login&next=/dashboard', { status: 'signed-in', profileComplete: true });
    expect(screen.getByText('The dashboard')).toBeInTheDocument();
  });

  it('asks a signed-out visitor on the profile panel to log in', () => {
    open('/login?auth=profile', { status: 'signed-out', profileComplete: false });
    expect(heading()).toBe('Log in');
  });

  it.each([
    ['create', 'Create account'],
    ['profile', 'Your contest'],
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
    await startWith('new@example.test');
    finishWith('New Reader', 'A-long-password-1');
    await waitFor(() =>
      expect(authService.signup).toHaveBeenCalledWith('New Reader', 'new@example.test', 'A-long-password-1'),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('ticks off each password rule as it is met', () => {
    open('/login?auth=create', { status: 'signed-out', profileComplete: false });
    const met = () => [...document.querySelectorAll('#pwRules li.is-met')].map((li) => li.textContent);
    fireEvent.change(document.getElementById('createPassword')!, { target: { value: 'abc' } });
    expect(met()).toHaveLength(1);
    expect(met()[0]).toContain('A lowercase letter');
    fireEvent.change(document.getElementById('createPassword')!, { target: { value: 'Abcdefg1!' } });
    expect(met()).toHaveLength(5);
  });

  it('asks for the email on its own, then a name and a password', async () => {
    open('/login?auth=create', { status: 'signed-out', profileComplete: false });
    expect(document.getElementById('createForm')).toHaveAttribute('hidden');
    expect(document.querySelectorAll('#createStart input')).toHaveLength(1);
    await startWith('new@example.test');
    expect(document.getElementById('createStart')).toHaveAttribute('hidden');
    expect(screen.getByText('new@example.test')).toBeInTheDocument();
    // Three fields in all: the email, a name and one password.
    expect(document.querySelectorAll('#createForm input:not([type=checkbox])')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(document.getElementById('createStart')).not.toHaveAttribute('hidden');
  });

  it("won't move on without a real-looking email", async () => {
    open('/login?auth=create', { status: 'signed-out', profileComplete: false });
    const start = document.getElementById('createStart')!;
    fireEvent.change(start.querySelector('[name=email]')!, { target: { value: 'not-an-email' } });
    fireEvent.submit(start);
    expect(await screen.findByText('Enter your email to continue.')).toBeInTheDocument();
    expect(document.getElementById('createForm')).toHaveAttribute('hidden');
  });

  it('opens on the second half with an email from the landing page', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>,
      {
        route: { pathname: '/login', search: '?auth=create', state: { email: 'from@home.test' } },
        auth: { status: 'signed-out', profileComplete: false },
      },
    );
    expect(document.getElementById('createForm')).not.toHaveAttribute('hidden');
    expect(screen.getByText('from@home.test')).toBeInTheDocument();
    await waitFor(() => expect(authService.checkEmail).toHaveBeenCalledWith('from@home.test'));
  });

  it('shows or hides the password', async () => {
    open('/login?auth=create', { status: 'signed-out', profileComplete: false });
    await startWith('new@example.test');
    const pw = document.getElementById('createPassword') as HTMLInputElement;
    expect(pw.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(pw.type).toBe('text');
  });

  it('says an email is taken as soon as the field is left', async () => {
    vi.mocked(authService.checkEmail).mockResolvedValueOnce({ success: true, valid: true, available: false });
    open('/login?auth=create', { status: 'signed-out', profileComplete: false });
    const email = document.querySelector('[data-step="create"] [name=email]')!;
    fireEvent.change(email, { target: { value: 'taken@example.test' } });
    fireEvent.blur(email);
    expect(await screen.findByText(/already has a Summit account/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in instead' })).toBeInTheDocument();
  });
});
