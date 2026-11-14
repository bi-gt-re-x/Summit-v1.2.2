/**
 * The small charts on the dashboard and the analytics page, drawn in plain
 * HTML so they take the AMC pages' tokens in light and dark.
 *
 * Columns: one bar per point, the darker part a share of it (right answers of
 * those answered). Hovering, focusing or tapping a column puts its numbers in
 * the readout under the chart, which doubles as the chart's text for screen
 * readers.
 */
import { useState, type ReactNode } from 'react';

export interface Column {
  key: string;
  /** Under the column (keep it short; every few are shown on narrow charts). */
  label: string;
  value: number;
  /** The darker part of the column, out of `value`. */
  part?: number;
  /** What the readout says for this column. */
  tip: string;
}

export function Columns({
  points,
  max,
  goal,
  caption,
  idle,
  labelEvery = 1,
}: {
  points: Column[];
  max?: number;
  /** A dashed line across the chart at this value. */
  goal?: { value: number; label: string } | null;
  caption: string;
  /** The readout before anything is hovered. */
  idle?: ReactNode;
  labelEvery?: number;
}) {
  const [on, setOn] = useState<number | null>(null);
  const top = Math.max(max ?? 0, ...points.map((p) => p.value), goal?.value ?? 0, 1);
  const active = on == null ? null : points[on];
  return (
    <figure className="am-chart" onMouseLeave={() => setOn(null)}>
      <div className="am-cols" role="list" aria-label={caption}>
        {goal && (
          <span className="am-cols-goal" style={{ bottom: `${(goal.value / top) * 100}%` }} aria-hidden="true">
            <em>{goal.label}</em>
          </span>
        )}
        {points.map((p, i) => (
          <button key={p.key} type="button" role="listitem" aria-label={p.tip}
                  className={`am-col${on === i ? ' is-on' : ''}`}
                  onMouseEnter={() => setOn(i)} onFocus={() => setOn(i)} onClick={() => setOn(i)}>
            <span className="am-col-bar" style={{ height: `${(p.value / top) * 100}%` }}>
              {p.part != null && p.value > 0 && <i style={{ height: `${(p.part / p.value) * 100}%` }} />}
            </span>
          </button>
        ))}
      </div>
      <div className="am-cols-labels" aria-hidden="true">
        {points.map((p, i) => (
          <span key={p.key}>{i % labelEvery === 0 || i === points.length - 1 ? p.label : ''}</span>
        ))}
      </div>
      <figcaption className="am-chart-readout" aria-live="polite">
        {active ? active.tip : idle ?? caption}
      </figcaption>
    </figure>
  );
}

export function Legend({ items }: { items: { label: string; tone: 'strong' | 'soft' | 'goal' }[] }) {
  return (
    <ul className="am-legend">
      {items.map((it) => (
        <li key={it.label}><i className={`am-legend-${it.tone}`} aria-hidden="true" />{it.label}</li>
      ))}
    </ul>
  );
}

/** Horizontal bars with the value at the end: shares, accuracies. */
export function Bars({
  rows,
  format = (v) => `${Math.round(v)}%`,
  max = 100,
}: {
  rows: { key: string; label: ReactNode; value: number | null; hint?: string; tone?: string }[];
  format?: (value: number) => string;
  max?: number;
}) {
  return (
    <div className="am-hbars">
      {rows.map((r) => (
        <div key={r.key} className="am-hbar" title={r.hint}
             style={r.tone ? { ['--tone' as string]: `var(--am-${r.tone})` } : undefined}>
          <span className="am-hbar-label">{r.label}</span>
          <span className="am-hbar-track" aria-hidden="true">
            <i style={{ width: `${r.value == null ? 0 : Math.min(100, (r.value / max) * 100)}%` }} />
          </span>
          <span className="am-hbar-value">{r.value == null ? '—' : format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
