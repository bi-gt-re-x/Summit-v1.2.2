/**
 * Where the app starts.
 *
 * The stylesheets imported here are the ones every page depends on:
 * `tokens.css` is the shared type scale, radii, shadows and colours, first so
 * every sheet after it can read them; `ui.css` dresses the building blocks in
 * components/ui (button, card, badge, figure, dialog);
 * `grades.css` is the letter-grade palette every page that shows one reads,
 * `layout.css` is the shared responsive foundation (`.page-shell`, the
 * 1024/768/480 breakpoints), `page-enter.css` is the arrival cascade every
 * page shares (hooks/usePageEntrance), `summit.css` is the mountain hero every
 * page opens with (components/Hero.tsx), and `rail.css` dresses the side rail,
 * which is rendered outside the router and so belongs to no page. Everything
 * else is imported by the page that needs it, so a route nobody visits costs
 * nothing.
 *
 * StrictMode double-invokes effects in development on purpose. That is a
 * feature here rather than a nuisance: it is what catches a fetch that sets
 * state after unmount, which is exactly the bug `useApi` guards against.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { RootBoundary } from '@/components';
import {
  AuthProvider,
  NotificationsProvider,
  SettingsProvider,
  StatsProvider,
  ThemeProvider,
  UserDataProvider,
} from '@/context';

import '@/styles/tokens.css';
import '@/styles/ui.css';
import '@/styles/grades.css';
import '@/styles/layout.css';
import '@/styles/page-enter.css';
import '@/styles/preferences.css';
import '@/styles/rail.css';
import '@/styles/summit.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('index.html is missing <div id="root">');
}

/* The service worker, which is what makes this installable on a phone.
 *
 * After load rather than during it: registering competes with the app's own
 * first paint for the same connection, and the worker has nothing to do on
 * this visit anyway — it controls the *next* one.
 *
 * Only in a real build. `import.meta.env.PROD` is false under `npm run dev`,
 * where Vite serves unhashed modules it rewrites on every edit; a worker
 * caching those is a worker serving yesterday's component after a save, and
 * the hour lost to working out why is the reason this guard is here.
 *
 * Failure is silent on purpose. No worker means no offline and no install
 * prompt; it does not mean a broken app, and there is nothing the reader
 * could do about it if they were told.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(container).render(
  <StrictMode>
    {/* Outside the providers, because a provider throwing is exactly the case
        the boundary inside App.tsx cannot catch — there would be no App. */}
    <RootBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <SettingsProvider>
              {/* The account's six numbers, for the rail and the top bar,
                  which mount on every screen behind the login. Above
                  UserDataProvider because that one writes its stats here
                  rather than keeping a second copy — one state, so the top bar
                  and the dashboard cannot disagree about the XP. This is also
                  the read that decays a stale streak. */}
              <StatsProvider>
                {/* The task list. Above App so it is read once for the session
                    rather than once per caller, and demand-gated so a session
                    that never opens a task page never reads it at all. See
                    context/UserDataProvider. */}
                <UserDataProvider>
                  {/* The bell. Inside the preferences, because which
                      notifications exist at all is decided by eight switches
                      on that page, and inside the stats for the same reason
                      the top bar is: they are read together and a completion
                      moves both. It holds no task list of its own — what it
                      reads is six numbers' worth of aggregates counted in SQL.
                      See context/NotificationsProvider. */}
                  <NotificationsProvider>
                    <App />
                  </NotificationsProvider>
                </UserDataProvider>
              </StatsProvider>
            </SettingsProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </RootBoundary>
  </StrictMode>,
);
