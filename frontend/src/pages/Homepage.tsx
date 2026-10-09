/**
 * Home — the landing page.
 *
 * Ported from frontend/html/homepage.html and the eleven home-*.js
 * files, with the account popup from auth-flow.js. It is the last
 * and largest of the ports, and the shape it lands in is the same one the
 * original had: the page is the running order, and each thing that moves is its
 * own file beside this one, named after the script it came from.
 *
 * What this file itself owns is only what spans the whole page:
 *
 *   * sending account links on. Signing in is its own page now (/login,
 *     pages/Login.tsx); the buttons here link to it, and an old
 *     /home?auth=… link — a bookmark, an e-mail sent before the move — is
 *     forwarded there with its query intact.
 *   * the four page-wide motions, as hooks over the rendered tree: the opening,
 *     the scroll reveals, the count-ups, the charts drawing themselves, and the
 *     closing flourishes. Each measures something that only exists once the
 *     page is laid out, which is why they are hooks over a ref and not markup.
 *   * the toast, which belongs to no section.
 *
 *   * its own header: the Summit mark, links to the page's own sections, and
 *     the theme select and Log In / Sign Up. The page went a while with no bar
 *     at all, and a landing page with no name on it and no way to the pricing
 *     but scrolling read as unfinished. The links are to sections of this page
 *     rather than to the app, because App.tsx leaves this route without the
 *     rail for the same reason: a stranger cannot open the dashboard, so
 *     offering it is not navigation. The mark takes you back to the top.
 *
 * The one thing the server-rendered page had that is still deliberately not
 * here: it wrote the signed-in username into localStorage from the template.
 * `useAuth` asks the server, which is the same answer without the copy that can
 * go stale.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Analytics,
  CalendarDemo,
  DashboardDemo,
  FeatureStrip,
  FinalCta,
  Footer,
  Hero,
  Performance,
  Philosophy,
  Pricing,
  SectionHead,
  StreakLevel,
  TaskDemo,
  TaskStats,
  TechStack,
  useCharts,
  useCountUps,
  useFinalMotion,
  useIntro,
  useReveals,
} from '@/components/Home';
import { useAuth, useDocumentTitle, useTheme } from '@/hooks';
import { useSecretScripts } from '@/hooks/useSecretScripts';
import type { Theme } from '@/types';
import '@/styles/homepage.css';
import '@/styles/home-motion.css';
import '@/styles/home-minimal.css';

/** The header's links: a section of this page each, in the order they come. */
const SECTIONS = [
  ['see-it', 'Product'],
  ['features', 'Features'],
  ['analytics', 'Analytics'],
  ['pricing', 'Pricing'],
] as const;

export default function Homepage() {
  useDocumentTitle('Home');

  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toLogin = useCallback(
    (step: 'login' | 'create') => navigate(`/login?auth=${step}`),
    [navigate],
  );
  const { status, username, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const signedIn = status === 'signed-in';

  /* The two stages of the hidden chain this page carries, and the void they
     both lead into. They are the original scripts, bound to markup rendered
     below — the testimonial card in components/Home/sections.tsx and the
     pentagon in the Growth Rating preview beside it — and hooks/useSecretScripts
     explains why they are loaded rather than ported. Nothing here is reachable
     without the clue from the dashboard, except the testimonial, which is the
     short way in for a visitor who has no account to put a dashboard behind.

     **Not until the account is known**, which is why this sits below `status`
     rather than at the top with the other page-wide hooks.
     frontend/secret/pentagon-egg.js reads whose unlock to look for once, at
     load, and binds nothing at all if it does not find one — so loading it
     while the session check is still in flight asks it about 'Default' and
     leaves a pentagon that is inert for the rest of the visit. The session is
     a round trip and the script is in cache, so that race is not close: it
     loses almost every time. 'loading' is the only state worth waiting on —
     signed out is an answer, and the testimonial's door is open to it. */
  useSecretScripts(
    status === 'loading'
      ? []
      : ['void.css', 'void.js', 'quote-egg.js', 'pentagon-egg.js'],
  );

  const page = useRef<HTMLDivElement>(null);
  useIntro(page);
  useReveals(page);
  useCountUps(page);
  useCharts(page);
  useFinalMotion(page);

  // --- the toast -----------------------------------------------------------
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  // An account link from before /login existed: the server's redirects, a
  // bookmark, a verification e-mail. Forwarded whole, so `next`, `verify` and
  // `oauth` arrive with it. After every hook, so the hooks run in one order.
  if (params.has('auth') || params.has('verify') || params.has('oauth')) {
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }

  return (
    <>

      {/* Which of the right-hand pair this shows is decided from the server's
          answer rather than from localStorage, which is what the original got
          wrong: an account signed in on the server but with no localStorage —
          cleared storage, another browser — was being offered Log In and Sign
          Up. The theme select stays beside them because the landing page is
          the one place a reader can pick a theme before they have an account.

          Sticky, and the section links drop away on a phone, where the bar
          keeps only the mark and the account buttons. */}
      <header className="lp-header">
        <a
          className="lp-brand"
          href="#top"
          onClick={(event) => {
            event.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <img src="/static/images/logo.svg" alt="" width={28} height={28} />
          <span>Summit</span>
        </a>
        <nav className="lp-nav" aria-label="On this page">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <div className="account-row">
          <select
            className="theme-select"
            aria-label="Theme"
            value={theme}
            onChange={(event) => setTheme(event.target.value as Theme)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          {signedIn ? (
            <div className="user-greeting">
              <span>Hello, {username}</span>
              <button type="button" className="logout-btn" onClick={() => void signOut()}>
                Log Out
              </button>
            </div>
          ) : (
            <div className="auth-buttons">
              <button type="button" className="auth-btn" onClick={() => toLogin('login')}>
                Log In
              </button>
              <button
                type="button"
                className="auth-btn auth-btn-primary"
                onClick={() => toLogin('create')}
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="home-main" ref={page}>
        <div className="lp">
          <Hero
            signedIn={signedIn}
            username={username}
            onGetStarted={() => toLogin('create')}
          />

          {/* Not a screenshot: a working mock the reader watches fill in.

              **This sits directly under the hero, and that is the point.** It
              used to come third, below the feature strip — roughly a thousand
              pixels down on a phone, which is a scroll a stranger has to
              choose to make before the page has given them a reason to. The
              one thing on this page that sells the app is ticking a box and
              watching a number move, so it goes where the reader already is.
              The strip that was here explains the same three ideas in prose;
              prose is what you read after you are interested, so it follows.

              `see-it` is also where the hero's second button lands. A
              signed-out reader has nothing they are allowed to open, so the
              honest offer to "see it working" is this — and it costs them
              nothing to reach. */}
          <section className="lp-section lp-section-demo" id="see-it">
            <SectionHead
              title="Try it right here"
              blurb="Check off a task and watch your XP climb. This is the real dashboard, live on the page."
            />
            <DashboardDemo />
          </section>

          <FeatureStrip />

          <section className="lp-section">
            <SectionHead
              title="Check it off, get the XP"
              blurb="Priorities, subjects and due dates all live on one list. Finish something and the XP goes straight to your bar."
            />
            {/* The workflow, played out: a task gets checked off, the list
                closes over it, and the XP it earned lands on the bar. */}
            <TaskDemo />
            <TaskStats />
          </section>

          <section className="lp-section">
            <SectionHead
              title="Know where your time goes"
              blurb="Hours, completion rate and efficiency by day or by week. Only the days you actually worked count, so a day off won't drag your numbers down."
            />
            <Performance />
          </section>

          <section className="lp-section">
            <SectionHead
              title="Drag it onto your calendar"
              blurb="Drop a task on a day to schedule it. Move it and your list updates too. Same task, so there's nothing to keep in sync."
            />
            <CalendarDemo />
          </section>

          <section className="lp-section">
            <SectionHead
              title="Keep the streak alive"
              blurb="Every task you finish earns XP toward your next level. Your streak goes up each day you get at least one thing done. Once it's a week old you get one free miss a month, so one bad day won't wipe it out. Two in a row will, though."
            />
            <StreakLevel />
          </section>

          {/* The end of the feature tour, and the only section about the app
              thinking rather than about the reader working. It comes last of
              the seven because it is the one that needs the other six to have
              happened: a score made of productivity, consistency and focus
              means nothing to someone who has not yet been shown the tasks,
              the streak and the calendar those are measured from. */}
          <section className="lp-section" id="analytics">
            <SectionHead
              title="Stats that tell you what to do next"
              blurb="Five stats make up your Growth Score, and Summit turns it into a short list of what to work on next week. Click any number to see the math behind it."
            />
            <Analytics />
          </section>

          <Philosophy />
          <Pricing
            signedIn={signedIn}
            onGetStarted={() => toLogin('create')}
            onTheme={setTheme}
            onToast={say}
          />
          <TechStack />
          <FinalCta signedIn={signedIn} onGetStarted={() => toLogin('create')} />
        </div>
      </div>

      <Footer />

      <div className={`hfx-toast${toast ? ' is-shown' : ''}`}>{toast}</div>
    </>
  );
}
