/**
 * The simulated dashboard on the landing page — the port of
 * home-dashboard.js.
 *
 * A mock of the real dashboard that fills itself in when the reader scrolls to
 * it, so the section shows the app working rather than a screenshot of it.
 *
 *      0ms   the frame slides up and fades in
 *    260ms   the sidebar appears
 *    380ms   the nav icons follow, 70ms apart
 *    720ms   the cards arrive, 110ms apart
 *   1150ms   the XP bar fills in three pulls and the XP counter climbs with it
 *   1500ms   the task count climbs
 *   2050ms   the growth rating steps C -> B -> A
 *   2450ms   the level badge flips 8 -> 9
 *   3100ms   the frame starts floating, and keeps floating
 *
 * The numbers are the ones the original used: XP 0 -> 75 -> 220 -> 500, tasks
 * 0 -> 24 -> 67 -> 142, rating C -> B -> A, level 8 -> 9.
 *
 * React renders the markup; the animation stays imperative and works on refs.
 * That is deliberate rather than lazy — every step of it is a class toggle or
 * a transition-delay on an element the stylesheet already dresses, and turning
 * eleven timed DOM writes into eleven pieces of state would be the same
 * sequence with a re-render between each one. The classes here are the ones in
 * styles/homepage.css and styles/home-motion.css, unchanged.
 */
import { useCallback, useRef } from 'react';
import {
  afterPaint,
  countThrough,
  timeline,
  useInViewPlay,
  type Counter,
  type Timeline,
} from '@/utils/homePlay';

/** The rating steps C -> B -> A; the ends are named so nothing indexes for them. */
/* The same student as the hero (see HERO_XP in ./sections): crossing into
   level 13 at 7,800 XP and ending the term on 8,610, graded B. */
const GRADES = ['C', 'B'] as const;
const FIRST_GRADE = 'C';
const LAST_GRADE = 'B';
const XP_STOPS = [7420, 7650, 7800, 8610];
const XP_FULL = 8610;
const xpText = (value: number) => Math.round(value).toLocaleString('en-US');
const TASK_STOPS = [0, 24, 67, 142];
const TASKS_FULL = 142;
/** The three pulls the bar fills in, as a fraction of full. */
const BAR_STEPS = [0.1, 0.58, 1];

const NAV_ICONS = [
  <>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </>,
  <>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 2v4M16 2v4" />
  </>,
  <>
    <path d="M3 17L9 11l4 4 8-8" />
    <path d="M16 7h5v5" />
  </>,
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" />
  </>,
  <path d="M4 6h16M4 12h16M4 18h10" key="menu" />,
];

export function DashboardDemo() {
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const side = useRef<HTMLElement>(null);
  const bar = useRef<HTMLElement>(null);
  const xp = useRef<HTMLElement>(null);
  const tasks = useRef<HTMLElement>(null);
  const grade = useRef<HTMLElement>(null);
  const level = useRef<HTMLElement>(null);

  const tl = useRef<Timeline | null>(null);
  const counters = useRef<Counter[]>([]);
  const unpaint = useRef<(() => void) | null>(null);

  /** The nav icons and cards, read off the stage rather than kept as refs. */
  const staggered = useCallback(() => {
    const el = stage.current;
    return {
      nav: Array.from(el?.querySelectorAll<HTMLElement>('.dd-nav-i') ?? []),
      cards: Array.from(el?.querySelectorAll<HTMLElement>('.dd-card') ?? []),
    };
  }, []);

  const reset = useCallback(() => {
    tl.current?.cancel();
    counters.current.forEach((c) => c.cancel());
    counters.current = [];
    unpaint.current?.();
    unpaint.current = null;

    stage.current?.classList.add('dd-armed');
    frame.current?.classList.remove('dd-float');
    level.current?.classList.remove('is-flipped');
    grade.current?.classList.remove('dd-grade-pop');
    if (grade.current) grade.current.textContent = FIRST_GRADE;
    if (xp.current) xp.current.textContent = xpText(XP_STOPS[0]!);
    if (tasks.current) tasks.current.textContent = '0';
    if (bar.current) bar.current.style.transform = 'scaleX(0)';

    // Clear the per-element delays from the last run, or the second play would
    // stagger against stale numbers.
    const { nav, cards } = staggered();
    nav.forEach((el) => (el.style.transitionDelay = ''));
    cards.forEach((el) => (el.style.transitionDelay = ''));
  }, [staggered]);

  const play = useCallback(() => {
    const t = timeline();
    tl.current = t;

    const { nav, cards } = staggered();
    nav.forEach((el, i) => (el.style.transitionDelay = `${380 + i * 70}ms`));
    cards.forEach((el, i) => (el.style.transitionDelay = `${720 + i * 110}ms`));
    if (side.current) side.current.style.transitionDelay = '260ms';

    // Unarm once the browser has painted the opening state, so every
    // transition above has something to move from.
    unpaint.current = afterPaint(() => {
      stage.current?.classList.remove('dd-armed');
    });

    // The bar fills in three pulls rather than one sweep, so it reads as work
    // landing in batches.
    BAR_STEPS.forEach((fraction, i) => {
      t.at(1150 + i * 420, () => {
        if (bar.current) bar.current.style.transform = `scaleX(${fraction})`;
      });
    });

    t.at(1150, () => {
      counters.current.push(countThrough(xp.current, XP_STOPS, { duration: 1260, format: xpText }));
    });
    t.at(1500, () => {
      counters.current.push(countThrough(tasks.current, TASK_STOPS, { duration: 1260 }));
    });

    // C -> B -> A, each letter popping in over the last.
    GRADES.slice(1).forEach((letter, i) => {
      t.at(2050 + i * 400, () => {
        const el = grade.current;
        if (!el) return;
        el.textContent = letter;
        el.classList.remove('dd-grade-pop');
        void el.offsetWidth; // restart the animation
        el.classList.add('dd-grade-pop');
      });
    });

    t.at(2450, () => level.current?.classList.add('is-flipped'));

    // Only once everything has landed — a frame that floats while its contents
    // are still arriving reads as unsteady, not alive.
    t.at(3100, () => frame.current?.classList.add('dd-float'));
  }, [staggered]);

  const still = useCallback(() => {
    stage.current?.classList.remove('dd-armed');
    if (bar.current) bar.current.style.transform = 'scaleX(1)';
    if (xp.current) xp.current.textContent = xpText(XP_FULL);
    if (tasks.current) tasks.current.textContent = String(TASKS_FULL);
    if (grade.current) grade.current.textContent = LAST_GRADE;
    level.current?.classList.add('is-flipped');
  }, []);

  useInViewPlay(stage, { play, reset, still, threshold: 0.3 });

  return (
    <div className="dd-stage dd-armed" id="dashDemo" ref={stage} aria-hidden="true">
      <div className="dd-frame" ref={frame}>
        <aside className="dd-side" ref={side}>
          <span className="dd-side-mark">
            <svg viewBox="0 0 100 100">
              <path
                fillRule="evenodd"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinejoin="round"
                d="M49 19 L81 80 L17 80 Z M49 49 L63 75 L37 75 Z"
              />
            </svg>
          </span>
          <nav className="dd-nav">
            {NAV_ICONS.map((icon, i) => (
              <span className={`dd-nav-i${i === 0 ? ' is-active' : ''}`} key={i}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {icon}
                </svg>
              </span>
            ))}
          </nav>
        </aside>

        <div className="dd-main">
          <div className="dd-top">
            <div>
              <b>Dashboard</b>
              <small>Daily XP · Streak</small>
            </div>
            <span className="dd-top-pill">Last 30 days</span>
          </div>

          <div className="dd-cards">
            <article className="dd-card dd-card-wide">
              <span className="dd-label">Total XP</span>
              <strong className="dd-num" id="ddXp" ref={xp}>
                {xpText(XP_STOPS[0]!)}
              </strong>
              <div className="dd-bar">
                <i id="ddBar" ref={bar as React.RefObject<HTMLElement>} />
              </div>
            </article>
            <article className="dd-card">
              <span className="dd-label">Level</span>
              <span className="dd-flip" id="ddLevel" ref={level}>
                <span className="dd-flip-in">
                  <span className="dd-face dd-face-front">12</span>
                  <span className="dd-face dd-face-back">13</span>
                </span>
              </span>
            </article>
            <article className="dd-card">
              <span className="dd-label">Growth Rating</span>
              <span className="dd-grade" id="ddGrade" ref={grade}>
                C
              </span>
            </article>
            <article className="dd-card">
              <span className="dd-label">Tasks completed</span>
              <strong className="dd-num" id="ddTasks" ref={tasks}>
                0
              </strong>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
