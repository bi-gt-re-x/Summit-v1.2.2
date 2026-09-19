/**
 * The long view: where the pace leads, what it has already reached, and how it
 * compares to everybody else's.
 *
 * It used to open with a grouped-bar `ComparisonPanel` — "This period against
 * the last" — which was the same question the Trends tab's `ComparePanel`
 * answers two rows above it, from the same window, with a period picker on top.
 * Two panels, one question, one tab; the bars carried a footer link to the tab
 * they were already on. The bars went and the picker stayed.
 */
import type { CSSProperties } from 'react';
import { Panel, PanelLink, PanelNote, toneVar } from './charts';
import { GLYPHS, type GlyphName } from './glyphs';
import { rankLabel } from './score';
import type { Standing, StandingKey } from '@/services/analytics';
import type { Insight } from '@/utils/growthSummary';
import { Icon } from '@/components/Icon';

// --------------------------------------------------------------------------
// Compounding
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// Streaks
// --------------------------------------------------------------------------
export interface StreaksPanelProps {
  current: number;
  best: number;
  bestMonth: { label: string; rate: number } | null;
}

export function StreaksPanel({ current, best, bestMonth }: StreaksPanelProps) {
  return (
    <Panel title="Longest Streaks" footer={<PanelLink to="/habits">See what you actually keep up</PanelLink>}>
      <div className="ax-streaks">
        <div className="ax-streak">
          <span className="ax-streak-icon" aria-hidden="true">
            <Icon name="flame" />
          </span>
          <span className="ax-muted">Current Streak</span>
          <strong>{current} days</strong>
        </div>
        <div className="ax-streak">
          <span className="ax-streak-icon" aria-hidden="true">
            <Icon name="trophy" />
          </span>
          <span className="ax-muted">Longest Streak</span>
          <strong>{best} days</strong>
        </div>
      </div>
      {bestMonth && (
        <div className="ax-best-month">
          <span className="ax-muted">Most Consistent Month</span>
          <strong>{bestMonth.label}</strong>
          <span className="ax-muted ax-small">{bestMonth.rate}% consistency</span>
        </div>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Insights
// --------------------------------------------------------------------------
/** One drawing per tone — a finding, something to watch, and a plain note. */
const INSIGHT_GLYPH: Record<Insight['tone'], GlyphName> = {
  good: 'trend',
  watch: 'target',
  note: 'clock',
};

/**
 * The findings, most important first.
 *
 * `limit` is how many of them a panel has room to mean. `growthInsights` emits
 * in priority order — the patterns and the movement first, then the single
 * facts (best day, longest run, task and focus totals) that are true but are
 * not findings — so the top of the list is the important end of it and taking
 * the first four is taking the four that matter. The overview does exactly
 * that; the Insights tab, whose whole job is the long read, takes them all.
 */
export function InsightsPanel({ insights, limit }: { insights: Insight[]; limit?: number }) {
  const shown = limit ? insights.slice(0, limit) : insights;

  return (
    <Panel title="Key Growth Insights" footer={<PanelLink to="/insights">Read the evidence behind these</PanelLink>}>
      {shown.length === 0 ? (
        <p className="ax-empty">Not enough history in this window to find a pattern yet.</p>
      ) : (
        <ul className="ax-insights">
          {shown.map((insight) => (
            <li key={insight.headline} className={`ax-insight ax-insight-${insight.tone}`}>
              <span
                className="ax-insight-icon"
                style={{ '--ico': GLYPHS[INSIGHT_GLYPH[insight.tone]] } as CSSProperties}
                aria-hidden="true"
              />
              <div>
                <strong>{insight.headline}</strong>
                <span className="ax-muted">{insight.hint}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Where you stand
// --------------------------------------------------------------------------
export interface StandingPanelProps {
  /** From `/api/standing`. Null while it is in flight or the call failed. */
  standing: Standing | null;
}

/**
 * Percentile bars — measured across accounts, not modelled.
 *
 * This was the one panel on the page with nothing behind it: nothing on the
 * backend aggregated across users, so the four bars were constants under a
 * Sample chip. backend/tracking/standing.py does that aggregation now, and each
 * bar is a plain rank — how many comparable accounts this one is ahead of on
 * that measure, ties split.
 *
 * **The cohort size is part of the figure, not a footnote.** "Top 25%" means
 * something different out of four hundred accounts than out of four, and a
 * panel that prints the first without the second is inviting the wrong reading
 * of a number that is otherwise perfectly honest. Under the backend's floor it
 * prints no percentages at all rather than ranking a reader against one or two
 * other people.
 */
export function StandingPanel({ standing }: StandingPanelProps) {
  if (!standing) {
    return (
      <Panel title="Where You Stand" footer={STANDING_NOTE}>
        <p className="ax-empty">Working out where you stand…</p>
      </Panel>
    );
  }

  if (!standing.enough) {
    return (
      <Panel
        title="Where You Stand"
        note={`Compared to ${standing.cohort.toLocaleString()} Summit ${standing.cohort === 1 ? 'user' : 'users'}`}
        footer={STANDING_NOTE}
      >
        <p className="ax-empty">
          Not enough comparable accounts yet — this needs {standing.floor} others and there{' '}
          {standing.cohort - 1 === 1 ? 'is' : 'are'} {standing.cohort - 1}.
        </p>
      </Panel>
    );
  }

  // The claim names the measure the account places best on, because "top 12%
  // on consistency" is a fact somebody can carry away and a column of four bars
  // is a thing they have to read. The bars are still there, one click down.
  const ranked = standing.rows
    .filter((row) => row.percentile !== null && STANDING[row.key])
    .sort((a, b) => a.percentile! - b.percentile!);
  const best = ranked[0];

  return (
    <Panel
      title="Where You Stand"
      note={`Compared to ${standing.cohort.toLocaleString()} Summit ${standing.cohort === 1 ? 'user' : 'users'} with a comparable record`}
      claim={
        best ? (
          <>
            You are in the <strong>{rankLabel(best.percentile!).toLowerCase()}</strong> on{' '}
            {STANDING[best.key]!.label.toLowerCase()}, your strongest measure against everybody
            else.
          </>
        ) : undefined
      }
      footer={STANDING_NOTE}
    >
      <ul className="ax-standing">
        {standing.rows.map((row) => {
          const measure = STANDING[row.key];
          if (!measure || row.percentile === null) return null;
          return (
            <li key={row.key}>
              <span className="ax-standing-label">{measure.label}</span>
              <span className="ax-standing-track">
                <i
                  style={{
                    width: `${100 - row.percentile}%`,
                    background: toneVar(measure.tone),
                  }}
                />
              </span>
              {/* Through the same formatter as the badge on the score panel, so
                  the two places this page states a percentile state it the same
                  way — one said "Top 17.7%" beside the other's "Top 18%". And
                  `rankLabel` turns the bottom half around, because "Top 99%"
                  described this account's *worst* measure. */}
              <span className="ax-standing-rank">{rankLabel(row.percentile)}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** One note, three states — the panel says the same thing however it renders. */
const STANDING_NOTE = (
  <PanelNote label="How this is worked out">
    A <strong>plain rank</strong>, not a model — how many accounts you are ahead of on that
    measure, ties split down the middle. Only accounts with three or more days of work count.
  </PanelNote>
);

/** What each measure is called and painted, keyed by the backend's `MEASURES`. */
const STANDING: Record<StandingKey, { label: string; tone: string }> = {
  xp: { label: 'XP Earned', tone: 'violet' },
  focus: { label: 'Focus Time', tone: 'blue' },
  consistency: { label: 'Consistency', tone: 'green' },
  tasks: { label: 'Task Completion', tone: 'amber' },
  score: { label: 'Growth Score', tone: 'violet' },
};
