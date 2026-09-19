/**
 * The one chart on a goal card.
 *
 * Which one is `pickVisual` in utils/goalVisuals; this file only draws what it
 * was handed. The split is the same one the skill tree keeps: the thing that
 * decides is testable without a browser, and the thing that draws has no
 * opinions.
 *
 * ## One, and a caption
 *
 * Every branch below renders a single visual and a line saying what it is. The
 * caption is not decoration — the whole point of choosing per goal is that two
 * cards on the same page are showing different things, and a reader who is not
 * told will assume they are showing the same thing at different values.
 *
 * ## Everything is drawn from the same three primitives
 *
 * A row of labelled bars, a grid of squares, and a line. Three charts share the
 * bar list — difficulty, subjects and weekdays differ in what they count, not in
 * how they look — because a card that changed its visual language per goal would
 * be four dialects on one page.
 */
import { useState } from 'react';
import { formatGoalDate, goalDate, goalNumbers } from './numbers';
import {
  CHART_CHOICES,
  VISUALS,
  chosenChart,
  difficultyBars,
  heatCells,
  subjectBars,
  weekdayBars,
  type Bar,
  type Pick,
  type VisualContext,
} from '@/utils/goalVisuals';
import type { Goal, Milestone } from '@/types';

const DAY = 86_400_000;

const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const time = (value?: string) => goalDate(value)?.getTime() ?? 0;

/** "May 2024" — the checkpoint column, where the year is the point. */
function monthYear(value?: string): string {
  const at = time(value);
  if (!at) return '—';
  return new Date(at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Primitive 1 — labelled bars
// ---------------------------------------------------------------------------
function Bars({ rows }: { rows: Bar[] }) {
  return (
    <ul className="ag-bars">
      {rows.map((row) => (
        <li key={row.label} className={row.empty ? 'is-empty' : ''}>
          <span className="ag-bar-label">{row.label}</span>
          <span className="ag-bar-track">
            <i style={{ width: `${pct(row.percent)}%` }} />
          </span>
          <span className="ag-bar-value">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Primitive 2 — a grid of days
// ---------------------------------------------------------------------------
function Heat({ context }: { context: VisualContext }) {
  const cells = heatCells(context);
  // Twelve columns of seven. Laid out down each column so a week reads
  // vertically, which is the arrangement everybody already knows.
  return (
    <div className="ag-heat" role="img" aria-label="Days with finished work, last twelve weeks">
      <ul className="ag-heat-days" aria-hidden="true">
        <li>M</li>
        <li />
        <li>W</li>
        <li />
        <li>F</li>
        <li />
        <li>S</li>
      </ul>
      <div className="ag-heat-grid">
        {cells.map((cell) => (
          <i
            key={cell.day}
            className={`is-l${cell.level}`}
            title={`${formatGoalDate(cell.day)} — ${cell.count} finished`}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primitive 3 — a line
// ---------------------------------------------------------------------------
export interface Point {
  at: number;
  percent: number;
}

/**
 * `step` draws the same points as a staircase: flat until a checkpoint is
 * reached, then straight up. That is the truer shape for checkpoints, which
 * are reached on a day rather than gradually.
 */
export function Sparkline({ points, step = false }: { points: Point[]; step?: boolean }) {
  const w = 300;
  const h = 118;
  const padX = 4;
  const first = points[0]!.at;
  const last = points[points.length - 1]!.at;
  const span = Math.max(1, last - first);

  const placed = points.map((point) => ({
    x: padX + ((point.at - first) / span) * (w - padX * 2),
    y: h - (pct(point.percent) / 100) * (h - 8) - 4,
  }));

  const line = placed
    .map((p, i) =>
      i === 0
        ? `M${p.x.toFixed(1)},${p.y.toFixed(1)}`
        : step
          ? `H${p.x.toFixed(1)} V${p.y.toFixed(1)}`
          : `L${p.x.toFixed(1)},${p.y.toFixed(1)}`,
    )
    .join(' ');
  const area = `${line} L${placed[placed.length - 1]!.x.toFixed(1)},${h} L${placed[0]!.x.toFixed(1)},${h} Z`;

  // Four month labels across the span, evenly. Not one per point: the points
  // land on the days checkpoints happened, which is not a scale.
  const marks = [0, 1, 2, 3].map((i) => ({
    x: padX + (i / 3) * (w - padX * 2),
    label: new Date(first + (span * i) / 3).toLocaleDateString(undefined, { month: 'short' }),
  }));

  return (
    <div className="ag-chart">
      <ul className="ag-chart-scale" aria-hidden="true">
        {[100, 75, 50, 25, 0].map((value) => (
          <li key={value}>{value}%</li>
        ))}
      </ul>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="ag-chart-plot" aria-hidden="true">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} className="ag-chart-grid" x1={0} x2={w} y1={4 + f * (h - 8)} y2={4 + f * (h - 8)} />
        ))}
        <path className="ag-chart-area" d={area} />
        <path className="ag-chart-line" d={line} />
        {placed.map((p, i) => (
          <circle key={i} className="ag-chart-dot" cx={p.x} cy={p.y} r={2.6} />
        ))}
      </svg>
      <ul className="ag-chart-months" aria-hidden="true">
        {marks.map((mark, i) => (
          <li key={i} style={{ left: `${(mark.x / w) * 100}%` }}>
            {mark.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The goal's completion history, as a running percentage.
 *
 * Built from the days its checkpoints were reached, plus today's standing as the
 * last point — so the line ends where the ring says it is. Not a series the
 * account stores: a goal keeps no history of its own percentage, and this is the
 * honest reconstruction of one from the dates it does keep.
 */
export function series(goal: Goal, range: 'year' | 'all', today: number): Point[] {
  const stones = goal.milestones ?? [];
  if (stones.length === 0) return [];

  const floor = range === 'year' ? today - 365 * DAY : 0;
  const done = stones
    .filter((stone) => stone.status === 'done' && time(stone.completed_at))
    .map((stone) => time(stone.completed_at))
    .sort((a, b) => a - b);

  if (done.length === 0) return [];

  const out: Point[] = [];
  done.forEach((at, index) => {
    if (at < floor) return;
    out.push({ at, percent: ((index + 1) / stones.length) * 100 });
  });

  // Everything reached happened before the window opened: the line would be
  // empty even though the goal is well along, so the window's left edge carries
  // the standing it started at.
  if (out.length === 0) {
    out.push({ at: floor, percent: (done.length / stones.length) * 100 });
  } else if (done.length > out.length) {
    out.unshift({ at: floor, percent: ((done.length - out.length) / stones.length) * 100 });
  } else {
    // Nothing had been reached before the first point, so the line starts at
    // nothing — on the day the goal was set. Without it a goal with one
    // checkpoint behind it draws a flat run at its current standing, which is
    // arithmetically true and reads as "no progress ever".
    const began = time(goal.start_date || goal.created_at);
    if (began && began < out[0]!.at && began >= floor) out.unshift({ at: began, percent: 0 });
  }

  out.push({ at: today, percent: goalNumbers(goal).progress });
  return out;
}

/** Checkpoints actually reached inside the window — what makes a line worth it. */
export function movement(goal: Goal, range: 'year' | 'all', today: number): number {
  const floor = range === 'year' ? today - 365 * DAY : 0;
  return (goal.milestones ?? []).filter(
    (stone) => stone.status === 'done' && time(stone.completed_at) >= floor,
  ).length;
}

// ---------------------------------------------------------------------------
// Roadmap and scale
// ---------------------------------------------------------------------------
/**
 * The checkpoints, each row's bar being its state rather than a figure.
 *
 * A checkpoint has no percentage, so three lengths meaning three states is the
 * most a bar can honestly say here.
 */
function Roadmap({ goal, onOpen }: { goal: Goal; onOpen: () => void }) {
  const stones = goal.milestones ?? [];
  const share = (stone: Milestone) =>
    stone.status === 'done' ? 100 : stone.status === 'active' ? 45 : 6;

  return (
    <ul className="ag-roadmap">
      {stones.slice(0, 8).map((stone) => (
        <li key={stone.id} className={`is-${stone.status}`}>
          <button type="button" onClick={onOpen}>
            <span className="ag-road-name">{stone.title}</span>
            <span className="ag-road-bar">
              <i style={{ width: `${share(stone)}%` }} />
            </span>
            <span className="ag-quiet">
              {monthYear(stone.status === 'done' ? stone.completed_at : stone.target_date)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The figure between nothing and the target, on one line. */
function Scale({ goal }: { goal: Goal }) {
  const n = goalNumbers(goal);
  if (n.target <= 0) return <p className="ag-empty">No target set yet, so there is nothing to measure against.</p>;
  const done = pct(n.progress);
  const short = (value: number) => Math.round(value * 10) / 10;

  return (
    <div className="ag-scale">
      <div className="ag-scale-track">
        <i style={{ width: `${done}%` }} />
        <b style={{ left: `${done}%` }}>{short(n.current).toLocaleString()}</b>
      </div>
      <div className="ag-scale-ends">
        <span>0</span>
        <span>
          {short(n.target).toLocaleString()} {n.label}
        </span>
      </div>
      <p className="ag-scale-left">
        {n.current >= n.target
          ? 'Target reached.'
          : `${short(n.target - n.current).toLocaleString()} ${n.label} to go.`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------
export interface GoalVisualProps {
  goal: Goal;
  context: VisualContext;
  pick: Pick;
  /** Turns a subject id into its name. */
  nameOf: (id: string) => string;
  onOpen: () => void;
  /** Pin a chart to the goal, or '' to let the page pick. Absent hides the menu. */
  onChart?: (chart: string) => void;
}

/** The ⋯ in the panel's corner: which chart this goal draws. */
export function ChartMenu({
  goal,
  onChart,
}: {
  goal: Goal;
  onChart: (chart: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = chosenChart(goal) ?? '';
  const choose = (chart: string) => {
    setOpen(false);
    if (chart !== current) onChart(chart);
  };

  return (
    <div className="ag-menu-wrap">
      <button
        type="button"
        className="ag-kebab"
        aria-label={`Chart for ${goal.title}`}
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
      {open && (
        <>
          <button
            type="button"
            className="ag-menu-veil"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="ag-menu ag-chart-menu" role="menu" aria-label="Chart">
            {[{ id: '', label: 'Automatic' }, ...CHART_CHOICES].map((choice) => (
              <button
                key={choice.id || 'auto'}
                type="button"
                role="menuitemradio"
                aria-checked={current === choice.id}
                className={current === choice.id ? 'is-on' : ''}
                onClick={() => choose(choice.id)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function GoalVisual({ goal, context, pick, nameOf, onOpen, onChart }: GoalVisualProps) {
  const today = Date.now();
  /* Opens on the window that has something in it — see `movement`. Checked once
     on first render rather than watched, so a reader who picks a range keeps it. */
  const [range, setRange] = useState<'year' | 'all'>(() =>
    movement(goal, 'year', today) > 0 ? 'year' : 'all',
  );

  const meta = VISUALS[pick.id];
  const timed = pick.id === 'progress' || pick.id === 'step';
  const line = timed ? series(goal, range, today) : [];
  const stones = goal.milestones ?? [];

  return (
    <>
      <header className="ag-panel-head">
        <h4>{meta.title}</h4>
        <div className="ag-panel-tools">
          {timed && (
            <label className="ag-range">
              <span className="gx-sr">Range</span>
              <select value={range} onChange={(event) => setRange(event.target.value as 'year' | 'all')}>
                <option value="year">This Year</option>
                <option value="all">All Time</option>
              </select>
            </label>
          )}
          {onChart && <ChartMenu goal={goal} onChart={onChart} />}
        </div>
      </header>

      {timed && line.length > 1 && <Sparkline points={line} step={pick.id === 'step'} />}
      {/* A chosen chart can land on a goal with nothing behind it yet. Said
          plainly, rather than drawing an empty frame. */}
      {timed && line.length <= 1 && (
        <p className="ag-empty">No checkpoints reached yet, so there is no line to draw.</p>
      )}
      {(pick.id === 'scale' || pick.id === 'basic') && <Scale goal={goal} />}
      {pick.id === 'difficulty' && <Bars rows={difficultyBars(context)} />}
      {pick.id === 'skills' && <Bars rows={subjectBars(context, nameOf)} />}
      {pick.id === 'volume' && <Bars rows={weekdayBars(context)} />}
      {pick.id === 'heatmap' && <Heat context={context} />}
      {pick.id === 'roadmap' && stones.length > 0 && <Roadmap goal={goal} onOpen={onOpen} />}
      {pick.id === 'roadmap' && stones.length === 0 && (
        <p className="ag-empty">No checkpoints yet.</p>
      )}

      <p className="ag-caption">{meta.caption}</p>
      {/* Why this chart and not one of the others. It names the evidence, so a
          reader who wants a different chart can see what it would take — or,
          for a chart they chose, how to hand the choice back. */}
      <p className="ag-why-chart">{pick.why}</p>
    </>
  );
}
