/**
 * The Insights tab's opening: your overall state, in one screen.
 *
 * The tab used to open on four behavioural tiles — strongest day, peak hour,
 * typical sitting, widest subject. Every one of them is true and none of them is
 * what a reader wants first: they are details about *how* the work happens, and
 * they were sitting where the answer to "how am I doing" belongs. Those tiles
 * have moved down to the group about when and what you work on, which is what
 * they were always describing.
 *
 * What opens the tab now is two rows, and the order between them is the point:
 *
 *     the four metrics    performance, consistency, efficiency, quality —
 *                         the report card's own numbers, each with its band
 *                         and the measurement behind it
 *     the four movements  streak, this week against last, the biggest
 *                         improvement, the biggest weakness
 *
 * The metrics say where the account stands and the movements say which way it is
 * going, and a reader who reads only the first row has still had the question
 * answered.
 *
 * ## The meters are the report card, not a second opinion
 *
 * Every figure in the top row is a `ScorePart` from utils/analyticalScore, which
 * is the mean the Growth Score tile prints divided by ten. There is one scoring
 * computation in this app and this draws it — see that module's note on why a
 * second formula would need a different name. The bar is the same 0-100 the
 * letter comes from, so a reader cannot find a full bar under a D.
 *
 * `focus` is the fifth part of that mean and is deliberately not drawn here.
 * Four meters is a row; five is a table, and focus is the one metric whose raw
 * line ("41% of your focus goal") is about a target the reader set rather than
 * about the work they did. The Overview tab draws all five.
 */
import type { CSSProperties } from 'react';
import { StatRow, type Stat } from '@/components/Analytics';
import { GRADE_MEANING, type AnalyticalScore, type ScorePart } from '@/utils/analyticalScore';
import type { MetricName } from '@/types';

/** The four drawn, in the order they are read. */
const SHOWN: readonly MetricName[] = ['productivity', 'consistency', 'efficiency', 'quality'];

/**
 * What each meter is called here.
 *
 * "Productivity" is the report card's own word for it and "Performance" is the
 * reader's — this row is the one place the two meet, so the label is the
 * reader's and the number underneath is unchanged. Every other surface keeps
 * the backend's name, which is why this map lives here rather than in
 * utils/analyticalScore.
 */
const HEADINGS: Partial<Record<MetricName, string>> = {
  productivity: 'Performance',
};

/** Which tone a score gets. Bands, not a gradient — the letters are banded too. */
function toneFor(score: number): string {
  if (score >= 80) return 'green';
  if (score >= 60) return 'blue';
  if (score >= 40) return 'amber';
  return 'pink';
}

function Meter({ part }: { part: ScorePart }) {
  const tone = toneFor(part.score);
  return (
    <article className={`ax-meter ax-tone-${tone}`}>
      <header>
        <span className="ax-meter-label">{HEADINGS[part.name] ?? part.label}</span>
        <strong className="ax-meter-value">{Math.round(part.score)}</strong>
      </header>
      {/* The bar is the figure again rather than a decoration, so it carries
          the same value to a screen reader and the same width to everybody
          else. */}
      <div
        className="ax-meter-track"
        role="meter"
        aria-valuenow={Math.round(part.score)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${HEADINGS[part.name] ?? part.label} ${Math.round(part.score)} out of 100`}
        style={{ '--ax-fill': `${Math.max(2, Math.min(100, part.score))}%` } as CSSProperties}
      >
        <span className="ax-meter-fill" />
      </div>
      <p className="ax-meter-raw">{part.raw}</p>
    </article>
  );
}

export interface StateOverviewProps {
  /** The report card's five parts, its total and its letter. */
  analytical: AnalyticalScore;
  /** Consecutive days worked, from the account's stats. */
  streak: number;
  /**
   * The last 7 days against the 7 before, as a signed percentage, or null when
   * there is no previous week to compare with.
   */
  weekChange: number | null;
  /** The biggest measured improvement, already worded. */
  improvement: { text: string; figure: string } | null;
  /** The weakest metric, and the sentence naming what is behind it. */
  weakness: { label: string; score: number; note: string } | null;
}

export function StateOverview({
  analytical,
  streak,
  weekChange,
  improvement,
  weakness,
}: StateOverviewProps) {
  const parts = SHOWN.map((name) => analytical.parts.find((part) => part.name === name)).filter(
    (part): part is ScorePart => Boolean(part),
  );

  /*
   * The movements. Four tiles, and each one is a different kind of answer —
   * a count, a percentage, and two findings in words — which is why the row
   * drops to the small face: see `WIDE_VALUE` in StatRow.
   *
   * A tile is left out rather than drawn as a dash when its figure does not
   * exist yet. An account with no second week has no weekly change, and "—"
   * under a label reads as a measurement of nothing rather than as an absence.
   */
  const stats: Stat[] = [
    {
      key: 'streak',
      label: 'Current streak',
      value: `${streak}`,
      unit: streak === 1 ? 'day' : 'days',
      tone: 'amber',
      glyph: 'flame',
      note: streak > 0 ? 'Consecutive days with work on them' : 'No days in a row yet',
    },
  ];
  if (weekChange !== null) {
    stats.push({
      key: 'week',
      label: 'Weekly change',
      value: `${weekChange > 0 ? '+' : weekChange < 0 ? '−' : ''}${Math.abs(Math.round(weekChange))}%`,
      tone: weekChange >= 0 ? 'green' : 'pink',
      glyph: 'trend',
      note: 'XP against the 7 days before',
    });
  }
  if (improvement) {
    stats.push({
      key: 'best',
      label: 'Biggest improvement',
      value: improvement.figure,
      tone: 'violet',
      glyph: 'rocket',
      note: improvement.text,
    });
  }
  if (weakness) {
    stats.push({
      key: 'weakest',
      label: 'Biggest weakness',
      value: weakness.label,
      tone: 'pink',
      glyph: 'target',
      note: weakness.note,
    });
  }

  return (
    <div className="ax-state">
      {parts.length > 0 && (
        <>
          <div className="ax-meters">
            {parts.map((part) => (
              <Meter key={part.name} part={part} />
            ))}
          </div>
          {analytical.value !== null && analytical.grade && (
            <p className="ax-state-score">
              <strong>{analytical.value}</strong> out of 100 overall
              <span className="ax-state-grade">{analytical.grade}</span>
              <span className="ax-muted">{GRADE_MEANING[analytical.grade]}</span>
            </p>
          )}
        </>
      )}
      <StatRow stats={stats} />
    </div>
  );
}
