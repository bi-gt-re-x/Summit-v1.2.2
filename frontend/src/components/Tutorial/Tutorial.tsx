/**
 * The tutorial: Mango hops around the app, points at the real buttons, and
 * dims everything else so the only thing that can be clicked is the thing
 * the step is about.
 *
 * Replaces the old five-card welcome, which named the pages without showing
 * where anything was. The script is in ./steps.ts.
 *
 * ## Who sees it
 *
 * A new account, once, on its first visit after Complete Profile: the same
 * rule the welcome had (`welcome_seen` off, the account still in its starter
 * or gated stage). Settings can start it again for any account, which writes
 * a step to this browser's storage; a saved step is also what lets a reload
 * pick the tour up where it was instead of starting over.
 *
 * ## The dark-out
 *
 * A lit hole over the target, and blockers over the rest of the window that
 * swallow every click. On a `next` step the blocker covers the hole too, so
 * the page is something to look at. On `click` and `inside` steps the hole is
 * open, and that is the only part of the page that works. The blockers are
 * placed every frame from the target's live rectangle, so they follow it
 * through scrolling, resizing and layout shifts.
 *
 * Nothing is ever a dead end. A target that never shows up either skips its
 * step (`skipIfMissing`) or gets a plain card in the middle with a Next
 * button, and Skip tour is on every card.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { useStarter } from '@/hooks/useStarter';
import { reduced } from '@/utils/homePlay';
import { Mango } from './Mango';
import { STEPS, type Step, type TourContext } from './steps';
import '@/styles/tutorial.css';

const STORE = 'summit:tour';
/** Room around a lit target. */
const PAD = 8;
/** How long a step waits for its target once its page has loaded. */
const GRACE_MS = 900;

interface Saved { user: string; at: number }

function readSaved(user: string | null): number | null {
  if (!user) return null;
  try {
    const raw = window.localStorage.getItem(STORE);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    return saved.user === user && Number.isInteger(saved.at) ? saved.at : null;
  } catch {
    return null;
  }
}

function writeSaved(user: string | null, at: number | null) {
  try {
    if (!user || at === null) window.localStorage.removeItem(STORE);
    else window.localStorage.setItem(STORE, JSON.stringify({ user, at }));
  } catch {
    /* private window: the tour still runs, it just won't survive a reload */
  }
}

/** Start the tour again from the top. Settings calls this. */
export function replayTutorial(user: string | null) {
  writeSaved(user, 0);
}

/** The first match for any of the selectors that is actually on screen. */
function findTarget(selectors: string[] | undefined): HTMLElement | null {
  if (!selectors) return null;
  for (const selector of selectors) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (el.closest('.tut-root')) continue;
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) return el;
    }
  }
  return null;
}

const onRoute = (pathname: string, route?: string) =>
  !route || pathname === route || pathname.startsWith(`${route}/`);

interface Box { top: number; left: number; width: number; height: number }

const same = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

const text = (value: Step['title'], ctx: TourContext) => (typeof value === 'function' ? value(ctx) : value);

export function Tutorial() {
  const { status, username, profileComplete } = useAuth();
  const { prefs, displayName, update, ready } = useSettings();
  const starter = useStarter();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const saved = readSaved(username);
  const wanted = status === 'signed-in' && profileComplete && ready && starter.ready && !prefs.welcome_seen
    && (starter.stage !== 'open' || saved !== null);

  const [at, setAt] = useState<number>(() => saved ?? 0);
  const [closed, setClosed] = useState(false);
  const showing = wanted && !closed && at < STEPS.length;
  const step = STEPS[Math.min(at, STEPS.length - 1)]!;

  // A replay started from Settings after this component had already decided.
  useEffect(() => {
    if (saved !== null && wanted) {
      setClosed(false);
      setAt(saved);
    }
    // Only when the account's flag flips, not on every step this tour writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  useEffect(() => {
    if (showing) writeSaved(username, at);
  }, [showing, username, at]);

  const end = useCallback((to?: string) => {
    writeSaved(username, null);
    setClosed(true);
    void update({ welcome_seen: true });
    if (to) navigate(to);
  }, [navigate, update, username]);

  const advance = useCallback(() => setAt((was) => was + 1), []);

  // ---- Getting to the step's page ------------------------------------------
  useEffect(() => {
    if (!showing || onRoute(pathname, step.route)) return;
    // A click step's own click is what changes the page, so give it a moment
    // before deciding the reader is somewhere else.
    const wait = window.setTimeout(() => navigate(step.route!), 250);
    return () => window.clearTimeout(wait);
  }, [showing, pathname, step.route, navigate]);

  // ---- Finding and following the target ------------------------------------
  const [box, setBox] = useState<Box | null>(null);
  const [missing, setMissing] = useState(false);
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
  const target = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setBox(null);
    setMissing(false);
    target.current = null;
    if (!showing || !step.target) return undefined;

    let frame = 0;
    let seen = false;
    let settledAt: number | null = null;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const el = findTarget(step.target);
      if (el) {
        if (!seen) {
          seen = true;
          const r = el.getBoundingClientRect();
          if (r.top < 0 || r.bottom > window.innerHeight) {
            el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
          }
        }
        target.current = el;
        setMissing(false);
        const r = el.getBoundingClientRect();
        const next = {
          top: Math.round(r.top - PAD),
          left: Math.round(r.left - PAD),
          width: Math.round(r.width + PAD * 2),
          height: Math.round(r.height + PAD * 2),
        };
        setBox((was) => (same(was, next) ? was : next));
        return;
      }

      target.current = null;
      setBox((was) => (was ? null : was));
      // A dialog or a setup screen that has closed: that was the point.
      if (seen && step.kind === 'inside') {
        cancelAnimationFrame(frame);
        advance();
        return;
      }
      // Not there yet. Give the page time to load before giving up on it.
      const loading = !onRoute(window.location.pathname, step.route)
        || document.querySelector('.page-state-loading') !== null;
      if (loading) { settledAt = null; return; }
      settledAt ??= performance.now();
      if (performance.now() - settledAt < GRACE_MS) return;
      if (step.skipIfMissing) {
        cancelAnimationFrame(frame);
        advance();
        return;
      }
      setMissing(true);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [showing, at, step, advance]);

  useEffect(() => {
    if (!showing) return undefined;
    const resize = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [showing]);

  // ---- Clicking the target --------------------------------------------------
  useEffect(() => {
    if (!showing || step.kind !== 'click') return undefined;
    const onClick = (event: MouseEvent) => {
      const el = target.current;
      if (el && event.target instanceof Node && el.contains(event.target)) {
        window.setTimeout(advance, 60);
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [showing, step, advance]);

  // ---- The card's height, for placing it -----------------------------------
  const card = useRef<HTMLDivElement | null>(null);
  const [cardH, setCardH] = useState(180);
  useLayoutEffect(() => {
    if (!showing || !card.current) return undefined;
    const el = card.current;
    const measure = () => setCardH(el.offsetHeight);
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [showing, at]);

  const nextButton = useRef<HTMLButtonElement | null>(null);
  const hole = missing ? null : box;
  const lit = hole !== null;
  const needsNext = step.kind === 'next' || missing || (step.kind === 'click' && !step.target);
  useEffect(() => {
    if (showing && needsNext) nextButton.current?.focus({ preventScroll: true });
    else if (showing && lit && step.kind === 'click') target.current?.focus?.({ preventScroll: true });
  }, [showing, at, needsNext, lit, step.kind]);

  if (!showing) return null;

  const ctx: TourContext = { name: displayName || username || '', stage: starter.stage };
  const place = layout(hole, cardH, view.w, view.h);
  const last = at === STEPS.length - 1;
  const open = hole && step.kind !== 'next' ? hole : null;

  return createPortal(
    <div className={`tut-root${reduced ? ' is-still' : ''}`}>
      {/* The dark-out, with a hole where the target is. */}
      {hole ? (
        <div className={`tut-hole${open ? ' is-open' : ''}`} style={hole} aria-hidden="true" />
      ) : (
        <div className="tut-dim" aria-hidden="true" />
      )}

      {/* What stops stray clicks. Four pieces round an open hole, or one over
          everything. */}
      {open ? (
        <>
          <div className="tut-block" style={{ top: 0, left: 0, right: 0, height: Math.max(0, open.top) }} />
          <div className="tut-block" style={{ top: open.top + open.height, left: 0, right: 0, bottom: 0 }} />
          <div className="tut-block" style={{ top: open.top, left: 0, width: Math.max(0, open.left), height: open.height }} />
          <div className="tut-block" style={{ top: open.top, left: open.left + open.width, right: 0, height: open.height }} />
        </>
      ) : (
        <div className="tut-block" style={{ inset: 0 }} />
      )}

      <div className="tut-mango" style={{ left: place.mango.x, top: place.mango.y, width: place.m, height: place.m * 1.1 }}>
        <Mango angle={place.angle} hop={`${at}`} />
      </div>

      <div
        ref={card}
        className="tut-card"
        role="dialog"
        aria-labelledby="tut-title"
        aria-describedby="tut-body"
        style={{ left: place.card.x, top: place.card.y, width: place.w }}
      >
        <p className="tut-count">{at + 1} of {STEPS.length}</p>
        <h2 id="tut-title">{text(step.title, ctx)}</h2>
        <p id="tut-body" aria-live="polite">{text(step.body, ctx)}</p>
        {!needsNext && step.kind === 'click' && (
          <p className="tut-hint">Click the lit-up button to keep going.</p>
        )}
        {!needsNext && step.kind === 'inside' && (
          <p className="tut-hint">I'll wait here until you're done.</p>
        )}
        <div className="tut-actions">
          {!last && (
            <button type="button" className="tut-skip" onClick={() => end()}>
              Skip tour
            </button>
          )}
          {needsNext && (
            <button
              ref={nextButton}
              type="button"
              className="tut-next"
              onClick={() => (last ? end('/dashboard') : advance())}
            >
              {step.next ?? 'Next'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Where Mango and the card go.
 *
 * Beside the target on whichever side has room (right, below, left, above),
 * Mango nearest the target and the card past Mango, so the arm points across
 * a short gap at the thing it means. With no target, or no room anywhere,
 * the card sits in the middle (or the half of the screen away from the
 * target) with Mango perched on top of it.
 */
function layout(box: Box | null, cardH: number, vw: number, vh: number) {
  const m = vw < 640 ? 64 : 84;
  const mh = m * 1.1;
  let w = Math.min(320, vw - 32);
  const gap = 12;
  const edge = 16;
  const clampX = (x: number, size: number) => Math.min(Math.max(edge, x), vw - size - edge);
  const clampY = (y: number, size: number) => Math.min(Math.max(edge, y), vh - size - edge);

  const perched = (cardY: number) => {
    const cardX = clampX((vw - w) / 2, w);
    return {
      card: { x: cardX, y: cardY },
      mango: { x: cardX + w - m - 12, y: cardY - mh + 8 },
    };
  };

  let spot: { card: { x: number; y: number }; mango: { x: number; y: number } };
  if (!box) {
    spot = perched(clampY((vh - cardH) / 2 + mh / 2, cardH));
  } else {
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const right = vw - (box.left + box.width);
    const below = vh - (box.top + box.height);
    if (right >= m + w + gap * 2 + edge) {
      const mango = { x: box.left + box.width + gap, y: clampY(cy - mh / 2, mh) };
      spot = { mango, card: { x: mango.x + m + 4, y: clampY(cy - cardH / 2, cardH) } };
    } else if (below >= mh + cardH + gap + edge) {
      const mango = { x: clampX(cx - m / 2, m), y: box.top + box.height + gap };
      spot = { mango, card: { x: clampX(cx - w / 2, w), y: mango.y + mh - 6 } };
    } else if (box.left >= m + w + gap * 2 + edge) {
      const mango = { x: box.left - gap - m, y: clampY(cy - mh / 2, mh) };
      spot = { mango, card: { x: mango.x - 4 - w, y: clampY(cy - cardH / 2, cardH) } };
    } else if (box.top >= mh + cardH + gap + edge) {
      const mango = { x: clampX(cx - m / 2, m), y: box.top - gap - mh };
      spot = { mango, card: { x: clampX(cx - w / 2, w), y: mango.y - cardH + 6 } };
    } else if (Math.max(right, box.left) >= 200 + gap + edge) {
      // A tall target with a strip beside it, like a dialog: a narrower card
      // in the wider strip, with Mango on top of it, so nothing in the
      // target is covered.
      const onRight = right >= box.left;
      w = Math.min(w, (onRight ? right : box.left) - gap - edge);
      const cardX = onRight ? box.left + box.width + gap : box.left - gap - w;
      const cardY = clampY(cy - (cardH + mh) / 2, cardH + mh) + mh - 8;
      spot = {
        card: { x: cardX, y: cardY },
        mango: { x: onRight ? cardX : cardX + w - m, y: cardY - mh + 8 },
      };
    } else {
      // Nowhere beside it: the half of the screen the target isn't in.
      spot = perched(cy > vh / 2 ? edge + mh : vh - cardH - edge);
    }
  }

  let angle: number | null = null;
  if (box) {
    const fromX = spot.mango.x + m / 2;
    const fromY = spot.mango.y + mh * 0.53;
    const toX = Math.min(Math.max(fromX, box.left), box.left + box.width);
    const toY = Math.min(Math.max(fromY, box.top), box.top + box.height);
    const dx = (toX === fromX ? box.left + box.width / 2 : toX) - fromX;
    const dy = (toY === fromY ? box.top + box.height / 2 : toY) - fromY;
    angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  }

  return { ...spot, angle, m, w };
}
