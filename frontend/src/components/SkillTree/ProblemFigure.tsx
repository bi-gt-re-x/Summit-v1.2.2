/**
 * A problem's figure: the triangle, graph, chart or table a question is about,
 * or the worked drawing that goes with its answer.
 *
 * ## Why a spec and not a picture
 *
 * The figure is stored as a few numbers (backend/tracking/skillsteps.py checks
 * the shape) and drawn here, rather than kept as SVG or an image. That way it
 * follows the theme in light and dark, it scales to a phone, it can't carry
 * markup out of the database, and an answer figure can be written by changing
 * a few marks on the question's own figure.
 *
 * ## Kinds
 *
 *     plot        a coordinate plane: lines, arrows, polygons and curves,
 *                 circles, points, angle arcs, text, and `fn` curves ("x^2-2",
 *                 read by utils/calc). With `grid` and `axes` off it is a
 *                 plain geometry drawing; `equal` keeps circles round.
 *     bars        a bar chart, one value per label
 *     table       rows and an optional header, as a real table
 *     graph       nodes placed on a 100 x 100 field, joined by edges that may
 *                 point one way and carry a weight
 *     numberline  ticks, points (open or filled) and shaded ranges
 *
 * Every mark may take `tone`: 'accent' for the thing the question is about,
 * 'muted' for scaffolding, 'good' and 'bad' for an answer that compares two.
 */
import { useId } from 'react';
import type { Figure, FigureTone as Tone, FigurePlace as Place } from '@/services/skillSteps';
import { compile } from '@/utils/calc';
import '@/styles/problemaids.css';

type Pt = [number, number];

const W = 400;
const PAD = 28;

function tone(value: Tone | undefined, fallback: Tone = 'ink') {
  return `pfig-${value ?? fallback}`;
}

/** The compass offset for a label, in pixels. */
const OFFSET: Record<Place, [number, number, 'start' | 'middle' | 'end']> = {
  n: [0, -9, 'middle'],
  s: [0, 17, 'middle'],
  e: [9, 4, 'start'],
  w: [-9, 4, 'end'],
  ne: [7, -7, 'start'],
  nw: [-7, -7, 'end'],
  se: [7, 15, 'start'],
  sw: [-7, 15, 'end'],
  c: [0, 4, 'middle'],
};

function Label({ x, y, text, at = 'ne', className }: { x: number; y: number; text: string | number; at?: Place; className?: string }) {
  const [dx, dy, anchor] = OFFSET[at];
  return (
    <text x={x + dx} y={y + dy} textAnchor={anchor} className={`pfig-label ${className ?? ''}`}>
      {String(text)}
    </text>
  );
}

/** An arrowhead at `to`, pointing away from `from`, as a filled triangle. */
function Head({ from, to, className }: { from: Pt; to: Pt; className: string }) {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const size = 9;
  const left: Pt = [to[0] - size * Math.cos(angle - 0.42), to[1] - size * Math.sin(angle - 0.42)];
  const right: Pt = [to[0] - size * Math.cos(angle + 0.42), to[1] - size * Math.sin(angle + 0.42)];
  return <polygon points={`${to.join(',')} ${left.join(',')} ${right.join(',')}`} className={`pfig-head ${className}`} />;
}

/** A tick spacing that gives about eight ticks: 1, 2 or 5 times a power of ten. */
function niceStep(span: number) {
  const raw = span / 8;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = raw / power;
  return (unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10) * power;
}

function ticks(low: number, high: number, step: number) {
  const out: number[] = [];
  const first = Math.ceil(low / step - 1e-9) * step;
  for (let at = first; at <= high + 1e-9 && out.length < 60; at += step) out.push(Number(at.toPrecision(10)));
  return out;
}

function svgId(raw: string) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

function Plot({ figure, label }: { figure: Extract<Figure, { kind: 'plot' }>; label: string }) {
  const clip = `pfig-clip-${svgId(useId())}`;
  const [x0, x1] = figure.x;
  const [y0, y1] = figure.y;
  const grid = figure.grid ?? true;
  const axes = figure.axes ?? true;
  let width = W;
  let height = 260;
  if (figure.equal) {
    const scale = Math.min(W / (x1 - x0), 340 / (y1 - y0));
    width = (x1 - x0) * scale;
    height = (y1 - y0) * scale;
  }
  const sx = (x: number) => PAD + ((x - x0) / (x1 - x0)) * width;
  const sy = (y: number) => PAD + ((y1 - y) / (y1 - y0)) * height;
  const at = (p: Pt): Pt => [sx(p[0]), sy(p[1])];
  const [stepX, stepY] = Array.isArray(figure.step)
    ? figure.step
    : [figure.step ?? niceStep(x1 - x0), figure.step ?? niceStep(y1 - y0)];
  const xs = ticks(x0, x1, stepX);
  const ys = ticks(y0, y1, stepY);
  // The axes sit on zero when zero is in view, and on the edge when it isn't.
  const axisY = sy(Math.min(Math.max(0, y0), y1));
  const axisX = sx(Math.min(Math.max(0, x0), x1));

  const marks = figure.items.map((item, index) => {
    const cls = tone(item.tone);
    const dash = item.dash ? 'pfig-dash' : '';
    if ('line' in item || 'arrow' in item) {
      const [a, b] = ('line' in item ? item.line : item.arrow).map(at) as [Pt, Pt];
      return (
        <g key={index}>
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={`pfig-stroke ${cls} ${dash}`} />
          {'arrow' in item && <Head from={a} to={b} className={cls} />}
          {item.label !== undefined && <Label x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2} text={item.label} at={item.at ?? 'n'} className={cls} />}
        </g>
      );
    }
    if ('path' in item) {
      const points = item.path.map(at);
      const d = `M${points.map((p) => p.join(',')).join('L')}${item.closed ? 'Z' : ''}`;
      const centre = points.reduce<Pt>((sum, p) => [sum[0] + p[0] / points.length, sum[1] + p[1] / points.length], [0, 0]);
      return (
        <g key={index}>
          <path d={d} className={`pfig-stroke ${cls} ${dash} ${item.fill ? 'pfig-fill' : ''}`} />
          {item.label !== undefined && <Label x={centre[0]} y={centre[1]} text={item.label} at={item.at ?? 'c'} className={cls} />}
        </g>
      );
    }
    if ('circle' in item) {
      const [cx, cy, r] = item.circle;
      const rx = (r / (x1 - x0)) * width;
      const ry = (r / (y1 - y0)) * height;
      return (
        <g key={index}>
          <ellipse cx={sx(cx)} cy={sy(cy)} rx={rx} ry={ry} className={`pfig-stroke ${cls} ${dash} ${item.fill ? 'pfig-fill' : ''}`} />
          {item.label !== undefined && <Label x={sx(cx)} y={sy(cy) - ry} text={item.label} at={item.at ?? 'n'} className={cls} />}
        </g>
      );
    }
    if ('point' in item) {
      const [px, py] = at(item.point);
      return (
        <g key={index}>
          <circle cx={px} cy={py} r={4} className={`pfig-dot ${cls} ${item.open ? 'is-open' : ''}`} />
          {item.label !== undefined && <Label x={px} y={py} text={item.label} at={item.at} className={cls} />}
        </g>
      );
    }
    if ('text' in item) {
      const [px, py] = at(item.text);
      return <Label key={index} x={px} y={py} text={item.label ?? ''} at={item.at ?? 'c'} className={cls} />;
    }
    if ('angle' in item) {
      const [v, a, b] = item.angle.map(at) as [Pt, Pt, Pt];
      // The arc never reaches past half the shorter arm, so it stays inside
      // a small triangle and is still easy to see on a big one.
      const arm = Math.min(Math.hypot(a[0] - v[0], a[1] - v[1]), Math.hypot(b[0] - v[0], b[1] - v[1]));
      const r = Math.max(14, Math.min(30, arm / 2));
      const ta = Math.atan2(a[1] - v[1], a[0] - v[0]);
      let tb = Math.atan2(b[1] - v[1], b[0] - v[0]);
      // The arc takes the short way round, the angle inside the shape.
      let sweep = tb - ta;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      tb = ta + sweep;
      const mid = ta + sweep / 2;
      // A narrow angle has no room for its label at the arc, so it moves out.
      const out = r + 14 + Math.max(0, (0.7 - Math.abs(sweep)) * 34);
      const labelAt: Pt = [v[0] + out * Math.cos(mid), v[1] + out * Math.sin(mid) + 4];
      let shape: React.ReactNode;
      if (item.right) {
        const s = 11;
        const ua: Pt = [Math.cos(ta), Math.sin(ta)];
        const ub: Pt = [Math.cos(tb), Math.sin(tb)];
        shape = (
          <path
            d={`M${v[0] + s * ua[0]},${v[1] + s * ua[1]}L${v[0] + s * (ua[0] + ub[0])},${v[1] + s * (ua[1] + ub[1])}L${v[0] + s * ub[0]},${v[1] + s * ub[1]}`}
            className={`pfig-stroke pfig-thin ${cls}`}
          />
        );
      } else {
        const start: Pt = [v[0] + r * Math.cos(ta), v[1] + r * Math.sin(ta)];
        const end: Pt = [v[0] + r * Math.cos(tb), v[1] + r * Math.sin(tb)];
        shape = <path d={`M${start.join(',')}A${r},${r} 0 0 ${sweep > 0 ? 1 : 0} ${end.join(',')}`} className={`pfig-stroke pfig-thin ${cls}`} />;
      }
      return (
        <g key={index}>
          {shape}
          {item.label !== undefined && (
            <text x={labelAt[0]} y={labelAt[1]} textAnchor="middle" className={`pfig-label ${cls}`}>
              {String(item.label)}
            </text>
          )}
        </g>
      );
    }
    if ('fn' in item) {
      let f: (x: number) => number;
      try {
        f = compile(item.fn);
      } catch {
        return null;
      }
      const from = Math.max(item.from ?? x0, x0);
      const to = Math.min(item.to ?? x1, x1);
      const span = y1 - y0;
      const parts: string[] = [];
      let open = false;
      let last: number | null = null;
      const samples = 240;
      for (let i = 0; i <= samples; i += 1) {
        const x = from + ((to - from) * i) / samples;
        const y = f(x);
        // A jump of more than the whole window between samples is an
        // asymptote (tan, 1/x), not a steep stretch, so the pen lifts.
        if (!Number.isFinite(y) || Math.abs(y) > 1e6 || (last !== null && Math.abs(y - last) > span)) {
          open = false;
          last = Number.isFinite(y) ? y : null;
          continue;
        }
        const clamped = Math.min(Math.max(y, y0 - span), y1 + span);
        parts.push(`${open ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(clamped).toFixed(1)}`);
        open = true;
        last = y;
      }
      let labelNode: React.ReactNode = null;
      if (item.label !== undefined) {
        // The label goes where the curve is still in view, nearest the right.
        for (let i = samples; i >= 0; i -= 1) {
          const x = from + ((to - from) * i) / samples;
          const y = f(x);
          if (Number.isFinite(y) && y >= y0 && y <= y1) {
            labelNode = <Label x={sx(x)} y={sy(y)} text={item.label} at={item.at ?? 'nw'} className={cls} />;
            break;
          }
        }
      }
      return (
        <g key={index}>
          <path d={parts.join('')} clipPath={`url(#${clip})`} className={`pfig-stroke pfig-curve ${cls} ${dash}`} />
          {labelNode}
        </g>
      );
    }
    return null;
  });

  return (
    <svg
      className="pfig-svg"
      viewBox={`0 0 ${width + PAD * 2} ${height + PAD * 2}`}
      style={{ maxWidth: width + PAD * 2 }}
      role="img"
      aria-label={label}
    >
      <defs>
        <clipPath id={clip}>
          <rect x={PAD} y={PAD} width={width} height={height} />
        </clipPath>
      </defs>
      {grid && (
        <g className="pfig-grid">
          {xs.map((x) => (
            <line key={`gx${x}`} x1={sx(x)} y1={PAD} x2={sx(x)} y2={PAD + height} />
          ))}
          {ys.map((y) => (
            <line key={`gy${y}`} x1={PAD} y1={sy(y)} x2={PAD + width} y2={sy(y)} />
          ))}
        </g>
      )}
      {axes && (
        <g className="pfig-axes">
          <line x1={PAD} y1={axisY} x2={PAD + width} y2={axisY} />
          <line x1={axisX} y1={PAD} x2={axisX} y2={PAD + height} />
          {xs
            .filter((x) => Math.abs(x) > 1e-9 || x0 >= 0)
            .map((x) => (
              <text key={`tx${x}`} x={sx(x)} y={Math.min(axisY + 14, PAD + height + 16)} textAnchor="middle" className="pfig-tick">
                {x}
              </text>
            ))}
          {ys
            .filter((y) => Math.abs(y) > 1e-9)
            .map((y) => (
              <text key={`ty${y}`} x={Math.max(axisX - 5, PAD - 4)} y={sy(y) + 4} textAnchor="end" className="pfig-tick">
                {y}
              </text>
            ))}
          {figure.xlabel && (
            <text x={PAD + width} y={axisY - 6} textAnchor="end" className="pfig-axis-name">
              {figure.xlabel}
            </text>
          )}
          {figure.ylabel && (
            <text x={axisX + 6} y={PAD + 10} className="pfig-axis-name">
              {figure.ylabel}
            </text>
          )}
        </g>
      )}
      {marks}
    </svg>
  );
}

function Bars({ figure, label }: { figure: Extract<Figure, { kind: 'bars' }>; label: string }) {
  const top = Math.max(...figure.values, 0);
  const bottom = Math.min(...figure.values, 0);
  const span = top - bottom || 1;
  const height = 200;
  const slot = W / figure.values.length;
  const bar = Math.min(56, slot * 0.62);
  const sy = (v: number) => PAD + ((top - v) / span) * height;
  const marked = new Set(figure.highlight ?? []);
  return (
    <svg className="pfig-svg" viewBox={`0 0 ${W + PAD * 2} ${height + PAD * 2 + 8}`} style={{ maxWidth: W + PAD * 2 }} role="img" aria-label={label}>
      <line x1={PAD} y1={sy(0)} x2={PAD + W} y2={sy(0)} className="pfig-axes-line" />
      {figure.values.map((value, index) => {
        const x = PAD + slot * index + (slot - bar) / 2;
        const y = Math.min(sy(value), sy(0));
        const h = Math.abs(sy(value) - sy(0));
        return (
          <g key={index}>
            <rect x={x} y={y} width={bar} height={Math.max(h, 1)} rx={3} className={`pfig-bar ${marked.has(index) ? 'is-marked' : ''}`} />
            <text x={x + bar / 2} y={value >= 0 ? y - 6 : y + h + 14} textAnchor="middle" className="pfig-label">
              {value}
              {figure.unit ?? ''}
            </text>
            <text x={x + bar / 2} y={PAD + height + 22} textAnchor="middle" className="pfig-tick">
              {String(figure.labels[index])}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Table({ figure }: { figure: Extract<Figure, { kind: 'table' }> }) {
  const marked = new Set((figure.highlight ?? []).map(([r, c]) => `${r}:${c}`));
  return (
    <div className="pfig-table-wrap">
      <table className="pfig-table">
        {figure.head && (
          <thead>
            <tr>
              {figure.head.map((cell, at) => (
                <th key={at} scope="col">
                  {String(cell)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {figure.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className={marked.has(`${r}:${c}`) ? 'is-marked' : undefined}>
                  {String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Graph({ figure, label }: { figure: Extract<Figure, { kind: 'graph' }>; label: string }) {
  const height = 240;
  const R = 15;
  const place = new Map(figure.nodes.map((node) => [String(node.id), [PAD + (node.at[0] / 100) * W, PAD + (node.at[1] / 100) * height] as Pt]));
  return (
    <svg className="pfig-svg" viewBox={`0 0 ${W + PAD * 2} ${height + PAD * 2}`} style={{ maxWidth: W + PAD * 2 }} role="img" aria-label={label}>
      {figure.edges.map((edge, index) => {
        const a = place.get(String(edge.from));
        const b = place.get(String(edge.to));
        if (!a || !b) return null;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const ux = (b[0] - a[0]) / length;
        const uy = (b[1] - a[1]) / length;
        const start: Pt = [a[0] + ux * R, a[1] + uy * R];
        const end: Pt = [b[0] - ux * (R + 1), b[1] - uy * (R + 1)];
        const cls = tone(edge.tone);
        const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        return (
          <g key={index}>
            <line x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} className={`pfig-stroke ${cls} ${edge.tone === 'accent' ? 'pfig-bold' : ''}`} />
            {edge.dir && <Head from={start} to={end} className={cls} />}
            {edge.label !== undefined && (
              <g>
                <rect
                  x={mid[0] - Math.max(11, String(edge.label).length * 4.5 + 4)}
                  y={mid[1] - 9}
                  width={Math.max(22, String(edge.label).length * 9 + 8)}
                  height={18}
                  rx={4}
                  className="pfig-chip"
                />
                {/* The weight stays in ink: a highlighted route is drawn by its line,
                    and a tinted number on a tinted line is hard to read. */}
                <text x={mid[0]} y={mid[1] + 4} textAnchor="middle" className="pfig-label pfig-ink">
                  {String(edge.label)}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {figure.nodes.map((node) => {
        const [x, y] = place.get(String(node.id)) as Pt;
        return (
          <g key={String(node.id)}>
            <circle cx={x} cy={y} r={R} className={`pfig-node ${node.tone ? `is-${node.tone}` : ''}`} />
            <text x={x} y={y + 4.5} textAnchor="middle" className="pfig-node-name">
              {node.label ?? String(node.id)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function NumberLine({ figure, label }: { figure: Extract<Figure, { kind: 'numberline' }>; label: string }) {
  const height = 56;
  const y = 26;
  const sx = (v: number) => PAD + ((v - figure.from) / (figure.to - figure.from)) * W;
  const every = figure.every ?? 1;
  const marks = ticks(figure.from, figure.to, figure.step);
  return (
    <svg className="pfig-svg" viewBox={`0 0 ${W + PAD * 2} ${height}`} style={{ maxWidth: W + PAD * 2 }} role="img" aria-label={label}>
      <line x1={PAD - 14} y1={y} x2={PAD + W + 14} y2={y} className="pfig-stroke pfig-ink" />
      <Head from={[PAD, y]} to={[PAD + W + 16, y]} className="pfig-ink" />
      <Head from={[PAD + W, y]} to={[PAD - 16, y]} className="pfig-ink" />
      {(figure.ranges ?? []).map((range, index) => {
        const a = sx(range.from ?? figure.from) - (range.from === undefined ? 14 : 0);
        const b = sx(range.to ?? figure.to) + (range.to === undefined ? 14 : 0);
        return <line key={index} x1={a} y1={y} x2={b} y2={y} className={`pfig-range ${tone(range.tone, 'accent')}`} />;
      })}
      {marks.map((value, index) => (
        <g key={value}>
          <line x1={sx(value)} y1={y - 5} x2={sx(value)} y2={y + 5} className="pfig-stroke pfig-ink pfig-thin" />
          {index % every === 0 && (
            <text x={sx(value)} y={y + 20} textAnchor="middle" className="pfig-tick">
              {value}
            </text>
          )}
        </g>
      ))}
      {(figure.points ?? []).map((point, index) => (
        <g key={`p${index}`}>
          <circle cx={sx(point.at)} cy={y} r={5} className={`pfig-dot ${tone(point.tone, 'accent')} ${point.open ? 'is-open' : ''}`} />
          {point.label && (
            <text x={sx(point.at)} y={y - 11} textAnchor="middle" className={`pfig-label ${tone(point.tone, 'accent')}`}>
              {point.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function ProblemFigure({ figure, answer = false }: { figure: Figure; answer?: boolean }) {
  const label = figure.caption ?? (answer ? 'Figure for the answer' : 'Figure for the question');
  let drawing: React.ReactNode = null;
  if (figure.kind === 'plot') drawing = <Plot figure={figure} label={label} />;
  else if (figure.kind === 'bars') drawing = <Bars figure={figure} label={label} />;
  else if (figure.kind === 'table') drawing = <Table figure={figure} />;
  else if (figure.kind === 'graph') drawing = <Graph figure={figure} label={label} />;
  else if (figure.kind === 'numberline') drawing = <NumberLine figure={figure} label={label} />;
  if (!drawing) return null;
  return (
    <figure className={`pfig ${answer ? 'is-answer' : ''}`}>
      {drawing}
      {figure.caption && <figcaption className="pfig-caption">{figure.caption}</figcaption>}
    </figure>
  );
}
