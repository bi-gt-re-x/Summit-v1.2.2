/**
 * The landing page: what the site is, a sample problem you can answer on the
 * spot, and the way in. A signed-out visitor's page, so it carries its own
 * header rather than the rail and the top bar (App.tsx, `isLanding`).
 */
import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { MathText } from '@/components/Amc/MathText';
import { AnswerInput } from '@/components/Amc/bits';
import { useAuth, useDocumentTitle } from '@/hooks';
import '@/styles/amc.css';

const SAMPLE = {
  statement: String.raw`How many ordered pairs of positive integers $(x, y)$ satisfy $\dfrac{1}{x} + \dfrac{1}{y} = \dfrac{1}{6}$?`,
  choices: ['$6$', '$8$', '$9$', '$10$', '$12$'],
  answer: 'C',
  insight: String.raw`Clear denominators: $(x-6)(y-6) = 36$, and $36$ has $9$ divisors — one ordered pair each.`,
};

const FEATURES = [
  ['Problems', 'Every problem tagged by topic, technique and difficulty 1–5, with a full solution, the key insight and the trap that costs points.'],
  ['Review', 'Missed problems return after 3, 10 and 21 days until they stick. Your error log, scheduled for you.'],
  ['Topics', 'Thirty-two topics across algebra, number theory, counting, geometry and logic — each with its key ideas.'],
  ['Past Contests', 'Timed Step Mocks scored like the real thing (6 / 1.5 / 0), plus every official AMC 10, AMC 12 and AIME since 2000.'],
  ['Study Plan', 'Pick a contest and a date. Get a week-by-week plan that puts your weakest topics first and schedules mocks.'],
  ['Search', 'Find any problem by text, topic or technique, any topic by idea, and any contest by year — from anywhere with ⌘K.'],
];

export default function Landing() {
  useDocumentTitle('AMC 10, AMC 12 & AIME prep');
  const [params] = useSearchParams();
  const { status } = useAuth();
  const signedIn = status === 'signed-in';
  const [pick, setPick] = useState('');
  const [checked, setChecked] = useState(false);

  // Old account links (verification e-mails, the server's redirects) arrive
  // with ?auth= and belong on the sign-in page.
  if (params.has('auth') || params.has('verify') || params.has('oauth')) {
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }

  return (
    <div className="am-landing">
      <header className="am-landing-nav">
        <Link className="am-landing-brand" to="/home">
          <img src="/static/images/logo.svg" alt="" />
          SUMMIT
        </Link>
        <nav className="am-landing-links" aria-label="Site">
          <a href="#features">Features</a>
          <Link to="/about-us">About</Link>
          {signedIn ? (
            <Link className="am-btn am-btn-primary am-btn-sm" to="/dashboard" style={{ color: '#FAF8F4' }}>Dashboard</Link>
          ) : (
            <>
              <Link to="/login?auth=login">Log in</Link>
              <Link className="am-btn am-btn-primary am-btn-sm" to="/login?auth=create" style={{ color: '#FAF8F4' }}>Start free</Link>
            </>
          )}
        </nav>
      </header>

      <main className="am-landing-main">
        <section className="am-landing-hero">
          <div>
            <p className="am-kicker">AMC 10 · AMC 12 · AIME</p>
            <h1>Train for the AMC. Qualify for the AIME.</h1>
            <p className="lead">
              A step-by-step study site for the American Mathematics Competitions: tagged practice problems, a review
              log that brings your mistakes back on schedule, timed mock contests, and a study plan to contest day.
            </p>
            <div className="am-landing-cta">
              <Link className="primary" to={signedIn ? '/dashboard' : '/login?auth=create'}>
                {signedIn ? 'Go to your dashboard' : 'Start free'}
              </Link>
              <a className="secondary" href="#features">See what's inside</a>
            </div>
            <div className="am-landing-numbers">
              <div><strong>65</strong><span>problems with step-by-step solutions</span></div>
              <div><strong>156</strong><span>official papers indexed</span></div>
              <div><strong>32</strong><span>topics</span></div>
            </div>
          </div>
          <div className="am-landing-card amc-page" style={{ padding: 28, margin: 0, width: '100%' }}>
            <p className="am-kicker">Try one · Step Mock AMC 10 #18</p>
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
              <span className="am-muted" style={{ fontSize: 13 }}>AoPS rating 2 · Factors &amp; Divisors</span>
              {checked ? (
                <button type="button" className="am-btn" onClick={() => { setPick(''); setChecked(false); }}>Reset</button>
              ) : (
                <button type="button" className="am-btn am-btn-primary" disabled={!pick} onClick={() => setChecked(true)}>
                  Check
                </button>
              )}
            </div>
            {checked && (
              <div className="am-callout am-callout-insight" style={{ marginTop: 16 }}>
                <span>{pick === SAMPLE.answer ? 'Correct — the key insight' : 'Not quite — the key insight'}</span>
                <MathText text={SAMPLE.insight} as="p" />
              </div>
            )}
          </div>
        </section>

        <section id="features" className="am-landing-features">
          {FEATURES.map(([title, body]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="am-landing-foot">
        <span>
          Step Mock problems are original. Official AMC and AIME problems are © the Mathematical Association of America
          and are linked, not reproduced. Not affiliated with or endorsed by the MAA.
        </span>
        <span>
          <Link to="/privacy-policy">Privacy</Link> · <Link to="/terms-of-service">Terms</Link>
        </span>
      </footer>
    </div>
  );
}
