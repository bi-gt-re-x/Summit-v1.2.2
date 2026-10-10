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
 * A mask over the window with holes in it: one over the target, and one over
 * any dialog or menu that opens while the step is up (the calendar's Event or
 * Task chooser, a date picker panel). Everything lit works, on every kind of
 * step. Everything dimmed is dead: a capture-phase listener on the window
 * swallows presses that land outside the lit elements and the card, before
 * the page ever hears them. Filtering by element rather than by screen
 * position is what lets a dialog that opens somewhere else stay usable.
 *
 * A focus session's full screen (components/Timer/FocusSitting) pauses the
 * tour: it hides until the session is paused, then picks up where it was.
 *
 * Nothing is ever a dead end. A target that never shows up either skips its
 * step (`skipIfMissing`) or gets a plain card in the middle with a Next
 * button, and Skip tour is on every card.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { useStarter } from '@/hooks/useStarter';
import { reduced } from '@/utils/homePlay';
import { useSittingShown } from '@/components/Timer/FocusSitting';
import { Mango } from './Mango';
import { STEPS, type Step, type TourContext } from './steps';
import { PAGE_TOURS } from './pageTours';
import { featureForPath } from '@/utils/starter';
import '@/styles/tutorial.css';

const STORE = 'summit:tour';
/** Room around a lit target. */
const PAD = 8;
/** Things that open over the page and should stay usable when they do. */
const POPUPS = '[role="dialog"], [aria-modal="true"], [role="menu"], [role="listbox"], .modal-content';

/** How long a step waits for its target once its page has loaded. */
const GRACE_MS = 900;

interface Saved { user: string; tour?: string; at: number }

/** The step a tour was left on, for this account, or null. */
function readSaved(user: string | null, tour: string): number | null {
  if (!user) return null;
  try {
    const raw = window.localStorage.getItem(STORE);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    return saved.user === user && (saved.tour ?? 'welcome') === tour && Number.isInteger(saved.at)
      ? saved.at
      : null;
  } catch {
    return null;
  }
}

function writeSaved(user: string | null, tour: string, at: number | null) {
  try {
    if (!user || at === null) window.localStorage.removeItem(STORE);
    else window.localStorage.setItem(STORE, JSON.stringify({ user, tour, at }));
  } catch {
    /* private window: the tour still runs, it just won't survive a reload */
  }
}

/** Start the main tour again from the top. Settings calls this. */
export function replayTutorial(user: string | null) {
  writeSaved(user, 'welcome', 0);
}

/* Whether a tour is on screen, for the dashboard's resting Mango, which
   steps aside while one runs. */
let touring = false;
const tourListeners = new Set<() => void>();
function setTouring(on: boolean) {
  if (touring === on) return;
  touring = on;
  tourListeners.forEach((listener) => listener());
}
export function useTourShowing(): boolean {
  return useSyncExternalStore(
    (listener) => {
      tourListeners.add(listener);
      return () => tourListeners.delete(listener);
    },
    () => touring,
    () => false,
  );
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

  /* Which tour, if any. The main tutorial first, for a new account; then the
     guide for the page on screen, the first time it's opened past its note. */
  const mainSaved = readSaved(username, 'welcome');
  const signedIn = status === 'signed-in' && profileComplete && ready && starter.ready;
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const mainWanted = signedIn && !prefs.welcome_seen && (starter.stage !== 'open' || mainSaved !== null);
  const feature = featureForPath(pathname);
  const pageSteps = feature ? PAGE_TOURS[feature.id] : undefined;
  const pageWanted = Boolean(
    signedIn && feature && pageSteps && prefs.mango_tours
      && !starter.isLocked(feature.id) && !prefs.tours_seen.includes(feature.id),
  );
  const tour: { id: string; steps: Step[] } | null =
    mainWanted && !closed.has('welcome')
      ? { id: 'welcome', steps: STEPS }
      : pageWanted && feature && pageSteps && !closed.has(feature.id)
        ? { id: feature.id, steps: pageSteps }
        : null;
  const tourId = tour?.id ?? null;
  const steps = tour?.steps ?? STEPS;

  const [at, setAt] = useState<number>(() => mainSaved ?? 0);
  const [atFor, setAtFor] = useState<string | null>(null);
  // A different tour is up: pick up where it was left, or start it.
  if (tourId !== atFor) {
    setAtFor(tourId);
    setAt(tourId ? readSaved(username, tourId) ?? 0 : 0);
  }

  const sitting = useSittingShown();
  const showing = tour !== null && atFor === tourId && !sitting && at < steps.length;
  const step = steps[Math.min(at, steps.length - 1)]!;

  useEffect(() => {
    setTouring(showing);
    return () => setTouring(false);
  }, [showing]);

  // Settings can hand the page guides back. Forget the ones closed this
  // session that the account no longer counts as seen.
  useEffect(() => {
    setClosed((was) => {
      const next = new Set([...was].filter((id) => id === 'welcome' || prefs.tours_seen.includes(id)));
      return next.size === was.size ? was : next;
    });
  }, [prefs.tours_seen]);

  // A replay started from Settings after this component had already decided.
  useEffect(() => {
    if (mainSaved !== null && mainWanted) {
      setClosed((was) => {
        const next = new Set(was);
        next.delete('welcome');
        return next;
      });
      if (tourId === 'welcome') setAt(mainSaved);
    }
    // Only when the account's flag flips, not on every step this tour writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainWanted]);

  useEffect(() => {
    if (showing && tourId) writeSaved(username, tourId, at);
  }, [showing, username, tourId, at]);

  const end = useCallback((to?: string) => {
    if (!tourId) return;
    writeSaved(username, tourId, null);
    setClosed((was) => new Set(was).add(tourId));
    if (tourId === 'welcome') void update({ welcome_seen: true });
    else if (!prefs.tours_seen.includes(tourId)) void update({ tours_seen: [...prefs.tours_seen, tourId] });
    if (to) navigate(to);
  }, [navigate, update, username, tourId, prefs.tours_seen]);

  const advance = useCallback(() => setAt((was) => was + 1), []);

  // Skipped past the last step (a missing target at the end): that's done too.
  useEffect(() => {
    if (tour && atFor === tourId && at >= steps.length) end();
  }, [tour, atFor, tourId, at, steps.length, end]);

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
    let scrolledAt = -Infinity;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const el = findTarget(step.target);
      if (el) {
        const r0 = el.getBoundingClientRect();
        const vh = window.innerHeight;
        // Bring it on screen the first time if any of it is cut off, and again
        // later if it's wholly gone (a page that finishes loading can reset
        // the scroll). A tall target that's partly showing is left alone.
        // The top bar is fixed, so anything under it is as good as off screen.
        const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
        const cut = r0.top < top || r0.bottom > vh;
        const gone = r0.bottom < top + 40 || r0.top > vh - 40;
        if (((!seen && cut) || gone) && performance.now() - scrolledAt > 900) {
          scrolledAt = performance.now();
          el.scrollIntoView({ block: 'center', behavior: reduced || document.hidden ? 'auto' : 'smooth' });
        }
        seen = true;
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
    tick();
    return () => cancelAnimationFrame(frame);
  }, [showing, at, step, advance]);

  useEffect(() => {
    if (!showing) return undefined;
    const resize = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [showing]);

  // ---- Dialogs that open over the page --------------------------------------
  const [extra, setExtra] = useState<Box[]>([]);
  const popups = useRef<HTMLElement[]>([]);
  useEffect(() => {
    if (!showing) return undefined;
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const found: HTMLElement[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(POPUPS))) {
        if (el.closest('.tut-root')) continue;
        if (target.current && (target.current.contains(el) || el.contains(target.current))) continue;
        if (found.some((other) => other.contains(el))) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) found.push(el);
      }
      popups.current = found;
      const boxes = found.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top - 4), left: Math.round(r.left - 4), width: Math.round(r.width + 8), height: Math.round(r.height + 8) };
      });
      setExtra((was) => (was.length === boxes.length && was.every((b, i) => same(b, boxes[i]!)) ? was : boxes));
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [showing]);

  // ---- Keeping the dimmed page dead ------------------------------------------
  useEffect(() => {
    if (!showing) return undefined;
    const lit = (node: EventTarget | null) => {
      if (!(node instanceof Node)) return true;
      const el = node instanceof Element ? node : node.parentElement;
      if (el?.closest('.tut-root')) return true;
      if (target.current?.contains(node)) return true;
      return popups.current.some((popup) => popup.contains(node));
    };
    const stop = (event: Event) => {
      if (lit(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    // Enter and Space on something dimmed that still has focus would press it.
    const keys = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && !lit(document.activeElement)) stop(event);
    };
    const kinds = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'touchstart', 'touchend'];
    kinds.forEach((kind) => window.addEventListener(kind, stop, { capture: true, passive: false }));
    window.addEventListener('keydown', keys, true);
    return () => {
      kinds.forEach((kind) => window.removeEventListener(kind, stop, { capture: true }));
      window.removeEventListener('keydown', keys, true);
    };
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
    if (typeof ResizeObserver === 'undefined') return undefined;
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
  const last = at === steps.length - 1;

  return createPortal(
    <div className={`tut-root${reduced ? ' is-still' : ''}`}>
      {/* The dark-out: one dim layer with a hole for the target and one for
          each dialog that's open. Purely visual; the listener above is what
          keeps the dimmed part from being clicked. */}
      <svg className="tut-dim" width={view.w} height={view.h} aria-hidden="true">
        <defs>
          <mask id="tut-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={view.w} height={view.h}>
            <rect x="0" y="0" width={view.w} height={view.h} fill="#fff" />
            {[...(hole ? [hole] : []), ...extra].map((h, i) => (
              <rect key={i} x={h.left} y={h.top} width={h.width} height={h.height} rx="14" fill="#000" />
            ))}
          </mask>
        </defs>
        <rect x="0" y="0" width={view.w} height={view.h} mask="url(#tut-mask)" />
      </svg>
      {hole && <div className={`tut-ring${step.kind === 'next' ? '' : ' is-ask'}`} style={hole} aria-hidden="true" />}

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
        <p className="tut-count">{at + 1} of {steps.length}</p>
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
              {tourId === 'welcome' ? 'Skip tour' : 'Skip guide'}
            </button>
          )}
          {needsNext && (
            <button
              ref={nextButton}
              type="button"
              className="tut-next"
              onClick={() => (last ? end(tourId === 'welcome' ? '/dashboard' : undefined) : advance())}
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
