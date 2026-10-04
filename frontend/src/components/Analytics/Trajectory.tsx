/**
 * The big chart: the account's history, this period against the last.
 *
 * The growth score panel that sat beside it is gone. The score over time, its
 * five parts and how it is worked out are the Growth tab, and
 * this row was the same answer a second time.
 */
import { AreaChart, Panel, toneVar } from './charts';
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
