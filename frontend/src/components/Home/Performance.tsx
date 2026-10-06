/**
 * Performance Metrics — the featured chart, the two stat cards and the gauge.
 *
 * Ported from the section of frontend/html/homepage.html of the same name,
 * with the Daily/Weekly tabs from home-fx.js and the growth-rating
 * gauge from home-charts.js.
 *
 * The tabs are the one place the original reached into the SVG and rewrote its
 * `d` by hand. Here the path is simply what the chosen series says it is, and
 * React writes it — which useCharts notices, because it watches `d` for exactly
 * this and re-measures the line so the dash and the points follow the new
 * shape. The 160ms pause before the swap is the crossfade: a path's `d` cannot
 * tween, so the chart dips out and back rather than snapping.
 *
 * The gauge stays imperative, like the other demos: the ring is a dash offset
 * and the grade is a letter being replaced, neither of which is state anyone
 * else needs to see.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Trend } from './Trend';
import {
  countThrough,
  reduced,
  timeline,
  useInViewPlay,
  type Counter,
  type Timeline,
} from '@/utils/homePlay';

/** The two series behind the Daily / Weekly tabs. */
const SERIES = {
  Daily: {
    axis: ['6', '4', '2', '0'],
    line: 'M0,120 C40,96 80,108 120,72 C160,40 200,84 240,64 C280,44 320,88 360,52 C400,28 440,60 480,34',
    x: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
  Weekly: {
    axis: ['36', '24', '12', '0'],
    line: 'M0,112 C60,104 120,82 180,86 C240,90 300,56 360,46 C420,38 450,28 480,20',
    x: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7'],
  },
} as const;

type Tab = keyof typeof SERIES;
const TABS = Object.keys(SERIES) as Tab[];

/** F -> S, one letter per step; the ends are named so nothing indexes for them. */
const GRADES = ['F', 'D', 'C', 'B', 'A', 'S'] as const;
const FIRST_GRADE = 'F';
const LAST_GRADE = 'S';

/** Where the markup leaves the ring is what "full" means — see home-charts.js. */
const RING_DASH = 201;
const RING_END = 8;
const RING_FROM = 12;
const RING_TO = 96;

function FeaturedChart() {
  const [tab, setTab] = useState<Tab>('Daily');
  /** The series actually painted; it lags `tab` by the crossfade. */
  const [shown, setShown] = useState<Tab>('Daily');
  const swapping = tab !== shown;
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (tab === shown) return;
    swapTimer.current = setTimeout(() => setShown(tab), reduced ? 0 : 160);
    return () => {
      if (swapTimer.current) clearTimeout(swapTimer.current);
    };
  }, [tab, shown]);

  const series = SERIES[shown];
  const area = `${series.line} L480,160 L0,160 Z`;

  return (
    <div className="lp-card lp-perf-main">
      <div className="lp-card-top">
        <div>
          <span className="lp-metric-label">Total Hours Worked</span>
          <strong className="lp-metric-num">
            312<small> hrs</small>
          </strong>
        </div>
        <div className="lp-tabs">
          {TABS.map((name) => (
            <span
              key={name}
              className={`lp-tab${name === tab ? ' is-active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setTab(name)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setTab(name);
                }
              }}
            >
              {name}
            </span>
          ))}
        </div>
      </div>

      <div className="lp-chart">
        <div className="lp-chart-y">
          {series.axis.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <svg
          viewBox="0 0 480 160"
          preserveAspectRatio="none"
          className={`lp-area lp-area-lg${swapping ? ' lp-chart-swap' : ''}`}
        >
          <defs>
            <linearGradient id="lpg1" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.30" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" y1="40" x2="480" y2="40" className="lp-grid" />
          <line x1="0" y1="80" x2="480" y2="80" className="lp-grid" />
          <line x1="0" y1="120" x2="480" y2="120" className="lp-grid" />
          <path d={area} fill="url(#lpg1)" />
          <path
            d={series.line}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="lp-chart-x">
        {series.x.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

/** The completion ring and the efficiency grade, which play together. */
function Gauge() {
  const card = useRef<HTMLDivElement>(null);
  const arc = useRef<SVGCircleElement>(null);
  const num = useRef<HTMLElement>(null);
  const badge = useRef<HTMLElement>(null);

  const tl = useRef<Timeline | null>(null);
  const counter = useRef<Counter | null>(null);

  const reset = useCallback(() => {
    tl.current?.cancel();
    counter.current?.cancel();
    if (arc.current) arc.current.style.strokeDashoffset = String(RING_DASH);
    if (num.current) num.current.textContent = `${RING_FROM}%`;
    if (badge.current) badge.current.textContent = FIRST_GRADE;
  }, []);

  const play = useCallback(() => {
    const t = timeline();
    tl.current = t;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (arc.current) arc.current.style.strokeDashoffset = String(RING_END);
      });
    });

    counter.current = countThrough(num.current, [RING_FROM, RING_TO], {
      duration: 1400,
      format: (value) => `${Math.round(value)}%`,
    });

    GRADES.slice(1).forEach((letter, i) => {
      t.at(240 * (i + 1), () => {
        const el = badge.current;
        if (!el) return;
        el.textContent = letter;
        el.classList.remove('gr-pop');
        void el.offsetWidth; // restart the animation
        el.classList.add('gr-pop');
      });
    });
  }, []);

  const still = useCallback(() => {
    if (arc.current) arc.current.style.strokeDashoffset = String(RING_END);
    if (num.current) num.current.textContent = `${RING_TO}%`;
    if (badge.current) badge.current.textContent = LAST_GRADE;
  }, []);

  useInViewPlay(card, { play, reset, still, threshold: 0.5 });

  return (
    <>
      <div className="lp-card lp-metric lp-metric-row" id="ringCard" ref={card}>
        <div className="lp-ring lp-ring-sm">
          <svg viewBox="0 0 80 80">
            <circle
              cx="40"
              cy="40"
              r="32"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeWidth="8"
            />
            <circle
              id="ringArc"
              ref={arc}
              cx="40"
              cy="40"
              r="32"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={RING_DASH}
              strokeDashoffset={RING_END}
              transform="rotate(-90 40 40)"
            />
          </svg>
          <em id="ringNum" ref={num as React.RefObject<HTMLElement>}>
            {RING_TO}%
          </em>
        </div>
        <div>
          <span className="lp-metric-label">Best Completion Rate</span>
          <span className="lp-metric-note">245 of 255 tasks on time</span>
        </div>
      </div>

      <div className="lp-card lp-metric lp-metric-row" id="gradeCard">
        <span
          className="lp-grade-badge"
          id="gradeBadge"
          ref={badge as React.RefObject<HTMLElement>}
        >
          {LAST_GRADE}
        </span>
        <div>
          <span className="lp-metric-label">Best Efficiency Ratio</span>
          <span className="lp-metric-note">100% deadlines · avg 42 min/task</span>
        </div>
      </div>
    </>
  );
}

export function Performance() {
  return (
    <div className="lp-perf">
      <FeaturedChart />
      <div className="lp-perf-side">
        <div className="lp-card lp-metric">
          <div className="lp-card-top">
            <span className="lp-metric-label">Daily Hours Logged</span>
            <Trend value={11} suffix="%" />
          </div>
          <strong className="lp-metric-num">
            3.7<small> hrs</small>
          </strong>
          <svg viewBox="0 0 200 44" className="lp-spark">
            <polyline
              points="0,36 28,30 56,32 84,18 112,24 140,10 170,16 200,6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <Gauge />
      </div>
    </div>
  );
}
