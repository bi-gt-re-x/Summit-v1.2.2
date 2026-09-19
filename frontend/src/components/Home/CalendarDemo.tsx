/**
 * Planning a week, played out — the port of home-calendar.js.
 *
 * The week grid fills in, a pointer picks "Math revision" up off Monday and
 * carries it to Tuesday, the column it is over lights up, the event snaps in
 * with a small overshoot, then a new task appears on Wednesday, gets ticked
 * off, pays its XP and pushes the streak from 27 to 28.
 *
 *      0ms   the events fade onto the grid, 70ms apart
 *    700ms   the pointer arrives on Monday's "Math revision"
 *   1050ms   it presses; the event lifts, tilts and casts further
 *   1250ms   pointer and event travel to Tuesday; the column highlights
 *   1950ms   released: the event lands in Tuesday's column with an overshoot
 *   2350ms   a new task appears on Wednesday
 *   2750ms   the pointer moves to it and clicks
 *   3050ms   it is ticked off, "+40 XP" floats away, the flame takes the streak
 *            to 28
 *   3700ms   the pointer leaves
 *
 * The drag is a transform, and the drop is a real move: the event is appended
 * to Tuesday's column and the transform cleared in the same frame, so it stays
 * exactly where it was on screen while changing which column owns it. Anything
 * else makes it jump at the handover.
 *
 * That move is the one place this port reaches across React and takes a node
 * React rendered out of one parent and puts it in another. It is safe because
 * this component never re-renders — it holds no state, and everything that
 * moves is a ref — and because `reset` puts the node back where it started,
 * including on unmount, which is when `useInViewPlay` calls it.
 */
import { useCallback, useRef } from 'react';
import {
  effects,
  timeline,
  useInViewPlay,
  type Effects,
  type Timeline,
} from '@/utils/homePlay';
import { Icon } from '@/components/Icon';

const STREAK_FROM = 27;
const STREAK_TO = 28;

/**
 * Where the dragged event lands on Tuesday, and what that slot is called.
 *
 * Tuesday already holds "Goal review" from 14% to 44% of the column, so
 * dropping at 30% — the middle, which is where a naive drop goes — would bury
 * one under the other. 50% clears it with room to spare.
 *
 * The column's own scale is set by the event being dragged: it starts at 4%
 * labelled 9:00 and is 22% tall for its hour, so 22% is an hour and 50% is
 * 9:00 plus (50-4)/22 hours — eleven o'clock. Moving an event has to move its
 * time with it, or the card is showing two different answers.
 */
const DROP_TOP = 50;
const DROP_TIME = '11:00–12:00';
const HOME_TOP = '4%';
const HOME_TIME = '9:00–10:00';

const POINTER = (
  <svg viewBox="0 0 24 24">
    <path
      d="M5 2.5 19.5 11l-6.6 1.6L9.8 19.5z"
      fill="#14181f"
      stroke="#fff"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

/** One event block. `tone` is the legend colour: a study, b task, c goal. */
function Event({
  tone,
  top,
  height,
  title,
  when,
}: {
  tone: 'a' | 'b' | 'c';
  top: string;
  height: string;
  title: string;
  when: string;
}) {
  return (
    <span className={`lp-ev lp-ev-${tone}`} style={{ top, height }}>
      <b>{title}</b>
      <small>{when}</small>
    </span>
  );
}

export function CalendarDemo() {
  const card = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const from = useRef<HTMLDivElement>(null);
  const to = useRef<HTMLDivElement>(null);
  const newHost = useRef<HTMLDivElement>(null);
  const drag = useRef<HTMLSpanElement>(null);
  const streak = useRef<HTMLSpanElement>(null);
  const streakNum = useRef<HTMLElement>(null);

  const tl = useRef<Timeline | null>(null);
  const fx = useRef<Effects>(effects());
  /** The task that turns up on Wednesday — made on the fly, so not in the JSX. */
  const fresh = useRef<HTMLSpanElement | null>(null);

  const dragTime = useCallback(
    () => drag.current?.querySelector('small') ?? null,
    [],
  );

  const reset = useCallback(() => {
    tl.current?.cancel();
    fx.current.clear();
    fresh.current?.remove();
    fresh.current = null;

    card.current?.classList.add('cal-armed');

    const event = drag.current;
    if (event) {
      event.classList.remove('is-dragging', 'is-dropped');
      event.style.removeProperty('--cal-dx');
      event.style.removeProperty('--cal-dy');
      event.style.top = HOME_TOP;
      const when = dragTime();
      if (when) when.textContent = HOME_TIME;
      // Home again, so React finds the tree it rendered when this unmounts.
      if (event.parentNode !== from.current) from.current?.appendChild(event);
    }

    to.current?.classList.remove('is-target');

    const pointer = cursor.current;
    if (pointer) {
      pointer.classList.remove('is-on', 'is-press');
      pointer.style.transitionDuration = '';
      pointer.style.setProperty('--fx-at', 'none');
      pointer.style.transform = '';
    }

    streak.current?.classList.remove('is-lit');
    if (streakNum.current) streakNum.current.textContent = String(STREAK_FROM);

    card.current?.querySelectorAll<HTMLElement>('.lp-ev').forEach((ev) => {
      ev.style.transitionDelay = '';
      ev.classList.remove('is-done');
    });
  }, [dragTime]);

  const moveCursor = useCallback((x: number, y: number, ms: number) => {
    const el = cursor.current;
    if (!el) return;
    const at = `translate3d(${x}px,${y}px,0)`;
    el.style.transitionDuration = `260ms, ${ms}ms`;
    el.style.setProperty('--fx-at', at);
    el.style.transform = at;
  }, []);

  /** A point inside `el`, given as fractions of it, in the card's coordinates. */
  const pointIn = useCallback((el: Element, fx0: number, fy: number) => {
    const a = el.getBoundingClientRect();
    const b = card.current?.getBoundingClientRect();
    return {
      x: a.left - (b?.left ?? 0) + a.width * fx0,
      y: a.top - (b?.top ?? 0) + a.height * fy,
    };
  }, []);

  const flyXp = useCallback((at: { x: number; y: number }, label: string) => {
    const host = card.current;
    if (!host) return;
    const badge = document.createElement('span');
    badge.className = 'fx-xp-fly';
    badge.textContent = label;
    badge.style.left = `${at.x}px`;
    badge.style.top = `${at.y}px`;
    fx.current.spawn(host, badge);
    fx.current.animate(
      badge,
      [
        { transform: 'translate3d(-50%,-50%,0) scale(0.7)', opacity: 0 },
        {
          transform: 'translate3d(-50%,-130%,0) scale(1)',
          opacity: 1,
          offset: 0.3,
        },
        { transform: 'translate3d(-50%,-260%,0) scale(0.9)', opacity: 0 },
      ],
      {
        duration: 1100,
        easing: 'cubic-bezier(0.25,0.6,0.3,1)',
        fill: 'forwards',
      },
    );
  }, []);

  const play = useCallback(() => {
    const t = timeline();
    tl.current = t;

    card.current?.querySelectorAll<HTMLElement>('.lp-ev').forEach((ev, i) => {
      ev.style.transitionDelay = `${i * 70}ms`;
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => card.current?.classList.remove('cal-armed'));
    });

    // --- the pointer arrives on Monday's event ---
    t.at(560, () => {
      const pointer = cursor.current;
      const host = card.current;
      const event = drag.current;
      if (!pointer || !host || !event) return;
      const entry = pointIn(host, 0.62, 1.08);
      pointer.style.transitionDuration = '0ms, 0ms';
      const at = `translate3d(${entry.x}px,${entry.y}px,0)`;
      pointer.style.setProperty('--fx-at', at);
      pointer.style.transform = at;
      requestAnimationFrame(() => {
        pointer.classList.add('is-on');
        const grab = pointIn(event, 0.5, 0.45);
        moveCursor(grab.x, grab.y, 620);
      });
    });

    // --- picked up ---
    t.at(1050, () => {
      cursor.current?.classList.add('is-press');
      drag.current?.classList.add('is-dragging');
    });

    // --- carried across to Tuesday ---
    t.at(1250, () => {
      const event = drag.current;
      const column = to.current;
      if (!event || !column) return;
      const a = event.getBoundingClientRect();
      const b = column.getBoundingClientRect();
      // Centred on Tuesday's column, and low enough to clear the event already
      // sitting there — see DROP_TOP.
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height * (DROP_TOP / 100) - a.top;
      event.style.setProperty('--cal-dx', `${dx}px`);
      event.style.setProperty('--cal-dy', `${dy}px`);
      column.classList.add('is-target');

      const here = pointIn(event, 0.5, 0.45);
      moveCursor(here.x + dx, here.y + dy, 620);
    });

    // --- released: hand the event to Tuesday without it moving ---
    t.at(1950, () => {
      const event = drag.current;
      const column = to.current;
      if (!event || !column) return;
      cursor.current?.classList.remove('is-press');
      column.classList.remove('is-target');

      event.classList.remove('is-dragging');
      event.style.removeProperty('--cal-dx');
      event.style.removeProperty('--cal-dy');
      column.appendChild(event);
      // The transform put it at exactly DROP_TOP of the column, so handing
      // ownership over at that same percentage leaves it where it already is
      // on screen — no jump at the handover.
      event.style.top = `${DROP_TOP}%`;
      const when = dragTime();
      if (when) when.textContent = DROP_TIME;
      event.classList.add('is-dropped');
    });

    // --- a new task turns up on Wednesday ---
    t.at(2350, () => {
      const host = newHost.current;
      if (!host) return;
      const made = document.createElement('span');
      made.className = 'lp-ev lp-ev-b';
      made.style.top = '80%';
      made.style.height = '16%';
      made.innerHTML = '<b>Revision recap</b><small>3:00</small>';
      fx.current.spawn(host, made);
      fresh.current = made;
      fx.current.animate(
        made,
        [
          { opacity: 0, transform: 'translate3d(0,10px,0) scale(0.94)' },
          { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
        ],
        {
          duration: 420,
          easing: 'cubic-bezier(0.22,0.68,0.28,1)',
          fill: 'forwards',
        },
      );
    });

    // --- and gets ticked off ---
    t.at(2750, () => {
      if (!fresh.current) return;
      const at = pointIn(fresh.current, 0.5, 0.5);
      moveCursor(at.x, at.y, 520);
    });
    t.at(3000, () => cursor.current?.classList.add('is-press'));
    t.at(3140, () => cursor.current?.classList.remove('is-press'));

    t.at(3050, () => {
      const made = fresh.current;
      if (!made) return;
      made.classList.add('is-done');
      flyXp(pointIn(made, 0.5, 0.2), '+40 XP');
      if (streakNum.current) streakNum.current.textContent = String(STREAK_TO);
      const flame = streak.current;
      if (!flame) return;
      flame.classList.remove('is-lit');
      void flame.offsetWidth; // restart the animation
      flame.classList.add('is-lit');
    });

    t.at(3700, () => {
      const host = card.current;
      if (!host) return;
      const out = pointIn(host, 0.62, 1.08);
      moveCursor(out.x, out.y, 620);
      cursor.current?.classList.remove('is-on');
    });
  }, [dragTime, flyXp, moveCursor, pointIn]);

  const still = useCallback(() => {
    card.current?.classList.remove('cal-armed');
    // The outcome, painted directly: the event on Tuesday at its new time, and
    // the streak already counted.
    const event = drag.current;
    if (event && to.current) {
      to.current.appendChild(event);
      event.style.top = `${DROP_TOP}%`;
      const when = dragTime();
      if (when) when.textContent = DROP_TIME;
    }
    if (streakNum.current) streakNum.current.textContent = String(STREAK_TO);
  }, [dragTime]);

  useInViewPlay(card, { play, reset, still, threshold: 0.35 });

  return (
    <div className="lp-card lp-calendar cal-armed" id="calDemo" ref={card} aria-hidden="true">
      <div className="lp-cal-topbar">
        <div className="lp-cal-title">
          <span className="lp-cal-ico"><Icon name="calendar" /></span> This Week · July 2026
        </div>
        <div className="lp-cal-legend">
          <span>
            <i className="lp-lg lp-lg-a" /> Study
          </span>
          <span>
            <i className="lp-lg lp-lg-b" /> Tasks
          </span>
          <span>
            <i className="lp-lg lp-lg-c" /> Goals
          </span>
          <span className="cal-streak" id="calStreak" ref={streak}>
            <i><Icon name="flame" /></i>{' '}
            <b id="calStreakNum" ref={streakNum as React.RefObject<HTMLElement>}>
              {STREAK_FROM}
            </b>{' '}
            days
          </span>
        </div>
      </div>

      <span className="fx-cursor" id="calCursor" ref={cursor}>
        {POINTER}
      </span>

      <div className="lp-cal-grid">
        <div className="lp-cal-times">
          <span>9 AM</span>
          <span>10</span>
          <span>11</span>
          <span>12</span>
          <span>1 PM</span>
          <span>2</span>
        </div>
        <div className="lp-cal-cols">
          <div className="lp-cal-col">
            <div className="lp-cal-colhead">
              Mon <b>7</b>
            </div>
            <div className="lp-cal-body" id="calFrom" ref={from}>
              {/* The one that gets carried across. */}
              <span
                className="lp-ev lp-ev-a"
                id="calDrag"
                ref={drag}
                style={{ top: HOME_TOP, height: '22%' }}
              >
                <b>Math revision</b>
                <small>{HOME_TIME}</small>
              </span>
              <Event tone="b" top="46%" height="16%" title="Essay draft" when="12:00" />
            </div>
          </div>

          <div className="lp-cal-col">
            <div className="lp-cal-colhead">
              Tue <b>8</b>
            </div>
            <div className="lp-cal-body" id="calTo" ref={to}>
              <Event tone="c" top="14%" height="30%" title="Goal review" when="10:00–11:30" />
            </div>
          </div>

          <div className="lp-cal-col lp-cal-today">
            <div className="lp-cal-colhead">
              Wed <b>9</b>
            </div>
            <div className="lp-cal-body" id="calNewHost" ref={newHost}>
              <Event tone="b" top="6%" height="18%" title="CS lab" when="9:00" />
              <Event tone="a" top="52%" height="26%" title="Deep work" when="1:00–2:00" />
            </div>
          </div>

          <div className="lp-cal-col">
            <div className="lp-cal-colhead">
              Thu <b>10</b>
            </div>
            <div className="lp-cal-body">
              <Event tone="a" top="20%" height="26%" title="Reading" when="10:30–12:00" />
            </div>
          </div>

          <div className="lp-cal-col">
            <div className="lp-cal-colhead">
              Fri <b>11</b>
            </div>
            <div className="lp-cal-body">
              <Event tone="c" top="8%" height="20%" title="Weekly goals" when="9:00" />
              <Event tone="b" top="48%" height="30%" title="Practice set" when="12:30–2:00" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
