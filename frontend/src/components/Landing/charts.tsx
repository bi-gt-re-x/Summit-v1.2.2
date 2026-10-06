/**
 * The landing page's pictures, drawn as plain SVG.
 *
 * Every figure is made up, and every one is read off the same made-up student
 * so no two cards disagree (see `STUDENT` in ./data). They draw themselves as
 * they scroll into view: the bars carry `ld-grow` and the ring's arc a
 * `stroke-dashoffset`, and styles/landing.css holds them at zero until the
 * block around them gets `is-in` from ./useLandingMotion.
 */
import type { CSSProperties } from 'react';

/** A smooth path through points: Catmull-Rom, turned into cubic Béziers. */
export function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return '';
  let d = `M${points[0]![0]},${points[0]![1]}`;
  for (let at = 0; at < points.length - 1; at++) {
    const p0 = points[at - 1] ?? points[at]!;
    const p1 = points[at]!;
    const p2 = points[at + 1]!;
    const p3 = points[at + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]!.toFixed(1)},${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)},${c2[1]!.toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export interface AreaSeries {
  name: string;
  values: readonly number[];
  colour: string;
}

/** Overlapping filled lines, the hero's Daily XP card. */
export function AreaChart({ series, max, label }: { series: readonly AreaSeries[]; max: number; label: string }) {
  const W = 300;
  const H = 110;
  const left = 22;
  const top = 6;
  const plotH = H - top - 14;
  const points = (values: readonly number[]): [number, number][] =>
    values.map((value, at) => [
      Math.round(left + (at / (values.length - 1)) * (W - left)),
      Math.round(top + plotH - (value / max) * plotH),
    ]);

  return (
    <svg className="ld-area" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <defs>
        {series.map((one, at) => (
          <linearGradient key={one.name} id={`ld-area-${at}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={one.colour} stopOpacity=".32" />
            <stop offset="100%" stopColor={one.colour} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {[max, max / 2, 0].map((tick) => {
        const y = top + plotH - (tick / max) * plotH;
        return (
          <g key={tick}>
            <line className="ld-area-grid" x1={left} x2={W} y1={y} y2={y} />
            <text className="ld-area-axis" x={0} y={y + 3}>
              {tick}
            </text>
          </g>
        );
      })}
      {series.map((one, at) => {
        const line = smoothPath(points(one.values));
        const base = top + plotH;
        return (
          <g key={one.name}>
            <path
              className="ld-area-fill"
              d={`${line} L${W},${base} L${left},${base} Z`}
              fill={`url(#ld-area-${at})`}
            />
            <path className="ld-area-line" d={line} stroke={one.colour} pathLength={1} />
          </g>
        );
      })}
    </svg>
  );
}

/** Grouped bars: a lighter total behind a darker part of it, per label. */
export function PairedBars({
  labels,
  back,
  front,
  max,
  unit,
  label,
}: {
  labels: readonly string[];
  back: readonly number[];
  front: readonly number[];
  max: number;
  unit: string;
  label: string;
}) {
  const W = 340;
  const H = 150;
  const left = 22;
  const base = H - 16;
  const plotH = base - 6;
  const slot = (W - left) / labels.length;
  const bar = Math.min(14, slot / 3);
  const y = (value: number) => base - (value / max) * plotH;

  return (
    <svg className="ld-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {[0, max / 4, max / 2, (3 * max) / 4, max].map((tick) => (
        <g key={tick}>
          <line x1={left} x2={W} y1={y(tick)} y2={y(tick)} />
          <text x={0} y={y(tick) + 3}>
            {tick}
            {unit}
          </text>
        </g>
      ))}
      {labels.map((name, at) => {
        const x = left + at * slot + slot / 2;
        return (
          <g key={name}>
            <rect
              className="ld-grow"
              style={{ '--i': at } as CSSProperties}
              x={x - bar}
              y={y(back[at]!)}
              width={bar}
              height={base - y(back[at]!)}
              rx="2"
              fill="#BFD6FB"
            />
            <rect
              className="ld-grow"
              style={{ '--i': at + 0.5 } as CSSProperties}
              x={x}
              y={y(front[at]!)}
              width={bar}
              height={base - y(front[at]!)}
              rx="2"
              fill="#3B82F6"
            />
            <text x={x} y={H - 2} textAnchor="middle">
              {name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** One bar per day, with every seventh day back from the last named under it. */
export function DayBars({ days, label }: { days: readonly { date: Date; xp: number }[]; label: string }) {
  const W = 360;
  const H = 110;
  const left = 22;
  const base = H - 16;
  const plotH = base - 6;
  const max = 400;
  const slot = (W - left) / days.length;
  const y = (value: number) => base - (Math.min(value, max) / max) * plotH;
  const name = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <svg className="ld-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {[0, 200, 400].map((tick) => (
        <g key={tick}>
          <line x1={left} x2={W} y1={y(tick)} y2={y(tick)} />
          <text x={0} y={y(tick) + 3}>
            {tick}
          </text>
        </g>
      ))}
      {days.map(({ date, xp }, at) => (
        <rect
          key={date.toISOString()}
          className="ld-grow"
          style={{ '--i': at * 0.4 } as CSSProperties}
          x={left + at * slot + slot * 0.2}
          y={y(xp)}
          width={slot * 0.6}
          height={base - y(xp)}
          rx="1.5"
          fill="#2563EB"
        />
      ))}
      {days.map(({ date }, at) =>
        (days.length - 1 - at) % 7 === 0 ? (
          <text key={`t${at}`} x={left + at * slot + slot / 2} y={H - 2} textAnchor="middle">
            {name(date)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** A ring that fills to `value` of 100. */
export function Ring({ value, size = 120, stroke = 12 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <defs>
        <linearGradient id="ld-ring" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#14B8A6" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ld-line-soft)" strokeWidth={stroke} />
      <circle
        className="ld-ring-arc"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#ld-ring)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={length}
        strokeDashoffset={length * (1 - value / 100)}
        style={{ '--full': length } as CSSProperties}
      />
    </svg>
  );
}
