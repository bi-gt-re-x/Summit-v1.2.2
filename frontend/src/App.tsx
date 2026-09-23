/**
 * The routing table, and the shell every page renders inside.
 *
 * The paths deliberately match the ones the server-rendered pages already use
 * — `/dashboard`, `/calendar`, `/goals`, `/growth`. That is what lets the two
 * frontends swap over a page at a time: nothing outside this file has to
 * change when a page moves from Jinja to React, and no link anywhere breaks.
 *
 * Pages are lazy so a route nobody visits costs nothing. `Dashboard` is the
 * exception — it is where a signed-in visitor lands, and a spinner on the
 * first paint of the landing page is exactly the wrong first impression.
 */
import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Ambient, AppBoundary, Loading, Rail, Toasts, Topbar, VerifyBanner } from '@/components';
import { RequireAccount } from './RequireAccount';
import { useAuth, usePinnedViewport, useSettings } from '@/hooks';
import { useChainAccount } from '@/hooks/useChainAccount';
import { useVoid } from '@/hooks/useVoid';
import Dashboard from '@/pages/Dashboard';
// Not lazy, unlike every other page here: the routes below are generated from
// `UNBUILT_PATHS`, so the module has to be loaded to build the routing table at
// all. Splitting it would put the same few hundred bytes of strings in a second
// chunk that is always already fetched.
import Unbuilt, { PATHS as UNBUILT_PATHS } from '@/pages/Unbuilt';
import type { Prefs } from '@/services/settings';

const Homepage = lazy(() => import('@/pages/Homepage'));
const Login = lazy(() => import('@/pages/Login'));
const Goals = lazy(() => import('@/pages/Goals'));
const Tasks = lazy(() => import('@/pages/Tasks'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const SubjectAnalytics = lazy(() => import('@/pages/SubjectAnalytics'));
const SkillTrees = lazy(() => import('@/pages/SkillTrees'));
const Notes = lazy(() => import('@/pages/Notes'));
const Timer = lazy(() => import('@/pages/Timer'));
const Records = lazy(() => import('@/pages/Records'));
const Settings = lazy(() => import('@/pages/Settings'));
const Achievements = lazy(() => import('@/pages/Achievements'));
const AboutUs = lazy(() => import('@/pages/AboutUs'));
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('@/pages/TermsOfService'));

const CalendarDay = lazy(() => import('@/pages/Calendar/Day'));
const CalendarWeek = lazy(() => import('@/pages/Calendar/Week'));
const CalendarMonth = lazy(() => import('@/pages/Calendar/Month'));

/**
 * The front door.
 *
 * Signed in goes to whichever page the account opens on — the dashboard unless
 * they have said otherwise (Settings, General) — and everyone else lands on the
 * home page, the rule the server route at '/' used to apply before React owned
 * that path too (backend/routes/spa.py). Waiting on `status` matters for the
 * same reason it does in RequireAccount: treating "still asking" as signed out
 * would flash the landing page at an account on its way in. It waits on the
 * preferences too, and for the reason CalendarHome does: a redirect cannot be
 * taken back, so opening on the default and correcting a moment later would
 * make somebody who chose Tasks watch the dashboard load first.
 */
const HOME_PATHS: Record<Prefs['home_page'], string> = {
  dashboard: '/dashboard',
  tasks: '/tasks',
  calendar: '/calendar',
  goals: '/goals',
  analytics: '/analytics',
  notes: '/notes',
};
/**
 * `/calendar` itself, which is a redirect to whichever view the account
 * prefers. It waits for `ready` rather than redirecting on the default and
 * correcting: a navigation cannot be taken back, and a reader who chose Month
 * would watch the week open and then jump.
 *
 * **The query and the fragment come along.** This path is an alias for one of
 * the three views, not a different destination, so everything the reader
 * arrived with has to survive the hop — and a redirect that quietly drops half
 * a URL is the kind of bug that only shows up in whatever needed the half it
 * dropped. What needed it here was `/calendar#void`, the far end of the hidden
 * chain (hooks/useVoid.ts): the void opened on arrival and then closed again a
 * frame later, because the redirect handed the router the same path with no
 * `#void` on it and the hook does what the URL says.
 */
export function CalendarHome() {
  const { prefs, ready } = useSettings();
  const { hash, search } = useLocation();
  if (!ready) return <Loading />;
  return <Navigate to={`/calendar/${prefs.calendar_view}${search}${hash}`} replace />;
}

function FrontDoor() {
  const { status } = useAuth();
  const { prefs, ready } = useSettings();
  if (status === 'loading') return <Loading />;
  if (status !== 'signed-in') return <Navigate to="/home" replace />;
  if (!ready) return <Loading />;
  return <Navigate to={HOME_PATHS[prefs.home_page] ?? '/dashboard'} replace />;
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
const PINNED = ['/calendar'];

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

export default function App() {
  const { pathname } = useLocation();
  usePinnedViewport(pinsViewport(pathname));

  // `has-rail` is what reserves the rail's width; index.html sets it because
  // every page but this one wants it. Off here, so the landing page gets the
  // full width back.
  const landing = isLanding(pathname);
  /* See the note on <Ambient /> below. */
  const ownsAmbient = pathname === '/timer';
  useEffect(() => {
    document.body.classList.toggle('has-rail', !landing);
    return () => document.body.classList.add('has-rail');
  }, [landing]);

  /* Whose hidden chain this is. Above the router so the name is right before
     any page mounts a script that reads it — see hooks/useChainAccount.ts. */
  useChainAccount();

  /* `/calendar#void` is the far end of the hidden chain, and it is read here
     rather than on the calendar because the calendar's own route redirects and
     a redirect drops the fragment. See hooks/useVoid.ts. */
  useVoid();

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
          
          The glow that follows the pointer stays off everywhere but the
          landing page. The reasoning is on components/Ambient: a light that
          chases the cursor suits a page being read and follows every trip to a
          checkbox on a page being worked.
          
          The timer is the one page that renders its own. While a sitting is
          running its field accelerates — `surge`, in the same component — and
          a second canvas behind the first would be a second rAF loop drawing
          something nobody can see. See pages/Timer.tsx. */}
      {!ownsAmbient && <Ambient cursor={pathname === '/home'} />}
      {!landing && <Rail />}
      {/* Beside the rail rather than above it: the rail owns the full height
          and the bar starts at `--rail-w`. Outside the router with the rail,
          so neither is torn down and rebuilt on every navigation. The account
          read they both show is not theirs any more — it belongs to
          UserDataProvider above them, and happens once for the session. */}
      {!landing && <Topbar />}
      {/* Under the bar and over the page, and only when there is something to
          ask: an account whose address is confirmed never sees it. It is drawn
          here rather than by each page for the same reason the bar is — one
          strip for the app, not one per screen. See components/VerifyBanner. */}
      {!landing && <VerifyBanner />}
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
            <Route path="/home" element={<Homepage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/about-us" element={<AboutUs />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />

            {/* Account required — the same four the backend gates.
                See backend/middleware/gate.py GATED_PATHS. */}
            <Route element={<RequireAccount />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/goals" element={<Goals />} />
              {/* One page, seven tabs, seven URLs. The analytics page reads the
                  pathname to decide which tab opens (VIEWS in
                  components/Analytics/Header), so the rail, the back button and
                  a pasted link all agree about what is showing — none of which
                  a local useState could have managed. */}
              <Route path="/recommendations" element={<Analytics />} />
              <Route path="/analytics" element={<Analytics />} />
              {/* The Goals tab. `/trends` was this slot and redirects rather
                  than 404s, because it was a tab with its own URL for long
                  enough to be bookmarked. */}
              <Route path="/analytics/goals" element={<Analytics />} />
              <Route path="/trends" element={<Navigate to="/analytics/goals" replace />} />
              <Route path="/habits" element={<Analytics />} />
              <Route path="/insights" element={<Analytics />} />
              <Route path="/subjects" element={<Analytics />} />
              {/* The Growth tab. This slot was the analytics tab called
                  Records, which asked where the last thirty days *stand* — the
                  percentile, the goal pacing, the round numbers cleared. Two of
                  those three are answered better elsewhere (the Goals tab, and
                  the /records page), so the slot now holds the question none of
                  them asks: how far the account has come over its whole life.
                  See VIEWS in components/Analytics/Header.

                  `/analytics/records` redirects rather than 404s, for the same
                  reason `/trends` does below: it was a tab with its own URL for
                  long enough to be bookmarked.

                  Note that `/growth` — the old server-rendered path — still
                  redirects to `/analytics` rather than here. That is deliberate
                  and it is a wart: the short path and the tab named Growth are
                  different destinations. It is left alone because `/growth` has
                  meant "the analytics page" since the port, and quietly moving
                  it would change where an existing link lands. */}
              {/* One subject, on its own — a page rather than an eighth tab.
                  There is one of these per subject the account follows, and a
                  tab bar whose shape depends on a wizard answer is a tab bar
                  the reader cannot learn; the rail's Analytics entry unfolds
                  into the list instead. The id is the subject's own, the same
                  one a task carries, so the URL survives a rename. It is a
                  skeleton today — see the page. */}
              <Route path="/analytics/subject/:subjectId" element={<SubjectAnalytics />} />
              <Route path="/analytics/growth" element={<Analytics />} />
              <Route
                path="/analytics/records"
                element={<Navigate to="/analytics/growth" replace />}
              />
              {/* The growth page was the other half of the original growth.js
                  and had five tabs of its own, four of which are now tabs above
                  and the fifth of which was a lower-resolution copy of the
                  Overview. The path stays and redirects, because it is the one
                  the server-rendered app used and links to it exist. */}
              <Route path="/growth" element={<Navigate to="/analytics" replace />} />
              {/* The skill trees. `/growth-tree` was the placeholder's path and
                  redirects, for the same reason `/growth` does: it was routed,
                  it was described in the app's structure, and links to it
                  exist. Its entry in pages/Unbuilt.tsx is gone — building one
                  for real is exactly the exit that file's instructions
                  describe. */}
              <Route path="/skill-trees" element={<SkillTrees />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/timer" element={<Timer />} />
              <Route path="/records" element={<Records />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/:section" element={<Settings />} />
              <Route path="/achievements" element={<Achievements />} />
              <Route path="/growth-tree" element={<Navigate to="/skill-trees" replace />} />
              <Route path="/calendar" element={<CalendarHome />} />
              <Route path="/calendar/day" element={<CalendarDay />} />
              <Route path="/calendar/week" element={<CalendarWeek />} />
              <Route path="/calendar/month" element={<CalendarMonth />} />
            </Route>

            {/* Not built yet, but routed, so the structure is real and the
                links resolve. Gated with the rest — every one of them shows
                personal data once it exists. Building one for real means giving
                it its own module and its own line here, and dropping its entry
                from pages/Unbuilt.tsx. */}
            <Route element={<RequireAccount />}>
              {UNBUILT_PATHS.map((path) => (
                <Route key={path} path={path} element={<Unbuilt />} />
              ))}
            </Route>

            <Route path="*" element={<Navigate to="/home" replace />} />
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
