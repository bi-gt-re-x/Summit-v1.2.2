/**
 * The Startup setting: "Open on", in Settings → Account.
 *
 * It is one preference with one reader. The select writes `home_page`, and
 * `FrontDoor` — the element behind the `/` route — turns it into a redirect.
 * Everything between those two is the ordinary settings round trip, so the
 * thing worth pinning is the end of it: given a stored choice, does `/` go
 * there.
 *
 * The two waits are as much the feature as the redirect. A redirect cannot be
 * taken back, so answering before the session or the preferences have landed
 * means opening the dashboard and jumping — which is exactly what somebody who
 * chose Notes would report as "the setting does nothing", because the page
 * they asked for is the second one they see rather than the first.
 *
 * What this cannot pin, and what is worth knowing when the setting looks
 * broken: it only ever applies to `/`. A reader who reloads while sitting on
 * /dashboard, or who is bounced to /login from a gated page and comes back
 * through `next`, has not gone through the front door and will not be sent
 * anywhere. That is correct — a setting about where the app opens is not a
 * rule about where every URL leads — and it is the likeliest reason for the
 * setting to seem inert.
 */
import { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { InitialEntry } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, SettingsContext } from '@/context/contexts';
import { authValue, settingsValue } from '@/test/render';
import { FrontDoor, Landing } from './App';
import type { AuthValue } from '@/context/contexts';
import type { Prefs } from '@/services/settings';

/** Every page `home_page` can name, and the path each one has to land on. */
const DESTINATIONS: [Prefs['home_page'], string][] = [
  ['dashboard', '/dashboard'],
  ['tasks', '/tasks'],
  ['calendar', '/calendar'],
  ['goals', '/goals'],
  ['analytics', '/analytics'],
  ['notes', '/notes'],
];

function draw(
  prefs: Partial<Prefs>,
  options: { auth?: Partial<AuthValue>; ready?: boolean } = {},
) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthContext.Provider value={authValue(options.auth)}>
        <SettingsContext.Provider
          value={settingsValue({ prefs, ready: options.ready ?? true })}
        >
          <Routes>
            <Route path="/" element={<FrontDoor />} />
            {[...DESTINATIONS.map(([, path]) => path), '/home'].map((path) => (
              <Route key={path} path={path} element={<span data-testid="at">{path}</span>} />
            ))}
          </Routes>
        </SettingsContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

const landedOn = () => screen.getByTestId('at').textContent;

describe('where the app opens', () => {
  it.each(DESTINATIONS)('opens on %s', (page, path) => {
    draw({ home_page: page });
    expect(landedOn()).toBe(path);
  });

  it('opens on the dashboard for a stored value nothing answers to', () => {
    // A preference written by a build whose list was longer, or edited by
    // hand. A front door that renders nothing is worse than one that opens
    // somewhere sensible.
    draw({ home_page: 'growth' as Prefs['home_page'] });
    expect(landedOn()).toBe('/dashboard');
  });

  it('waits for the preferences rather than opening on the default', () => {
    // The failure this guards is not a wrong page, it is a right page arrived
    // at second: redirect on the default and correct a moment later, and
    // somebody who chose Notes watches the dashboard load every morning and
    // reports that the setting does nothing.
    draw({ home_page: 'notes' }, { ready: false });
    expect(screen.queryByTestId('at')).not.toBeInTheDocument();
  });

  it('waits for the session rather than assuming signed out', () => {
    draw({ home_page: 'notes' }, { auth: { status: 'loading' }, ready: true });
    expect(screen.queryByTestId('at')).not.toBeInTheDocument();
  });

  it('sends a visitor with no account to the landing page', () => {
    draw({ home_page: 'notes' }, { auth: { status: 'signed-out', username: null } });
    expect(landedOn()).toBe('/home');
  });
});

/* The landing page itself is a long page of motion and canvases, and none of
   it is what these tests are about. */
vi.mock('@/pages/Homepage', () => ({
  default: () => <span data-testid="at">landing</span>,
}));

/**
 * `/home` as the tab's first page (typed, autocompleted, bookmarked) is a
 * second front door for an account. Reached from inside the app it is the
 * landing page for everybody, because the rail's mark is how an account gets
 * to the pentagon in the hidden chain.
 */
function drawHome(entry: InitialEntry, auth: Partial<AuthValue> = {}) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthContext.Provider value={authValue(auth)}>
        <SettingsContext.Provider value={settingsValue({ prefs: { home_page: 'dashboard' } })}>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<FrontDoor />} />
              <Route path="/home" element={<Landing />} />
              <Route path="/dashboard" element={<span data-testid="at">/dashboard</span>} />
            </Routes>
          </Suspense>
        </SettingsContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

/** What a click on the rail's mark leaves behind: an entry with its own key. */
const FROM_INSIDE = { pathname: '/home', key: 'from-the-rail' };

describe('the landing page', () => {
  it('sends an account that typed /home on to its start page', async () => {
    drawHome('/home');
    expect(await screen.findByTestId('at')).toHaveTextContent('/dashboard');
  });

  it('shows an account the landing page when it came from inside the app', async () => {
    drawHome(FROM_INSIDE);
    expect(await screen.findByTestId('at')).toHaveTextContent('landing');
  });

  it('shows a stranger the landing page', async () => {
    drawHome('/home', { status: 'signed-out', username: null });
    expect(await screen.findByTestId('at')).toHaveTextContent('landing');
  });

  it("doesn't show the landing page while a returning account is checked", () => {
    drawHome('/home', { status: 'loading', username: 'myles' });
    expect(screen.queryByTestId('at')).not.toBeInTheDocument();
  });

  it("doesn't make a first-time visitor wait for the check", async () => {
    drawHome('/home', { status: 'loading', username: null });
    expect(await screen.findByTestId('at')).toHaveTextContent('landing');
  });
});
