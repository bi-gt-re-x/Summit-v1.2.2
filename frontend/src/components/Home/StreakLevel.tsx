/**
 * Streak & Level — the port of home-streak.js, plus the tracking
 * card that sits beside the two demonstrations.
 *
 * The streak. Three flames light one after another, the count climbs
 * 0 -> 7 -> 14 -> 28 alongside them, and a few sparks go up with each. Once all
 * three are lit they keep flickering, slightly out of step with each other, so
 * the card is never quite still.
 *
 * The XP history. The rail draws itself top to bottom, the three events hang
 * themselves off it in order, then the level badge flips 9 -> 10, the bar runs
 * to full and a light sweeps across it.
 *
 * Both reset when the reader leaves and play again on the way back. The sparks
 * are Web Animations so they can be cancelled outright rather than finishing
 * over a card that has already gone back to its opening state.
 */
import { useCallback, useRef } from 'react';
import { Trend } from './Trend';
import {
  countThrough,
  effects,
  timeline,
  useInViewPlay,
  type Counter,
  type Effects,
  type Timeline,
} from '@/utils/homePlay';
import { Icon, type IconName } from '@/components/Icon';

/** Lucide's flame (components/Icon.tsx), as markup: the flames are made one at
 *  a time by the timeline below rather than rendered, so they cannot be a
 *  component. A constant, so nothing user-supplied ever reaches innerHTML. */
const FLAME =
  '<svg class="icon lucide-flame" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"' +
  ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/></svg>';
const STREAK_STOPS = [0, 7, 14, 28];
const STREAK_FULL = 28;
/** Where the bar ends up. The markup starts it there; `reset` pulls it back. */
const XP_FULL = '78%';

const XP_EVENTS: { icon: IconName; label: string; xp: string }[] = [
  { icon: 'trophy', label: 'Level 13 unlocked', xp: '+200 XP' },
  { icon: 'check', label: 'Completed project', xp: '+200 XP' },
  { icon: 'check', label: 'Completed project', xp: '+200 XP' },
];

// --------------------------------------------------------------------------
// The streak card
// --------------------------------------------------------------------------
function StreakCard() {
  const card = useRef<HTMLDivElement>(null);
  const flames = useRef<HTMLSpanElement>(null);
  const num = useRef<HTMLElement>(null);

  const tl = useRef<Timeline | null>(null);
  const counter = useRef<Counter | null>(null);
  const fx = useRef<Effects>(effects());

  const reset = useCallback(() => {
    tl.current?.cancel();
    counter.current?.cancel();
    fx.current.clear();
    flames.current?.classList.remove('is-lit');
    // The flames are made as they light, so emptying the box is the reset.
    if (flames.current) flames.current.textContent = '';
    if (num.current) num.current.textContent = '0';
  }, []);

  const sparkFrom = useCallback((el: HTMLElement) => {
    const host = card.current;
    if (!host) return;
    const a = el.getBoundingClientRect();
    const b = host.getBoundingClientRect();
    for (let i = 0; i < 5; i++) {
      const spark = document.createElement('span');
      spark.className = 'sk-spark';
      spark.style.left = `${a.left - b.left + a.width / 2}px`;
      spark.style.top = `${a.top - b.top + 2}px`;
      fx.current.spawn(host, spark);
      fx.current.animate(
        spark,
        [
          { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
          {
            transform:
              `translate3d(${Math.random() * 26 - 13}px,` +
              `${-18 - Math.random() * 22}px,0) scale(0.2)`,
            opacity: 0,
          },
        ],
        {
          duration: 700 + Math.random() * 300,
          easing: 'cubic-bezier(0.25,0.7,0.35,1)',
          fill: 'forwards',
        },
      );
    }
  }, []);

  const play = useCallback(() => {
    const t = timeline();
    tl.current = t;

    for (let i = 0; i < 3; i++) {
      t.at(220 + i * 420, () => {
        const box = flames.current;
        if (!box) return;
        const flame = document.createElement('span');
        flame.innerHTML = FLAME;
        flame.className = 'is-new';
        box.appendChild(flame);
        sparkFrom(flame);
        if (i === 2) {
          // Only start the idle flicker once the last one is up, or the first
          // two would be flickering while the third ignites.
          t.at(620, () => box.classList.add('is-lit'));
        }
      });
    }

    t.at(220, () => {
      counter.current = countThrough(num.current, STREAK_STOPS, {
        duration: 1400,
      });
    });
  }, [sparkFrom]);

  const still = useCallback(() => {
    const box = flames.current;
    if (box) {
      box.textContent = '';
      for (let i = 0; i < 3; i++) {
        const flame = document.createElement('span');
        flame.innerHTML = FLAME;
        box.appendChild(flame);
      }
    }
    if (num.current) num.current.textContent = String(STREAK_FULL);
  }, []);

  useInViewPlay(card, { play, reset, still, threshold: 0.5 });

  return (
    <div className="lp-card lp-streak" id="streakDemo" ref={card}>
      <span className="lp-metric-label">Current Streak</span>
      <strong className="lp-streak-num">
        <span className="sk-flames" id="skFlames" ref={flames} />{' '}
        <span id="skNum" ref={num as React.RefObject<HTMLElement>}>
          0
        </span>{' '}
        Days
      </strong>
      <span className="lp-metric-note">Streak counting</span>
    </div>
  );
}

// --------------------------------------------------------------------------
// The XP history
// --------------------------------------------------------------------------
function XpHistory() {
  const card = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const level = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLElement>(null);

  const tl = useRef<Timeline | null>(null);

  const rows = useCallback(
    () => Array.from(card.current?.querySelectorAll<HTMLElement>('.xp-row') ?? []),
    [],
  );

  const reset = useCallback(() => {
    tl.current?.cancel();
    track.current?.classList.add('xp-armed');
    rows().forEach((row) => (row.style.transitionDelay = ''));
    level.current?.classList.remove('is-flipped');
    if (bar.current) bar.current.style.width = '0%';
    bar.current?.parentElement?.classList.remove('is-full');
  }, [rows]);

  const play = useCallback(() => {
    const t = timeline();
    tl.current = t;

    // The rail draws first; the events hang off it as it passes them.
    rows().forEach((row, i) => (row.style.transitionDelay = `${420 + i * 260}ms`));

    requestAnimationFrame(() => {
      requestAnimationFrame(() => track.current?.classList.remove('xp-armed'));
    });

    t.at(1500, () => level.current?.classList.add('is-flipped'));
    t.at(1700, () => {
      if (bar.current) bar.current.style.width = XP_FULL;
    });
    t.at(2500, () => {
      const wrap = bar.current?.parentElement;
      if (!wrap) return;
      wrap.classList.remove('is-full');
      void wrap.offsetWidth; // restart the sweep
      wrap.classList.add('is-full');
    });
  }, [rows]);

  const still = useCallback(() => {
    track.current?.classList.remove('xp-armed');
    level.current?.classList.add('is-flipped');
    if (bar.current) bar.current.style.width = XP_FULL;
  }, []);

  useInViewPlay(card, { play, reset, still, threshold: 0.35 });

  return (
    <div className="lp-card lp-xphist" id="xpDemo" ref={card}>
      <div className="lp-stats-head">XP History</div>
      <div className="xp-track xp-armed" id="xpTrack" ref={track}>
        <span className="xp-line">
          <i />
        </span>
        {XP_EVENTS.map((event, i) => (
          <div className="lp-stat xp-row" key={i}>
            <span>
              <Icon name={event.icon} /> {event.label}
            </span>
            <b>{event.xp}</b>
          </div>
        ))}
      </div>
      <div className="lp-level">
        <div className="lp-level-top">
          <span>Leveling</span>
          {/* The longer face is the one in normal flow, so the box is as wide
              as the widest text it will ever show. With the short face in flow,
              "Level 10 unlocked" would overflow the card on the flip. */}
          <span className="xp-flip" id="xpLevel" ref={level}>
            <span className="xp-flip-in">
              <span className="xp-face xp-face-front">Level 12</span>
              <span className="xp-face xp-face-back">Level 13 unlocked</span>
            </span>
          </span>
        </div>
        <span className="lp-prev-bar xp-bar-wrap">
          <i id="xpBar" ref={bar as React.RefObject<HTMLElement>} style={{ width: 0 }} />
        </span>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// The tracking card — static, but its charts are drawn on by useCharts.
// --------------------------------------------------------------------------
function TrackingCard() {
  return (
    <div className="lp-card lp-track">
      <div className="lp-card-top">
        <div className="lp-stats-head">Data Tracking &amp; Visualization</div>
        <Trend value={12} suffix="%" />
      </div>
      <div className="lp-track-legend">
        <span>
          <i className="lp-lg lp-lg-a" /> XP earned
        </span>
        <span>
          <i className="lp-lg lp-lg-b" /> Tasks done
        </span>
      </div>
      <div className="lp-chart lp-chart-sm">
        <div className="lp-chart-y">
          <span>200</span>
          <span>100</span>
          <span>0</span>
        </div>
        <svg viewBox="0 0 240 90" preserveAspectRatio="none" className="lp-spark">
          <line x1="0" y1="30" x2="240" y2="30" className="lp-grid" />
          <line x1="0" y1="60" x2="240" y2="60" className="lp-grid" />
          <polyline
            points="0,72 34,58 68,64 102,40 136,50 170,24 205,34 240,14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <svg viewBox="0 0 240 40" className="lp-bars-sm">
        {[
          [6, 18, 22],
          [32, 10, 30],
          [58, 22, 18],
          [84, 6, 34],
          [110, 16, 24],
          [136, 24, 16],
          [162, 12, 28],
          [188, 20, 20],
          [214, 8, 32],
        ].map(([x, y, height]) => (
          <rect key={x} x={x} y={y} width="16" height={height} rx="2" />
        ))}
      </svg>
      <div className="lp-chips">
        <span className="lp-chip">
          This week <b>+12%</b>
        </span>
        <span className="lp-chip">
          Best day <b>Fri</b>
        </span>
        <span className="lp-chip">
          Avg <b>162 XP</b>
        </span>
      </div>
    </div>
  );
}

export function StreakLevel() {
  return (
    <div className="lp-streak-grid">
      <StreakCard />
      <XpHistory />
      <TrackingCard />
    </div>
  );
}
