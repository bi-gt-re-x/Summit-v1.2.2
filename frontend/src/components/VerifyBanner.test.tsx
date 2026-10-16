/**
 * The confirm-your-e-mail strip.
 *
 * What is worth testing here is not how it looks — it is the four conditions
 * under which it must not appear, because each of them is a way for a request
 * to turn back into the door it replaced. A banner over a confirmed account is
 * a lie; one over a signed-out visitor is a lie about somebody who does not
 * exist; one that cannot be dismissed is a modal in a different shape; and one
 * dismissed for ever means the address is never confirmed and the account
 * cannot be recovered.
 *
 * The fifth is the opposite failure: a banner that is put away on this tab
 * must come back on the next visit, or "dismiss" quietly became "never ask".
 * That one is asserted through `sessionStorage` directly, because a new visit
 * is exactly what a test cannot stage by re-rendering.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyBanner } from './VerifyBanner';
import { renderWithProviders } from '@/test/render';
import type { AuthValue } from '@/context/contexts';

vi.mock('@/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services')>();
  return {
    ...actual,
    auth: { ...actual.auth, resendVerification: vi.fn() },
  };
});

const { auth: authService } = await import('@/services');
const resend = vi.mocked(authService.resendVerification);

/** The ask, as the reader sees it. */
const ASK = /confirm your email/i;

function show(auth: Partial<AuthValue> = {}) {
  return renderWithProviders(<VerifyBanner />, { auth });
}

beforeEach(() => {
  sessionStorage.clear();
  resend.mockReset();
  resend.mockResolvedValue({
    success: true, email: 'newcomer@example.test', sent: true,
    dev_link: null, message: 'Sent again to newcomer@example.test.',
  });
});

describe('when it appears', () => {
  it('asks an account whose address is not confirmed', () => {
    show({ emailVerified: false });
    expect(screen.getByText(ASK)).toBeInTheDocument();
  });

  it('says outright that nothing is blocked', () => {
    /* The whole point of the change is that the app works meanwhile. A strip
       that only says "confirm your e-mail" reads as a warning that something
       is wrong, which is the impression the door used to give. */
    show({ emailVerified: false });
    expect(screen.getByText(/everything works while you wait/i)).toBeInTheDocument();
  });

  it('says nothing to an account that has confirmed', () => {
    show({ emailVerified: true });
    expect(screen.queryByText(ASK)).not.toBeInTheDocument();
  });

  it('says nothing to a signed-out visitor', () => {
    show({ status: 'signed-out', username: null, emailVerified: false });
    expect(screen.queryByText(ASK)).not.toBeInTheDocument();
  });

  it('says nothing while the account is still being read', () => {
    /* `emailVerified` starts true in the provider for this reason, but the
       status check is the one that holds if that default ever changes. */
    show({ status: 'loading', emailVerified: false });
    expect(screen.queryByText(ASK)).not.toBeInTheDocument();
  });
});

describe('putting it away', () => {
  it('can be dismissed', () => {
    show({ emailVerified: false });
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText(ASK)).not.toBeInTheDocument();
  });

  it('is put away for this session and not for good', () => {
    /* Written to sessionStorage rather than localStorage, so the next visit
       asks again. An address that is never confirmed is an account that can
       never be recovered — see the note in VerifyBanner.tsx. */
    show({ emailVerified: false, username: 'newcomer' });
    fireEvent.click(screen.getByLabelText('Dismiss'));

    expect(sessionStorage.getItem('summit.verify-banner.dismissed')).toBe('newcomer');
    expect(localStorage.getItem('summit.verify-banner.dismissed')).toBeNull();
  });

  it('asks the next account on this tab, even after a dismissal', () => {
    sessionStorage.setItem('summit.verify-banner.dismissed', 'someone-else');
    show({ emailVerified: false, username: 'newcomer' });
    expect(screen.getByText(ASK)).toBeInTheDocument();
  });

  it('stays away for the account that dismissed it', () => {
    sessionStorage.setItem('summit.verify-banner.dismissed', 'newcomer');
    show({ emailVerified: false, username: 'newcomer' });
    expect(screen.queryByText(ASK)).not.toBeInTheDocument();
  });
});

describe('sending it again', () => {
  it('asks the server and reports what it said', async () => {
    show({ emailVerified: false });
    fireEvent.click(screen.getByRole('button', { name: /send it again/i }));

    await waitFor(() =>
      expect(screen.getByText(/sent again to newcomer@example\.test/i)).toBeInTheDocument());
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it('offers the development link when the server hands one back', async () => {
    /* With no mail server there is no inbox for the link to arrive in, and
       this is the only place left that can show it now that signing up does
       not stop on "check your inbox". Without it the accounts flow cannot be
       walked on a laptop at all. */
    resend.mockResolvedValue({
      success: true, email: 'newcomer@example.test', sent: false,
      dev_link: '/verify/abc123', message: 'Sent.',
    });
    show({ emailVerified: false });
    fireEvent.click(screen.getByRole('button', { name: /send it again/i }));

    const link = await screen.findByRole('link', { name: /open the link/i });
    expect(link).toHaveAttribute('href', '/verify/abc123');
  });

  it('does not leave the button pressable while it is in flight', async () => {
    let release: (value: unknown) => void = () => {};
    resend.mockReturnValue(new Promise((resolve) => { release = resolve; }) as never);

    show({ emailVerified: false });
    const button = screen.getByRole('button', { name: /send it again/i });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled());
    release({ success: true, dev_link: null, message: 'Sent.' });
  });

  it('says so when the server cannot be reached', async () => {
    resend.mockRejectedValue(new Error('offline'));
    show({ emailVerified: false });
    fireEvent.click(screen.getByRole('button', { name: /send it again/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn't reach the server/i)).toBeInTheDocument());
  });
});
