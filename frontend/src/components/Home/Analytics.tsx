/**
 * Analytics — the Growth Score, the five measures under it, and the six tabs.
 *
 * The one section on this page with no home-*.js behind it: the analytics page
 * post-dates the landing page, so there was nothing to port. It is written to
 * the same rules as the demos that were — a panel that sits still until it is
 * scrolled to, plays once, and holds its finished state.
 *
 * ## Nothing here is typed in
 *
 * The temptation in a landing-page mock is to type "8.3" and "Top 2%" into the
 * markup and move on. Every figure is derived instead, and each from the thing
 * beside it, so none of them can drift apart as the sample numbers are edited:
 *
 *   * the score is `mean(FACTORS) / 10`, computed from the same five bars the
 *     panel draws. That is the rule `components/Analytics/score` is built
 *     around — a panel that prints five factors and a total the reader cannot
 *     add up is a panel nobody trusts — and it matters more here than there,
 *     because this is the version a stranger sees first.
 *   * the standing is `percentileLabel`, the real placement model, imported
 *     rather than guessed. A hardcoded "Top 2%" beside a score that no longer
 *     implies it is exactly the unmodelled figure that function replaced.
 *   * the ring's sweep is the score over the scale, the sparkline's points are
 *     `TREND` mapped into the viewBox, and the rise printed beside it is that
 *     series' own two ends subtracted. The series ends *at* the score rather
 *     than near it, so the curve and the number cannot disagree.
 *
 * `score` is imported from the module and not the folder index on purpose: the
 * index pulls the whole analytics page in behind it, and this route is its own
 * chunk. `score` imports nothing but types, so the landing bundle gains an
 * arithmetic function and no components.
 *
 * The five names and the six tabs are the real ones — `backend/tracking/analytics.py`
 * scores those five metrics, and `pages/Analytics.tsx` has those six tabs in
 * that order. A tour of features the app does not have is worse than no tour.
 *
 * ## The motion
 *
 * Four things play on one timeline, in the order the eye wants them: the ring
 * sweeps round, the score counts up inside it, the five bars grow and their
 * values count with them, and the tab rail lights left to right once the
 * numbers have settled.
 *
 * The ring and the bars are CSS transitions armed by a class, like the charts
 * and the tech grid: `styles/home-motion.css` writes the finished panel as the
 * plain rule and the empty one under `.ax-armed`. The markup ships armed, the
 * way the task and dashboard demos do, because the alternative is a panel that
 * paints itself full and then blanks when the observer first fires. The numbers
 * are `countThrough`, which rewrites a text node and cannot be a transition;
 * they are started with the shapes and given the same duration, so every figure
 * lands as its own bar does.
 *
 * The two cards themselves are not animated here. `.lp-ax` is named in the
 * reveal hook's grid list, so they slide in from the sides with every other
 * pair on the page — the section arrives the way the rest of the page arrives,
 * and only what is inside it belongs to this file.
 */
import { useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { percentileLabel } from '@/components/Analytics/score';
import {
  afterPaint,
  countThrough,
  timeline,
  useInViewPlay,
  type Counter,
  type Timeline,
} from '@/utils/homePlay';
import type { CSSProperties } from 'react';

/**
 * The five metrics the report card scores, and a plausible reading of each.
 *
 * Equally weighted, because the backend weights them equally — so the score
 * below is their flat mean and nothing here needs to know a weight.
 */
const FACTORS = [
  { name: 'Productivity', to: 92 },
  { name: 'Consistency', to: 78 },
  { name: 'Quality', to: 85 },
  { name: 'Efficiency', to: 71 },
  { name: 'Focus', to: 88 },
] as const;

/** The report card is out of a hundred; the score it becomes is out of ten. */
const SCORE_SCALE = 10;

/** The mean of the five, out of ten — the parts by construction. */
const SCORE =
  FACTORS.reduce((sum, factor) => sum + factor.to, 0) / FACTORS.length / SCORE_SCALE;

/** One decimal, the way the analytics page states it. */
const scoreText = (value: number) => value.toFixed(1);

/** Where that score places, by the same model the real badge uses. */
const STANDING = percentileLabel(SCORE);

/**
 * Six weeks of the score, ending where the score actually is.
 *
 * The last point is `SCORE` itself rather than a number that looks like it, so
 * editing a factor moves the end of the curve with the dial. The rise printed
 * beside the sparkline is this series' two ends subtracted — there is no third
 * place for a figure about the trend to be typed in and go stale.
 */
const TREND = [6.2, 6.6, 7.0, 7.5, 7.9, SCORE];
const RISE = SCORE - (TREND[0] ?? SCORE);

/** The sparkline's box, and the series mapped into it. */
const SPARK_W = 190;
const SPARK_H = 42;
const SPARK_PAD = 5;
const sparkPoints = TREND.map((value, i) => {
  const x = (i / (TREND.length - 1)) * SPARK_W;
  const span = SPARK_H - SPARK_PAD * 2;
  const y = SPARK_H - SPARK_PAD - (value / SCORE_SCALE) * span;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}).join(' ');

/**
 * The dial. Radius and circumference together so the dash cannot drift.
 *
 * Both are rounded once, here, because each is written twice — into the SVG
 * attribute and into the custom property the stylesheet animates between. Round
 * them at the point of use instead and the two spellings of the same number
 * differ in the last decimal, which is a difference that means nothing and
 * would have to be explained forever.
 */
const round2 = (value: number) => Math.round(value * 100) / 100;
const RING_R = 54;
const RING_LEN = round2(2 * Math.PI * RING_R);
/** How much of the ring is left unpainted at the finished score. */
const RING_END = round2(RING_LEN * (1 - SCORE / SCORE_SCALE));

/**
 * The seven tabs, in the order the analytics page's bar puts them, each with
 * the route that opens it.
 *
 * **They are links now.** They were bare `<li>`s — no href, no handler, not
 * reachable by keyboard — while `.lp-ax-tab:hover` lifted them two pixels and
 * pulled an accent border on. So they read as the one control on the section
 * that could be operated, and were the one thing on the page that did nothing
 * when clicked. Every other feature on this page hands the reader to the page
 * it is describing; these are the same promise and now keep it.
 *
 * **This list has drifted twice.** The third tab said Trends after it was
 * renamed to Goals, and the seventh said Records after that slot became Growth
 * (see VIEWS in components/Analytics/Header). The first time, this copy of the
 * list did not hear about it — so the landing page was advertising
 * a tab by a name the app had stopped using, which is exactly the "tour of
 * features the app does not have" the note at the top of this file warns
 * against. The list is still written out here rather than imported from VIEWS,
 * for the reason `score` is imported from its module and not the folder index:
 * Header pulls components/Analytics/data and its half of utils behind it, and
 * this is the landing chunk. Analytics.test.tsx imports VIEWS instead and
 * asserts the two agree — a test is not bundled, so the drift is caught for
 * free and cannot happen again quietly.
 */
const TABS = [
  { label: 'Recommendations', to: '/recommendations' },
  { label: 'Overview', to: '/analytics' },
  { label: 'Goals', to: '/analytics/goals' },
  { label: 'Insights', to: '/insights' },
  { label: 'Subjects', to: '/subjects' },
  { label: 'Growth', to: '/analytics/growth' },
] as const;

/** Long enough to read as counting rather than snapping; the shapes' own time. */
const RUN_MS = 1500;
/** Each bar waits on the one above it. */
const BAR_STAGGER_MS = 90;
/** The rail starts lighting once the numbers are essentially done. */
const TABS_AT_MS = 1000;
const TAB_STAGGER_MS = 60;

export function Analytics() {
  const root = useRef<HTMLDivElement>(null);
  const num = useRef<HTMLElement>(null);
  /** The five bar values, in order, so each can count with its own bar. */
  const values = useRef<(HTMLElement | null)[]>([]);

  const tl = useRef<Timeline | null>(null);
  const counters = useRef<Counter[]>([]);
  const armed = useRef<(() => void) | null>(null);

  const stopCounters = useCallback(() => {
    counters.current.forEach((counter) => counter.cancel());
    counters.current = [];
  }, []);

  /** Back to the opening frame: ring closed, bars at nothing, rail dark. */
  const reset = useCallback(() => {
    tl.current?.cancel();
    stopCounters();
    armed.current?.();
    armed.current = null;
    root.current?.classList.add('ax-armed');
    root.current?.classList.remove('ax-lit');
    if (num.current) num.current.textContent = scoreText(0);
    values.current.forEach((el) => {
      if (el) el.textContent = '0';
    });
  }, [stopCounters]);

  const play = useCallback(() => {
    const host = root.current;
    if (!host) return;

    const t = timeline();
    tl.current = t;

    // Armed, painted, then unarmed — the ring and the bars need somewhere to
    // travel from.
    armed.current = afterPaint(() => host.classList.remove('ax-armed'));

    counters.current = [
      countThrough(num.current, [0, SCORE], { duration: RUN_MS, format: scoreText }),
      ...FACTORS.map((factor, i) =>
        countThrough(values.current[i] ?? null, [0, factor.to], {
          duration: RUN_MS - i * BAR_STAGGER_MS,
          format: (value) => String(Math.round(value)),
        }),
      ),
    ];

    t.at(TABS_AT_MS, () => host.classList.add('ax-lit'));
  }, []);

  /** For `prefers-reduced-motion`: the finished panel, at once. */
  const still = useCallback(() => {
    const host = root.current;
    if (!host) return;
    host.classList.remove('ax-armed');
    host.classList.add('ax-lit');
    if (num.current) num.current.textContent = scoreText(SCORE);
    values.current.forEach((el, i) => {
      const factor = FACTORS[i];
      if (el && factor) el.textContent = String(factor.to);
    });
  }, []);

  useInViewPlay(root, { play, reset, still, threshold: 0.35 });

  return (
    <div className="lp-ax-wrap ax-armed" ref={root}>
      <div className="lp-ax">
        <div className="lp-card lp-ax-score">
          <div className="lp-card-top">
            <span className="lp-metric-label">Growth Score</span>
            {STANDING ? <span className="lp-pill-mini lp-ax-rank">{STANDING}</span> : null}
          </div>

          <div className="lp-ax-dial">
            <svg viewBox="0 0 132 132" className="lp-ax-ring" aria-hidden="true">
              <defs>
                <linearGradient id="lpAxRing" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="var(--lp-accent)" />
                  <stop offset="1" stopColor="var(--lp-accent-2)" />
                </linearGradient>
              </defs>
              <circle className="lp-ax-ring-bed" cx="66" cy="66" r={RING_R} />
              {/* Both ends of the sweep are handed to CSS as custom properties
                  rather than written there: the closed ring is the full
                  circumference and the finished one is where the score stops,
                  and both follow from RING_R and SCORE. A number typed into the
                  stylesheet would be a third place for the dial to disagree
                  with itself. */}
              <circle
                className="lp-ax-ring-arc"
                cx="66"
                cy="66"
                r={RING_R}
                strokeDasharray={RING_LEN}
                strokeDashoffset={RING_END}
                transform="rotate(-90 66 66)"
                style={
                  {
                    '--ax-ring-len': RING_LEN,
                    '--ax-ring-end': RING_END,
                  } as CSSProperties
                }
              />
            </svg>

            <div className="lp-ax-dial-mid">
              <strong className="lp-ax-num">
                <em ref={num as React.RefObject<HTMLElement>}>{scoreText(SCORE)}</em>
                <small>/{SCORE_SCALE}</small>
              </strong>
            </div>
          </div>

          <p className="lp-ax-note">
            The mean of the five measures beside it — add them up yourself.
          </p>

          <div className="lp-ax-trend">
            <svg
              viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
              className="lp-ax-spark"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polyline points={sparkPoints} />
            </svg>
            <span className="lp-ax-rise">
              <i aria-hidden="true">▲</i> {RISE > 0 ? '+' : ''}
              {scoreText(RISE)} in six weeks
            </span>
          </div>
        </div>

        <div className="lp-card lp-ax-factors">
          <div className="lp-card-top">
            <span className="lp-metric-label">What it is made of</span>
            <span className="lp-pill-mini">A fifth each</span>
          </div>

          <ul className="lp-ax-list">
            {FACTORS.map((factor, i) => (
              <li className="lp-ax-row" key={factor.name}>
                <span className="lp-ax-name">{factor.name}</span>
                <span className="lp-ax-track">
                  <i
                    style={
                      {
                        '--ax-to': `${factor.to}%`,
                        transitionDelay: `${i * BAR_STAGGER_MS}ms`,
                        animationDelay: `${i * BAR_STAGGER_MS}ms`,
                      } as CSSProperties
                    }
                  />
                </span>
                <b className="lp-ax-val">
                  <em
                    ref={(el) => {
                      values.current[i] = el;
                    }}
                  >
                    {factor.to}
                  </em>
                </b>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* The seven tabs, as the analytics page's own bar orders them. The pill
          is the link rather than the <li>, so the whole of what looks clickable
          is the click target and the tab strip is one tab stop per tab. */}
      <ul className="lp-ax-tabs">
        {TABS.map((tab, i) => (
          <li key={tab.label}>
            <Link
              to={tab.to}
              className={`lp-ax-tab${i === 0 ? ' is-lead' : ''}`}
              style={{ transitionDelay: `${i * TAB_STAGGER_MS}ms` } as CSSProperties}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
