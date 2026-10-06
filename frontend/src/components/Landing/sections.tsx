/**
 * The landing page, section by section, in the order it is read.
 *
 * Each section is a picture of one part of the app beside a sentence about it
 * and a link into it. Links into the app work for a stranger too: a gated page
 * sends them to sign in and back (RequireAccount in App.tsx), so "View
 * Analytics" is an honest offer either way.
 *
 * `data-reveal` marks what fades up as it scrolls in, and `--i` staggers a row
 * of them — see ./useLandingMotion and styles/landing.css.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Gauge,
  Goal,
  NotebookPen,
  Sparkles,
} from 'lucide-react';
import { AreaChart, DayBars, PairedBars, Ring } from './charts';
import { MiniApp } from './MiniApp';
import { STUDENT, duration, hadWork, partOfDay, recentXp } from './data';

const stagger = (at: number) => ({ '--i': at }) as CSSProperties;

function Arrow() {
  return (
    <span className="ld-arrow" aria-hidden="true">
      →
    </span>
  );
}

/** A section's words: the kicker, the heading, a line, and a way in. */
function Copy({
  kicker,
  title,
  children,
  action,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div data-reveal>
      <span className="ld-kicker">{kicker}</span>
      <h2 className="ld-h2">{title}</h2>
      <p className="ld-lede">{children}</p>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
export function Hero({ signedIn, name }: { signedIn: boolean; name: string | null }) {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return (
    <section className="ld-hero" id="top">
      <div className="ld-wrap ld-hero-grid">
        <div>
          <span className="ld-pill ld-rise" style={{ '--d': 0 } as CSSProperties}>
            {signedIn ? (
              `${partOfDay()}${name ? `, ${name}` : ''}`
            ) : (
              <>
                <Sparkles size={13} aria-hidden="true" /> Free to start · No card
              </>
            )}
          </span>
          <span className="ld-date ld-rise" style={{ '--d': 1 } as CSSProperties}>
            {date}
          </span>
          <h1 className="ld-title ld-rise" style={{ '--d': 2 } as CSSProperties}>
            Finish the work. <em>Summit keeps the score.</em>
          </h1>
          <p className="ld-tagline ld-rise" style={{ '--d': 3 } as CSSProperties}>
            A study tracker that does the arithmetic.
          </p>
          <p className="ld-hero-copy ld-rise" style={{ '--d': 4 } as CSSProperties}>
            Tasks, a calendar and a focus timer on one side. Streaks, XP and a growth score on
            the other — out of the same finished work, so there is nothing to log twice and every
            figure shows the sum it came from.
          </p>
          <div className="ld-actions ld-rise" style={{ '--d': 5 } as CSSProperties}>
            {signedIn ? (
              <>
                <Link to="/dashboard" className="ld-btn is-primary">
                  Go to Dashboard <Arrow />
                </Link>
                <Link to="/calendar" className="ld-btn">
                  <CalendarDays aria-hidden="true" /> Open Calendar
                </Link>
              </>
            ) : (
              <>
                <Link to="/login?auth=create" className="ld-btn is-primary">
                  Create a free account <Arrow />
                </Link>
                <a href="#see-it" className="ld-btn">
                  See it working{' '}
                  <span className="ld-arrow is-down" aria-hidden="true">
                    ↓
                  </span>
                </a>
              </>
            )}
          </div>
        </div>

        <div className="ld-hero-art" aria-hidden="true">
          <div className="ld-card lp-preview ld-preview ld-preview-dash ld-rise" style={{ '--d': 3 } as CSSProperties}>
            <div className="ld-prev-head">
              <p className="ld-card-title">Daily XP</p>
              <span className="ld-live" />
            </div>
            <p className="ld-card-sub">A term, six weeks against six</p>
            <div className="ld-legend">
              {STUDENT.term.map((one) => (
                <span key={one.name}>
                  <i style={{ background: one.colour }} />
                  {one.name}
                </span>
              ))}
            </div>
            <AreaChart
              series={STUDENT.term}
              max={200}
              label="Daily XP over a term: a first half around 60 a day, a second half around 145."
            />
            <div className="ld-level">
              <span>Level {STUDENT.level}</span>
              <span className="ld-meter">
                <i style={{ width: `${STUDENT.levelShare}%` }} />
              </span>
            </div>
          </div>

          {/* `lp-preview-rating` and `lp-radar` are read by
              frontend/secret/pentagon-egg.js. */}
          <div className="ld-card lp-preview lp-preview-rating ld-preview ld-preview-rating">
            <p className="ld-card-title">Growth Rating</p>
            <svg viewBox="0 0 120 120" className="lp-radar ld-radar">
              <polygon
                points="60,12 108,46 90,104 30,104 12,46"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.35"
                strokeWidth="1.5"
              />
              <polygon
                points="60,36 84,52 78,86 42,86 36,52"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.2"
              />
              <polygon className="ld-radar-fill" points="60,30 92,54 80,94 40,94 30,54" />
            </svg>
            <div className="ld-overall">
              Overall <strong>{STUDENT.growth}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Live demo
// ---------------------------------------------------------------------------
export function Demo({ name }: { name: string | null }) {
  return (
    <section className="ld-section" id="see-it">
      <div className="ld-wrap ld-split">
        <Copy kicker="Live demo" title="This is the app, not a screenshot">
          Tick something off and watch the numbers move. It is the same dashboard the signed-in
          page shows, running here in front of you.
        </Copy>
        <div data-reveal style={stagger(1)}>
          <MiniApp name={name} />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------
const FEATURES = [
  { tone: 'ld-tone-blue', icon: CalendarDays, title: 'Tasks & Calendar', body: 'Plan your day, stay focused, finish what matters.' },
  { tone: 'ld-tone-teal', icon: Goal, title: 'Goals & Milestones', body: 'Turn big goals into small steps, with AI support.' },
  { tone: 'ld-tone-violet', icon: BarChart3, title: 'Analytics & Growth', body: 'See your progress with real data, not guesswork.' },
  { tone: 'ld-tone-green', icon: NotebookPen, title: 'Notes & Records', body: 'Keep your thoughts, study logs and achievements in one place.' },
];

export function Features() {
  return (
    <section className="ld-section" id="features">
      <div className="ld-wrap">
        <div data-reveal>
          <span className="ld-kicker">Features</span>
          <h2 className="ld-h2">Everything you need to grow</h2>
        </div>
        <div className="ld-features">
          {FEATURES.map(({ tone, icon: Glyph, title, body }, at) => (
            <article key={title} className="ld-feature" data-reveal style={stagger(at)}>
              <span className={`ld-feature-ico ${tone}`}>
                <Glyph aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The quote
// ---------------------------------------------------------------------------
export function Quote() {
  return (
    <section className="ld-band ld-quote-band">
      <div className="ld-wrap ld-quote-grid" data-reveal>
        <span className="ld-quote-mark" aria-hidden="true">
          &ldquo;
        </span>
        {/* `lp-quote` is the door frontend/secret/quote-egg.js listens on. */}
        <blockquote className="lp-quote ld-quote">
          <p>
            &ldquo;The difference between where you are and where you want to be is the work you
            do, and how you track it.&rdquo;
          </p>
          <cite>— Summit</cite>
        </blockquote>
        <ul className="ld-mottos">
          <li>Better habits.</li>
          <li>Higher standards.</li>
          <li>Real progress.</li>
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// At a glance
// ---------------------------------------------------------------------------
const GLANCE = [
  { label: 'Total XP', count: STUDENT.xp, suffix: '', change: '+12%', against: 'vs. last 30 days' },
  { label: 'Current Level', count: STUDENT.level, suffix: '', change: '+1', against: 'vs. last 30 days' },
  { label: 'Growth Rating', count: STUDENT.growth, suffix: '', change: '+4', against: 'vs. last 30 days' },
  { label: 'Streak', count: STUDENT.streak, suffix: ' days', change: '+2', against: 'vs. last 7 days' },
];

export function Glance() {
  return (
    <section className="ld-section">
      <div className="ld-wrap ld-split">
        <Copy
          kicker="At a glance"
          title="Your progress, in numbers"
          action={
            <Link to="/analytics" className="ld-btn is-primary is-small">
              View Analytics <Arrow />
            </Link>
          }
        >
          From daily XP to long-term growth, Summit turns your effort into measurable progress.
        </Copy>
        <div className="ld-stats" data-reveal style={stagger(1)}>
          {GLANCE.map((stat) => (
            <div key={stat.label} className="ld-stat">
              <span>{stat.label}</span>
              <strong data-count={stat.count} data-suffix={stat.suffix}>
                {stat.count.toLocaleString('en-US')}
                {stat.suffix}
              </strong>
              <span className="ld-up">↑ {stat.change}</span>
              <small>{stat.against}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Hours
// ---------------------------------------------------------------------------
export function Hours() {
  return (
    <section className="ld-section">
      <div className="ld-wrap ld-split is-flip">
        <div className="ld-card ld-chart-card" data-reveal>
          <div className="ld-chart-head">
            <p className="ld-card-title">Study Hours</p>
            <div className="ld-legend">
              <span>
                <i style={{ background: '#3B82F6' }} />
                Focused
              </span>
              <span>
                <i style={{ background: '#BFD6FB' }} />
                Total
              </span>
            </div>
          </div>
          <PairedBars
            labels={STUDENT.week}
            back={STUDENT.hoursTotal}
            front={STUDENT.hoursFocused}
            max={8}
            unit="h"
            label="Study hours this week, total and focused, by day."
          />
        </div>
        <Copy
          kicker="Hours"
          title="See where your time goes"
          action={
            <Link to="/calendar" className="ld-btn is-small">
              View Calendar <Arrow />
            </Link>
          }
        >
          Track your study hours, focus time and productivity across days, weeks and months.
        </Copy>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
function MonthGrid({ now }: { now: Date }) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const before = new Date(year, month, 0).getDate();
  const cells: { day: number; other: boolean }[] = [];
  for (let at = first - 1; at >= 0; at--) cells.push({ day: before - at, other: true });
  for (let day = 1; day <= days; day++) cells.push({ day, other: false });
  while (cells.length % 7) cells.push({ day: cells.length - first - days + 1, other: true });

  return (
    <div className="ld-card ld-month">
      <div className="ld-month-head">
        {now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        <span aria-hidden="true">‹ ›</span>
      </div>
      <div className="ld-month-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name) => (
          <b key={name}>{name}</b>
        ))}
        {cells.map(({ day, other }, at) => {
          const today = !other && day === now.getDate();
          const classes = ['ld-day'];
          if (other) classes.push('is-other');
          if (today) classes.push('is-today');
          if (!other && day <= now.getDate() && hadWork(day)) classes.push('has-work');
          return (
            <span key={at} className={classes.join(' ')} aria-current={today ? 'date' : undefined}>
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function TodayList({ now }: { now: Date }) {
  return (
    <div className="ld-card ld-today">
      <p className="ld-today-head">
        Today, {now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </p>
      <ul className="ld-todo">
        {STUDENT.today.map((task) => (
          <TodayItem key={task.name} name={task.name} minutes={task.minutes} initiallyDone={task.done} />
        ))}
      </ul>
    </div>
  );
}

function TodayItem({ name, minutes, initiallyDone }: { name: string; minutes: number; initiallyDone: boolean }) {
  const [done, setDone] = useState(initiallyDone);
  return (
    <li>
      <label className={done ? 'is-done' : undefined}>
        <input type="checkbox" checked={done} onChange={(event) => setDone(event.currentTarget.checked)} />
        <span>{name}</span>
        <em>{duration(minutes)}</em>
      </label>
    </li>
  );
}

export function Calendar() {
  const now = new Date();
  return (
    <section className="ld-section">
      <div className="ld-wrap ld-split">
        <Copy
          kicker="Calendar"
          title="Plan. Focus. Finish."
          action={
            <Link to="/calendar" className="ld-btn is-small">
              Open Calendar <Arrow />
            </Link>
          }
        >
          Your calendar keeps everything in sync — tasks, classes, goals and more.
        </Copy>
        <div className="ld-cal-pair">
          <div data-reveal style={stagger(1)}>
            <MonthGrid now={now} />
          </div>
          <div data-reveal style={stagger(2)}>
            <TodayList now={now} />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Streaks and XP
// ---------------------------------------------------------------------------
export function Streaks() {
  const now = new Date();
  return (
    <section className="ld-section">
      <div className="ld-wrap ld-split">
        <Copy
          kicker="Streaks & XP"
          title="Small steps. Big results."
          action={
            <Link to="/achievements" className="ld-btn is-primary is-small">
              View Streaks <Arrow />
            </Link>
          }
        >
          Keep your streak alive and earn XP for every action. Consistency compounds.
        </Copy>
        <div className="ld-streak-pair">
          <div className="ld-card ld-streak is-lift" data-reveal style={stagger(1)}>
            <span className="ld-flame" aria-hidden="true">
              🔥
            </span>
            <div>
              <span className="ld-streak-label">Current Streak</span>
              <strong>
                <span data-count={STUDENT.streak} data-suffix=" days">
                  {STUDENT.streak} days
                </span>
              </strong>
              <span className="ld-streak-label">Best: {STUDENT.bestStreak} days</span>
            </div>
          </div>
          <div className="ld-card ld-chart-card" data-reveal style={stagger(2)}>
            <div className="ld-chart-head">
              <p className="ld-card-title">XP, Last 31 Days</p>
              <div className="ld-xp-total">
                <span>Total XP</span>
                <strong>{STUDENT.xp.toLocaleString('en-US')}</strong>
                <span className="ld-up">↑ +12%</span>
              </div>
            </div>
            <DayBars days={recentXp(now)} label="XP earned on each of the last 31 days." />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
const PILLAR_ICONS = [Gauge, Clock, CheckCircle2, Sparkles];

export function Analytics() {
  return (
    <section className="ld-section" id="analytics">
      <div className="ld-wrap ld-split is-flip">
        <div className="ld-score-pair">
          <div className="ld-card ld-score" data-reveal>
            <p className="ld-card-title">Growth Score</p>
            <div className="ld-ring">
              <Ring value={STUDENT.growth} />
              <span>
                <strong data-count={STUDENT.growth}>{STUDENT.growth}</strong>
                <small>/100</small>
              </span>
            </div>
          </div>
          <div className="ld-card ld-pillars" data-reveal style={stagger(1)}>
            <p className="ld-card-title">Four Pillars</p>
            {STUDENT.pillars.map((pillar, at) => {
              const Glyph = PILLAR_ICONS[at]!;
              return (
                <div key={pillar.name} className="ld-pillar">
                  <Glyph aria-hidden="true" />
                  <span>{pillar.name}</span>
                  <span className="ld-pillar-track">
                    <i style={{ width: `${pillar.value}%`, ...stagger(at) }} />
                  </span>
                  <b>{pillar.value}</b>
                </div>
              );
            })}
          </div>
        </div>
        <Copy
          kicker="Analytics"
          title="Track what matters"
          action={
            <Link to="/analytics" className="ld-btn is-small">
              View Analytics <Arrow />
            </Link>
          }
        >
          Your Growth Score combines four key areas to give you a clear picture of your progress.
        </Copy>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Four decisions
// ---------------------------------------------------------------------------
const STEPS = [
  { title: 'Be intentional', body: 'Set clear goals and decide what matters.' },
  { title: 'Do the work', body: 'Turn plans into action with simple, consistent habits.' },
  { title: 'Track progress', body: 'Let data remove guesswork and build momentum.' },
  { title: 'Keep going', body: 'Small improvements compound over time.' },
];

export function Decisions() {
  return (
    <section className="ld-section">
      <div className="ld-wrap">
        <div data-reveal>
          <span className="ld-kicker">The Summit way</span>
          <h2 className="ld-h2">Four decisions. A better you.</h2>
        </div>
        <div className="ld-steps">
          {STEPS.map((step, at) => (
            <article key={step.title} className="ld-card ld-step is-lift" data-reveal style={stagger(at)}>
              <span className="ld-step-num">{String(at + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------
export interface Plan {
  name: string;
  price: number;
  perks: string[];
  cta: string;
  featured?: boolean;
}

export const PLANS: Plan[] = [
  { name: 'Free', price: 0, perks: ['Up to 4 subjects', 'Basic analytics', 'Calendar & tasks'], cta: 'Get Started' },
  { name: 'Pro', price: 6, perks: ['Unlimited subjects', 'Advanced analytics', 'AI goal suggestions'], cta: 'Upgrade', featured: true },
  { name: 'Team', price: 12, perks: ['Shared goals', 'Team analytics', 'Collaboration tools'], cta: 'Get Started' },
];

export function Pricing({ signedIn, onPaidPlan }: { signedIn: boolean; onPaidPlan: (plan: string) => void }) {
  return (
    <section className="ld-section" id="pricing">
      <div className="ld-wrap ld-pricing">
        <Copy kicker="Pricing" title="Simple, transparent pricing">
          Everything you need, nothing you don&apos;t.
        </Copy>
        <div className="ld-plans">
          {PLANS.map((plan, at) => (
            <article
              key={plan.name}
              className={`ld-card ld-plan is-lift${plan.featured ? ' is-featured' : ''}`}
              data-reveal
              style={stagger(at)}
            >
              {plan.featured && <span className="ld-plan-badge">Most Popular</span>}
              <h3>{plan.name}</h3>
              <p className="ld-price">
                ${plan.price} <small>/ month</small>
              </p>
              <ul>
                {plan.perks.map((perk) => (
                  <li key={perk}>{perk}</li>
                ))}
              </ul>
              {plan.price === 0 ? (
                <Link to={signedIn ? '/dashboard' : '/login?auth=create'} className="ld-btn is-small">
                  {plan.cta}
                </Link>
              ) : (
                <button
                  type="button"
                  className={`ld-btn is-small${plan.featured ? ' is-primary' : ''}`}
                  onClick={() => onPaidPlan(plan.name)}
                >
                  {plan.cta}
                </button>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Built with
// ---------------------------------------------------------------------------
const TECH: { name: string; role: string; icon: ReactNode }[] = [
  {
    name: 'React',
    role: 'Frontend',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" stroke="#38BDF8" strokeWidth="1.6">
        <ellipse cx="16" cy="16" rx="13" ry="5" />
        <ellipse cx="16" cy="16" rx="13" ry="5" transform="rotate(60 16 16)" />
        <ellipse cx="16" cy="16" rx="13" ry="5" transform="rotate(120 16 16)" />
        <circle cx="16" cy="16" r="2.4" fill="#38BDF8" stroke="none" />
      </svg>
    ),
  },
  {
    name: 'TypeScript',
    role: 'Language',
    icon: (
      <svg viewBox="0 0 32 32">
        <rect x="2" y="2" width="28" height="28" rx="5" fill="#3178C6" />
        <text x="16" y="22" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="800" fontFamily="system-ui">
          TS
        </text>
      </svg>
    ),
  },
  {
    name: 'FastAPI',
    role: 'Backend',
    icon: (
      <svg viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="14" fill="#059669" />
        <path d="M17.5 6 10 18h5.5l-1 8L22 14h-5.5z" fill="#fff" />
      </svg>
    ),
  },
  {
    name: 'SQLite',
    role: 'Database',
    icon: (
      <svg viewBox="0 0 32 32" fill="none" stroke="#2563EB" strokeWidth="1.8">
        <ellipse cx="16" cy="8" rx="10" ry="4" />
        <path d="M6 8v16c0 2.2 4.5 4 10 4s10-1.8 10-4V8" />
        <path d="M6 16c0 2.2 4.5 4 10 4s10-1.8 10-4" />
      </svg>
    ),
  },
  {
    name: 'Claude',
    role: 'AI integration',
    icon: (
      <svg viewBox="0 0 32 32" stroke="#D97757" strokeWidth="2.6" strokeLinecap="round">
        {Array.from({ length: 8 }, (_, at) => {
          const angle = (at * Math.PI) / 4;
          return (
            <line
              key={at}
              x1={16 + Math.cos(angle) * 3}
              y1={16 + Math.sin(angle) * 3}
              x2={16 + Math.cos(angle) * (at % 2 ? 10 : 13)}
              y2={16 + Math.sin(angle) * (at % 2 ? 10 : 13)}
            />
          );
        })}
      </svg>
    ),
  },
];

export function Tech() {
  return (
    <section className="ld-section">
      <div className="ld-wrap ld-tech">
        <Copy kicker="Built with" title="Modern technology">
          Fast, secure and built for scale.
        </Copy>
        <div className="ld-logos" data-reveal style={stagger(1)}>
          {TECH.map((tech) => (
            <div key={tech.name} className="ld-logo">
              <span aria-hidden="true">{tech.icon}</span>
              <strong>{tech.name}</strong>
              <span>{tech.role}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The closing call
// ---------------------------------------------------------------------------
export function FinalCall({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="ld-band ld-final">
      <div className="ld-wrap ld-final-row" data-reveal>
        <div>
          <h2>Ready to build better habits?</h2>
          <p>Join Summit and start turning your effort into real progress.</p>
        </div>
        <Link to={signedIn ? '/dashboard' : '/login?auth=create'} className="ld-btn is-primary">
          {signedIn ? 'Go to Dashboard' : 'Create a free account'} <Arrow />
        </Link>
      </div>
    </section>
  );
}
