/**
 * The long view: where the pace leads and what it has already reached.
 *
 * It used to open with a grouped-bar `ComparisonPanel` — "This period against
 * the last" — which was the same question the Trends tab's `ComparePanel`
 * answers two rows above it, from the same window, with a period picker on top.
 * Two panels, one question, one tab; the bars carried a footer link to the tab
 * they were already on. The bars went and the picker stayed.
 */
import type { CSSProperties } from 'react';
import { Panel } from './charts';
import { GLYPHS, type GlyphName } from './glyphs';
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
    <Panel title="Longest Streaks">
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
    <Panel title="Key Growth Insights">
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
