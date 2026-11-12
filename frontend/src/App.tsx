/**
 * The routing table, and the shell every page renders inside.
 *
 * The paths deliberately match the ones the server-rendered pages already use
 * — `/dashboard`, `/calendar`, `/goals`, `/growth`. That is what lets the two
 * frontends swap over a page at a time: nothing outside this file has to
 * change when a page moves from Jinja to React, and no link anywhere breaks.
 *
 * Pages are lazy so a route nobody visits costs nothing. `Dashboard` is lazy
 * too, but it starts loading the moment this file runs for anyone who has
 * signed in on this browser before, so it comes down while "Checking your
 * account" is up rather than after it. A stranger on the landing page never
 * downloads it.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Ambient, AppBoundary, Loading, Rail, Toasts, Topbar, VerifyBanner } from '@/components';
import { RequireAccount } from './RequireAccount';
import { useAuth, usePinnedViewport } from '@/hooks';
import { useChainAccount } from '@/hooks/useChainAccount';
import { useVoid } from '@/hooks/useVoid';
import { storedUsername } from '@/services/auth';
import { loadPaper, paperLoaded } from '@/utils/paperLook';
import { rememberExit } from '@/utils/settingsExit';

const loadDashboard = () => import('@/pages/amc/Dashboard');
/* Fetched now, in parallel with the account check, for a browser that has
   been signed in here before. Everyone else loads it only if they get there. */
if (storedUsername()) void loadDashboard();
const Dashboard = lazy(loadDashboard);
const Homepage = lazy(() => import('@/pages/amc/Landing'));
const Login = lazy(() => import('@/pages/Login'));
const Settings = lazy(() => import('@/pages/Settings'));
const AboutUs = lazy(() => import('@/pages/AboutUs'));
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('@/pages/TermsOfService'));

/* The AMC prep site: one page per section in the rail, plus the detail pages
   under them. See backend/api/amc.py for what each one reads. */
const Problems = lazy(() => import('@/pages/amc/Problems'));
const Problem = lazy(() => import('@/pages/amc/Problem'));
const Review = lazy(() => import('@/pages/amc/Review'));
const Topics = lazy(() => import('@/pages/amc/Topics'));
const Topic = lazy(() => import('@/pages/amc/Topic'));
const Contests = lazy(() => import('@/pages/amc/Contests'));
const Contest = lazy(() => import('@/pages/amc/Contest'));
const TakeMock = lazy(() => import('@/pages/amc/TakeMock'));
const MockResult = lazy(() => import('@/pages/amc/MockResult'));
const StudyPlan = lazy(() => import('@/pages/amc/StudyPlan'));
const Search = lazy(() => import('@/pages/amc/Search'));

/**
 * Where the productivity app's pages used to be. Each had a URL long enough
 * to be bookmarked; they land on the dashboard rather than on a blank page.
 */
export const RETIRED_PATHS = [
  '/tasks', '/calendar', '/calendar/day', '/calendar/week', '/calendar/month', '/goals', '/growth',
  '/analytics', '/analytics/growth', '/analytics/review', '/analytics/goals', '/analytics/records',
  '/analytics/subject/:subjectId', '/recommendations', '/insights', '/habits', '/subjects', '/trends',
  '/skill-trees', '/growth-tree', '/log', '/behavior', '/notes', '/timer', '/achievements',
  '/achievements/badges', '/achievements/growth', '/records', '/records/growth', '/records/badges',
  '/spaces/:spaceId', '/team/:spaceId',
];

/**
 * The front door: the dashboard for an account, the landing page for anyone
 * else. Waiting on `status` matters: treating "still asking" as signed out
 * would flash the landing page at an account on its way in.
 */
export function FrontDoor() {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status !== 'signed-in') return <Navigate to="/home" replace />;
  return <Navigate to="/dashboard" replace />;
}

/**
 * `/home`: the landing page, unless a signed-in reader typed their way here.
 *
 * `/` is where the app opens, but the address bar does not always ask for it.
 * Once `/home` has been visited, autocomplete fills it in after
 * `localhost:5090`, and bookmarks and full-page bounces (frontend/secret/
 * engine.js) land here too. Arriving like that, as the tab's first page, an
 * account gets the front door's answer instead of a pitch for an app it
 * already uses.
 *
 * Arriving from inside the app, it stays the landing page. The rail's mark
 * links here, and that is how an account reaches the pentagon in step two of
 * the hidden chain. React Router keys a tab's first entry `default` and gives
 * every navigation after it a key of its own, which survives a reload, so the
 * key is what tells the two apart.
 *
 * It waits on the session only when somebody was signed in here last time
 * (the remembered username). A stranger gets the landing page at once, and an
 * account doesn't watch it flash past on the way to the dashboard.
 */
export function Landing() {
  const { status, username } = useAuth();
  const { key } = useLocation();
  const typed = key === 'default';
  if (typed && status === 'signed-in') return <Navigate to="/" replace />;
  if (typed && status === 'loading' && username) return <Loading />;
  return <Homepage />;
}

/**
 * The routes that fill the viewport rather than scrolling it.
 *
 * Everything else — the landing page, the written pages, and the stubs that
 * are not built yet — is a document and scrolls. That is the safe default:
 * a page wrongly pinned loses everything below the fold with no way to reach
 * it, while a page wrongly left scrolling just scrolls.
 *
 * The dashboard is deliberately not on this list. It is four rows tall now and
 * whether it fits depends on the screen, so pinning it would mean guessing a
 * viewport height to pin above — and a guess that is too low does not shorten
 * the page, it hides the bottom of it. Left alone, the browser answers exactly
 * the question that matters: taller than the window, it scrolls; shorter, no
 * scrollbar appears. Its task list still scrolls inside its own card, which is
 * what the pinning was really for — see .dash-main in styles/dashboard-home.css.
 *
 * Analytics came off with the redesign, and it is the clearest case. It was a
 * report card and a scoring panel side by side — one screen by construction. It
 * is seven tabs of panels down a scroll now, and the pinning was hiding
 * everything below the summary tiles. Growth had come off before it for the
 * same reason, back when it was a page of its own; its chapters are tabs of
 * Analytics now and inherit the ruling.
 *
 * Goals came off for the fourth time in the same story. It was a shell with a
 * list scrolling inside it; it is a ladder of goals, a stats row and a timeline
 * per goal now, which is taller than any screen on purpose. Pinned, the page
 * ended at whatever the first viewport could hold and the timelines could not
 * be reached at all — `body.pins-viewport` sets `overflow: hidden` on the
 * document, so there was no scrollbar to find them with.
 */
const PINNED: string[] = [];

function pinsViewport(pathname: string): boolean {
  return PINNED.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * The landing page is not an app page and does not get the app's chrome.
 *
 * It is the one route a signed-out visitor is meant to read rather than work
 * in, and it carries its own header and its own Log In / Sign Up row — the ones
 * it had before React, which styles/homepage.css still dresses. The rail beside
 * that would be a second navigation for pages the reader cannot open yet.
 * The sign-in page (/login) is the same: a signed-out visitor's page, with the
 * mark in its own layout.
 */
function isLanding(pathname: string): boolean {
  return pathname === '/home' || pathname === '/login';
}

function isSettings(pathname: string): boolean {
  return pathname === '/settings' || pathname.startsWith('/settings/');
}

export default function App() {
  const { pathname } = useLocation();
  usePinnedViewport(pinsViewport(pathname));

  // `has-rail` is what reserves the rail's width; index.html sets it because
  // every page but this one wants it. Off here, so the landing page gets the
  // full width back.
  const landing = isLanding(pathname);
  /* The Personal and Team spaces are the reader's own pages, and keep a plain
     ground: no graph paper behind what they write. */
  const custom = false;

  /* `on-calendar` re-rules the background's graph paper to the calendar's own
     hour pitch while a calendar view is open — styles/ambient.css has the
     figures and the caveat. A body class rather than a prop on <Ambient />,
     because what changes is a stylesheet's mind about one layer and not
     anything the component renders; `has-rail` beside it works the same way. */
  const onCalendar = pathname === '/calendar' || pathname.startsWith('/calendar/');
  /* Settings takes the whole window: no rail, no top bar, and an arrow in its
     own corner back to wherever the reader came from. `no-chrome` hides the
     two and gives their room back (styles/rail.css) rather than unmounting
     them, so neither is rebuilt on the way out. */
  const bare = isSettings(pathname);
  useEffect(() => {
    document.body.classList.toggle('has-rail', !landing);
    return () => document.body.classList.add('has-rail');
  }, [landing]);
  useEffect(() => {
    document.body.classList.toggle('no-chrome', bare);
    return () => document.body.classList.remove('no-chrome');
  }, [bare]);
  /* Where Settings' back arrow goes: the last page that was not Settings.
     Moving between its sections pushes history, so "back" is not the way out. */
  useEffect(() => {
    if (!bare && !landing) rememberExit(pathname);
  }, [bare, landing, pathname]);
  useEffect(() => {
    document.body.classList.toggle('on-calendar', onCalendar);
    return () => document.body.classList.remove('on-calendar');
  }, [onCalendar]);
  /* Whose hidden chain this is. Above the router so the name is right before
     any page mounts a script that reads it — see hooks/useChainAccount.ts. */
  useChainAccount();

  /* `/calendar#void` is the far end of the hidden chain, and it is read here
     rather than on the calendar because the calendar's own route redirects and
     a redirect drops the fragment. See hooks/useVoid.ts. */
  useVoid();

  /* The paper look loads on demand (styles/paperLook.ts). A visit that began
     on the landing page doesn't have it yet, so the first app page holds on
     the loading screen until it's in rather than showing in the wrong
     colours. Usually a few hundred milliseconds, once per visit. */
  const [paper, setPaper] = useState(paperLoaded);
  useEffect(() => {
    if (landing || paper) return;
    let live = true;
    void loadPaper().then(() => {
      if (live) setPaper(true);
    });
    return () => {
      live = false;
    };
  }, [landing, paper]);
  if (!landing && !paper) return <Loading />;

  return (
    <>
      {/* The graph paper, the slow wash and the drifting dots, once for the
          whole app.
          
          It used to be a line in each page's own markup, which meant ten
          copies of it and six pages without one — the written pages, the sign
          in page, the records page, the calendar — because a page nobody
          remembered to add it to simply did not have it. A background is a
          property of the app, not a thing each screen opts into, and a screen
          written next week gets this one without anybody remembering.
          
          Every page wears the whole layer — the graph paper, the slow wash and
          the drifting dots — and the landing page adds the glow that follows
          the pointer (see components/Ambient for why only there). The custom
          spaces have none — see `custom`. */}
      {!custom && <Ambient cursor={pathname === '/home'} />}
      {!landing && (
        <div className="app-chrome">
          <Rail />
        </div>
      )}
      {/* Beside the rail rather than above it: the rail owns the full height
          and the bar starts at `--rail-w`. Outside the router with the rail,
          so neither is torn down and rebuilt on every navigation. The account
          read they both show is not theirs any more — it belongs to
          UserDataProvider above them, and happens once for the session. */}
      {!landing && (
        <div className="app-chrome">
          <Topbar />
        </div>
      )}
      {/* Under the bar and over the page, and only when there is something to
          ask: an account whose address is confirmed never sees it. It is drawn
          here rather than by each page for the same reason the bar is — one
          strip for the app, not one per screen. See components/VerifyBanner. */}
      {!landing && (
        <div className="app-chrome">
          <VerifyBanner />
        </div>
      )}
      <main className="app-main">
        {/* Inside the shell, so a page that throws loses the page and not the
            rail, the top bar and the way back. Keyed on the path: navigating
            away from a broken screen clears the error rather than pinning it
            over the route the reader just chose. See components/ErrorBoundary. */}
        <AppBoundary resetKey={pathname}>
        <Suspense fallback={<Loading />}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<FrontDoor />} />
            <Route path="/home" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/about-us" element={<AboutUs />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />

            {/* Account required — the same paths the backend gates.
                See backend/middleware/gate.py GATED_PATHS. */}
            <Route element={<RequireAccount />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/review" element={<Review />} />
              <Route path="/problems" element={<Problems />} />
              <Route path="/problems/:problemId" element={<Problem />} />
              <Route path="/topics" element={<Topics />} />
              <Route path="/topics/:topicId" element={<Topic />} />
              <Route path="/contests" element={<Contests />} />
              <Route path="/contests/:contestId" element={<Contest />} />
              <Route path="/contests/:contestId/take" element={<TakeMock />} />
              <Route path="/mocks/:mockId" element={<MockResult />} />
              <Route path="/study-plan" element={<StudyPlan />} />
              <Route path="/search" element={<Search />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/:section" element={<Settings />} />
              {RETIRED_PATHS.map((path) => (
                <Route key={path} path={path} element={<Navigate to="/dashboard" replace />} />
              ))}
            </Route>

            {/* Through the front door rather than straight to /home, so a
                mistyped address puts an account on its start page and only a
                stranger on the landing page. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </AppBoundary>
      </main>
      {/* Over the page rather than in it, and outside the router with the rail
          and the bar: a notification that arrived while you were on Tasks
          should not be torn down by navigating to Goals. Nothing is drawn when
          there is nothing waiting, or when the account has turned the
          on-screen half off — see components/Notifications/Toasts.tsx. */}
      {!landing && <Toasts />}
    </>
  );
}
