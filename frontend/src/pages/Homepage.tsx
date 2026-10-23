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
 *   * the page-wide motions, as hooks over the rendered tree: the opening,
 *     the scroll reveals, the count-ups, the small looping drawings (played
 *     only while on screen), the charts drawing themselves, and the closing
 *     flourishes. Each measures something that only exists once the
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
  Facts,
  Faq,
  FeatureGrid,
  FinalCta,
  Footer,
  GoalsTour,
  Hero,
  HowItWorks,
  MoreTour,
  Numbers,
  Performance,
  Philosophy,
  Pricing,
  SectionHead,
  SkillsTour,
  SpacesTour,
  StreakLevel,
  TaskDemo,
  TaskStats,
  TechStack,
  TimerTour,
  useCharts,
  useCountUps,
  useFinalMotion,
  useIntro,
  useLoops,
  useReveals,
} from '@/components/Home';
import { useAuth, useDocumentTitle, useTheme } from '@/hooks';
import { useSecretScripts } from '@/hooks/useSecretScripts';
import type { Theme } from '@/types';
import '@/styles/homepage.css';
import '@/styles/home-motion.css';
import '@/styles/home-minimal.css';
import '@/styles/home-tour.css';

/** The header's links: a section of this page each, in the order they come. */
const SECTIONS = [
  ['features', 'Features'],
  ['how', 'How it works'],
  ['analytics', 'Analytics'],
  ['faq', 'Questions'],
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
  useLoops(page);
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
                Log out
              </button>
            </div>
          ) : (
            <div className="auth-buttons">
              <button type="button" className="auth-btn" onClick={() => toLogin('login')}>
                Log in
              </button>
              <button
                type="button"
                className="auth-btn auth-btn-primary"
                onClick={() => toLogin('create')}
              >
                Sign up
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

          <Numbers />

          {/* A drawing of the dashboard that fills itself in as it scrolls
              into view. It sits right under the hero because watching the
              numbers fill in is the quickest way to show what the app is, so
              it goes where the reader already is. The
              copy describes the real page's top row (the tour's "Your day in
              four numbers", components/Tutorial/steps.ts). */}
          <section className="lp-section lp-section-demo" id="see-it">
            <SectionHead
              title="Your dashboard"
              blurb="It's home base. The top shows tasks done, XP earned, time focused and your streak. They fill up as you work."
            />
            <DashboardDemo />
          </section>

          <HowItWorks />
          <FeatureGrid />

          {/* The deep dives, in the order the feature grid lists them, so
              each card's "Read more" lands further down in the same order. */}
          <section className="lp-section" id="tasks">
            <SectionHead
              title="Tasks and XP"
              blurb="Set what a task is worth when you add it. Finish it and the XP goes straight to your bar."
            />
            {/* The workflow, played out: a task gets checked off, the list
                closes over it, and the XP it earned lands on the bar. */}
            <TaskDemo />
            <TaskStats />
          </section>

          {/* Day, week and month are the calendar's three views; events are
              components/Calendar/EventModal, and blocking out time is the
              tour's own step on this page. */}
          <section className="lp-section" id="calendar">
            <SectionHead
              title="Your calendar"
              blurb="Drop a task on a day to schedule it. Move it and your list updates too. It's the same task, so there's nothing to keep in sync."
            />
            <CalendarDemo />
            <Facts
              items={[
                {
                  icon: 'calendar',
                  title: 'Day, week and month',
                  body: 'See one day hour by hour, or zoom out to the whole month.',
                },
                {
                  icon: 'clock',
                  title: 'Block out time',
                  body: "Drag down on an empty spot to block out time. Drag a block's edge to make it longer.",
                },
                {
                  icon: 'pin',
                  title: 'Events too',
                  body: "Add things that aren't tasks, like a class or a game. They sit on the same calendar.",
                },
              ]}
            />
          </section>

          <TimerTour />
          <GoalsTour />

          {/* The grace day and vacation mode are backend/tracking/xp.py
              (GRACE_EARNED_AT, GRACE_REFRESH_DAYS, VACATION_MAX_DAYS), and the
              level cost is utils/format's N × 100 with no cap. */}
          <section className="lp-section" id="streak">
            <SectionHead
              title="Streaks and levels"
              blurb="Finish at least one task a day and your streak goes up. Every bit of XP you earn counts toward your next level."
            />
            <StreakLevel />
            <Facts
              items={[
                {
                  icon: 'shield',
                  title: 'Grace day',
                  body: 'Hit a 7-day streak and you earn one. It covers one missed day, and a new one comes every 30 days.',
                },
                {
                  icon: 'sun',
                  title: 'Vacation mode',
                  body: 'Going away? Pause your streak for up to 30 days from Settings.',
                },
                {
                  icon: 'trend',
                  title: 'No level cap',
                  body: 'Level 1 takes 100 XP and level 2 takes 200. It keeps going from there.',
                },
              ]}
            />
          </section>

          <section className="lp-section">
            <SectionHead
              title="Where your time goes"
              blurb="Hours, completion rate and efficiency by day or by week. Only the days you actually worked count, so a day off won't drag your numbers down."
            />
            <Performance />
          </section>

          {/* The tab lines are each tab's own job (components/Analytics/Header
              and utils/siteIndex): advice with a book button, patterns and
              mood against output, one page per subject, the long view. */}
          <section className="lp-section" id="analytics">
            <SectionHead
              title="Analytics"
              blurb="Five stats make up your growth score: productivity, consistency, quality, efficiency and focus. Each one gets a grade from F up to S. Click any number to see how it works."
            />
            <Analytics />
            <Facts
              items={[
                {
                  icon: 'lightbulb',
                  title: 'Recommendations',
                  body: 'A ranked list of what to change next. Book the study sessions it suggests onto your calendar.',
                },
                {
                  icon: 'search',
                  title: 'Insights',
                  body: "When you work best and what's slipping. It also lines up your mood with what you got done.",
                },
                {
                  icon: 'folder',
                  title: 'Subjects',
                  body: 'How each subject is going. Every subject gets a page of its own.',
                },
                {
                  icon: 'trend',
                  title: 'Growth',
                  body: "How far you've come over months and years.",
                },
              ]}
            />
          </section>

          <SkillsTour />
          <MoreTour />
          <SpacesTour />
          <Philosophy />
          <Faq />
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
