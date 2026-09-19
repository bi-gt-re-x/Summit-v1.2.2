/**
 * The account popup — the port of auth-flow.js.
 *
 * One white card, five panels, walked in this order:
 *
 *              ┌──────────── choose ────────────┐
 *           Log In                       Create Account
 *              │                    name / e-mail / password
 *              │                       (password strength)
 *              │                                │
 *              │                     verification e-mail sent
 *              │                        "check your inbox"
 *              │                          verify e-mail
 *              └──────────────┬─────────────────┘
 *                      Complete Profile
 *            (username optional · theme · daily goal)
 *                             │
 *                         Dashboard
 *
 * The server decides everything that matters — who exists, what is verified,
 * which account the session holds. This moves between panels and reports what
 * came back.
 *
 * Two things the original did by hand are the router's job now. Finishing the
 * flow is a `navigate`, not a full page load, so the app keeps the state it has
 * already fetched. And auth-flow.js used to intercept clicks on links into
 * gated areas and open the popup instead of letting the redirect happen;
 * `RequireAccount` bounces those to /home?auth=login&next=… before a request is
 * ever made, and this opens on that — same outcome, one mechanism instead of
 * two racing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useTheme } from '@/hooks';
import { auth as authService } from '@/services';
import type { Theme } from '@/types';
import { Icon } from '@/components/Icon';

export type AuthStep = 'choose' | 'login' | 'create' | 'inbox' | 'profile';

/** The panels a URL is allowed to open the popup on. */
export const DEEP_LINKED: AuthStep[] = ['login', 'create', 'profile'];

const COPY: Record<AuthStep, [string, string]> = {
  choose: ['Welcome', 'Log in or create an account to continue.'],
  login: ['Log in', 'Good to see you again.'],
  create: ['Create account', 'A name, an e-mail and a password is all it takes.'],
  inbox: ['Check your inbox', 'One click and the account is yours.'],
  profile: ['Complete profile', 'Three quick choices and you are in.'],
};

const GOALS = [
  { value: 50, label: 'Light' },
  { value: 100, label: 'Steady' },
  { value: 200, label: 'Serious' },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

interface Message {
  text: string;
  kind: 'error' | 'info';
}

/**
 * Length does most of the work, with a point each for mixed case, digits and
 * symbols — enough to steer someone away from "password1" without pretending to
 * be a real strength estimator.
 */
function strengthOf(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: 'Password strength' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length < 8) score = Math.min(score, 1);
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  return { score, label: labels[Math.min(score, 5)] as string };
}

export function AuthModal({
  step,
  notice,
  onStep,
  onClose,
  next,
}: {
  /** Which panel to show, or null when the popup is closed. */
  step: AuthStep | null;
  /** A line to open with — an expired verification link, a failed Google hop. */
  notice?: Message | null;
  onStep: (step: AuthStep) => void;
  onClose: () => void;
  /** Where the flow finishes: the page they were trying to reach. */
  next: string;
}) {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { setTheme } = useTheme();

  const [message, setMessage] = useState<Message | null>(notice ?? null);
  const [google, setGoogle] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [devLink, setDevLink] = useState<string | null>(null);
  /* The mail did not go out and there is no link to offer instead — so the
     inbox screen must not tell somebody to go and watch an empty inbox. */
  const [mailFailed, setMailFailed] = useState(false);
  /* Ticked before an account can be created — see the note by the box. */
  const [consented, setConsented] = useState(false);
  const [chosenTheme, setChosenTheme] = useState<Theme>('light');
  const [chosenGoal, setChosenGoal] = useState(100);
  const [password, setPassword] = useState('');

  const card = useRef<HTMLDivElement>(null);
  const open = step !== null;

  const say = useCallback((text: string, kind: Message['kind'] = 'error') => {
    setMessage(text ? { text, kind } : null);
  }, []);

  /** A panel change clears the last panel's message. */
  const go = useCallback(
    (to: AuthStep) => {
      setMessage(null);
      onStep(to);
    },
    [onStep],
  );

  /** The flow is over: the account is real and signed in. */
  const finish = useCallback(async () => {
    await refresh();
    navigate(next);
  }, [navigate, next, refresh]);

  // The popup opens with whatever the URL had to say.
  useEffect(() => setMessage(notice ?? null), [notice]);

  // Google only when the server says it is configured.
  useEffect(() => {
    if (!open) return;
    let live = true;
    void authService
      .providers()
      .then((result) => {
        if (live && result.success) setGoogle(result.google);
      })
      .catch(() => {
        // Leave the button hidden: a control that cannot work is worse than
        // one that is not there.
      });
    return () => {
      live = false;
    };
  }, [open]);

  // Opening the link in another tab verifies the account server-side; this poll
  // is how the popup notices and moves on by itself.
  useEffect(() => {
    if (step !== 'inbox') return;
    const timer = setInterval(() => {
      void authService
        .verifyStatus()
        .then((result) => {
          if (!result.success || !result.verified) return;
          clearInterval(timer);
          if (result.profile_complete) void finish();
          else go('profile');
        })
        .catch(() => {
          // Keep waiting.
        });
    }, 3000);
    return () => clearInterval(timer);
  }, [step, finish, go]);

  // Escape closes, from anywhere.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // The scroll behind the card is locked while it is up.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('auth-open');
    return () => document.body.classList.remove('auth-open');
  }, [open]);

  // The first field of whichever panel is showing takes focus.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      card.current
        ?.querySelector<HTMLElement>('.auth-step:not(.hidden) input, .auth-step:not(.hidden) button')
        ?.focus();
    }, 60);
    return () => clearTimeout(timer);
  }, [open, step]);

  if (!open) return null;

  const [heading, sub] = COPY[step];

  async function doLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get('identifier') ?? '').trim();
    const pw = String(form.get('password') ?? '');
    if (!id || !pw) {
      say('Enter your details to continue.');
      return;
    }
    say('Signing in…', 'info');
    try {
      const result = await authService.login(id, pw);
      if (!result.success) {
        say(result.message || 'That did not work.');
        return;
      }
      /* An unconfirmed address is no longer a refused sign-in, so there is
         nothing here to divert to the inbox screen. The account carries on to
         wherever it was going and the banner over the app does the asking —
         see components/VerifyBanner.tsx. */
      setPendingEmail(result.email ?? '');
      setTheme(result.user.theme || 'light');
      if (!result.profile_complete) {
        go('profile');
        return;
      }
      await finish();
    } catch {
      say('Could not reach the server.');
    }
  }

  async function doCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    if (!form.get('consent')) {
      // The button is disabled without it; this is for the Enter key and for
      // anything that submits the form without going through the button.
      say('Tick the box to confirm your age and agree to the terms.');
      return;
    }
    say('Creating your account…', 'info');
    try {
      const result = await authService.signup(name, email, password);
      if (!result.success) {
        say(result.message || 'That did not work.');
        return;
      }
      setPendingEmail(result.email || email);
      setDevLink(result.dev_link);
      setMailFailed(Boolean(result.mail_failed));
      /* Signing up signs the account in, so the next thing a new reader sees
         is the last step of setting up — not a screen telling them to go and
         look in their mail. The confirmation has been sent and the app will
         keep asking for it; it is simply not standing in the doorway. The
         inbox panel is still here and still reachable, from the banner's
         "check your inbox" and from a reader who signed out before
         confirming. */
      go('profile');
    } catch {
      say('Could not reach the server.');
    }
  }

  async function doResend() {
    say('Sending…', 'info');
    try {
      const result = await authService.resendVerification(pendingEmail);
      setDevLink(result.success ? result.dev_link : null);
      setMailFailed(Boolean(result.success && result.mail_failed));
      say(result.message || '', result.success && !result.mail_failed ? 'info' : 'error');
    } catch {
      say('Could not reach the server.');
    }
  }

  async function doProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get('username') ?? '').trim();
    say('Saving…', 'info');
    try {
      const result = await authService.completeProfile({
        username: username || undefined,
        theme: chosenTheme,
        daily_goal: chosenGoal,
      });
      if (!result.success) {
        say(result.message || 'That did not work.');
        return;
      }
      await finish();
    } catch {
      say('Could not reach the server.');
    }
  }

  const strength = strengthOf(password);
  const googleUrl = authService.googleSignInUrl(next);

  /** "or" and the Google button, on the two panels that offer it. */
  const googleBlock = google ? (
    <>
      <div className="auth-or auth-google-only">
        <span>or</span>
      </div>
      <a href={googleUrl} className="auth-google auth-google-only">
        <span className="auth-google-g">G</span> Continue with Google
      </a>
    </>
  ) : null;

  return (
    <div
      id="authModal"
      className="auth-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="authHeading"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="auth-card" ref={card}>
        <button
          type="button"
          id="closeModalBtn"
          className="auth-close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>

        <div className="auth-brandline">Summit</div>
        <h2 id="authHeading" className="auth-heading">
          {heading}
        </h2>
        <p id="authSub" className="auth-sub">
          {sub}
        </p>

        {/* Step 1 — the fork */}
        <section className={`auth-step${step === 'choose' ? '' : ' hidden'}`} data-step="choose">
          <button type="button" className="auth-primary" onClick={() => go('login')}>
            Log In
          </button>
          <button type="button" className="auth-secondary" onClick={() => go('create')}>
            Create Account
          </button>
          {googleBlock}
        </section>

        {/* Log in */}
        <section className={`auth-step${step === 'login' ? '' : ' hidden'}`} data-step="login">
          <form id="loginForm" noValidate onSubmit={(e) => void doLogin(e)}>
            <label className="auth-label" htmlFor="loginId">
              E-mail or username
            </label>
            <input
              className="auth-input"
              type="text"
              id="loginId"
              name="identifier"
              autoComplete="username"
              required
            />
            <label className="auth-label" htmlFor="loginPassword">
              Password
            </label>
            <input
              className="auth-input"
              type="password"
              id="loginPassword"
              name="password"
              autoComplete="current-password"
              required
            />
            <button type="submit" className="auth-primary">
              Log In
            </button>
          </form>
          {googleBlock}
          <button type="button" className="auth-link" onClick={() => go('choose')}>
            ← Back
          </button>
        </section>

        {/* Create account */}
        <section className={`auth-step${step === 'create' ? '' : ' hidden'}`} data-step="create">
          <form id="createForm" noValidate onSubmit={(e) => void doCreate(e)}>
            <label className="auth-label" htmlFor="createName">
              Name
            </label>
            <input
              className="auth-input"
              type="text"
              id="createName"
              name="name"
              autoComplete="name"
              required
            />
            <label className="auth-label" htmlFor="createEmail">
              E-mail
            </label>
            <input
              className="auth-input"
              type="email"
              id="createEmail"
              name="email"
              autoComplete="email"
              required
            />
            <label className="auth-label" htmlFor="createPassword">
              Password
            </label>
            <input
              className="auth-input"
              type="password"
              id="createPassword"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <div className="auth-strength" id="pwStrength" aria-live="polite">
              <div className="auth-strength-bar">
                <span
                  id="pwStrengthFill"
                  className={`lvl-${strength.score}`}
                  style={{ width: `${(strength.score / 5) * 100}%` }}
                />
              </div>
              <div className="auth-strength-label" id="pwStrengthLabel">
                {strength.label}
              </div>
            </div>
            {/* One box for both, because they are one decision: whether to
                open an account here on the stated terms. Two boxes to tick is
                two boxes to tick without reading.

                The age half is not decoration. Summit is built for students and
                much of its audience is at school, and an account here is an
                e-mail address plus a term's worth of what somebody works on
                and when — which is a different kind of record to hold about a
                twelve-year-old than about an adult, and a different set of
                rules (COPPA in the US, and the GDPR age of consent in the EU,
                which several member states set above 13). Asking is what makes
                the answer in the privacy policy true. */}
            <label className="auth-consent" htmlFor="createConsent">
              <input
                type="checkbox"
                id="createConsent"
                name="consent"
                checked={consented}
                onChange={(event) => setConsented(event.target.checked)}
              />
              <span>
                I am 13 or older, and I agree to the{' '}
                <a href="/terms-of-service" target="_blank" rel="noreferrer">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="/privacy-policy" target="_blank" rel="noreferrer">
                  Privacy Policy
                </a>
                .
              </span>
            </label>
            <button type="submit" className="auth-primary" disabled={!consented}>
              Create Account
            </button>
          </form>
          <button type="button" className="auth-link" onClick={() => go('choose')}>
            ← Back
          </button>
        </section>

        {/* Check your inbox */}
        <section className={`auth-step${step === 'inbox' ? '' : ' hidden'}`} data-step="inbox">
          <div className="auth-inbox-mark"><Icon name="mail" /></div>
          <p className="auth-inbox-text">
            {mailFailed ? (
              <>
                Your account is made, but the confirmation e-mail to{' '}
                <strong id="inboxEmail">{pendingEmail || 'your e-mail'}</strong> could not
                be sent. Nothing is coming yet — try again in a moment.
              </>
            ) : (
              <>
                We sent a verification link to{' '}
                <strong id="inboxEmail">{pendingEmail || 'your e-mail'}</strong>. Open it to
                confirm your address.
              </>
            )}
          </p>
          {/* With no mail server configured the link has nowhere to go, so the
              popup shows it directly — the flow stays walkable end to end on a
              laptop. It leaves the app, because verifying is a server route. */}
          <div className="auth-devlink" hidden={!devLink}>
            <p>No mail server is configured yet, so here is that link:</p>
            <a id="devLink" href={devLink ?? '#'} className="auth-primary">
              Verify Email
            </a>
          </div>
          <button type="button" className="auth-link" onClick={() => void doResend()}>
            Send it again
          </button>
        </section>

        {/* Complete profile */}
        <section className={`auth-step${step === 'profile' ? '' : ' hidden'}`} data-step="profile">
          <form id="profileForm" noValidate onSubmit={(e) => void doProfile(e)}>
            <label className="auth-label" htmlFor="profileUsername">
              Choose a username <span className="auth-optional">(optional)</span>
            </label>
            <input
              className="auth-input"
              type="text"
              id="profileUsername"
              name="username"
              autoComplete="username"
              placeholder="Leave blank to keep the suggested one"
            />

            <label className="auth-label">Select a theme</label>
            <div className="auth-choices" id="themeChoices">
              {THEMES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`auth-choice${chosenTheme === option.value ? ' is-on' : ''}`}
                  onClick={() => {
                    setChosenTheme(option.value);
                    // Show the choice immediately — it is the theme they are
                    // picking, and seeing it is the point of picking it.
                    setTheme(option.value);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="auth-label">Choose a daily goal</label>
            <div className="auth-choices" id="goalChoices">
              {GOALS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`auth-choice${chosenGoal === option.value ? ' is-on' : ''}`}
                  onClick={() => setChosenGoal(option.value)}
                >
                  {option.label}
                  <span>{option.value} XP</span>
                </button>
              ))}
            </div>

            <button type="submit" className="auth-primary">
              Go to Dashboard
            </button>
          </form>
        </section>

        <p
          id="authMessage"
          className={`auth-message${message ? ` is-${message.kind}` : ''}`}
          aria-live="polite"
        >
          {message?.text ?? ''}
        </p>
      </div>
    </div>
  );
}
