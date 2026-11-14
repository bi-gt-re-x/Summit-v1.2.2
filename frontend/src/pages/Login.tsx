/**
 * /login — signing in, signing up, confirming the e-mail and finishing the
 * profile, on a page of their own.
 *
 * This used to be a popup over the landing page, which meant a signed-out
 * visitor who followed a link to their dashboard arrived at the marketing page
 * with a card over it. It is a page now: the brand on the left, the form on
 * the right, and on a phone the form alone under the mark.
 *
 * The URL says everything the flow needs, as it did for the popup:
 *
 *   * `auth` — which panel to open (login, create, profile; choose for the
 *     fork). The panel is written back into the URL as the reader moves, so a
 *     refresh or the back button lands where they were.
 *   * `next` — where to go when it is done. Only a same-site path is honoured.
 *   * `verify` / `oauth` — what the server is reporting after the e-mail link
 *     or the Google hop (backend/routes/auth.py), said as the opening line.
 *
 * A signed-in, finished account has nothing to do here and is sent on to
 * `next`; one that still owes its profile gets that panel.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { AuthFlow, type AuthStep } from '@/components/Auth';
import { Icon, type IconName } from '@/components/Icon';
import { Loading } from '@/components';
import { Range } from '@/components/Range';
import { useAuth, useDocumentTitle } from '@/hooks';
import { loadPaper } from '@/utils/paperLook';
import '@/styles/summit.css';
import '@/styles/auth.css';

/**
 * Where the flow finishes. Only a path on this site, never somewhere else.
 *
 * With nothing to go back to the answer is the front door, not the dashboard:
 * `/` is the one route that reads the account's chosen start page (FrontDoor
 * in App.tsx), so signing in without a `next` lands where the account asked.
 */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
}

const STEPS: AuthStep[] = ['choose', 'login', 'create', 'inbox', 'profile'];

/** The tab's title on each panel, so it says where in the flow the reader is. */
const TITLES: Record<AuthStep, string> = {
  choose: 'Welcome',
  login: 'Log in',
  create: 'Create account',
  inbox: 'Check your inbox',
  profile: 'Your contest',
};

const POINTS: [IconName, string][] = [
  ['target', 'Problems tagged by topic, strategy and AoPS difficulty'],
  ['timer', 'Timed mock contests, scored like the real thing'],
  ['sparkles', 'A study plan written around your goal and your misses'],
];

export default function Login() {
  const [params, setParams] = useSearchParams();
  /* The email from the landing page's start form, sent in history state so
     it stays out of the URL (pages/Homepage.tsx). */
  const arrived = useLocation().state as { email?: unknown } | null;
  const initialEmail = typeof arrived?.email === 'string' ? arrived.email : '';
  const { status, profileComplete } = useAuth();

  // Any panel the flow itself can move to, since it writes each one back here;
  // anything else — or nothing — is the log-in panel.
  const wanted = params.get('auth') as AuthStep | null;
  /* The profile panel saves to the signed-in account, so a
     signed-out visitor who lands on one (an old tab, a shared link) is asked
     to log in first rather than shown a form that cannot save. */
  const needsAccount = wanted === 'profile' && status === 'signed-out';
  const step: AuthStep = wanted && STEPS.includes(wanted) && !needsAccount ? wanted : 'login';
  const next = safeNext(params.get('next'));

  useDocumentTitle(TITLES[step]);

  /* The app's look (styles/paperLook.ts) isn't used here, but the dashboard
     after this page needs it. Fetched while the form is being filled in, so
     finishing doesn't wait on it. */
  useEffect(() => {
    const timer = setTimeout(() => void loadPaper(), 1200);
    return () => clearTimeout(timer);
  }, []);

  const setStep = useCallback(
    (to: AuthStep) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          updated.set('auth', to);
          // A report from the server is about the arrival, not the panel after.
          updated.delete('verify');
          updated.delete('oauth');
          return updated;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  /** The line the form opens with, when the URL is reporting something.
   *  Memoised on the strings it reads: the flow resets its message whenever
   *  this changes identity, and a new object every render would wipe an
   *  error the moment anything above re-rendered. */
  const verify = params.get('verify');
  const oauth = params.get('oauth');
  const bounced = params.has('next') && step === 'login';
  const notice = useMemo(
    () =>
      verify === 'invalid'
        ? { text: 'That verification link has already been used or expired.', kind: 'error' as const }
        : oauth === 'unconfigured'
          ? { text: "Google sign-in isn't configured on this server yet.", kind: 'error' as const }
          : oauth
            ? { text: "Google sign-in didn't complete. Try again.", kind: 'error' as const }
            : bounced
              ? { text: 'You need an account to open that page.', kind: 'info' as const }
              : null,
    [verify, oauth, bounced],
  );

  if (status === 'loading') return <Loading label="Checking your account" />;
  // Already in: straight on. The profile panel is the one thing a signed-in
  // account can still owe, and the inbox poll finishes by itself. About you
  // comes after the profile is complete, so it is left alone too: without
  // this, a reload (or anything refreshing the account) on that step skipped
  // it and dropped the reader on the dashboard.
  if (status === 'signed-in' && profileComplete && step !== 'inbox' && step !== 'profile') {
    return <Navigate to={next} replace />;
  }

  const home = (
    <Link className="auth-home" to="/home">
      <img src="/static/images/logo.svg" alt="" width={28} height={28} />
      <span>Summit</span>
    </Link>
  );

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Range variant="login" className="auth-range" />
        {home}
        <div className="auth-pitch">
          <h1>Train for the AMC. Qualify for the AIME.</h1>
          <p>
            Step-by-step solutions, a review log that brings every miss back until it sticks,
            and a plan to contest day.
          </p>
          <ul className="auth-points">
            {POINTS.map(([icon, text]) => (
              <li key={icon}>
                <Icon name={icon} />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="auth-aside-foot">100% free · No credit card · Your data stays yours</p>
      </aside>

      <main className="auth-main">
        <div className="auth-main-top">{home}</div>
        <AuthFlow
          step={step}
          notice={notice}
          next={next}
          onStep={setStep}
          initialEmail={initialEmail}
        />
      </main>
    </div>
  );
}
