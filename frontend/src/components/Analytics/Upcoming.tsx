/**
 * What opens next, as locked cards with a picture of what's behind them.
 *
 * ## Why this replaced "no padlocks, no sample data"
 *
 * The page used to describe what was coming in words only: a countdown, a
 * ladder of thresholds, a reason for each. All of it true, and none of it
 * shows a new reader what they are working toward. On day one an account
 * opens Analytics, sees a few counts and a promise, and has no idea whether
 * the promise is worth three weeks of turning up.
 *
 * So each thing still ahead is a card, the way an unearned achievement is:
 * its name, what it will do, a meter, and the work days left. Behind it sits
 * an example of what it looks like, dimmed and tagged "Example".
 *
 * ## The rule that keeps the example honest
 *
 * It is never the reader's data and never looks like it might be. Every
 * figure in a preview is fixed, written in this file, and the whole preview
 * is `aria-hidden` behind an "Example" tag, so a screen reader hears the card
 * and not a made-up grade. Nothing in a preview is computed from the account.
 * That is the line `Collecting` was drawing when it said "no sample data":
 * an invented figure must never pass for a real one. A labeled picture of the
 * shape of the thing does not.
 */
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { milestonesAhead, type Milestone, type PreviewKind } from './milestones';
import { GLYPHS } from './glyphs';

/** The example under each card. Fixed figures, never the reader's. */
function Preview({ kind }: { kind: PreviewKind }) {
  switch (kind) {
    case 'patterns':
      return (
        <div className="ax-up-ex ax-up-ex-bars">
          <p>Most of your work lands 9 to 11am</p>
          <div className="ax-up-bars">
            {[20, 70, 95, 45, 30, 55, 25].map((h, at) => (
              <i key={at} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      );
    case 'trends':
      return (
        <div className="ax-up-ex">
          <p className="ax-up-big">
            6.5h <span className="ax-up-up">+18%</span>
          </p>
          <p>Focus this week vs. last week</p>
          <svg viewBox="0 0 120 32" className="ax-up-spark" preserveAspectRatio="none">
            <polyline points="0,26 20,22 40,24 60,15 80,17 100,8 120,10" />
          </svg>
        </div>
      );
    case 'grade':
      return (
        <div className="ax-up-ex ax-up-ex-row">
          <span className="ax-up-grade">B+</span>
          <div>
            <p className="ax-up-strong">Top 30% this month</p>
            <p>Tip: start the hard task first</p>
          </div>
        </div>
      );
    case 'habits':
      return (
        <div className="ax-up-ex">
          <p>Usually math on Mon, Wed, Fri</p>
          <div className="ax-up-dots">
            {[1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0].map((on, at) => (
              <i key={at} className={on ? 'is-on' : undefined} />
            ))}
          </div>
        </div>
      );
    case 'insights':
      return (
        <div className="ax-up-ex">
          <p className="ax-up-strong">On days you start before 10am, you finish twice as much.</p>
          <p>Seen on 9 of 12 days</p>
        </div>
      );
    case 'full':
      return (
        <div className="ax-up-ex">
          <p>Your growth, month by month</p>
          <svg viewBox="0 0 120 32" className="ax-up-spark" preserveAspectRatio="none">
            <polyline points="0,30 15,27 30,26 45,21 60,19 75,14 90,12 105,7 120,4" />
          </svg>
        </div>
      );
  }
}

function Card({ step, activeDays }: { step: Milestone; activeDays: number }) {
  const left = Math.max(0, step.need - activeDays);
  const pct = Math.round((Math.min(activeDays, step.need) / step.need) * 100);

  return (
    <li>
      <Link to={step.href} className="ax-up-card">
        <div className="ax-up-preview">
          <span className="ax-up-tag">Example</span>
          <div className="ax-up-dim" aria-hidden="true">
            <Preview kind={step.preview} />
          </div>
        </div>
        <div className="ax-up-body">
          <p className="ax-up-title">
            <i
              className="ax-up-lock"
              aria-hidden="true"
              style={{ '--ico': GLYPHS.lock } as CSSProperties}
            />
            {step.title}
          </p>
          <p className="ax-up-reward">{step.reward}</p>
          <div
            className="ax-up-meter"
            role="img"
            aria-label={`${Math.min(activeDays, step.need)} of ${step.need} work days`}
          >
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="ax-up-left">
            <strong>
              {left} more work {left === 1 ? 'day' : 'days'}
            </strong>{' '}
            to unlock
          </p>
        </div>
      </Link>
    </li>
  );
}

export interface UpcomingProps {
  activeDays: number;
  /** How many cards at most. The nearest ones, since those are the reason to come back. */
  limit?: number;
  /** Leave out the nearest few, when something above already counts down to them. */
  skip?: number;
}

export function Upcoming({ activeDays, limit = 3, skip = 0 }: UpcomingProps) {
  const ahead = milestonesAhead(activeDays).slice(skip, skip + limit);
  if (ahead.length === 0) return null;

  return (
    <section className="ax-up">
      <p className="ax-up-head">Up next</p>
      <ul className="ax-up-grid">
        {ahead.map((step) => (
          <Card key={step.need} step={step} activeDays={activeDays} />
        ))}
      </ul>
    </section>
  );
}

/** One example on its own, for a gated tab's `Building` card. */
export function ExamplePreview({ kind }: { kind: PreviewKind }) {
  return (
    <div className="ax-up-preview ax-up-preview-wide">
      <span className="ax-up-tag">Example</span>
      <div className="ax-up-dim" aria-hidden="true">
        <Preview kind={kind} />
      </div>
    </div>
  );
}

/**
 * The label on a reading that opened before it had much behind it.
 *
 * Gates open sooner than they used to (see `SOLID_AT` in ./milestones), and
 * this is the other half of that bargain: the reading shows, and says how
 * thin it is and when it firms up. Nothing at all once it is past `solidAt`.
 */
export function EarlyRead({ days, solidAt }: { days: number; solidAt: number }) {
  if (days >= solidAt) return null;
  return (
    <p className="ax-early-read">
      <span className="ax-early-chip">Early read</span>
      <span>
        From {days} work {days === 1 ? 'day' : 'days'}. It firms up around day {solidAt}.
      </span>
    </p>
  );
}
