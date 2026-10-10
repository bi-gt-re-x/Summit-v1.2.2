/**
 * The account's own aim, and the panel that measures against it.
 *
 * A baseline is the part of this page that does not need history, because the
 * account states it rather than the page measuring it. Every other panel here
 * needs weeks of record before it means anything — two weeks for a
 * recommendation, three for a habit or a trend, four for an explanation. That
 * is correct and it is not negotiable: the analysis is only worth reading
 * because it refuses to speak early. But it left a new reader with a page of
 * countdowns and no reason to be on it, and three questions answerable on day
 * one fix that: from day two every tab has something to compare against, not
 * "you worked four days" but "you worked four of the five you meant to".
 *
 * ## Where the questions went
 *
 * They used to be asked by a `BaselineSetup` in this file — three of them, on
 * one card, with a comment arguing that the moment it needed a second screen it
 * had stopped being the thing somebody does on day one. It has four more
 * questions now and they are not more of the same kind, so the argument does
 * not carry; see the header of ./Setup, which took the three over and states
 * the case. This file kept the type they answer into and the panel that reads
 * it, which is everything about the baseline that is not the asking.
 */
import { Panel } from './charts';
import { verdict } from '@/utils/analyticsPrefs';
import type { AnalyticsTone } from '@/services/settings';

export interface BaselineValues {
  active_days: number;
  session_minutes: number;
  focus_subject: string;
}

// --------------------------------------------------------------------------
// What the baseline is for
// --------------------------------------------------------------------------
export interface BaselinePanelProps {
  /** What the account said it was aiming at. */
  aim: BaselineValues;
  /** The day the aim was set, ISO — a stale baseline should read as stale. */
  setOn: string;
  /** Days worked out of days in the window, 0-100. From `rhythmShape`. */
  activeRate: number;
  /** Focus minutes on a day that had any, averaged. From `rhythmShape`. */
  typicalSession: number;
  /** What the window covers, in the page's own words. */
  span: string;
  /**
   * How blunt the verdict beside each row is allowed to be.
   *
   * It moves the line between "near enough" and "short" and nothing else —
   * the percentage, the bar and the two figures are identical at every
   * setting. See utils/analyticsPrefs for why that boundary is where it is.
   */
  tone?: AnalyticsTone;
  onEdit: () => void;
}

/** A ratio as a percentage of its target, capped for the bar but not the text. */
function against(actual: number, target: number): number {
  if (target <= 0) return 0;
  return Math.round((actual / target) * 100);
}

/**
 * The account's own aim, against what actually happened.
 *
 * This is the payoff for the setup screen and the reason the baseline is worth
 * storing at all. Every other figure on this page is an absolute — you worked
 * four days, your sittings ran 38 minutes — and an absolute cannot be good or
 * bad on its own. Four days is excellent against a three-day aim and a miss
 * against a six-day one, and until the account said which, the page had no way
 * to tell the difference and did not try.
 *
 * It states the comparison and stops. No grade, no encouragement, no colour
 * beyond the bar: the reader set the target, so they are the one qualified to
 * say whether missing it matters.
 */
export function BaselinePanel({
  aim,
  setOn,
  activeRate,
  typicalSession,
  span,
  tone,
  onEdit,
}: BaselinePanelProps) {
  // The aim is days-a-week; the measurement is a percentage of days in a window
  // of any length. Both become "share of days", which is the only footing the
  // two actually share.
  const aimedRate = (aim.active_days / 7) * 100;
  const daysPct = against(activeRate, aimedRate);
  const sessionPct = against(typicalSession, aim.session_minutes);

  // Roughly how many of seven days were worked, for a sentence that reads in
  // the same unit the reader answered in.
  const workedPerWeek = Math.round((activeRate / 100) * 7 * 10) / 10;

  const rows = [
    {
      key: 'days',
      label: 'Days a week',
      actual: `${workedPerWeek}`,
      target: `aimed ${aim.active_days}`,
      pct: daysPct,
    },
    {
      key: 'session',
      label: 'Sitting',
      actual: typicalSession > 0 ? `${Math.round(typicalSession)} min` : '—',
      target: `aimed ${aim.session_minutes}`,
      pct: sessionPct,
    },
  ];

  return (
    <Panel
      title="Against your baseline"
      note={span}
      aside={
        <button type="button" className="ax-baseline-edit" onClick={onEdit}>
          Edit
        </button>
      }
    >
      <ul className="ax-baseline-rows">
        {rows.map((row) => {
          /* The word beside the bar, and the only thing on this panel the
             harshness setting touches. Both figures and the percentage are
             the same at every tone; what moves is where "short" begins. */
          const said = verdict(tone, row.pct);
          return (
          <li key={row.key}>
            <div className="ax-baseline-row-head">
              <span className="ax-baseline-row-label">{row.label}</span>
              <span className="ax-baseline-row-actual">
                {row.actual} <em>({row.target})</em>
              </span>
            </div>
            <span className="ax-baseline-row-track">
              <i
                className={`ax-baseline-row-fill${row.pct >= 100 ? ' is-met' : ''}`}
                style={{ width: `${Math.max(2, Math.min(100, row.pct))}%` }}
              />
            </span>
            <span className="ax-baseline-row-pct">{row.pct}%</span>
            <span className={`ax-baseline-row-said${said.met ? ' is-met' : ''}`}>
              {said.label}
            </span>
          </li>
          );
        })}
      </ul>
      <p className="ax-baseline-row-foot">
        Set{' '}
        {setOn
          ? new Date(`${setOn}T00:00:00`).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })
          : 'earlier'}
      </p>
    </Panel>
  );
}
