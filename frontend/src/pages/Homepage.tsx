/**
 * Home — the landing page.
 *
 * One scrolling page: a hero with the app's two previews, a live miniature of
 * the dashboard, then a section per part of the app — features, the numbers,
 * hours, the calendar, streaks, analytics, the four decisions, pricing and what
 * it is built on — and a closing call. The sections are
 * components/Landing; the look and every animation are styles/landing.css.
 *
 * What this file owns is only what spans the page:
 *
 *   * its header — the mark, links to this page's own sections, the theme,
 *     and the account (a greeting and Log Out, or Log In and Sign Up). Decided
 *     from the server's answer (`useAuth`), not from localStorage. It gains a
 *     rule and a shadow once the page has scrolled;
 *   * the scroll motion (components/Landing/useLandingMotion);
 *   * forwarding an old `/home?auth=…` link on to /login, query intact;
 *   * the toast the paid plans answer with;
 *   * loading the two stages of the hidden chain that live on this page.
 *
 * App.tsx leaves this route without the rail, the top bar and the ambient
 * background: the page draws its own soft washes and nothing else.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Analytics,
  Calendar,
  Decisions,
  Demo,
  Features,
  FinalCall,
  Glance,
  Hero,
  Hours,
  Pricing,
  Quote,
  Streaks,
  Tech,
  useLandingMotion,
} from '@/components/Landing';
import { useAuth, useDocumentTitle, useTheme } from '@/hooks';
import { useSecretScripts } from '@/hooks/useSecretScripts';
import type { Theme } from '@/types';
import '@/styles/landing.css';

/** The header's links: a section of this page each, in the order they come. */
export const SECTIONS = [
  ['see-it', 'Product'],
  ['features', 'Features'],
  ['analytics', 'Analytics'],
  ['pricing', 'Pricing'],
] as const;

export default function Homepage() {
  useDocumentTitle('Home');

  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { status, username, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const signedIn = status === 'signed-in';

  /* The quote and the pentagon are doors in the hidden chain, bound by the
     original scripts (hooks/useSecretScripts says why they are loaded, not
     ported). Not until the account is known: pentagon-egg.js reads whose
     unlock to look for once, at load. */
  useSecretScripts(
    status === 'loading' ? [] : ['void.css', 'void.js', 'quote-egg.js', 'pentagon-egg.js'],
  );

  const page = useRef<HTMLDivElement>(null);
  useLandingMotion(page);

  // The header's rule and shadow, once the page has moved.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // --- the toast -----------------------------------------------------------
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  // An account link from before /login existed. After every hook.
  if (params.has('auth') || params.has('verify') || params.has('oauth')) {
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }

  return (
    <>
      <header className={`lp-header ld-header${scrolled ? ' is-scrolled' : ''}`}>
        <a
          className="ld-brand"
          href="#top"
          onClick={(event) => {
            event.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <img src="/static/images/logo.svg" alt="" width={26} height={26} />
          <span>Summit</span>
        </a>
        <nav className="ld-nav" aria-label="On this page">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <div className="ld-account">
          <select
            className="ld-theme"
            aria-label="Theme"
            value={theme}
            onChange={(event) => setTheme(event.target.value as Theme)}
          >
            <option value="light">☀ Light</option>
            <option value="dark">☾ Dark</option>
          </select>
          {signedIn ? (
            <>
              <span className="ld-hello">Hello, {username}</span>
              <button type="button" className="ld-btn is-small" onClick={() => void signOut()}>
                Log Out
              </button>
            </>
          ) : (
            <>
              <button type="button" className="ld-btn is-small" onClick={() => navigate('/login?auth=login')}>
                Log In
              </button>
              <button
                type="button"
                className="ld-btn is-small is-primary"
                onClick={() => navigate('/login?auth=create')}
              >
                Sign Up
              </button>
            </>
          )}
        </div>
      </header>

      {/* `home-main` around `lp` is what the hidden chain shakes and collapses
          (frontend/secret/*-egg.js); each section is one of the `lp`'s
          children that flies apart. */}
      <main className="home-main ld" ref={page}>
        <div className="lp">
          <Hero signedIn={signedIn} name={signedIn ? username : null} />
          <Demo name={signedIn ? username : null} />
          <Features />
          <Quote />
          <Glance />
          <Hours />
          <Calendar />
          <Streaks />
          <Analytics />
          <Decisions />
          <Pricing
            signedIn={signedIn}
            onPaidPlan={(plan) =>
              say(`${plan} is not open yet — everything is free while it is built.`)
            }
          />
          <Tech />
          <FinalCall signedIn={signedIn} />
        </div>
      </main>

      <footer className="footer ld-footer">
        <div className="ld-footer-row">
          <a className="ld-brand" href="#top">
            <img src="/static/images/logo.svg" alt="" width={22} height={22} />
            <span>Summit</span>
          </a>
          <nav className="ld-footer-links" aria-label="Footer">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
          <div className="ld-footer-meta">
            <span>Built for students.</span>
            <span>© {new Date().getFullYear()} Summit.</span>
          </div>
        </div>
        <div className="ld-footer-legal">
          <Link to="/about-us">About Us</Link>
          <a href="/contact-support">Contact Support</a>
          <Link to="/privacy-policy">Privacy Policy</Link>
          <Link to="/terms-of-service">Terms of Service</Link>
          <a href="/careers">Careers</a>
        </div>
      </footer>

      <div className={`ld-toast${toast ? ' is-shown' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </>
  );
}
