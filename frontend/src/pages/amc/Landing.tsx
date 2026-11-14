/**
 * The landing page: one long scroll for a signed-out visitor. It carries its
 * own header rather than the rail and the top bar (App.tsx, `isLanding`).
 *
 * Top to bottom: a hero with a mountain range that parallaxes and a sample
 * problem you can answer on the spot, a moving strip of the topics, the
 * numbers (counted up as they arrive), "the climb" (the four steps, with a
 * trail that fills as you scroll), small live demos of the features, the
 * mock contests, and a closing call to the summit.
 *
 * Motion comes from one IntersectionObserver (things fade and rise in as they
 * reach the screen) and one scroll listener (the parallax, the progress bar,
 * the trail). With prefers-reduced-motion everything is simply shown.
 * styles/landing.css has the looks.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { MathText } from '@/components/Amc/MathText';
import { AnswerInput } from '@/components/Amc/bits';
import { useAuth, useDocumentTitle } from '@/hooks';
import '@/styles/amc.css';
import '@/styles/landing.css';

const SAMPLE = {
  statement: String.raw`How many ordered pairs of positive integers $(x, y)$ satisfy $\dfrac{1}{x} + \dfrac{1}{y} = \dfrac{1}{6}$?`,
  choices: ['$6$', '$8$', '$9$', '$10$', '$12$'],
  answer: 'C',
  insight: String.raw`Clear denominators to get $(x-6)(y-6) = 36$. $36$ has $9$ divisors, one ordered pair each.`,
};

const TOPICS = [
  'Modular Arithmetic', 'Probability', 'Similar Triangles', 'Stars and Bars', 'Logarithms', 'Complex Numbers',
  'Mass Points', 'Expected Value', 'Pigeonhole', 'Cyclic Quadrilaterals', 'Diophantine Equations', 'Recursion',
  'Lattice Paths', 'Trigonometry', 'Vieta’s Formulas', 'Floor & Ceiling', 'Conics', 'Invariants',
  'Digits & Bases', 'Binomial Theorem', 'Geometric Probability', 'Polynomials', '3D Geometry', 'Parity',
  'Casework', 'Inequalities', 'Triangle Centers', 'GCD & LCM', 'Sequences & Series', 'Games & Strategy',
];

const FLOATERS = [
  { tex: String.raw`$\binom{n}{k}$`, x: 6, y: 18, d: 0 },
  { tex: String.raw`$a^2+b^2=c^2$`, x: 78, y: 12, d: 1.2 },
  { tex: String.raw`$x \equiv 3 \pmod 7$`, x: 62, y: 70, d: 2.1 },
  { tex: String.raw`$\sum_{k=1}^{n} k$`, x: 14, y: 72, d: 0.6 },
  { tex: String.raw`$e^{i\pi}+1=0$`, x: 88, y: 46, d: 1.7 },
  { tex: String.raw`$\log_2 1024$`, x: 40, y: 8, d: 2.6 },
];

const STEPS = [
  {
    n: '01', title: 'Practice',
    body: 'Hundreds of problems, each rated 1–10 on the AoPS scale and tagged by topic and technique. Pick by problem number, year, topic or method.',
  },
  {
    n: '02', title: 'Review',
    body: 'Every miss comes back after 3, 10 and 21 days, so a mistake you made once is one you stop making.',
  },
  {
    n: '03', title: 'Sit a mock',
    body: 'Full contests in real problem order, on the real clock, with a cover page and a bubble sheet. Scored like the MAA scores them.',
  },
  {
    n: '04', title: 'Read the numbers',
    body: 'Your level on the 1–10 scale, a predicted score with a range, your chance of the AIME cutoff, and exactly which topics are worth the most points.',
  },
];

const MOCKS = [
  { name: 'AMC 10', problems: 25, time: '75 min', sets: 5, note: 'Algebra, counting, number theory and geometry, ramping from 1 to 4 on the scale.', tone: 'sage' },
  { name: 'AMC 12', problems: 25, time: '75 min', sets: 5, note: 'Shares eight problems with its AMC 10, then adds logs, trig and complex numbers.', tone: 'clay' },
  { name: 'AIME', problems: 15, time: '3 hours', sets: 5, note: 'Integer answers 000–999. Fifteen problems from 2.5 up to 6.5.', tone: 'slate' },
];

const COACH = [
  'You solve about half the problems rated 2.5.',
  'Counting is costing you the most points.',
  'This week: 20 casework problems, 30 min a day.',
];

// ---------------------------------------------------------------------------
// Motion helpers
// ---------------------------------------------------------------------------
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** True once the element has come on screen (and stays true). */
function useInView<T extends Element>(margin = '0px 0px -12% 0px') {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined' || reduced()) { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, margin]);
  return [ref, seen] as const;
}

function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }: {
  children: ReactNode; delay?: number; className?: string; as?: 'div' | 'section' | 'li' | 'p';
}) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <Tag ref={ref as never} className={`lp-reveal${seen ? ' is-in' : ''} ${className}`}
         style={{ '--d': `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reduced()) { setValue(to); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1400);
      setValue(Math.round(to * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [seen, to]);
  return <span ref={ref}>{value}{suffix}</span>;
}

/** Types its lines out once on screen. */
function Typed({ lines }: { lines: string[] }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const total = lines.join('').length;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reduced()) { setShown(total); return; }
    const id = window.setInterval(() => setShown((n) => (n >= total ? n : n + 1)), 28);
    return () => window.clearInterval(id);
  }, [seen, total]);
  let left = shown;
  return (
    <div ref={ref} className="lp-typed" aria-label={lines.join(' ')}>
      {lines.map((line, i) => {
        const part = line.slice(0, Math.max(0, left));
        const typing = left > 0 && left < line.length;
        left -= line.length;
        return (
          <p key={i} aria-hidden="true" className={part ? '' : 'is-empty'}>
            {part}{typing && <i className="lp-caret" />}
          </p>
        );
      })}
    </div>
  );
}

/** Scroll position into CSS variables: --lp-y for the parallax and the bar, --climb for the trail. */
function useScrollVars(root: RefObject<HTMLDivElement | null>, climb: RefObject<HTMLElement | null>) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = root.current;
      if (!el) return;
      const y = window.scrollY;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      el.style.setProperty('--lp-y', String(Math.min(y, 1400)));
      el.style.setProperty('--lp-progress', String(Math.min(1, y / max)));
      const c = climb.current;
      if (c) {
        const r = c.getBoundingClientRect();
        const p = (window.innerHeight * 0.55 - r.top) / Math.max(1, r.height - window.innerHeight * 0.2);
        c.style.setProperty('--climb', String(Math.max(0, Math.min(1, p))));
      }
      setScrolled(y > 24);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [root, climb]);
  return scrolled;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function Ridge() {
  return (
    <svg className="lp-ridge" viewBox="0 0 1440 420" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="lp-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#C9D3C6" /><stop offset="1" stopColor="#E6E9E0" />
        </linearGradient>
        <linearGradient id="lp-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9DB09E" /><stop offset="1" stopColor="#C7D0C2" />
        </linearGradient>
        <linearGradient id="lp-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6F8A73" /><stop offset="1" stopColor="#8EA290" />
        </linearGradient>
      </defs>
      <g className="lp-layer lp-layer-far">
        <path d="M0 300 L120 220 L210 260 L330 150 L450 240 L560 190 L700 90 L820 200 L930 160 L1060 230 L1180 140 L1300 210 L1440 170 L1440 420 L0 420 Z" fill="url(#lp-far)" />
      </g>
      <g className="lp-layer lp-layer-mid">
        <path d="M0 340 L150 270 L260 310 L400 220 L520 300 L640 250 L760 300 L900 230 L1020 290 L1160 240 L1300 300 L1440 260 L1440 420 L0 420 Z" fill="url(#lp-mid)" />
        <path className="lp-trail" d="M120 360 C 260 330, 330 300, 420 280 S 600 250, 640 210 S 690 130, 700 92" fill="none" />
        <g className="lp-flag" transform="translate(700 92)">
          <line x1="0" y1="0" x2="0" y2="-34" stroke="#2A2C2A" strokeWidth="2" />
          <path d="M0 -34 L22 -27 L0 -20 Z" fill="#C0784A" />
        </g>
      </g>
      <g className="lp-layer lp-layer-near">
        <path d="M0 380 L180 330 L320 370 L470 320 L620 372 L780 330 L940 376 L1100 326 L1260 368 L1440 334 L1440 420 L0 420 Z" fill="url(#lp-near)" />
      </g>
    </svg>
  );
}

function Headline({ text }: { text: string }) {
  return (
    <h1 className="lp-h1" aria-label={text}>
      {text.split(' ').map((w, i) => (
        <span key={i} className="lp-word" aria-hidden="true" style={{ '--i': i } as CSSProperties}>{w}&nbsp;</span>
      ))}
    </h1>
  );
}

function SampleProblem() {
  const [pick, setPick] = useState('');
  const [checked, setChecked] = useState(false);
  return (
    <div className="lp-sample amc-page">
      <div className="lp-sample-head">
        <span className="lp-pill">Try one</span>
        <span className="lp-sample-meta">Step Mock AMC 10 · #18</span>
      </div>
      <MathText text={SAMPLE.statement} as="p" className="am-statement" />
      <AnswerInput
        choices={SAMPLE.choices}
        value={pick}
        onChange={(v) => { setPick(v); setChecked(false); }}
        locked={checked}
        correct={checked ? SAMPLE.answer : undefined}
        given={checked ? pick : undefined}
      />
      <div className="am-answer-bar">
        <span className="am-muted" style={{ fontSize: 13 }}>Rated 2/10 · Factors &amp; Divisors</span>
        {checked ? (
          <button type="button" className="am-btn" onClick={() => { setPick(''); setChecked(false); }}>Reset</button>
        ) : (
          <button type="button" className="am-btn am-btn-primary" disabled={!pick} onClick={() => setChecked(true)}>Check</button>
        )}
      </div>
      {checked && (
        <div className="am-callout am-callout-insight" style={{ marginTop: 16 }}>
          <span>{pick === SAMPLE.answer ? 'Correct' : 'Not quite'}</span>
          <MathText text={SAMPLE.insight} as="p" />
        </div>
      )}
    </div>
  );
}

function Marquee({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  const row = [...items, ...items];
  return (
    <div className={`lp-marquee${reverse ? ' is-reverse' : ''}`} aria-hidden="true">
      <div className="lp-marquee-track">
        {row.map((t, i) => <span key={i} className="lp-tag">{t}</span>)}
      </div>
    </div>
  );
}

/** The 1-10 scale, filling as it arrives, with where each contest sits on it. */
function ScaleDemo() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const marks = [
    { at: 1, label: 'AMC 10 #1' }, { at: 2.5, label: 'AMC 10 #15' }, { at: 4, label: 'AMC 12 #23' },
    { at: 6.5, label: 'AIME #15' },
  ];
  return (
    <div ref={ref} className={`lp-scale${seen ? ' is-in' : ''}`}>
      <div className="lp-scale-bar"><i /></div>
      <div className="lp-scale-ticks">{Array.from({ length: 10 }, (_, i) => <span key={i}>{i + 1}</span>)}</div>
      <div className="lp-scale-marks">
        {marks.map((m, i) => (
          <span key={m.label} style={{ left: `${((m.at - 1) / 9) * 100}%`, '--d': `${400 + i * 220}ms` } as CSSProperties}>
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ScoreDemo() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={`lp-score${seen ? ' is-in' : ''}`}>
      <div className="lp-score-top">
        <span>AMC 10</span><span className="lp-pill">Example</span>
      </div>
      <strong><CountUp to={108} /><small> / 150</small></strong>
      <span className="lp-muted">Likely 93–123</span>
      <div className="lp-meter"><i style={{ width: seen ? '64%' : 0 }} /></div>
      <span className="lp-muted"><b>64%</b> chance of 100+</span>
    </div>
  );
}

function ReviewDemo() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const days = [{ d: 'Miss', at: 0 }, { d: 'Day 3', at: 3 }, { d: 'Day 10', at: 10 }, { d: 'Day 21', at: 21 }];
  return (
    <div ref={ref} className={`lp-review${seen ? ' is-in' : ''}`}>
      <div className="lp-review-line"><i /></div>
      {days.map((x, i) => (
        <span key={x.d} className="lp-review-dot" style={{ left: `${(x.at / 21) * 100}%`, '--d': `${i * 380}ms` } as CSSProperties}>
          <b />{x.d}
        </span>
      ))}
    </div>
  );
}

function BubbleDemo() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const answers = 'BDAECCBEADBCEDABCADEBDCAB';
  return (
    <div ref={ref} className={`lp-bubbles${seen ? ' is-in' : ''}`} aria-hidden="true">
      {answers.split('').map((a, row) => (
        <div key={row} className="lp-bubble-row">
          <span>{row + 1}</span>
          {'ABCDE'.split('').map((l) => (
            <i key={l} className={l === a ? 'is-on' : ''} style={{ '--d': `${row * 70}ms` } as CSSProperties}>{l}</i>
          ))}
        </div>
      ))}
    </div>
  );
}

function ChooserDemo() {
  const groups = [
    ['Source', ['Real', 'Mock', 'AI practice']],
    ['Topic', ['Probability', 'Circles', 'Modular Arithmetic']],
    ['Number', ['#1–5', '#11–15', '#21–25']],
  ] as const;
  return (
    <div className="lp-chooser" aria-hidden="true">
      {groups.map(([name, chips], g) => (
        <div key={name}>
          <span className="lp-muted">{name}</span>
          <div className="lp-chips">
            {chips.map((c, i) => <span key={c} className="lp-chip" style={{ '--d': `${(g * 3 + i) * 0.9}s` } as CSSProperties}>{c}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
export default function Landing() {
  useDocumentTitle('AMC 10, AMC 12 & AIME prep');
  const [params] = useSearchParams();
  const { status } = useAuth();
  const signedIn = status === 'signed-in';
  const root = useRef<HTMLDivElement>(null);
  const climb = useRef<HTMLElement>(null);
  const scrolled = useScrollVars(root, climb);

  // Old account links (verification e-mails, the server's redirects) arrive
  // with ?auth= and belong on the sign-in page.
  if (params.has('auth') || params.has('verify') || params.has('oauth')) {
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }

  const start = signedIn ? '/dashboard' : '/login?auth=create';
  const startLabel = signedIn ? 'Go to your dashboard' : 'Start free';

  return (
    <div className="lp" ref={root}>
      <div className="lp-progress" aria-hidden="true" />
      <header className={`lp-nav${scrolled ? ' is-scrolled' : ''}`}>
        <Link className="lp-brand" to="/home">
          <img src="/static/images/logo.svg" alt="" width={28} height={28} />
          SUMMIT
        </Link>
        <nav className="lp-links" aria-label="Site">
          <a href="#climb">How it works</a>
          <a href="#features">Features</a>
          <a href="#mocks">Mocks</a>
          <Link to="/about-us">About</Link>
          {signedIn ? (
            <Link className="lp-btn lp-btn-dark lp-btn-sm" to="/dashboard">Dashboard</Link>
          ) : (
            <>
              <Link to="/login?auth=login">Log in</Link>
              <Link className="lp-btn lp-btn-dark lp-btn-sm" to="/login?auth=create">Start free</Link>
            </>
          )}
        </nav>
      </header>

      <main>
        {/* Hero ------------------------------------------------------------ */}
        <section className="lp-hero">
          <div className="lp-sky" aria-hidden="true">
            <span className="lp-sun" />
            {FLOATERS.map((f) => (
              <span key={f.tex} className="lp-floater" style={{ left: `${f.x}%`, top: `${f.y}%`, '--d': `${f.d}s` } as CSSProperties}>
                <MathText text={f.tex} />
              </span>
            ))}
          </div>
          <Ridge />
          <div className="lp-hero-inner">
            <div className="lp-hero-copy">
              <p className="lp-kicker lp-rise" style={{ '--d': '0ms' } as CSSProperties}>AMC 10 · AMC 12 · AIME</p>
              <Headline text="Train for the AMC. Qualify for the AIME." />
              <p className="lp-lead lp-rise" style={{ '--d': '700ms' } as CSSProperties}>
                Rated problems with full solutions, real-order mock contests, a review log for every miss, and a model
                of your level that tells you where your next points are.
              </p>
              <div className="lp-cta lp-rise" style={{ '--d': '850ms' } as CSSProperties}>
                <Link className="lp-btn lp-btn-dark" to={start}>{startLabel}<span aria-hidden="true">→</span></Link>
                <a className="lp-btn lp-btn-light" href="#climb">See how it works</a>
              </div>
            </div>
            <div className="lp-hero-card lp-rise" style={{ '--d': '500ms' } as CSSProperties}>
              <SampleProblem />
            </div>
          </div>
          <a className="lp-scroll-cue" href="#topics" aria-label="Scroll down"><span /></a>
        </section>

        {/* Topics strip ---------------------------------------------------- */}
        <section id="topics" className="lp-strip" aria-label="Topics">
          <Marquee items={TOPICS.slice(0, 15)} />
          <Marquee items={TOPICS.slice(15)} reverse />
        </section>

        {/* Numbers --------------------------------------------------------- */}
        <section className="lp-numbers lp-wrap">
          {[
            { n: 350, s: '', label: 'problems with full solutions' },
            { n: 18, s: '', label: 'mock contests in real order' },
            { n: 63, s: '', label: 'topics' },
            { n: 92, s: '', label: 'named techniques' },
            { n: 162, s: '', label: 'official papers, 2000 to now' },
          ].map((x, i) => (
            <Reveal key={x.label} delay={i * 90} className="lp-number">
              <strong><CountUp to={x.n} suffix={x.s} /></strong>
              <span>{x.label}</span>
            </Reveal>
          ))}
        </section>

        {/* The climb ------------------------------------------------------- */}
        <section id="climb" className="lp-climb lp-wrap" ref={climb}>
          <div className="lp-climb-side">
            <Reveal>
              <p className="lp-kicker">How it works</p>
              <h2 className="lp-h2">Four steps,<br />repeated until<br />the cutoff is easy.</h2>
              <p className="lp-muted lp-climb-note">Each step feeds the next: your misses become reviews, your mocks become numbers, and the numbers pick what you practice.</p>
            </Reveal>
          </div>
          <div className="lp-steps-wrap">
          <div className="lp-steps-line" aria-hidden="true"><i /></div>
          <ol className="lp-steps">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.n} delay={i * 60} className="lp-step">
                <span className="lp-step-n">{s.n}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
          </div>
        </section>

        {/* Features -------------------------------------------------------- */}
        <section id="features" className="lp-features lp-wrap">
          <Reveal className="lp-section-head">
            <p className="lp-kicker">Inside</p>
            <h2 className="lp-h2">Built like the real contest.<br />Measured like a coach would.</h2>
          </Reveal>
          <div className="lp-bento">
            <Reveal className="lp-tile lp-tile-wide" delay={0}>
              <h3>Every problem on one scale</h3>
              <p>Ratings from 1 to 10, set by problem number the way AoPS rates the real papers.</p>
              <ScaleDemo />
            </Reveal>
            <Reveal className="lp-tile" delay={100}>
              <h3>A predicted score</h3>
              <p>From your first tries, weighted by how hard each problem was.</p>
              <ScoreDemo />
            </Reveal>
            <Reveal className="lp-tile" delay={0}>
              <h3>Misses come back</h3>
              <p>Spaced review at 3, 10 and 21 days.</p>
              <ReviewDemo />
            </Reveal>
            <Reveal className="lp-tile" delay={100}>
              <h3>A real answer sheet</h3>
              <p>Cover page, clock and bubbles. Scored 6 / 1.5 / 0.</p>
              <BubbleDemo />
            </Reveal>
            <Reveal className="lp-tile" delay={200}>
              <h3>Find exactly the problem</h3>
              <p>Filter by topic, technique, number, year, real or mock.</p>
              <ChooserDemo />
            </Reveal>
            <Reveal className="lp-tile lp-tile-full lp-tile-dark" delay={0}>
              <div>
                <span className="lp-pill lp-pill-dark">Hints · explanations · new problems</span>
                <h3>An AI coach that reads your numbers</h3>
                <p>Three hints that never give the answer, an explanation of the mistake behind a wrong answer, and new
                  problems written for your weakest topic. Each new problem is solved a second time from scratch and kept
                  only if the two answers agree.</p>
              </div>
              <Typed lines={COACH} />
            </Reveal>
          </div>
        </section>

        {/* Mocks ----------------------------------------------------------- */}
        <section id="mocks" className="lp-mocks lp-wrap">
          <Reveal className="lp-section-head">
            <p className="lp-kicker">Mock contests</p>
            <h2 className="lp-h2">Fifteen original papers.<br />Real order, real difficulty.</h2>
          </Reveal>
          <div className="lp-mock-grid">
            {MOCKS.map((m, i) => (
              <Reveal key={m.name} delay={i * 120} className={`lp-mock lp-mock-${m.tone}`}>
                <span className="lp-mock-name">{m.name}</span>
                <strong>{m.sets} sets</strong>
                <div className="lp-mock-facts">
                  <span><b>{m.problems}</b> problems</span>
                  <span><b>{m.time}</b></span>
                </div>
                <p>{m.note}</p>
                <svg className="lp-mock-peak" viewBox="0 0 200 60" aria-hidden="true" preserveAspectRatio="none">
                  <path d="M0 60 L40 34 L70 46 L110 10 L150 40 L200 22 L200 60 Z" />
                </svg>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Statement ------------------------------------------------------- */}
        <section className="lp-quote lp-wrap">
          <Reveal as="p" className="lp-quote-text">
            Know where every point goes.
          </Reveal>
          <Reveal as="p" delay={150} className="lp-quote-sub">
            Then go get the ones you’re missing.
          </Reveal>
        </section>

        {/* Closing --------------------------------------------------------- */}
        <section className="lp-final">
          <div className="lp-stars" aria-hidden="true">
            {Array.from({ length: 36 }, (_, i) => (
              <i key={i} style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 70}%`, '--d': `${(i % 7) * 0.5}s` } as CSSProperties} />
            ))}
          </div>
          <Reveal className="lp-final-inner">
            <h2 className="lp-h2">The summit is closer<br />than it looks.</h2>
            <p>Free to start. Your first problem is above; your first mock is a click away.</p>
            <Link className="lp-btn lp-btn-light lp-btn-lg" to={start}>{startLabel}<span aria-hidden="true">→</span></Link>
          </Reveal>
          <svg className="lp-final-ridge" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 200 L0 140 L160 90 L300 130 L460 60 L600 120 L720 30 L860 110 L1000 70 L1160 130 L1300 80 L1440 120 L1440 200 Z" />
          </svg>
        </section>
      </main>

      <footer className="lp-foot lp-wrap">
        <span>Summit’s mock and step problems are original. AMC and AIME problems are © MAA. Not affiliated with the MAA.</span>
        <span><Link to="/privacy-policy">Privacy</Link> · <Link to="/terms-of-service">Terms</Link></span>
      </footer>
    </div>
  );
}
