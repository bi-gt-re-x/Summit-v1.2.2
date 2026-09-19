/**
 * The big chart, and the score panel beside it.
 *
 * Two panels rather than one because they answer different questions: the
 * trajectory is the account's history and the score is where that history has
 * got it to. Both are the account's own arithmetic — the one thing on either
 * that is not is the score line's *shape*, which is generated because no
 * endpoint reads the score's history back yet, and the note under it says so.
 */
import { AreaChart, Delta, Panel, PanelNote, toneVar } from './charts';
import { ScoringDetails } from './ScoringDetails';
import {
  METRICS,
  axisMarks,
  pointLabel,
  bucketed,
  grainWithin,
  grainsFor,
  metricOption,
  type Grain,
  type MetricKey,
} from './data';
import { formatPercentile, percentileLabel, type ScoreFactor } from './score';
import { compact } from '@/utils/growthSummary';
import type { GrowthDay } from '@/types';

// --------------------------------------------------------------------------
// Trajectory
// --------------------------------------------------------------------------
export interface TrajectoryProps {
  current: GrowthDay[];
  previous: GrowthDay[];
  metric: MetricKey;
  onMetric: (key: MetricKey) => void;
  grain: Grain;
  onGrain: (grain: Grain) => void;
  /** "Jul 3, 2024 – Jul 3, 2026", for the legend under the chart. */
  spanLabel: string;
  previousSpanLabel: string;
}

/** Five evenly-spaced labels down the axis, largest first. */
function axisTicks(max: number, format: (value: number) => string): string[] {
  const out: string[] = [];
  for (let step = 5; step >= 0; step--) out.push(format((max / 5) * step));
  return out;
}

export function Trajectory({
  current,
  previous,
  metric,
  onMetric,
  grain,
  onGrain,
  spanLabel,
  previousSpanLabel,
}: TrajectoryProps) {
  const option = metricOption(metric);
  /*
   * The grain the window can actually draw, which is not always the one the
   * reader last picked. Held here rather than pushed back into the page's state
   * on purpose: the state means "the grain I want", and a reader who chooses
   * Monthly at 1Y and then looks at a week should get their monthly view back
   * when they return to 1Y rather than have the narrow window quietly rewrite
   * the preference. See `grainWithin`.
   */
  const grains = grainsFor(current.length);
  const active = grainWithin(grain, current.length);
  const now = bucketed(current, option, active);
  const before = bucketed(previous, option, active);
  const peak = Math.max(...now.map((p) => p.value), ...before.map((p) => p.value), 1);

  return (
    <Panel
      title="Productivity, consistency and quality over time"
      note="This period against the last, day for day"
      aside={
        <label className="ax-select-wrap">
          <span className="ax-sr">Chart grain</span>
          <select
            className="ax-select"
            value={active}
            onChange={(event) => onGrain(event.target.value as Grain)}
          >
            {grains.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      }
    >
      {/*
        `aria-pressed`, not `role="tab"`.

        These were tabs, and the role was a promise the markup did not keep:
        `role="tab"` commits to a `tabpanel` named by `aria-controls` and to
        arrow-key movement across the set, and there was neither — so a screen
        reader announced "tab, 1 of 5" and the arrow keys did nothing. They are
        not tabs anyway; nothing is swapped, the same chart redraws for a
        different series. Every other chip group on this page — the window
        picker in Header, the budget row in NextActions — is a pressed toggle,
        and these are the same component.
      */}
      <div className="ax-chips ax-chips-inline" role="group" aria-label="Chart series">
        {METRICS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-pressed={entry.key === metric}
            className={`ax-chip${entry.key === metric ? ' is-on' : ''}`}
            onClick={() => onMetric(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <AreaChart
        id="ax-traj"
        height={220}
        label={`${option.label} across ${spanLabel}, against the period before it`}
        /* The metric's own formatter, not the axis one. `option.axis` drops the
           unit because a tick is repeated six times up the left edge and has no
           room for it; the readout names one point once, and "1,240" without
           "XP" on it is the reader having to remember which chip is pressed. */
        readout={{
          labels: now.map((point) => pointLabel(point.date)),
          names:
            before.length > 1
              ? [`This period (${spanLabel})`, `Previous period (${previousSpanLabel})`]
              : [`This period (${spanLabel})`],
          format: option.format,
        }}
        series={[
          { values: now.map((point) => point.value), tone: 'violet' },
          ...(before.length > 1
            ? [{ values: before.map((point) => point.value), tone: 'violet' as const, muted: true }]
            : []),
        ]}
        ticks={axisTicks(peak, option.axis ?? compact)}
        marks={axisMarks(now.map((point) => point.date), 8)}
      />

      <div className="ax-legend">
        <span className="ax-legend-item">
          <i className="ax-legend-line" style={{ background: toneVar('violet') }} />
          This Period ({spanLabel})
        </span>
        {before.length > 1 && (
          <span className="ax-legend-item">
            <i className="ax-legend-line ax-legend-muted" />
            Previous Period ({previousSpanLabel})
          </span>
        )}
      </div>
    </Panel>
  );
}

// --------------------------------------------------------------------------
// Growth score
// --------------------------------------------------------------------------
export interface ScorePanelProps {
  score: number | null;
  /** The five metrics the score is the mean of. See ./score. */
  factors: ScoreFactor[];
  series: number[];
  marks: string[];
  /**
   * When each reading was taken, one per point of `series`.
   *
   * Separate from `marks`, which is four labels for however many readings there
   * are — "First reading", two blanks, "Now". That is the right x axis for a
   * line whose points are irregular visits, and it is useless to a readout: a
   * reader pointing at the fourth of nine readings is told the empty string.
   */
  dates: string[];
  /**
   * The measured placement from `/api/standing`, when there is one.
   *
   * Null falls back to the modelled band. See the note on the panel for why
   * this argument exists at all rather than the badge simply reading the model.
   */
  percentile?: number | null;
}

/**
 * The score, the five parts it is made of, and where it places.
 *
 * The parts are on the panel rather than behind the "how it's calculated" link
 * because a single figure out of ten is not actionable: 6.5 says nothing about
 * *which* of the five is holding it there, and the reader's next question is
 * always which one to go and work on. Printed with the measured quantity beside
 * each — "22/30 days active", not "Consistency 73" — since the score is the
 * abstraction and the measurement is the thing they can change.
 *
 * **The band under the score is measured where it can be and modelled where it
 * cannot.** It reads the same rank the "Where You Stand" panel prints, from
 * `/api/standing`, whenever the instance has enough comparable accounts to
 * produce one. Before that endpoint existed it was always modelled — a
 * placement against a stated distribution, from the score itself — and it still
 * is on an instance too small to rank against, because a band that disappeared
 * on a new install would take the reader's only sense of scale with it.
 *
 * The distinction is not cosmetic and the badge does not hide it: the tooltip
 * says which of the two the reader is looking at. Two figures on one page both
 * labelled "of Summit users", one counted and one modelled, is exactly the sort
 * of quiet disagreement this file is arranged to prevent — the panel and
 * `StandingPanel` now state one number.
 */
export function ScorePanel({
  score,
  factors,
  series,
  marks,
  dates,
  percentile,
}: ScorePanelProps) {
  const measured = percentile ?? null;
  const band = measured === null ? percentileLabel(score) : `Top ${formatPercentile(measured)}%`;

  return (
    <Panel
      title="Growth Score Over Time"
      /* `ScoringDetails` was written for this and then never mounted anywhere —
         exported, documented, orphaned. It is the honest destination for this
         footer, and opening it in place beats sending a reader to a page that
         would only hold the same five paragraphs. */
      footer={
        <PanelNote label="How this is calculated">
          <ScoringDetails />
        </PanelNote>
      }
    >
      <div className="ax-score-head">
        <div>
          <strong className="ax-score-value">
            {score === null ? '—' : score.toFixed(1)}
            <em className="ax-tile-unit">/10</em>
          </strong>
          <p className="ax-muted">Your current growth score</p>
          <Delta value={null} suffix="" />
        </div>
        {band && (
          <div
            className="ax-percentile"
            title={
              measured === null
                ? 'Where this score sits in the modelled distribution of Summit growth scores — 5.0 is the middle, and the scale runs from top 99.9% to top 0.1%.'
                : 'Counted, not modelled: this score ranked against every other account with a comparable record. The same figure the "Where You Stand" panel prints.'
            }
          >
            <span className="ax-percentile-icon" aria-hidden="true" />
            <strong>{band}</strong>
            <span>of Summit users</span>
          </div>
        )}
      </div>

      {factors.length > 0 && (
        <ul className="ax-factors">
          {factors.map((factor) => (
            <li className="ax-factor" key={factor.name}>
              <span className="ax-factor-label">{factor.label}</span>
              <span className="ax-factor-track">
                <i style={{ width: `${Math.max(0, Math.min(100, factor.score))}%` }} />
              </span>
              <span className="ax-factor-raw">{factor.raw}</span>
              <span className="ax-factor-score">
                +{factor.contribution.toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Two readings or none. This panel used to draw a generated climb when
          the account had no recorded history — a plausible curve with the real
          score pinned on its last point, disclaimed in the sentence below. It
          was the last invented figure on the page and it lived on the one tab
          that never carried a Sample chip, which made it the easiest thing here
          to mistake for a measurement. A panel titled "over time" with nothing
          to draw now says that, which is shorter and true. */}
      {series.length >= 2 ? (
        <AreaChart
          id="ax-score"
          height={130}
          label="Your growth score at each reading, out of ten"
          readout={{
            labels: dates,
            names: ['Growth score'],
            format: (value) => `${value.toFixed(1)} out of 10`,
          }}
          series={[{ values: series, tone: 'violet' }]}
          ticks={['10', '8', '6', '4', '2', '0']}
          marks={marks}
        />
      ) : (
        <p className="ax-score-nohistory">
          No trend yet. Your score is saved each time you open this page, and a trend needs at least
          two.
        </p>
      )}

      <p className="ax-panel-note ax-panel-note-foot">
        The mean of the five report-card metrics, each worth up to 2.0 of the ten.
        {series.length >= 2 && ' Each point is a reading taken when you opened this page.'}
      </p>
    </Panel>
  );
}
