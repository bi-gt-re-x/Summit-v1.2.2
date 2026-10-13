/**
 * The small read-only charts live blocks are drawn with.
 *
 * Every one fills the width it is given and keeps its words in HTML, so a
 * narrow column squeezes the plot and not the labels. The plots are SVG drawn
 * on a 0–100 box with `preserveAspectRatio="none"`, and their strokes are
 * `non-scaling-stroke`, so a line is the same weight at any width.
 *
 * Colours are the chart palette on `.sp-live` (styles/spaces.css).
 */
import type { CSSProperties, ReactNode } from 'react';
import { arcPath, slices } from './chart';
import { signed } from './live';

export const colorVar = (at: number): string => `var(--sp-chart-${((at % 8) + 8) % 8})`;

export const num = (value: number): string =>
  Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 });

/** A progress bar, 0 to 100. */
export function Bar({ share, label, color }: { share: number; label: string; color?: string }) {
  const pct = Math.max(0, Math.min(100, share));
  return (
    <div className="sp-live-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }} />
    </div>
  );
}

/** One figure with its name, and a change beside it when there is one. */
export function Stat({ value, label, change, hint }: { value: string; label: string; change?: number | null; hint?: string }) {
  const sign = signed(change);
  return (
    <div className="sp-live-stat" title={hint}>
      <strong>{value}</strong>
      <span>{label}</span>
      {sign && <em className={change! >= 0 ? 'is-up' : 'is-down'}>{sign}</em>}
    </div>
  );
}

export function Stats({ children }: { children: ReactNode }) {
  return <div className="sp-live-stats">{children}</div>;
}

/** A short sentence of what the numbers mean. */
export function Insight({ children }: { children: ReactNode }) {
  return <p className="sp-live-insight">{children}</p>;
}

const scaleOf = (values: number[], extra: number[] = []) => Math.max(1, ...values, ...extra);

/** A path through `values` on the 0–100 box, `top` being the highest value. */
function pathOf(values: number[], top: number, height = 100): string {
  const n = values.length;
  return values
    .map((v, i) => `${i ? 'L' : 'M'} ${n === 1 ? 50 : (i / (n - 1)) * 100} ${height - (Math.max(0, v) / top) * (height - 4)}`)
    .join(' ');
}

export interface Series {
  values: number[];
  kind: 'line' | 'area' | 'dash';
  color?: string;
  label: string;
}

/** Lines and areas sharing one scale. The first series is the main one. */
export function LineChart({ series, from, to, title, height = 120 }: { series: Series[]; from: string; to: string; title: string; height?: number }) {
  const top = scaleOf(series.flatMap((one) => one.values));
  return (
    <figure className="sp-live-plot" aria-label={title}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }} role="img" aria-label={title}>
        {[25, 50, 75].map((y) => <line key={y} className="sp-live-grid" x1="0" x2="100" y1={y} y2={y} vectorEffect="non-scaling-stroke" />)}
        {series.map((one, at) => {
          const d = pathOf(one.values, top);
          const color = one.color ?? colorVar(at === 0 ? 0 : at + 3);
          return (
            <g key={one.label} style={{ '--c': color } as CSSProperties}>
              {one.kind === 'area' && <path className="sp-live-fill" d={`${d} L 100 100 L 0 100 Z`} />}
              <path className={one.kind === 'dash' ? 'sp-live-stroke is-dash' : 'sp-live-stroke'} d={d} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
      </svg>
      <figcaption className="sp-live-axis">
        <span>{from}</span>
        {series.length > 1 && (
          <span className="sp-live-legend">
            {series.map((one, at) => (
              <span key={one.label} style={{ '--c': one.color ?? colorVar(at === 0 ? 0 : at + 3) } as CSSProperties} className={one.kind === 'dash' ? 'is-dash' : ''}>
                {one.label}
              </span>
            ))}
          </span>
        )}
        <span>{to}</span>
      </figcaption>
    </figure>
  );
}

/** Upright bars, with an optional line over them (a trend, an average). */
export function Columns({
  values,
  labels,
  title,
  overlay,
  overlayLabel,
  mark,
  height = 130,
  format = num,
}: {
  values: number[];
  labels: string[];
  title: string;
  overlay?: number[];
  overlayLabel?: string;
  /** Which bar to draw in the main colour; the rest are lighter. Defaults to the last. */
  mark?: number;
  height?: number;
  format?: (value: number) => string;
}) {
  const top = scaleOf(values, overlay);
  const marked = mark ?? values.length - 1;
  const many = values.length > 14;
  return (
    <figure className="sp-live-plot" aria-label={title}>
      <div className="sp-live-columns" style={{ height }} role="img" aria-label={`${title}: ${values.map((v, i) => `${labels[i] ?? ''} ${format(v)}`).join(', ')}`}>
        {values.map((value, i) => (
          <div key={i} className={`sp-live-column${i === marked ? ' is-mark' : ''}`} title={`${labels[i] ?? ''}: ${format(value)}`}>
            {!many && <span className="sp-live-column-num">{value ? format(value) : ''}</span>}
            <span className="sp-live-column-fill" style={{ height: `${(Math.max(0, value) / top) * 100}%` }} />
          </div>
        ))}
        {overlay && overlay.length > 1 && (
          <svg className="sp-live-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path
              className="sp-live-stroke is-dash"
              style={{ '--c': colorVar(3) } as CSSProperties}
              d={overlay.map((v, i) => `${i ? 'L' : 'M'} ${((i + 0.5) / overlay.length) * 100} ${100 - (Math.max(0, v) / top) * 100}`).join(' ')}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>
      <figcaption className="sp-live-column-labels">
        {labels.map((label, i) => (
          <span key={i}>{many && i % Math.ceil(values.length / 8) ? '' : label}</span>
        ))}
      </figcaption>
      {overlay && overlayLabel && <span className="sp-live-overlay-key">{overlayLabel}</span>}
    </figure>
  );
}

/** Bars lying down, one per row, each with its own figure. */
export function HBars({ rows, title, max }: { rows: Array<{ label: string; value: number; display?: string; color?: string; note?: ReactNode }>; title: string; max?: number }) {
  const top = max ?? scaleOf(rows.map((row) => row.value));
  return (
    <ul className="sp-live-hbars" aria-label={title}>
      {rows.map((row, i) => (
        <li key={`${row.label}-${i}`}>
          <span className="sp-live-hbar-name" title={row.label}>{row.label}</span>
          <span className="sp-live-hbar-track">
            <span style={{ width: `${(Math.max(0, row.value) / top) * 100}%`, background: row.color ?? colorVar(i) }} />
          </span>
          <span className="sp-live-hbar-num">{row.display ?? num(row.value)}</span>
          {row.note}
        </li>
      ))}
    </ul>
  );
}

/** A pie, or a donut with something in the middle. */
export function Donut({ rows, hole, center, title }: { rows: Array<{ label: string; value: number }>; hole: boolean; center?: ReactNode; title: string }) {
  const size = 160;
  const c = size / 2;
  const r = 74;
  const parts = slices(rows.map((row) => ({ label: row.label, value: row.value })));
  return (
    <div className="sp-live-donut">
      <div className="sp-live-donut-box">
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${title}: ${rows.map((row, i) => `${row.label} ${Math.round((parts[i]?.share ?? 0) * 100)}%`).join(', ')}`}>
          {parts.map((part, i) => (
            <path key={i} className="sp-live-slice" style={{ fill: colorVar(i) }} d={arcPath(c, r, hole ? r * 0.6 : 0, part.from, part.to)} />
          ))}
        </svg>
        {hole && center && <div className="sp-live-donut-center">{center}</div>}
      </div>
      <ul className="sp-live-key">
        {rows.map((row, i) => (
          <li key={`${row.label}-${i}`} style={{ '--c': colorVar(i) } as CSSProperties}>
            <span className="sp-chart-swatch" aria-hidden="true" />
            <span className="sp-live-key-name">{row.label}</span>
            <span className="sp-live-key-num">{Math.round((parts[i]?.share ?? 0) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A ring that fills to `share` percent, with words in the middle. */
export function Ring({ share, size = 120, label, children, color }: { share: number; size?: number; label: string; children?: ReactNode; color?: string }) {
  const r = 42;
  const around = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, share));
  return (
    <div className="sp-live-ring" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(pct)}%`}>
      <svg viewBox="0 0 100 100">
        <circle className="sp-live-ring-track" cx="50" cy="50" r={r} />
        <circle
          className="sp-live-ring-fill"
          cx="50"
          cy="50"
          r={r}
          style={{ strokeDasharray: `${(pct / 100) * around} ${around}`, ...(color ? { stroke: color } : {}) }}
        />
      </svg>
      <div className="sp-live-ring-words">{children}</div>
    </div>
  );
}

/** Cells shaded 0–4, laid out in columns of `rows`. */
export function HeatGrid({ cells, rows, title, rowLabels }: { cells: Array<{ key: string; level: number; tip: string } | null>; rows: number; title: string; rowLabels?: string[] }) {
  return (
    <div className="sp-live-heat-wrap">
      {rowLabels && (
        <div className="sp-live-heat-rows" style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }} aria-hidden="true">
          {rowLabels.map((label, i) => <span key={i}>{label}</span>)}
        </div>
      )}
      <div className="sp-live-heat" style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }} role="img" aria-label={title}>
        {cells.map((cell, i) =>
          cell ? <span key={cell.key} className={`is-l${cell.level}`} title={cell.tip} /> : <span key={`gap-${i}`} className="is-gap" />,
        )}
      </div>
    </div>
  );
}
