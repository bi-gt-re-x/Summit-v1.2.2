/**
 * Where the app opens: the dashboard for an account, the landing page for a
 * visitor, nothing at all while the session check is in flight (a redirect
 * cannot be taken back). And the productivity app's old pages, which land on
 * the dashboard rather than on a blank screen.
 */
import { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { InitialEntry } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, SettingsContext } from '@/context/contexts';
import { authValue, settingsValue } from '@/test/render';
import { FrontDoor, Landing, RETIRED_PATHS } from './App';
import type { AuthValue } from '@/context/contexts';

function draw(auth: Partial<AuthValue> = {}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthContext.Provider value={authValue(auth)}>
        <SettingsContext.Provider value={settingsValue({})}>
          <Routes>
            <Route path="/" element={<FrontDoor />} />
            {['/dashboard', '/home'].map((path) => (
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
  it('opens on the dashboard for an account', () => {
    draw();
    expect(landedOn()).toBe('/dashboard');
  });

  it('waits for the session rather than assuming signed out', () => {
    draw({ status: 'loading' });
    expect(screen.queryByTestId('at')).not.toBeInTheDocument();
  });

  it('sends a visitor with no account to the landing page', () => {
    draw({ status: 'signed-out', username: null });
    expect(landedOn()).toBe('/home');
  });
});

describe('the retired productivity pages', () => {
  it.each(['/tasks', '/calendar/week', '/goals', '/analytics/subject/math', '/spaces/2'])(
    'send %s to the dashboard',
    (path) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            {RETIRED_PATHS.map((p) => <Route key={p} path={p} element={<Navigate to="/dashboard" replace />} />)}
            <Route path="/dashboard" element={<span data-testid="at">/dashboard</span>} />
          </Routes>
        </MemoryRouter>,
      );
      expect(landedOn()).toBe('/dashboard');
    },
  );
});

/* The landing page itself is a long page of motion and canvases, and none of
   it is what these tests are about. */
vi.mock('@/pages/amc/Landing', () => ({
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
        <SettingsContext.Provider value={settingsValue({})}>
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
