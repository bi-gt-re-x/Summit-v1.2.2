/**
 * Finishing a task, played out — the port of home-tasks.js.
 *
 * The workflow the app is built on, shown rather than described: a pointer
 * moves to the first task, clicks it, the box fills, a little confetti goes up,
 * the row slides out and the list closes over it, and the XP it earned flies to
 * the bar and lands.
 *
 *      0ms   the panel's three rows arrive, 90ms apart
 *    620ms   the pointer comes in from the lower right
 *   1150ms   it reaches the first checkbox
 *   1400ms   it presses
 *   1500ms   the box fills, the check draws, confetti goes up
 *   1900ms   the row slides right and its box closes; the rows below rise
 *   2050ms   "+50 XP" lifts off the row
 *   2350ms   it reaches the bar; the bar grows and the total counts 150 -> 200
 *   2900ms   the pointer leaves
 *
 * Two things are worth knowing about the row leaving. Its height, margin,
 * padding and border are animated to zero alongside the slide, because a
 * transform alone would leave the row's space behind and the list would jump
 * when it was finally removed. And the row is not removed at all — it is left
 * collapsed, so replaying only has to put it back.
 *
 * Like the dashboard mock beside it, React renders the markup and the sequence
 * stays imperative on refs: every step is a class toggle, a transition-delay or
 * a Web Animation on an element styles/home-motion.css already dresses.
 */
import { useCallback, useRef } from 'react';
import {
  afterPaint,
  countThrough,
  effects,
  timeline,
  useInViewPlay,
  type Counter,
  type Effects,
  type Timeline,
} from '@/utils/homePlay';

const CONFETTI = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#38bdf8'];
const XP_FROM = 150;
const XP_TO = 200;
const BAR_FROM = 0.3;
const BAR_TO = 0.62;

const TASKS = [
  { name: 'Study Calculus', xp: 50 },
  { name: 'Read chapter four', xp: 30 },
  { name: 'Physics problem set', xp: 80 },
];

/** The tick inside a checkbox — drawn on by CSS when the row is done. */
function Tick() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function TaskDemo() {
  const panel = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLElement>(null);
  const total = useRef<HTMLElement>(null);

  const tl = useRef<Timeline | null>(null);
  const counter = useRef<Counter | null>(null);
  const fx = useRef<Effects>(effects());
  const unpaint = useRef<(() => void) | null>(null);

  /** The rows, read off the panel rather than kept as three refs. */
  const rows = useCallback(
    () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>('.td-task') ?? []),
    [],
  );

  /** Where an element's centre is, in the panel's own coordinates. */
  const centreOf = useCallback((el: Element) => {
    const a = el.getBoundingClientRect();
    const b = panel.current?.getBoundingClientRect();
    return {
      x: a.left - (b?.left ?? 0) + a.width / 2,
      y: a.top - (b?.top ?? 0) + a.height / 2,
    };
  }, []);

  /**
   * Moves the pointer to a point in the panel's own coordinates, over a
   * duration that suits the distance — a hand does not cross the panel in the
   * same time it nudges a few pixels.
   */
  const moveCursor = useCallback((x: number, y: number, ms: number) => {
    const el = cursor.current;
    if (!el) return;
    const at = `translate3d(${x}px,${y}px,0)`;
    el.style.transitionDuration = `260ms, ${ms}ms`;
    el.style.setProperty('--fx-at', at);
    el.style.transform = at;
  }, []);

  const reset = useCallback(() => {
    tl.current?.cancel();
    counter.current?.cancel();
    fx.current.clear();
    unpaint.current?.();
    unpaint.current = null;

    panel.current?.classList.add('td-armed');
    rows().forEach((row) => {
      row.classList.remove('is-leaving', 'is-done');
      row.style.transitionDelay = '';
    });

    const pointer = cursor.current;
    if (pointer) {
      pointer.classList.remove('is-on', 'is-press');
      pointer.style.transitionDuration = '';
      pointer.style.setProperty('--fx-at', 'none');
      pointer.style.transform = '';
    }
    if (bar.current) bar.current.style.transform = `scaleX(${BAR_FROM})`;
    if (total.current) total.current.textContent = String(XP_FROM);
  }, [rows]);

  const confettiAt = useCallback((point: { x: number; y: number }) => {
    const host = panel.current;
    if (!host) return;
    for (let i = 0; i < 14; i++) {
      const bit = document.createElement('span');
      bit.className = 'fx-confetti';
      bit.style.background = CONFETTI[i % CONFETTI.length] as string;
      bit.style.left = `${point.x - 3}px`;
      bit.style.top = `${point.y - 3}px`;
      fx.current.spawn(host, bit);

      const angle = ((-125 + Math.random() * 70) * Math.PI) / 180;
      const reach = 34 + Math.random() * 46;
      fx.current.animate(
        bit,
        [
          { transform: 'translate3d(0,0,0) rotate(0deg)', opacity: 1 },
          {
            transform:
              `translate3d(${Math.cos(angle) * reach}px,` +
              `${Math.sin(angle) * reach}px,0) ` +
              `rotate(${Math.random() * 420 - 210}deg)`,
            opacity: 0,
          },
        ],
        {
          duration: 620 + Math.random() * 260,
          easing: 'cubic-bezier(0.2,0.7,0.3,1)',
          fill: 'forwards',
        },
      );
    }
  }, []);

  const flyXp = useCallback(
    (
      from: { x: number; y: number },
      to: { x: number; y: number },
      label: string,
    ) => {
      const host = panel.current;
      if (!host) return;
      const badge = document.createElement('span');
      badge.className = 'fx-xp-fly';
      badge.textContent = label;
      badge.style.left = `${from.x}px`;
      badge.style.top = `${from.y}px`;
      fx.current.spawn(host, badge);

      fx.current.animate(
        badge,
        [
          { transform: 'translate3d(-50%,-50%,0) scale(0.7)', opacity: 0 },
          {
            transform: 'translate3d(-50%,-160%,0) scale(1)',
            opacity: 1,
            offset: 0.22,
          },
          {
            transform:
              `translate3d(${to.x - from.x}px,${to.y - from.y}px,0) ` +
              'translate(-50%,-50%) scale(0.55)',
            opacity: 0,
          },
        ],
        {
          duration: 900,
          easing: 'cubic-bezier(0.35,0.05,0.2,1)',
          fill: 'forwards',
        },
      );
    },
    [],
  );

  const play = useCallback(() => {
    const t = timeline();
    tl.current = t;

    const list = rows();
    const first = list[0];
    const box = first?.querySelector('.td-box');
    list.forEach((row, i) => (row.style.transitionDelay = `${i * 90}ms`));

    unpaint.current = afterPaint(() => {
      panel.current?.classList.remove('td-armed');
    });

    // In from the lower right, then across to the box.
    t.at(620, () => {
      const pointer = cursor.current;
      const host = panel.current;
      if (!pointer || !host || !box) return;
      const size = host.getBoundingClientRect();
      pointer.style.transitionDuration = '0ms, 0ms';
      const at = `translate3d(${size.width - 40}px,${size.height + 20}px,0)`;
      pointer.style.setProperty('--fx-at', at);
      pointer.style.transform = at;
      // Next frame, or the entrance and the travel collapse into one.
      requestAnimationFrame(() => {
        pointer.classList.add('is-on');
        const target = centreOf(box);
        moveCursor(target.x - 2, target.y - 2, 620);
      });
    });

    t.at(1400, () => cursor.current?.classList.add('is-press'));
    t.at(1560, () => cursor.current?.classList.remove('is-press'));

    t.at(1500, () => {
      if (!first || !box) return;
      first.classList.add('is-done');
      confettiAt(centreOf(box));
    });

    t.at(1900, () => first?.classList.add('is-leaving'));

    t.at(2050, () => {
      if (!first || !bar.current) return;
      flyXp(centreOf(first), centreOf(bar.current), '+50 XP');
    });

    t.at(2350, () => {
      if (bar.current) bar.current.style.transform = `scaleX(${BAR_TO})`;
      counter.current = countThrough(total.current, [XP_FROM, XP_TO], {
        duration: 700,
      });
    });

    t.at(2900, () => {
      const host = panel.current;
      if (!host) return;
      const size = host.getBoundingClientRect();
      moveCursor(size.width - 40, size.height + 20, 620);
      cursor.current?.classList.remove('is-on');
    });
  }, [centreOf, confettiAt, flyXp, moveCursor, rows]);

  const still = useCallback(() => {
    panel.current?.classList.remove('td-armed');
    rows()[0]?.classList.add('is-done', 'is-leaving');
    if (bar.current) bar.current.style.transform = `scaleX(${BAR_TO})`;
    if (total.current) total.current.textContent = String(XP_TO);
  }, [rows]);

  useInViewPlay(panel, { play, reset, still, threshold: 0.4 });

  return (
    <div className="lp-card td-panel td-armed" id="taskDemo" ref={panel} aria-hidden="true">
      <div className="td-head">
        <span className="td-title">Today</span>
        <span className="td-xp">
          <span className="td-xp-bar">
            <i id="tdBar" ref={bar as React.RefObject<HTMLElement>} />
          </span>
          <b id="tdXp" ref={total as React.RefObject<HTMLElement>}>
            {XP_FROM}
          </b>
          <small>XP</small>
        </span>
      </div>
      <ul className="td-list" id="tdList">
        {TASKS.map((task) => (
          <li className="td-task" data-xp={task.xp} key={task.name}>
            <span className="td-box">
              <Tick />
            </span>
            <span className="td-name">{task.name}</span>
            <span className="td-tag">{task.xp} XP</span>
          </li>
        ))}
      </ul>
      <span className="fx-cursor" id="tdCursor" ref={cursor}>
        <svg viewBox="0 0 24 24">
          <path
            d="M5 2.5 19.5 11l-6.6 1.6L9.8 19.5z"
            fill="#14181f"
            stroke="#fff"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}
