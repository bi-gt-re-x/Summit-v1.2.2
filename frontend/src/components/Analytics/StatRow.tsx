/**
 * The row of figures a tab opens with — every tab, one component.
 *
 * ## Why this exists
 *
 * There were four of these. Overview had `Tiles`, Trends had `TrendTiles`,
 * Habits had `HabitTiles`, Insights had `HeadlineTiles`, and they were four
 * separate implementations of the same idea written months apart. They
 * disagreed about nearly everything a reader can see:
 *
 *     the mark      a masked glyph in a tinted square, or a 9px dot, twice
 *     the figure    36px, or 26px, for reasons that were really about content
 *     the change    `<Delta>`, a hand-rolled span with the same arrows, or none
 *     the caption   a delta, or a sentence, never both, never the same slot
 *     the grid      `.ax-tiles`, `.ax-tiles-four`, `.ax-tiles-five`
 *     the spark     always, only when it has two points, or never
 *
 * None of those differences was a decision. They were four people's defaults,
 * and moving between tabs felt like moving between products because the first
 * thing on every tab was built to a different specification.
 *
 * ## What a stat can carry
 *
 * The union of what the four needed, which is smaller than it looks: a mark, a
 * label, a figure, and then at most one of a change or a sentence under it. A
 * stat states what it has and the row draws what it is given — there is no
 * variant prop, because "which tab am I on" is exactly the question that
 * produced four components in the first place.
 *
 * ## One row, one scale
 *
 * The old small face was not a stylistic choice: Insights and Habits print
 * words — "Wednesday", "Mathematics" — and a word at 36px wraps in a quarter of
 * a row. So the scale is decided from the content rather than passed in, and
 * decided **per row** rather than per stat, because a row with one big figure
 * and three small ones beside it reads as a mistake. The longest value in the
 * row sets it for all of them.
 */
import type { CSSProperties } from 'react';
import { Delta, Sparkline, type Tone } from './charts';
import { GLYPHS, type GlyphName } from './glyphs';

export interface Stat {
  key: string;
  /** The quiet line above the figure: "Consistency", "Peak hour". */
  label: string;
  /** Already formatted. This component does not know what a number means. */
  value: string;
  /** The trailing unit, set small beside the figure: "XP/day", "/ 25". */
  unit?: string;
  /**
   * The same figure as one phrase: "4 tasks", "2.3h focused", "83% completion".
   *
   * `StatRow` itself ignores this. It exists so that the digest line at the
   * top of `Collecting` — the one a reader on their second day sees before
   * anything else — can be *derived from this array* rather than assembled a
   * second time by the caller. Two lists of the same five numbers is two
   * chances to print 4 tasks above a tile reading 5.
   *
   * Optional, and absent is the normal case: only the stats worth putting in
   * a one-line summary carry one.
   */
  short?: string;
  /** Colours the mark, the sparkline and nothing else. */
  tone: Tone;
  /** A drawing for the mark. Without one the row draws a tone dot instead. */
  glyph?: GlyphName;
  /**
   * Percentage change against the row's baseline.
   *
   * `null` means there is a baseline to compare against and no earlier period
   * to be it — which `Delta` says out loud rather than printing a rise from
   * nothing as an infinite one. Omit the field entirely for a stat that has no
   * such comparison at all.
   */
  delta?: number | null;
  /** A sentence under the figure, for stats a percentage cannot describe. */
  note?: string;
  /** The `?` beside the label. Absent draws no `?`. */
  hint?: string;
  /** Drawn under everything else. Fewer than two points draws nothing. */
  series?: number[];
}

export interface StatRowProps {
  stats: Stat[];
  /**
   * What the deltas are measured against, in the window's own words — "vs
   * previous 30 days". One row, one baseline: four tiles that had each named
   * their own would be four different comparisons pretending to be a row.
   */
  compare?: string;
}

/**
 * Longer than this and the row drops to the smaller face.
 *
 * Five characters is "12.4k", "100%", "6.8" — every figure that is a number.
 * Six is where words start, and a word is what the big face cannot hold.
 */
const WIDE_VALUE = 5;

export function StatRow({ stats, compare }: StatRowProps) {
  if (stats.length === 0) return null;

  // Per row, not per stat. See the note at the top of the file.
  const wordy = stats.some((stat) => stat.value.length > WIDE_VALUE);
  const valueClass = `ax-tile-value${wordy ? ' ax-tile-value-sm' : ''}`;

  return (
    <div className="ax-tiles" style={{ '--ax-stat-n': stats.length } as CSSProperties}>
      {stats.map((stat) => (
        <article className="ax-tile" key={stat.key}>
          <header>
            {stat.glyph ? (
              <span
                className={`ax-tile-icon ax-tone-${stat.tone}`}
                style={{ '--ico': GLYPHS[stat.glyph] } as CSSProperties}
                aria-hidden="true"
              />
            ) : (
              <span className={`ax-tile-dot ax-tone-${stat.tone}`} aria-hidden="true" />
            )}
            <span className="ax-tile-label">{stat.label}</span>
            {stat.hint && (
              <span className="ax-info" title={stat.hint} aria-label={stat.hint}>
                ?
              </span>
            )}
          </header>

          <strong className={valueClass}>
            {stat.value}
            {stat.unit && <em className="ax-tile-unit">{stat.unit}</em>}
          </strong>

          {/* A change or a sentence, never both — they occupy one slot so that
              every tile in a row is the same height whichever it carries. */}
          {stat.delta !== undefined ? (
            <Delta value={stat.delta} suffix={compare ?? ''} />
          ) : stat.note ? (
            <span className="ax-muted ax-small">{stat.note}</span>
          ) : null}

          {(stat.series?.length ?? 0) > 1 && (
            <Sparkline values={stat.series!} tone={stat.tone} />
          )}
        </article>
      ))}
    </div>
  );
}
