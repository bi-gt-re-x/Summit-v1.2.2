/**
 * The three panels drawn from what the reader said about their finished work.
 *
 * Everything else on this page is measured off the record and is therefore
 * complete: every task has an XP value, every day has a focus total. These
 * three read the one optional thing in the app — the two star rows after a
 * completed task — and that changes what they are allowed to do.
 *
 * **Silence is not a bad score, and none of these may draw it as one.** A
 * window with nothing rated gets `QualityEmpty`: a sentence about what the
 * panel would show and how to feed it, never an empty axis or a zero. A window
 * with a few gets its figures with the sample size attached. The rule
 * throughout is that the reader is told how much of their work these describe,
 * because they chose the sample themselves and a self-selected one deserves the
 * caveat printed rather than implied.
 *
 * See utils/ratings for the arithmetic and for why quality is the product of
 * the two rows rather than their average.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Panel, PanelNote, toneVar } from './charts';
import { GLYPHS, type GlyphName } from './glyphs';
import {
  DIFFICULTY_WORDS,
  EXECUTION_WORDS,
  QUALITY_MAX,
  type QualityBand,
  type QualityCell,
  type RatingFinding,
  type RatingSummary,
} from '@/utils/ratings';
import type { RatingDepth } from '@/services/settings';

// --------------------------------------------------------------------------
// How much is asked
// --------------------------------------------------------------------------
/**
 * The three levels, on the panel whose contents they decide.
 *
 * It is a preference and it lives in Settings too, but it belongs here as
 * well: this is the one page where the difference between the three is
 * visible, and a reader looking at an empty quality panel should be able to
 * fix it from where they are standing rather than being told to go and find a
 * switch on another page. The rail's collapse button and its row in Settings
 * are the same arrangement — one preference, two places that own it.
 */
export const DEPTHS: { key: RatingDepth; label: string; hint: string }[] = [
  { key: 'none', label: 'Nothing', hint: 'Finishing a task asks nothing. Quality falls back to average XP per task.' },
  { key: 'ratings', label: 'Ratings', hint: 'Rate difficulty and how well it went.' },
  { key: 'reasons', label: '+ Reasons', hint: 'Both ratings, plus what made the difference. Adds a reasons panel to Insights.' },
];

export interface DepthPickerProps {
  value: RatingDepth;
  busy?: boolean;
  onPick: (next: RatingDepth) => void;
}

export function DepthPicker({ value, busy = false, onPick }: DepthPickerProps) {
  return (
    <div className="ax-depth" role="group" aria-label="What to ask after a finished task">
      {DEPTHS.map((depth) => (
        <button
          key={depth.key}
          type="button"
          className={`ax-depth-pick${value === depth.key ? ' is-on' : ''}`}
          aria-pressed={value === depth.key}
          title={depth.hint}
          disabled={busy}
          onClick={() => onPick(depth.key)}
        >
          {depth.label}
        </button>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// Nothing rated
// --------------------------------------------------------------------------
/**
 * What a quality panel says when the prompt has never been answered.
 *
 * Deliberately not the `Building` treatment the gated tabs use. That one counts
 * down to a date — "eleven more days" — because time is the only thing standing
 * between that account and the tab. Nothing is counting down here: rating is
 * optional, an account may never rate anything, and that is a supported way to
 * use the app rather than a state to be nagged out of. So this states what the
 * panel would show, says where the prompt appears, and stops.
 */
function QualityEmpty({
  title,
  shows,
  depth = 'ratings',
  aside,
}: {
  title: string;
  shows: string;
  depth?: RatingDepth;
  aside?: ReactNode;
}) {
  /* Two different silences, and telling them apart is the whole reason this
     takes the preference. An account that has the questions switched off is
     not going to rate anything by visiting Tasks, and pointing it there would
     be advice that cannot work — the answer is the picker in the corner of
     this panel. An account that has them on has simply skipped them, which is
     allowed and stays unnagged. */
  const off = depth === 'none';

  return (
    <Panel title={title} aside={aside}>
      <div className="ax-quality-empty">
        <p>
          <strong>{off ? 'The questions are switched off.' : 'Nothing rated in this window.'}</strong>{' '}
          {shows}
        </p>
        <p className="ax-muted">
          {off
            ? 'Ratings are off, so there is nothing to show. Turn them on above to start.'
            : 'You rate each task once, when you finish it. You can skip it.'}
        </p>
        {!off && (
          <Link to="/tasks" className="ax-btn">
            Open Tasks
          </Link>
        )}
      </div>
    </Panel>
  );
}

// --------------------------------------------------------------------------
// The headline panel
// --------------------------------------------------------------------------
export interface QualityPanelProps {
  summary: RatingSummary;
  findings: RatingFinding[];
  bands: QualityBand[];
  span: string;
  /** How much the account is being asked — see DepthPicker. */
  depth?: RatingDepth;
  /** The picker itself, rendered in the panel's title row. */
  aside?: ReactNode;
}

const FINDING_GLYPH: Record<RatingFinding['tone'], GlyphName> = {
  good: 'trend',
  watch: 'target',
  note: 'clock',
};

/**
 * The quality figure, its two halves, and what the ratings support saying.
 *
 * The two halves are printed beside the product rather than behind it because
 * the product alone is not actionable: 9 out of 25 is a 3×3 and a 1×9 does not
 * exist, but it is also a 4.5 average that could be brutal-work-going-badly or
 * easy-work-going-fine, and those need opposite responses. The bar under each
 * is out of five, which is the scale the reader answered on.
 */
export function QualityPanel({
  summary,
  findings,
  bands,
  span,
  depth,
  aside,
}: QualityPanelProps) {
  if (summary.rated === 0) {
    return (
      <QualityEmpty
        title="Quality of finished work"
        shows="How hard your work has been, and how well it went."
        depth={depth}
        aside={aside}
      />
    );
  }

  const quality = summary.quality ?? 0;
  const halves = [
    { label: 'Difficulty', value: summary.difficulty ?? 0, words: DIFFICULTY_WORDS, tone: 'amber' },
    { label: 'Execution', value: summary.execution ?? 0, words: EXECUTION_WORDS, tone: 'green' },
  ];

  return (
    <Panel
      title="Quality of finished work"
      aside={aside}
      note={`${summary.rated} rated task${summary.rated === 1 ? '' : 's'} in ${span}`}
      footer={
        <PanelNote label="What this measures">
          Difficulty <strong>×</strong> execution, averaged over the tasks you rated. The product,
          not the average — <strong>25</strong> is a brutal task done excellently, and there is no
          other route to it.
          <br />
          <br />
          Rating is optional. Skipped tasks are absent, not zero.
        </PanelNote>
      }
    >
      <div className="ax-quality-head">
        <strong className="ax-big">
          {quality.toFixed(1)}
          <em className="ax-tile-unit">/ {QUALITY_MAX}</em>
        </strong>
        <span className="ax-muted">
          Rated {summary.rated} of {summary.finished} finished ({summary.coverage}%)
        </span>
      </div>

      <ul className="ax-quality-halves">
        {halves.map((half) => (
          <li key={half.label}>
            <span className="ax-quality-half-label">{half.label}</span>
            <span className="ax-factor-track">
              <i
                style={{
                  width: `${(half.value / 5) * 100}%`,
                  background: toneVar(half.tone),
                }}
              />
            </span>
            <span className="ax-quality-half-value">
              {half.value.toFixed(1)}
              <em>/ 5 · {half.words[Math.max(0, Math.round(half.value) - 1)]}</em>
            </span>
          </li>
        ))}
      </ul>

      <ul className="ax-quality-bands">
        {bands.map((band) => (
          <li key={band.label} title={band.hint}>
            <i className="ax-dot" style={{ background: toneVar(band.tone) }} />
            <span className="ax-quality-band-label">{band.label}</span>
            <span className="ax-quality-band-share">{band.share}%</span>
            <span className="ax-muted ax-small">
              {band.count} {band.count === 1 ? 'task' : 'tasks'}
            </span>
          </li>
        ))}
      </ul>

      <ul className="ax-insights">
        {findings.map((finding) => (
          <li key={finding.headline} className={`ax-insight ax-insight-${finding.tone}`}>
            <span
              className="ax-insight-icon"
              style={{ '--ico': GLYPHS[FINDING_GLYPH[finding.tone]] } as CSSProperties}
              aria-hidden="true"
            />
            <div>
              <strong>{finding.headline}</strong>
              <span className="ax-muted">{finding.hint}</span>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// --------------------------------------------------------------------------
// The grid
// --------------------------------------------------------------------------
export interface QualityGridPanelProps {
  cells: QualityCell[];
  summary: RatingSummary;
  /** So an empty grid can tell "skipped" apart from "switched off". */
  depth?: RatingDepth;
}

/**
 * Where every rated task landed, difficulty across against execution up.
 *
 * The one picture in this app that could not be drawn from the record, and the
 * whole argument for asking the question. Two accounts with identical XP,
 * identical streaks and identical task counts can have opposite grids: one
 * clustered bottom-right — hard work, going well — and one top-left, which is
 * easy work going badly and needs a completely different response.
 *
 * All 25 cells are drawn including the empty ones, because the empty regions
 * are half the finding. An account with nothing in the right-hand columns has
 * not attempted anything hard, and a grid that only drew where the tasks are
 * would hide exactly that.
 */
export function QualityGridPanel({ cells, summary, depth }: QualityGridPanelProps) {
  if (summary.rated === 0) {
    return (
      <QualityEmpty
        title="Difficulty against execution"
        shows="Where your rated tasks land."
        depth={depth}
      />
    );
  }

  const peak = Math.max(...cells.map((cell) => cell.count), 1);

  return (
    <Panel
      title="Difficulty against execution"
      note="Darker is more tasks"
      claim={
        summary.difficulty === null || summary.execution === null ? (
          <>
            Where your <strong>{summary.rated}</strong> rated{' '}
            {summary.rated === 1 ? 'task' : 'tasks'} landed.
          </>
        ) : (
          <>
            Across <strong>{summary.rated}</strong> rated{' '}
            {summary.rated === 1 ? 'task' : 'tasks'} you rate difficulty{' '}
            <strong>{summary.difficulty.toFixed(1)}</strong> and execution{' '}
            <strong>{summary.execution.toFixed(1)}</strong> — the grid says whether that is one
            habit or several.
          </>
        )
      }
      footer={
        <PanelNote label="How to read this">
          Difficulty runs left to right, execution bottom to top. Bottom-right is hard work going
          badly; top-right is hard work going well. Watch the <strong>top-left</strong> — easy work
          done well, comfortable and no longer stretching you.
          <br />
          <br />
          Only your {summary.rated} rated tasks appear.
        </PanelNote>
      }
    >
      <div className="ax-qgrid">
        <span className="ax-qgrid-y" aria-hidden="true">
          Execution →
        </span>
        <div className="ax-qgrid-cells" role="img" aria-label="Rated tasks by difficulty and execution">
          {cells.map((cell) => (
            <span
              key={`${cell.difficulty}-${cell.execution}`}
              className={`ax-qgrid-cell${cell.count === 0 ? ' is-empty' : ''}`}
              // Shaded by how many tasks landed here against the busiest cell,
              // with a floor so a single task is never invisible — the same
              // rule the consistency heatmap uses for a 5 XP day.
              style={
                {
                  '--fill': cell.count ? Math.max(0.18, cell.count / peak) : 0,
                } as CSSProperties
              }
              title={`${DIFFICULTY_WORDS[cell.difficulty - 1]} · ${
                EXECUTION_WORDS[cell.execution - 1]
              } — ${cell.count} ${cell.count === 1 ? 'task' : 'tasks'}, worth ${cell.quality}/${QUALITY_MAX}`}
            >
              {cell.count > 0 ? cell.count : ''}
            </span>
          ))}
        </div>
        <div className="ax-qgrid-x" aria-hidden="true">
          {DIFFICULTY_WORDS.map((word) => (
            <span key={word}>{word}</span>
          ))}
        </div>
      </div>
    </Panel>
  );
}


