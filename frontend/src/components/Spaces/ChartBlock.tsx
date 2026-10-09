/**
 * A chart on a space's page, set by dragging.
 *
 * Bar, line and area charts: drag a bar's top, or a point, up or down. Pie and
 * donut charts: drag the dots on the rim, which are the edges between slices.
 * Each of those is also a slider for the keyboard (arrows step, Page Up/Down
 * take ten steps, Home and End go to the ends), and the value under each
 * label can be typed when a drag is not precise enough.
 *
 * The arithmetic is ./chart; this file only draws it and listens.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { CHART_KINDS, type Block, type ChartData, type ChartKind } from './blocks';
import {
  KIND_LABEL,
  LABEL_MAX,
  POINTS_MAX,
  POINTS_MIN,
  VALUE_MAX,
  addPoint,
  arcPath,
  isRound,
  moveEdge,
  nudgeEdge,
  percent,
  removePoint,
  renamePoint,
  setMax,
  setValue,
  short,
  slices,
  stepFor,
  ticks,
  turnAt,
  valueAt,
} from './chart';

/* The plot is drawn at the width it really has on screen (measured), and a
   fixed height, so its labels stay the same size on a narrow block as on a
   wide one. 600 is the width before it is measured. */
const VB_W = 600;
const VB_H = 240;
const PAD = { left: 44, right: 14, top: 18, bottom: 30 };
const PLOT_H = VB_H - PAD.top - PAD.bottom;
const PIE = 240;
const PIE_R = 104;

const colorOf = (at: number): CSSProperties => ({ '--c': `var(--sp-chart-${at % 8})` }) as CSSProperties;

/** A pointer's place in the SVG's own units. */
function inSvg(svg: SVGSVGElement, clientX: number, clientY: number, width: number, height: number) {
  const box = svg.getBoundingClientRect();
  return {
    x: box.width ? ((clientX - box.left) / box.width) * width : 0,
    y: box.height ? ((clientY - box.top) / box.height) * height : 0,
  };
}

/** Arrow keys, Page Up/Down, Home and End on a value slider. Null for any other key. */
function keyedValue(event: KeyboardEvent, value: number, max: number): number | null {
  const step = stepFor(max);
  switch (event.key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return value + step;
    case 'ArrowDown':
    case 'ArrowLeft':
      return value - step;
    case 'PageUp':
      return value + step * 10;
    case 'PageDown':
      return value - step * 10;
    case 'Home':
      return 0;
    case 'End':
      return max;
    default:
      return null;
  }
}

export interface ChartBlockProps {
  one: Block;
  disabled: boolean;
  register: (node: HTMLDivElement | null) => void;
  onChange: (change: { text?: string; chart?: ChartData }) => void;
  /** Keys on the chart itself (not on anything inside it): leaving it, deleting it. */
  onKey: (event: KeyboardEvent<HTMLDivElement>) => void;
}

export function ChartBlock({ one, disabled, register, onChange, onKey }: ChartBlockProps) {
  const chart = one.chart!;
  const set = (next: ChartData) => onChange({ chart: next });
  const kindName = `${KIND_LABEL[chart.kind]} chart`;

  return (
    <div
      ref={register}
      className={`sp-chart is-${chart.kind}`}
      role="figure"
      tabIndex={disabled ? -1 : 0}
      aria-label={one.text ? `${kindName}: ${one.text}` : kindName}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget) onKey(event);
      }}
    >
      <div className="sp-chart-head">
        <input
          className="sp-chart-title"
          value={one.text}
          placeholder="Chart title"
          aria-label="Chart title"
          maxLength={120}
          disabled={disabled}
          onChange={(event) => onChange({ text: event.target.value })}
        />
        <div className="sp-chart-kinds" role="radiogroup" aria-label="Chart type">
          {CHART_KINDS.map((kind: ChartKind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={chart.kind === kind}
              className="sp-chart-kind"
              disabled={disabled}
              onClick={() => set({ ...chart, kind })}
            >
              {KIND_LABEL[kind]}
            </button>
          ))}
        </div>
      </div>

      {isRound(chart.kind) ? (
        <Pie chart={chart} disabled={disabled} onChart={set} />
      ) : (
        <Plot chart={chart} disabled={disabled} onChart={set} />
      )}

      <div className="sp-chart-data">
        <ul className="sp-chart-rows">
          {chart.points.map((point, at) => (
            <li key={at} className="sp-chart-row" style={colorOf(at)}>
              <span className="sp-chart-swatch" aria-hidden="true" />
              <input
                className="sp-chart-label"
                value={point.label}
                maxLength={LABEL_MAX}
                aria-label={`Name of item ${at + 1}`}
                disabled={disabled}
                onChange={(event) => set(renamePoint(chart, at, event.target.value))}
              />
              <input
                className="sp-chart-value"
                type="number"
                min={0}
                max={isRound(chart.kind) ? VALUE_MAX : chart.max}
                step={stepFor(chart.max)}
                value={point.value}
                aria-label={`Value of ${point.label || `item ${at + 1}`}`}
                disabled={disabled}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) return;
                  set(isRound(chart.kind)
                    ? { ...chart, points: chart.points.map((p, i) => (i === at ? { ...p, value: Math.max(0, Math.min(VALUE_MAX, value)) } : p)) }
                    : setValue(chart, at, value));
                }}
              />
              {chart.points.length > POINTS_MIN && !disabled && (
                <button
                  type="button"
                  className="sp-chart-remove"
                  aria-label={`Remove ${point.label || `item ${at + 1}`}`}
                  title="Remove"
                  onClick={() => set(removePoint(chart, at))}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="sp-chart-tools">
          {chart.points.length < POINTS_MAX && !disabled && (
            <button type="button" className="sp-chart-add" onClick={() => set(addPoint(chart))}>
              + Add item
            </button>
          )}
          {!isRound(chart.kind) && (
            <label className="sp-chart-scale">
              Scale up to
              <input
                type="number"
                min={1}
                max={VALUE_MAX}
                value={chart.max}
                disabled={disabled}
                onChange={(event) => {
                  const max = Number(event.target.value);
                  if (max > 0) set(setMax(chart, max));
                }}
              />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Bars, lines and areas
// --------------------------------------------------------------------------
function Plot({ chart, disabled, onChart }: { chart: ChartData; disabled: boolean; onChart: (next: ChartData) => void }) {
  const svg = useRef<SVGSVGElement | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const [width, setWidth] = useState(VB_W);
  useLayoutEffect(() => {
    const node = svg.current;
    if (!node) return undefined;
    const fit = () => {
      const px = Math.round(node.getBoundingClientRect().width);
      if (px > 0) setWidth(Math.max(200, px));
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(fit);
    watch.observe(node);
    return () => watch.disconnect();
  }, []);
  const n = chart.points.length;
  const band = (width - PAD.left - PAD.right) / n;
  const xOf = (at: number) => PAD.left + band * at + band / 2;
  const yOf = (value: number) => PAD.top + PLOT_H - (Math.min(value, chart.max) / chart.max) * PLOT_H;
  const bottom = PAD.top + PLOT_H;

  const follow = (at: number, clientY: number) => {
    if (!svg.current) return;
    const { y } = inSvg(svg.current, 0, clientY, width, VB_H);
    onChart(setValue(chart, at, valueAt((bottom - y) / PLOT_H, chart.max)));
  };

  /** Pointer handlers for one bar or point: press, drag, let go. */
  const grab = (at: number) =>
    disabled
      ? {}
      : {
          onPointerDown: (event: PointerEvent<SVGElement>) => {
            event.preventDefault();
            event.stopPropagation();
            (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
            setHeld(at);
            follow(at, event.clientY);
          },
          onPointerMove: (event: PointerEvent<SVGElement>) => {
            if (held === at) follow(at, event.clientY);
          },
          onPointerUp: () => setHeld(null),
          onPointerCancel: () => setHeld(null),
        };

  const line = chart.points.map((point, at) => `${at ? 'L' : 'M'} ${xOf(at)} ${yOf(point.value)}`).join(' ');
  const area = `${line} L ${xOf(n - 1)} ${bottom} L ${xOf(0)} ${bottom} Z`;

  return (
    <svg
      ref={svg}
      className={`sp-chart-plot${held !== null ? ' is-held' : ''}`}
      viewBox={`0 0 ${width} ${VB_H}`}
      role="group"
      aria-label="Drag a bar or point up or down to set its value"
    >
      {ticks(chart.max).map((tick) => (
        <g key={tick} className="sp-chart-tick">
          <line x1={PAD.left} x2={width - PAD.right} y1={yOf(tick)} y2={yOf(tick)} />
          <text x={PAD.left - 8} y={yOf(tick)} dy="0.35em" textAnchor="end">{short(tick)}</text>
        </g>
      ))}

      {chart.kind === 'area' && <path className="sp-chart-area" d={area} />}
      {chart.kind !== 'bar' && <path className="sp-chart-line" d={line} />}

      {chart.points.map((point, at) => {
        const x = xOf(at);
        const y = yOf(point.value);
        const label = point.label || `Item ${at + 1}`;
        return (
          <g
            key={at}
            className={`sp-chart-point${held === at ? ' is-held' : ''}`}
            style={colorOf(chart.kind === 'bar' ? at : 0)}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={`${label} value`}
            aria-valuemin={0}
            aria-valuemax={chart.max}
            aria-valuenow={point.value}
            aria-disabled={disabled || undefined}
            onKeyDown={(event) => {
              if (disabled) return;
              const next = keyedValue(event, point.value, chart.max);
              if (next === null) return;
              event.preventDefault();
              onChart(setValue(chart, at, next));
            }}
            {...grab(at)}
          >
            {chart.kind === 'bar' ? (
              <>
                <rect className="sp-chart-bar" x={x - band * 0.32} width={band * 0.64} y={y} height={Math.max(0, bottom - y)} rx="3" />
                {/* A wider strip at the top is the easy thing to catch. */}
                <rect className="sp-chart-grab" x={x - band * 0.32} width={band * 0.64} y={y - 8} height="16" rx="4" />
              </>
            ) : (
              <>
                <circle className="sp-chart-hit" cx={x} cy={y} r="16" />
                <circle className="sp-chart-dot" cx={x} cy={y} r="6" />
              </>
            )}
            <text className="sp-chart-num" x={x} y={y - 12} textAnchor="middle">{short(point.value)}</text>
            <text className="sp-chart-axis" x={x} y={bottom + 18} textAnchor="middle">{label.length > 12 ? `${label.slice(0, 11)}…` : label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// --------------------------------------------------------------------------
// Pies and donuts
// --------------------------------------------------------------------------
function Pie({ chart, disabled, onChart }: { chart: ChartData; disabled: boolean; onChart: (next: ChartData) => void }) {
  const svg = useRef<SVGSVGElement | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const parts = slices(chart.points);
  const c = PIE / 2;
  const inner = chart.kind === 'donut' ? PIE_R * 0.56 : 0;
  const total = chart.points.reduce((sum, point) => sum + point.value, 0);

  const follow = (at: number, clientX: number, clientY: number) => {
    if (!svg.current) return;
    const { x, y } = inSvg(svg.current, clientX, clientY, PIE, PIE);
    onChart(moveEdge(chart, at, turnAt(x - c, y - c)));
  };

  return (
    <div className="sp-chart-round">
      <svg
        ref={svg}
        className={`sp-chart-pie${held !== null ? ' is-held' : ''}`}
        viewBox={`0 0 ${PIE} ${PIE}`}
        role="group"
        aria-label="Drag a dot on the edge to move the line between two slices"
      >
        {parts.map((part, at) => (
          <path key={at} className="sp-chart-slice" style={colorOf(at)} d={arcPath(c, PIE_R, inner, part.from, part.to)} />
        ))}
        {chart.kind === 'donut' && (
          <text className="sp-chart-total" x={c} y={c} dy="0.35em" textAnchor="middle">{short(total)}</text>
        )}
        {parts.slice(0, -1).map((part, at) => {
          const angle = part.to * 2 * Math.PI;
          const x = c + PIE_R * Math.sin(angle);
          const y = c - PIE_R * Math.cos(angle);
          const a = chart.points[at]!.label || `Item ${at + 1}`;
          const b = chart.points[at + 1]!.label || `Item ${at + 2}`;
          return (
            <g
              key={at}
              className={`sp-chart-edge${held === at ? ' is-held' : ''}`}
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label={`Edge between ${a} and ${b}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(part.share * 100)}
              aria-valuetext={`${a} ${percent(part.share)}, ${b} ${percent(parts[at + 1]!.share)}`}
              aria-disabled={disabled || undefined}
              onKeyDown={(event) => {
                if (disabled) return;
                const grow = ['ArrowUp', 'ArrowRight'].includes(event.key);
                const shrink = ['ArrowDown', 'ArrowLeft'].includes(event.key);
                if (!grow && !shrink) return;
                event.preventDefault();
                onChart(nudgeEdge(chart, at, grow ? 1 : -1));
              }}
              {...(disabled
                ? {}
                : {
                    onPointerDown: (event: PointerEvent<SVGGElement>) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      setHeld(at);
                    },
                    onPointerMove: (event: PointerEvent<SVGGElement>) => {
                      if (held === at) follow(at, event.clientX, event.clientY);
                    },
                    onPointerUp: () => setHeld(null),
                    onPointerCancel: () => setHeld(null),
                  })}
            >
              <circle className="sp-chart-hit" cx={x} cy={y} r="16" />
              <circle className="sp-chart-handle" cx={x} cy={y} r="7" />
            </g>
          );
        })}
      </svg>
      <ul className="sp-chart-legend">
        {chart.points.map((point, at) => (
          <li key={at} style={colorOf(at)}>
            <span className="sp-chart-swatch" aria-hidden="true" />
            <span className="sp-chart-legend-name">{point.label || `Item ${at + 1}`}</span>
            <span className="sp-chart-legend-share">{percent(parts[at]!.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
