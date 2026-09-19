/**
 * The strip that asks an account to confirm its e-mail address.
 *
 * ## Why this exists
 *
 * Confirming an address used to be a door: an account could not log in, could
 * not finish setting up, could not see anything, until a link in an inbox had
 * been followed. That put a trip out to another application — often another
 * device — between a stranger and the first thing the app had to show them,
 * and it charged that trip to exactly the people who had not yet decided they
 * wanted it. Signing up signs you in now (see `signup` in
 * backend/routes/auth.py), and this is what became of the door: the same
 * request, asked alongside the work instead of in front of it.
 *
 * So the whole design brief for this component is *ask without blocking*. It
 * is a strip above the page rather than a modal over it; nothing behind it is
 * inert; and it can be put away.
 *
 * ## What "put away" means
 *
 * Dismissing hides it for the tab's session and no longer — `sessionStorage`,
 * so a new visit asks again. That is the honest middle between the two easy
 * answers. A banner that cannot be dismissed is a modal wearing a different
 * shape, and one dismissed for ever would mean the address is never confirmed
 * and the app has quietly given up on being able to reach anyone: the thing a
 * confirmed address is *for* is password recovery, and an account that cannot
 * be recovered is one bad memory away from being lost.
 *
 * The banner stops appearing the moment the link is followed, because
 * `emailVerified` comes from the server on the next read and nothing here
 * caches it.
 *
 * ## The development link
 *
 * With no mail credentials configured there is no inbox for the link to land
 * in, so the server hands it back to the caller instead and Resend shows it
 * here. That is the same bargain the "check your inbox" panel struck — see
 * `_verification_reply` in backend/routes/auth.py for why it is gated on
 * SUMMIT_DEV rather than on the send having failed.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks';
import { auth as authService } from '@/services';
import '@/styles/verify-banner.css';
import { Icon } from '@/components/Icon';

/** One key per account, so signing into a second one on this tab asks again. */
const DISMISS_KEY = 'summit.verify-banner.dismissed';

function dismissedFor(username: string | null): boolean {
  if (!username) return false;
  try {
    return sessionStorage.getItem(DISMISS_KEY) === username;
  } catch {
    // Storage can be blocked outright. Showing the banner is the safe way to
    // be wrong: the worst case is that it is asked for twice.
    return false;
  }
}

export function VerifyBanner() {
  const { status, username, emailVerified } = useAuth();
  const [hidden, setHidden] = useState(() => dismissedFor(username));
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  // A different account on the same tab has not dismissed anything.
  useEffect(() => {
    setHidden(dismissedFor(username));
    setSaid(null);
    setDevLink(null);
  }, [username]);

  const dismiss = useCallback(() => {
    setHidden(true);
    try {
      if (username) sessionStorage.setItem(DISMISS_KEY, username);
    } catch {
      /* see dismissedFor */
    }
  }, [username]);

  const resend = useCallback(async () => {
    setBusy(true);
    setSaid(null);
    try {
      const result = await authService.resendVerification();
      setDevLink(result.success ? result.dev_link : null);
      setSaid(result.message || 'Sent.');
    } catch {
      setSaid('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }, []);

  if (status !== 'signed-in' || emailVerified || hidden) return null;

  return (
    <div className="vb" role="status">
      <span className="vb-mark" aria-hidden="true">
        <Icon name="mail" />
      </span>
      <p className="vb-text">
        {said ?? (
          <>
            Confirm your e-mail address to keep this account recoverable.{' '}
            <span className="vb-quiet">Everything works in the meantime.</span>
          </>
        )}
      </p>
      {devLink && (
        <a className="vb-link" href={devLink}>
          Open the link
        </a>
      )}
      <button type="button" className="vb-btn" onClick={() => void resend()} disabled={busy}>
        {busy ? 'Sending…' : 'Send it again'}
      </button>
      <button type="button" className="vb-close" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
