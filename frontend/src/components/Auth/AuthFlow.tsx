/**
 * The account flow — the port of auth-flow.js, and the body of /login
 * (pages/Login.tsx).
 *
 * It was a popup laid over the landing page. It is the form half of a page
 * now: a gated URL, the verification e-mail and the Google hop all land on
 * /login, and the landing page's buttons link there. Five panels, walked in
 * this order:
 *
 *              ┌──────────── choose ────────────┐
 *           Log In                       Create Account
 *              │                  e-mail, then name / password
 *              │                 (password rules, show / hide)
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
 * `RequireAccount` bounces those to /login?auth=login&next=… before a request
 * is ever made, and this opens on that — same outcome, one mechanism instead
 * of two racing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useTheme } from '@/hooks';
import { auth as authService } from '@/services';
import { Icon } from '@/components/Icon';
import { passwordOk, passwordRules } from './passwordRules';
import { AmcProfile } from './AmcProfile';

export type AuthStep = 'choose' | 'login' | 'create' | 'inbox' | 'profile';

const COPY: Record<AuthStep, [string, string]> = {
  choose: ['Welcome', 'Log in or create an account to continue.'],
  login: ['Log in', 'Good to see you again.'],
  create: ['Create account', "Start with your email. It's free."],
  inbox: ['Check your inbox', "Click the link we sent and you're in."],
  profile: ['Your contest', 'A few quick taps and your study plan is ready.'],
};

/** Good enough to catch a typo before asking the server. The server decides. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function AuthFlow({
  step,
  notice,
  onStep,
  next,
  initialEmail = '',
}: {
  /** Which panel to show. */
  step: AuthStep;
  /** A line to open with — an expired verification link, a failed Google hop. */
  notice?: Message | null;
  onStep: (step: AuthStep) => void;
  /** Where the flow finishes: the page they were trying to reach. */
  next: string;
  /** An email already typed on the landing page, so it isn't asked twice. */
  initialEmail?: string;
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
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  /* Sign-up asks for one thing at a time: the email first, then a name and a
     password. Three fields in all, and the first screen has just one. An
     email brought over from the landing page skips straight to the second. */
  const [email, setEmail] = useState(initialEmail);
  const [details, setDetails] = useState(Boolean(initialEmail));
  /* The email is checked when the field is left: an address that already has
     an account is sent to log in before the rest of the form is filled. */
  const [emailTaken, setEmailTaken] = useState(false);

  const card = useRef<HTMLDivElement>(null);

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

  /** On to the profile panel, once the app knows the account is signed in.
   *  The server signs in on sign-up, on a login and on the verify link, but
   *  the app's own record of it only changes on a refresh — and the login page
   *  sends a signed-out visitor on the profile panel to log in instead. */
  const toProfile = useCallback(async () => {
    await refresh();
    go('profile');
  }, [go, refresh]);

  /** The flow is over: the account is real and signed in. */
  const finish = useCallback(async () => {
    await refresh();
    navigate(next);
  }, [navigate, next, refresh]);

  // An email from the landing page is checked as soon as the form opens.
  useEffect(() => {
    if (initialEmail) void checkEmail(initialEmail);
    // Once, for the email the page opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The page opens with whatever the URL had to say.
  useEffect(() => setMessage(notice ?? null), [notice]);

  // Google only when the server says it is configured.
  useEffect(() => {
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
  }, []);

  // Opening the link in another tab verifies the account server-side; this poll
  // is how the page notices and moves on by itself.
  useEffect(() => {
    if (step !== 'inbox') return;
    const timer = setInterval(() => {
      void authService
        .verifyStatus()
        .then((result) => {
          if (!result.success || !result.verified) return;
          clearInterval(timer);
          if (result.profile_complete) void finish();
          else void toProfile();
        })
        .catch(() => {
          // Keep waiting.
        });
    }, 3000);
    return () => clearInterval(timer);
  }, [step, finish, toProfile]);

  // The first field of whichever panel (or half of sign-up) is showing takes
  // focus. Forms that are `hidden` are skipped, so it lands on what's shown.
  useEffect(() => {
    const timer = setTimeout(() => {
      const open = '.auth-step:not(.hidden) :is(input, textarea, button)';
      const fields = card.current?.querySelectorAll<HTMLElement>(open) ?? [];
      const shown = Array.from(fields).filter((el) => !el.closest('[hidden]'));
      (shown.find((el) => el.matches('input, textarea')) ?? shown[0])?.focus();
    }, 60);
    return () => clearTimeout(timer);
  }, [step, details]);

  const [heading, firstSub] = COPY[step];
  const sub = step === 'create' && details ? 'Now a name and a password.' : firstSub;

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
        say(result.message || "That didn't work.");
        return;
      }
      /* An unconfirmed address is no longer a refused sign-in, so there is
         nothing here to divert to the inbox screen. The account carries on to
         wherever it was going and the banner over the app does the asking —
         see components/VerifyBanner.tsx. */
      setPendingEmail(result.email ?? '');
      setTheme(result.user.theme || 'light');
      if (!result.profile_complete) {
        await toProfile();
        return;
      }
      await finish();
    } catch {
      say("Couldn't reach the server.");
    }
  }

  async function doCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    if (!name) {
      say('Add your name.');
      return;
    }
    if (!form.get('consent')) {
      // The button is disabled without it; this is for the Enter key and for
      // anything that submits the form without going through the button.
      say('Check the box to confirm your age and agree to the terms.');
      return;
    }
    if (emailTaken) {
      say('That email already has a Summit account. Log in instead.');
      return;
    }
    if (!passwordOk(password)) {
      say("Your password doesn't meet every rule under it yet.");
      return;
    }
    say('Creating your account…', 'info');
    try {
      const result = await authService.signup(name, email.trim(), password);
      if (!result.success) {
        if (result.field === 'email') {
          if (/already/i.test(result.message || '')) setEmailTaken(true);
          setDetails(false);
        }
        say(result.message || "That didn't work.");
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
      await toProfile();
    } catch {
      say("Couldn't reach the server.");
    }
  }

  /** The first half of sign-up: just the email. */
  async function doStart(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = email.trim();
    if (!EMAIL_SHAPE.test(typed)) {
      say('Enter your email to continue.');
      return;
    }
    say('');
    const taken = await checkEmail(typed);
    if (!taken) setDetails(true);
  }

  async function doResend() {
    say('Sending…', 'info');
    try {
      const result = await authService.resendVerification(pendingEmail);
      setDevLink(result.success ? result.dev_link : null);
      setMailFailed(Boolean(result.success && result.mail_failed));
      say(result.message || '', result.success && !result.mail_failed ? 'info' : 'error');
    } catch {
      say("Couldn't reach the server.");
    }
  }

  const strength = strengthOf(password);
  const rules = passwordRules(password);

  /** Whether the address already has an account. Also shows the note. */
  async function checkEmail(address: string): Promise<boolean> {
    if (!address.trim()) {
      setEmailTaken(false);
      return false;
    }
    try {
      const result = await authService.checkEmail(address.trim());
      const taken = Boolean(result.success && result.valid && !result.available);
      setEmailTaken(taken);
      if (taken) setDetails(false);
      return taken;
    } catch {
      setEmailTaken(false);
      return false;
    }
  }
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
    <div className="auth-card" ref={card}>
      <h1 id="authHeading" className="auth-heading">
        {heading}
      </h1>
      <p id="authSub" className="auth-sub">
        {sub}
      </p>

      {/* Step 1 — the fork */}
      <section className={`auth-step${step === 'choose' ? '' : ' hidden'}`} data-step="choose">
        <button type="button" className="auth-primary" onClick={() => go('login')}>
          Log in
        </button>
        <button type="button" className="auth-secondary" onClick={() => go('create')}>
          Create account
        </button>
        {googleBlock}
      </section>

      {/* Log in */}
      <section className={`auth-step${step === 'login' ? '' : ' hidden'}`} data-step="login">
        <form id="loginForm" noValidate onSubmit={(e) => void doLogin(e)}>
          <label className="auth-label" htmlFor="loginId">
            Email or username
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
            Log in
          </button>
        </form>
        {googleBlock}
        <p className="auth-switch">
          New to Summit?{' '}
          <button type="button" className="auth-link" onClick={() => go('create')}>
            Create an account
          </button>
        </p>
      </section>

      {/* Create account */}
      <section className={`auth-step${step === 'create' ? '' : ' hidden'}`} data-step="create">
        {/* Step one: the email, on its own. */}
        <form
          id="createStart"
          noValidate
          hidden={details}
          onSubmit={(e) => void doStart(e)}
        >
          <label className="auth-label" htmlFor="createEmail">
            Email
          </label>
          <input
            className="auth-input"
            type="email"
            id="createEmail"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            aria-invalid={emailTaken || undefined}
            aria-describedby={emailTaken ? 'createEmailTaken' : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              if (emailTaken) setEmailTaken(false);
            }}
            onBlur={(event) => void checkEmail(event.target.value)}
          />
          {emailTaken && (
            <p className="auth-field-note is-bad" id="createEmailTaken" role="alert">
              That email already has a Summit account.{' '}
              <button type="button" className="auth-inline-link" onClick={() => go('login')}>
                Log in instead
              </button>
            </p>
          )}
          <button type="submit" className="auth-primary">
            Continue
          </button>
        </form>
        {!details && googleBlock}

        {/* Step two: a name and a password, and that's it. */}
        <form id="createForm" noValidate hidden={!details} onSubmit={(e) => void doCreate(e)}>
          <p className="auth-as">
            <span>{email.trim()}</span>
            <button type="button" className="auth-inline-link" onClick={() => setDetails(false)}>
              Change
            </button>
          </p>
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
          <div className="auth-label-row">
            <label className="auth-label" htmlFor="createPassword">
              Password
            </label>
            <button
              type="button"
              className="auth-reveal"
              aria-pressed={showPassword}
              aria-controls="createPassword"
              onClick={() => setShowPassword((was) => !was)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            className="auth-input"
            type={showPassword ? 'text' : 'password'}
            id="createPassword"
            autoComplete="new-password"
            required
            aria-describedby="pwRules"
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
          <ul className="auth-rules" id="pwRules" aria-label="Your password needs">
            {rules.map((rule) => (
              <li key={rule.key} className={rule.met ? 'is-met' : ''}>
                <span className="auth-rule-mark" aria-hidden="true">
                  {rule.met ? <Icon name="check" /> : null}
                </span>
                {rule.label}
                <span className="sr-only">{rule.met ? ' (done)' : ' (not yet)'}</span>
              </li>
            ))}
          </ul>
          <label className="auth-consent" htmlFor="createConsent">
            <input
              type="checkbox"
              id="createConsent"
              name="consent"
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
            />
            <span>
              I'm 13 or older, and I agree to the{' '}
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
            Create account
          </button>
        </form>
        <p className="auth-switch">
          Already have an account?{' '}
          <button type="button" className="auth-link" onClick={() => go('login')}>
            Log in
          </button>
        </p>
      </section>

      {/* Check your inbox */}
      <section className={`auth-step${step === 'inbox' ? '' : ' hidden'}`} data-step="inbox">
        <div className="auth-inbox-mark"><Icon name="mail" /></div>
        <p className="auth-inbox-text">
          {mailFailed ? (
            <>
              Your account is ready, but the confirmation email to{' '}
              <strong id="inboxEmail">{pendingEmail || 'your email'}</strong> couldn't be sent. Try again in a moment.
            </>
          ) : (
            <>
              We sent a verification link to{' '}
              <strong id="inboxEmail">{pendingEmail || 'your email'}</strong>. Open it to
              confirm your address.
            </>
          )}
        </p>
        {/* With no mail server configured the link has nowhere to go, so the
            popup shows it directly — the flow stays walkable end to end on a
            laptop. It leaves the app, because verifying is a server route. */}
        <div className="auth-devlink" hidden={!devLink}>
          <p>No mail server is set up yet, so here's the link:</p>
          <a id="devLink" href={devLink ?? '#'} className="auth-primary">
            Verify email
          </a>
        </div>
        <button type="button" className="auth-link" onClick={() => void doResend()}>
          Send it again
        </button>
      </section>

      {/* The last step: the student's contest, and their plan made from it.
          See components/Auth/AmcProfile. */}
      <section className={`auth-step${step === 'profile' ? '' : ' hidden'}`} data-step="profile">
        {step === 'profile' && <AmcProfile onDone={() => void finish()} say={say} />}
      </section>

      <p
        id="authMessage"
        className={`auth-message${message ? ` is-${message.kind}` : ''}`}
        aria-live="polite"
      >
        {message?.text ?? ''}
      </p>
    </div>
  );
}
