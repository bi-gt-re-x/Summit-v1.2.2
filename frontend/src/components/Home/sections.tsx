/**
 * The landing page's written sections — the parts of frontend/html/homepage.html
 * that are prose and shape rather than demonstration.
 *
 * Every class name here is the one styles/homepage.css already dresses, so
 * none of this needed new CSS. The demos that move live in their own files
 * beside this one; what is left is the hero, the feature strip, the section
 * headings, the philosophy and pricing blocks, the tech grid and the footer.
 *
 * The one thing that is not a straight transcription: links that pointed at
 * pages through Jinja's `url_for` are router <Link>s, so following one inside
 * the app does not reload it.
 */
import { Link, useNavigate } from 'react-router-dom';
import { Range } from '@/components/Range';
import { RidgeChart } from './RidgeChart';
import { Trend } from './Trend';
import type { Theme } from '@/types';
import { Icon } from '@/components/Icon';

/** The date in the hero's eyebrow — what main.js wrote there. */
function today(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** The time of day, and the account's name when there is one. */
function greeting(name: string | null): string {
  const hour = new Date().getHours();
  const part =
    hour < 5
      ? 'Good night'
      : hour < 12
        ? 'Good morning'
        : hour < 18
          ? 'Good afternoon'
          : 'Good evening';
  return name ? `${part}, ${name}` : part;
}

/**
 * The six weeks behind the hero's chart, and the six in front of them.
 *
 * Daily XP for a made-up but ordinary term: a slow start, a dip over a
 * half-term, and a run at the end. The two arrays are one scale apart on
 * purpose — this is the argument the whole page makes, drawn rather than
 * claimed, and a "before" that were not actually lower than the "after" would
 * be a chart illustrating nothing.
 *
 * A mock, like every other number in the hero and like the demos further down.
 * The page is honest about that where it matters: the dashboard section says
 * outright that what the reader is looking at is the real component running,
 * and nothing here is presented as somebody's account.
 */
/*
 * One made-up term, and every figure on the page is read off it, so no two
 * cards can disagree about the same student. Six weeks at about 60 XP a day
 * and six at about 145 is 8,610 XP; level N costs N × 100 (utils/format), so
 * that is level 13 with 810 of 1,300 in hand — the 62% bar under the chart.
 * The last thirty days at ~145 a day is ~4,350 XP, or 142 tasks at ~30 each.
 * The growth score is the Analytics section's five factors averaged: 83, a B.
 * Change one of these and change the rest with it.
 */
const HERO_XP = [
  { name: 'Weeks 1–6', values: [40, 65, 30, 75, 55, 90, 60] },
  { name: 'Weeks 7–12', values: [95, 140, 110, 175, 130, 210, 165] },
] as const;

/**
 * The `hm-rise` and `hm-pop` classes below are what useIntro moves. The
 * original added them from script; they are part of what these elements are,
 * so they are written here — and because they only do anything while `hm-armed`
 * is on <html>, a page where the intro never runs is unaffected by them.
 */
export function Hero({
  signedIn,
  username,
  onGetStarted,
}: {
  signedIn: boolean;
  username: string | null;
  /** Opens the account popup. Signed-out visitors have nowhere else to go. */
  onGetStarted: () => void;
}) {
  return (
    <section className="lp-hero">
      {/* The same mountains every other page in the app opens with —
          components/Range.tsx, dressed by styles/summit.css, and given its
          colours here by the `--peak-*` block in styles/homepage.css. The
          landing page was the one room in the building with no window in it:
          twelve pages wear a range behind their header and the page that has
          to sell them opened on a flat gradient. */}
      <Range variant="home" className="lp-hero-scene" />

      <div className="lp-hero-text">
        {/* Two different openings, because there are two different readers.
            Someone signed in gets the greeting and the date the app has always
            shown them. A stranger gets the three facts that decide whether
            they read the next line — a greeting and today's date tell them
            nothing, and spend the most valuable line on the page saying it. */}
        {signedIn ? (
          <>
            <span className="lp-greet hm-rise">{greeting(username)}</span>
            <span className="lp-eyebrow hm-rise">
              <span className="date-container" id="dateDisplay">
                {today()}
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="lp-greet lp-kicker hm-rise">
              {/* The mark itself, not a second drawing of it. The first
                  version of this line carried a five-point path of its own,
                  which is the mistake components/Rail.tsx spent a paragraph
                  undoing: one mountain in utils/images/logo.svg, and every
                  place that shows it points at that file. */}
              <img
                className="lp-kicker-peak"
                src="/static/images/logo.svg"
                alt=""
                width={18}
                height={18}
              />
              A study tracker that does the arithmetic
            </span>
            <span className="lp-eyebrow hm-rise">
              Free, all of it · No card · One file you own
            </span>
          </>
        )}

        <h1 className="lp-hero-title">
          Finish the work. <em>Summit keeps the score.</em>
        </h1>
        <p className="lp-hero-sub hm-rise">
          Tasks, a calendar and a focus timer on one side. Streaks, XP and a growth
          score on the other — out of the same finished work, so there is nothing to
          log twice and every figure shows the sum it came from.
        </p>
        {/* Every call to action on this page is a pitch to a visitor who has no
            account yet. Someone already signed in has nothing left to be sold,
            so their buttons just say where they go.

            The second button used to be Open Calendar for both of them, and for
            a stranger that was a dead end: /calendar is gated, so the one
            button on the page offering to *show* them something bounced them
            straight back here with the sign-up box open. The demos further down
            are the honest version of that offer, and they cost nothing to
            reach. */}
        <div className="lp-hero-actions hm-pop">
          {signedIn ? (
            <>
              <Link to="/dashboard" className="lp-btn lp-btn-primary" id="dashboardBtn">
                Go to Dashboard <span className="lp-arrow">→</span>
              </Link>
              <Link to="/calendar" className="lp-btn lp-btn-ghost" id="calendarBtn">
                <span className="pill-icon"><Icon name="calendar" /></span> Open Calendar
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                id="dashboardBtn"
                className="lp-btn lp-btn-primary"
                onClick={onGetStarted}
              >
                Create a free account <span className="lp-chevd">▾</span>
              </button>
              <a href="#see-it" className="lp-btn lp-btn-ghost">
                See it working <span className="lp-arrow lp-arrow-down">↓</span>
              </a>
            </>
          )}
        </div>
      </div>

      <div className="lp-hero-art" aria-hidden="true">
        <div className="lp-preview lp-preview-dash">
          <div className="lp-prev-head">
            <span>Daily XP</span>
            <span className="lp-dot" />
          </div>
          <div className="lp-prev-sub">A term, six weeks against six</div>
          {/* Was two anonymous sparklines side by side, which is the chart
              every product page draws and the one nobody reads. The same
              numbers as a range: each day is a summit at its own height, and
              the best day of the term is the one wearing snow. */}
          <RidgeChart
            className="lp-prev-ridge"
            series={HERO_XP}
            axis={['200', '100', '0']}
            label="Daily XP over a term: a first half averaging around 60, a second half averaging around 145."
          />
          <div className="lp-prev-row">
            <span>Level 13</span>
            <span className="lp-prev-bar">
              <i style={{ width: '62%' }} />
            </span>
          </div>
        </div>
        <div className="lp-preview lp-preview-rating">
          <div className="lp-prev-head">
            <span>Growth Rating</span>
          </div>
          <svg viewBox="0 0 120 120" className="lp-radar">
            <polygon
              points="60,12 108,46 90,104 30,104 12,46"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="1.5"
            />
            <polygon points="60,34 90,54 80,92 40,92 30,54" className="lp-radar-fill" />
          </svg>
          <div className="lp-prev-overall">
            Overall <strong>83</strong>
          </div>
        </div>
        {/* A 📅 floated here at 45% opacity, over nothing, meaning nothing. It
            was the last of the decoration the hero had instead of a picture,
            and the range behind the card is the picture. */}
      </div>
    </section>
  );
}

/**
 * The three cards under the hero.
 *
 * `bits` is the part that was missing. Each card had a title, a sentence and a
 * link, and the sentence was doing two jobs badly — saying what the thing is
 * *and* listing what it can do, which is how a paragraph ends up as "organize
 * your schedule with an intuitive task manager" and tells a reader nothing they
 * could not have guessed from the title. The sentence now makes one claim and
 * the row of chips under it carries the specifics, which is also the only part
 * of a feature card anybody actually scans.
 */
const FEATURES = [
  {
    ico: 'lp-ico-teal',
    glyph: 'clipboard' as const,
    title: 'One list, not four',
    body: 'Everything you have on, in one place — filtered, sorted and searchable, and a dozen of them dealt with at once.',
    bits: ['Priorities', 'Due dates', 'Bulk actions'],
    to: '/dashboard',
    label: 'Go to Dashboard',
  },
  {
    ico: 'lp-ico-green',
    glyph: 'sprout' as const,
    title: 'A score you can audit',
    body: 'Five measures, one growth score, and the working shown for each — no black box telling you how your week went.',
    bits: ['Streaks', 'Growth score', 'Records'],
    to: '/growth',
    label: 'Go to Growth',
  },
  {
    ico: 'lp-ico-gold',
    glyph: 'target' as const,
    title: 'Goals that move themselves',
    body: 'Name a target in XP, tasks or streak days. It advances as you work — there is no second place to keep score.',
    bits: ['XP', 'Milestones', 'Auto-advance'],
    to: '/goals',
    label: 'Go to Goals',
  },
];

export function FeatureStrip() {
  const navigate = useNavigate();

  return (
    <section className="lp-strip" id="features">
      {FEATURES.map((f) => (
        // The whole card is the target, not just the link in it. The link is
        // still a real link — keyboard, middle-click and "open in new tab" all
        // work — so the card only handles a click that missed it.
        <article
          className="lp-card lp-feature lp-clickable"
          key={f.title}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) return;
            navigate(f.to);
          }}
        >
          <span className={`lp-feat-ico ${f.ico}`}><Icon name={f.glyph} /></span>
          <h3>{f.title}</h3>
          <p>{f.body}</p>
          <ul className="lp-feat-bits">
            {f.bits.map((bit) => (
              <li key={bit}>{bit}</li>
            ))}
          </ul>
          <Link to={f.to} className="lp-link">
            {f.label} <span className="lp-arrow">→</span>
          </Link>
        </article>
      ))}
      {/* This card is where the hidden chain starts on this page —
          secret/quote-egg.js counts ten clicks on the `.lp-quote` card itself,
          so everything inside it is a child and the clicks still bubble. That
          is the only reason the card has to stay; what is *in* it changed.

          It used to be a testimonial: five stars, a quote about how Summit
          changed somebody's studying, and "Sarah J. · Student · six month
          streak" under an initial in a circle. Sarah does not exist. That was
          harmless while this ran on one laptop and nobody but its author ever
          loaded the page, and it stops being harmless the moment the page is
          on a domain — an invented five-star review from an invented student
          is not a placeholder any more, it is a fake endorsement, and the
          people it would work on are the ones deciding whether to trust a
          study tool with their year.

          So the card says something true instead: why the thing was built,
          which needs no reviewer to vouch for it. */}
      <article className="lp-card lp-quote">
        <p className="lp-quote-kicker">Why this exists</p>
        <p>
          “Every tracker I tried could tell me what I had planned. None of them could
          tell me whether the week had actually gone well, or just felt like it.”
        </p>
        <div className="lp-quote-foot">
          <span className="lp-quote-by">The reason Summit counts what it counts</span>
        </div>
      </article>
    </section>
  );
}

/** The heading above each demonstration section. */
export function SectionHead({ title, blurb }: { title: string; blurb: string }) {
  return (
    <header className="lp-head">
      <h2>{title}</h2>
      <p>{blurb}</p>
    </header>
  );
}

export function TaskStats() {
  return (
    <div className="lp-split">
      <div className="lp-card lp-stats">
        <div className="lp-card-top">
          <div className="lp-stats-head">
            <span className="lp-feat-ico lp-ico-teal lp-ico-sm"><Icon name="chart" /></span> Statistics
          </div>
          <span className="lp-pill-mini">Last 30 days</span>
        </div>
        <div className="lp-stat">
          <span>Total tasks created</span>
          <span className="lp-stat-v">
            <b>164</b>
          </span>
        </div>
        <div className="lp-stat">
          <span>Total completed</span>
          <span className="lp-stat-v">
            <b>142</b>
            <Trend value={8} suffix="%" />
          </span>
        </div>
        <div className="lp-stat">
          <span>Goals completed</span>
          <span className="lp-stat-v">
            <b>3</b>
            <Trend value={1} />
          </span>
        </div>
        <div className="lp-stat">
          <span>Average XP / day</span>
          <span className="lp-stat-v">
            <b>145</b>
          </span>
        </div>
        <div className="lp-stat">
          <span>Best streak</span>
          <span className="lp-stat-v">
            <b>28</b>
            <i className="lp-trend flat">days</i>
          </span>
        </div>
      </div>
      {/* Three things a task actually has, rather than three things a task
          manager is generally said to have.

          The middle one used to be "Sub-tasks — break big tasks into smaller
          checkable steps", and a `Task` has never had any. Steps belong to a
          milestone under a goal, and types/models.ts is explicit that a step
          has no XP, no due date, no timer and no priority and "never reaches
          the tasks page". So this was not soft copy, it was a feature the page
          was inventing, in the one section devoted to the thing it was
          inventing it about. Subjects are what actually sits in that slot: a
          real field on a task, and the one the analytics breakdown is built
          from.

          "Reminders" went the same way for a smaller reason — nothing here
          reminds anybody of anything. There are due dates, and there is a
          timer, and what the timer does when it runs out is worth a sentence
          of its own. */}
      <ul className="lp-list">
        <li>
          <span className="lp-list-ico"><Icon name="star" /></span>
          <div>
            <h4>Priority</h4>
            <p>
              Low, medium or high. The list sorts by it, so what you flagged stays at the
              top until it is done.
            </p>
          </div>
        </li>
        <li>
          <span className="lp-list-ico"><Icon name="folder" /></span>
          <div>
            <h4>Subjects</h4>
            <p>
              File a task under a subject and the XP it earns is tallied there. That tally is
              the per-subject breakdown on the analytics page.
            </p>
          </div>
        </li>
        <li>
          <span className="lp-list-ico"><Icon name="timer" /></span>
          <div>
            <h4>Due dates and timers</h4>
            <p>
              A date puts a task on a day in the calendar. A timer runs the session, and a
              task whose timer runs out is marked expired rather than left open.
            </p>
          </div>
        </li>
      </ul>
    </div>
  );
}

const PHILOSOPHY = [
  {
    ico: 'lp-ico-teal',
    path: <path d="M3 12h4l3 8 4-16 3 8h4" />,
    title: 'Consistency over intensity',
    body: 'A streak counts days you turned up, not hours you sat down. Once it is a week old it survives one missed day a month.',
  },
  {
    ico: 'lp-ico-green',
    path: (
      <>
        <path d="M3 17L9 11l4 4 8-8" />
        <path d="M16 7h5v5" />
      </>
    ),
    title: 'Measurable progress',
    body: 'Everything you finish becomes a figure, and every figure names what it was counted from.',
  },
  {
    ico: 'lp-ico-gold',
    path: (
      <>
        <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
        <path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3" />
        <path d="M12 13v4M9 20h6" />
      </>
    ),
    title: 'Finishing should feel like something',
    body: 'XP, levels and a title on the rail. Small rewards for the part that is genuinely hard.',
  },
  {
    ico: 'lp-ico-purple',
    path: <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />,
    title: 'Simplicity first',
    body: 'The few tools that change what you do tomorrow, and nothing else competing for the screen.',
  },
];

export function Philosophy() {
  return (
    <section className="lp-section">
      <SectionHead
        title="Four decisions, kept"
        blurb="The rules the rest of the app is built to. Each one costs something, and each one is why a feature you might expect is not here."
      />
      {/* Line icons rather than emoji, so each one can draw itself in. */}
      <div className="lp-philo" id="philoGrid">
        {PHILOSOPHY.map((p) => (
          <div className="lp-card lp-phi" key={p.title}>
            <span className={`lp-feat-ico ${p.ico} ph-ico`}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {p.path}
              </svg>
            </span>
            <h4>{p.title}</h4>
            <p>{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The four squares under "Theme Selector". Two are real themes and two are not
 * built, which is what the toast is for — the original said so rather than
 * hiding them, and the swatches are part of the pitch.
 */
const SWATCHES: { css: string; title: string; theme: Theme | null }[] = [
  { css: 'lp-sw-light', title: 'Light', theme: 'light' },
  { css: 'lp-sw-dark', title: 'Dark', theme: 'dark' },
  { css: 'lp-sw-mid', title: 'Slate', theme: null },
  { css: 'lp-sw-ink', title: 'Ink', theme: null },
];

export function Pricing({
  signedIn,
  onGetStarted,
  onTheme,
  onToast,
}: {
  signedIn: boolean;
  /** Opens the account popup, for the same reason the hero's button does. */
  onGetStarted: () => void;
  onTheme: (theme: Theme) => void;
  onToast: (message: string) => void;
}) {
  /** The pop replays on every click, so the class comes off and goes back on. */
  const pick = (event: React.MouseEvent | React.KeyboardEvent, index: number) => {
    const swatch = SWATCHES[index];
    if (!swatch) return;
    if (swatch.theme) {
      onTheme(swatch.theme);
      const el = event.currentTarget as HTMLElement;
      el.classList.remove('lp-swatch-pop');
      void el.offsetWidth;
      el.classList.add('lp-swatch-pop');
    } else {
      onToast(`${swatch.title} theme is coming soon`);
    }
  };

  return (
    <section className="lp-section" id="pricing">
      {/* Was "Features Comparison and Pricing". There is nothing to compare —
          one plan, everything in it, no paid tier to hold anything back — so
          the heading was promising a table the section does not have and
          cannot have. The blurb underneath was already saying the true and
          shorter version of it. */}
      <SectionHead
        title="What it costs"
        blurb="Nothing. There is one plan, everything is in it, and there is no tier above it holding anything back."
      />
      <div className="lp-split">
        <div className="lp-card lp-themes">
          <div className="lp-stats-head">Theme</div>
          <div className="lp-swatches">
            {SWATCHES.map((swatch, i) => (
              <span
                key={swatch.title}
                className={`lp-swatch ${swatch.css}`}
                title={swatch.title}
                role="button"
                tabIndex={0}
                onClick={(event) => pick(event, i)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    pick(event, i);
                  }
                }}
              />
            ))}
          </div>
          <p className="lp-muted-p">
            Light &amp; dark themes follow you across every page and persist to your account.
          </p>
        </div>
        <div className="lp-card lp-price">
          <span className="lp-price-tag">Free forever</span>
          <ul className="lp-price-list">
            <li>✓ Unlimited tasks &amp; goals</li>
            <li>✓ Growth ratings &amp; analytics</li>
            <li>✓ Streaks, XP &amp; levels</li>
            <li>✓ Calendar scheduling</li>
          </ul>
          {/* The same correction as the closing block's: a signed-out reader
              clicking the price card's button wants an account, not the log-in
              panel a bounce off /dashboard leaves them looking at. */}
          {signedIn ? (
            <Link to="/dashboard" className="lp-btn lp-btn-primary lp-btn-full">
              Go to Dashboard
            </Link>
          ) : (
            <button
              type="button"
              className="lp-btn lp-btn-primary lp-btn-full"
              onClick={onGetStarted}
            >
              Create a free account
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Each technology is its own `.tech-bit` so useFinalMotion can bring them in
 * one at a time. The original wrote "HTML · CSS · Vanilla JS" and split it at
 * runtime; the parts are the parts, so they are written as a list.
 */
/**
 * What the app is actually built on.
 *
 * This said HTML / CSS / Vanilla JS and Python / Flask / Jinja, and carried a
 * note explaining that the copy described the stack the port was replacing —
 * true when it was written, and the reason to leave it alone was that what the
 * page claims is a separate decision from how it is rendered.
 *
 * That reason has expired. Both of those are gone: this page is React and the
 * server is FastAPI, so the section was no longer carrying old copy, it was
 * carrying wrong copy — on the one card whose entire job is to be checkable.
 * And it undersold the thing it was advertising, which is the rarer mistake.
 *
 * Versions come from package.json and requirements.txt. A number here is a
 * claim like any other, so keep it to the major and let the lockfiles hold the
 * rest.
 */
const TECH = [
  { ico: 'lp-ico-teal', glyph: 'monitor' as const, title: 'Frontend', bits: ['React 19', 'TypeScript', 'Vite'] },
  { ico: 'lp-ico-green', glyph: 'wrench' as const, title: 'Backend', bits: ['Python', 'FastAPI', 'Uvicorn'] },
  { ico: 'lp-ico-gold', glyph: 'database' as const, title: 'Database', bits: ['SQLite'] },
  { ico: 'lp-ico-purple', glyph: 'chart' as const, title: 'Visualization', bits: ['SVG', 'Canvas'] },
];

export function TechStack() {
  return (
    <section className="lp-section">
      <SectionHead
        title="What it is built on"
        blurb="A typed frontend, a typed API, and one SQLite file you can copy to a USB stick and take with you."
      />
      <div className="lp-tech" id="techGrid">
        <svg className="tech-wires" id="techWires" aria-hidden="true" />
        {TECH.map((t) => (
          <div className="lp-card lp-techitem" key={t.title}>
            <span className={`lp-feat-ico ${t.ico}`}><Icon name={t.glyph} /></span>
            <div>
              <h4>{t.title}</h4>
              <p>
                {t.bits.map((bit, i) => (
                  <span key={bit}>
                    {i > 0 && ' · '}
                    <span className="tech-bit">{bit}</span>
                  </span>
                ))}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * What the closing block promises, under the button.
 *
 * Three, because four reads as a list and two as an afterthought — and each one
 * has to agree with something the page has already said. "Free forever" is the
 * price tag in `Pricing` above, and the SQLite line is the same file the tech
 * grid names. A closing block that invents a fourth claim nobody can check is
 * the part of a landing page readers have learned to skip.
 */
const REASSURANCE = [
  'Free forever — everything included',
  'No card, no trial clock',
  'One SQLite file, on your own server',
];

export function FinalCta({
  signedIn,
  onGetStarted,
}: {
  signedIn: boolean;
  /** Opens the account popup, for the same reason the hero's button does. */
  onGetStarted: () => void;
}) {
  return (
    <section className="lp-final">
      {/* The second range on the page, and the one it has been walking
          towards. Same drawing as the hero's — components/Range.tsx — from a
          different seed, so the page closes somewhere it has not already
          been. */}
      <Range variant="summit" className="lp-final-scene" />
      <h2>Everything above is free. Start tonight.</h2>
      {/* The second sentence used to be "Everything on this page is the real
          app — nothing here is a screenshot." The dashboard section up the page
          already says it, at the moment the reader is looking at the thing
          being claimed and can check it. Repeating it here, eight sections
          later and next to the button, argues a point nobody is still
          disputing and takes the last line of the page away from the one
          thing it is for. */}
      <p>Finish one task today and the numbers start moving.</p>
      {/* It was a <Link> to /dashboard for both readers, and for a stranger
          that is the worst button on the page: the dashboard is gated, so
          "Get Started Today" walked them into a bounce and dropped them back
          here with the *log in* panel open — asking for a password from
          somebody whose whole reason for clicking was that they do not have
          one. It opens the same popup the hero's button does now. */}
      {signedIn ? (
        <Link to="/dashboard" className="lp-btn lp-btn-primary lp-btn-lg">
          Go to Your Dashboard <span className="lp-arrow">→</span>
        </Link>
      ) : (
        <button type="button" className="lp-btn lp-btn-primary lp-btn-lg" onClick={onGetStarted}>
          Create a free account <span className="lp-arrow">→</span>
        </button>
      )}
      {/* The last thing a signed-out reader wants to know is what it costs and
          what it takes. Someone with an account has already answered both, so
          they are shown a button and nothing else. */}
      {!signedIn && (
        <ul className="lp-final-notes">
          {REASSURANCE.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <nav className="footer-links">
          <Link to="/about-us">About Us</Link>
          {/* Still Jinja pages, so these leave the app on purpose. */}
          <a href="/contact-support">Contact Support</a>
          <Link to="/privacy-policy">Privacy Policy</Link>
          <Link to="/terms-of-service">Terms of Service</Link>
          <a href="/careers">Careers</a>
        </nav>
        {/* Was "© 2032 Study Dashboard Inc." — a year six ahead of this one,
            under a company that does not exist and a product name this app
            stopped using. The Terms page is the one that has to be right about
            ownership and it says the name and software belong to the project's
            authors, so this agrees with it. The year is computed, because a
            hardcoded one is only ever correct for twelve months. */}
        <div className="copyright">
          © {new Date().getFullYear()} Summit. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
