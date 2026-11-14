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
  insight: String.raw`Clear denominators to get $(x-6)(y-6) = 36$. $36$ has $9$ divisors, one ordered pair each.`,
};

const FEATURES = [
  ['Problems', 'Tagged by topic, method and AoPS difficulty, with step-by-step solutions.'],
  ['Review', 'Problems you miss come back after 3, 10 and 21 days.'],
  ['Topics', '32 topics in algebra, number theory, counting, geometry and more.'],
  ['Past Contests', 'Timed mocks scored like the real thing, and every AMC 10, AMC 12 and AIME since 2000.'],
  ['Study Plan', 'Pick your contest and date. Get a plan for each week.'],
  ['Analytics', 'See where you lose points and what to work on next.'],
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
              Practice problems, timed mocks, a review log for your misses, and a study plan for the AMC 10, AMC 12
              and AIME.
            </p>
            <div className="am-landing-cta">
              <Link className="primary" to={signedIn ? '/dashboard' : '/login?auth=create'}>
                {signedIn ? 'Go to your dashboard' : 'Start free'}
              </Link>
              <a className="secondary" href="#features">What's inside</a>
            </div>
            <div className="am-landing-numbers">
              <div><strong>65</strong><span>problems with solutions</span></div>
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
                <span>{pick === SAMPLE.answer ? 'Correct' : 'Not quite'}</span>
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
          Step problems are original. AMC and AIME problems are © MAA. Not affiliated with the MAA.
        </span>
        <span>
          <Link to="/privacy-policy">Privacy</Link> · <Link to="/terms-of-service">Terms</Link>
        </span>
      </footer>
    </div>
  );
}
