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
 *              │                    name / e-mail / password
 *              │              (password rules, show and confirm)
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
import type { Theme } from '@/types';
import { Icon } from '@/components/Icon';
import { AboutYou } from '@/components/AboutYou';
import { ThemePicker } from '@/components/Settings/ThemePicker';
import { settings as settingsService } from '@/services';
import type { ThemeSkin } from '@/services/settings';
import { passwordOk, passwordRules } from './passwordRules';

export type AuthStep = 'choose' | 'login' | 'create' | 'inbox' | 'profile' | 'about';

const COPY: Record<AuthStep, [string, string]> = {
  choose: ['Welcome', 'Log in or create an account to continue.'],
  login: ['Log in', 'Good to see you again.'],
  create: ['Create account', 'Just a name, an email and a password.'],
  inbox: ['Check your inbox', "Click the link we sent and you're in."],
  profile: ['Finish your profile', 'Three quick picks and one last step.'],
  about: ['About you', 'Last step. Tell us where you are and where you want to go.'],
};

const GOALS = [
  { value: 50, label: 'Light' },
  { value: 100, label: 'Steady' },
  { value: 200, label: 'Serious' },
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

export function AuthFlow({
  step,
  notice,
  onStep,
  next,
}: {
  /** Which panel to show. */
  step: AuthStep;
  /** A line to open with — an expired verification link, a failed Google hop. */
  notice?: Message | null;
  onStep: (step: AuthStep) => void;
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
  /** One of the four palettes, or '' for plain light or dark. */
  const [chosenSkin, setChosenSkin] = useState<ThemeSkin>('');
  const [chosenGoal, setChosenGoal] = useState(100);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  /* One switch for both password fields, so what you see in one is what
     you're matching in the other. */
  const [showPassword, setShowPassword] = useState(false);
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

  // The first field of whichever panel is showing takes focus.
  useEffect(() => {
    const timer = setTimeout(() => {
      card.current
        ?.querySelector<HTMLElement>('.auth-step:not(.hidden) input, .auth-step:not(.hidden) textarea, .auth-step:not(.hidden) button')
        ?.focus();
    }, 60);
    return () => clearTimeout(timer);
  }, [step]);

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
    const email = String(form.get('email') ?? '').trim();
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
    if (password !== confirm) {
      say("The two passwords don't match.");
      return;
    }
    say('Creating your account…', 'info');
    try {
      const result = await authService.signup(name, email, password);
      if (!result.success) {
        if (result.field === 'email' && /already/i.test(result.message || '')) setEmailTaken(true);
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
        say(result.message || "That didn't work.");
        return;
      }
      // The palette, and `theme_mode` pinned to the base so the device's own
      // light or dark doesn't take over on the next load. The same pair
      // Settings writes when a theme card is picked.
      await settingsService
        .saveSettings({ values: { theme_skin: chosenSkin, theme_mode: chosenTheme } })
        .catch(() => undefined);
      /* One step left: About you. Its answers set up Analytics and the model
         prompts, so it comes before the app rather than after it. */
      go('about');
    } catch {
      say("Couldn't reach the server.");
    }
  }

  const strength = strengthOf(password);
  const rules = passwordRules(password);

  async function checkEmail(email: string) {
    if (!email.trim()) {
      setEmailTaken(false);
      return;
    }
    try {
      const result = await authService.checkEmail(email.trim());
      setEmailTaken(Boolean(result.success && result.valid && !result.available));
    } catch {
      setEmailTaken(false);
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
            Email
          </label>
          <input
            className="auth-input"
            type="email"
            id="createEmail"
            name="email"
            autoComplete="email"
            required
            aria-invalid={emailTaken || undefined}
            aria-describedby={emailTaken ? 'createEmailTaken' : undefined}
            onChange={() => emailTaken && setEmailTaken(false)}
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
          <div className="auth-label-row">
            <label className="auth-label" htmlFor="createPassword">
              Password
            </label>
            <button
              type="button"
              className="auth-reveal"
              aria-pressed={showPassword}
              aria-controls="createPassword createConfirm"
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
          <label className="auth-label" htmlFor="createConfirm">
            Confirm password
          </label>
          <input
            className="auth-input"
            type={showPassword ? 'text' : 'password'}
            id="createConfirm"
            autoComplete="new-password"
            required
            aria-describedby="pwMatch"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          <p
            id="pwMatch"
            className={`auth-field-note${confirm ? (confirm === password ? ' is-good' : ' is-bad') : ''}`}
            aria-live="polite"
          >
            {!confirm ? 'Type it again to make sure.' : confirm === password ? 'Passwords match.' : "Passwords don't match yet."}
          </p>
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
            placeholder="Leave it blank to keep this one"
          />

          <label className="auth-label">Pick a theme</label>
          <ThemePicker
            skin={chosenSkin}
            theme={chosenTheme}
            onPick={(skin, base) => {
              setChosenSkin(skin);
              setChosenTheme(base);
              // Show it right away. Seeing it is the point of picking it.
              setTheme(base);
              if (skin) document.documentElement.setAttribute('data-skin', skin);
              else document.documentElement.removeAttribute('data-skin');
            }}
          />

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
            Next
          </button>
        </form>
      </section>

      {/* About you — the last step. See components/AboutYou. */}
      <section className={`auth-step${step === 'about' ? '' : ' hidden'}`} data-step="about">
        {step === 'about' && (
          <AboutYou
            submitLabel="Save and go to Dashboard"
            onDone={() => void finish()}
            onSkip={() => void finish()}
          />
        )}
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
