/**
 * Where the reader stands, in the seven ways it can be measured.
 *
 * ## Why seven and not one
 *
 * A single "subject score" is the thing everybody asks for and the thing that
 * answers nothing. Mastery and execution move in opposite directions on the
 * same account all the time — somebody reaching past what they can land has
 * high mastery and low execution, and the instruction for that is the
 * *opposite* of the instruction for the reverse — and a blend of the two says
 * neither. So the dimensions stay separate and visible, and the overall
 * figure exists only as the headline it is.
 *
 * ## Evidence, on every card
 *
 * Each card can be turned over. A page that says "Execution 73" and cannot
 * answer "from what" is asking to be trusted; one that says "84 rated tasks,
 * mean 3.7 of 5, best at Fair" is arguable, and arguable is the whole point.
 * The evidence is computed with the figure (components/Subject/state) rather
 * than written here, so a card cannot describe a number it did not come from.
 */
import { useState } from 'react';
import type { Dimension } from './state';

/** A 0-100 ring. The Timer's, at the size a headline wants. */
export function Ring({
  value,
  size = 132,
  label,
  sub,
}: {
  value: number | null;
  size?: number;
  label: string;
  sub?: string;
}) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.max(0, Math.min(100, value ?? 0));

  return (
    <div className="sx-ring-wrap" style={{ width: size, height: size }}>
      <svg className="sx-ring" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="sx-ring-track" cx={size / 2} cy={size / 2} r={radius} />
        <circle
          className="sx-ring-run"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (shown / 100) * circumference}
        />
      </svg>
      <div className="sx-ring-text">
        <strong>{value === null ? '-' : value}</strong>
        <span className="sx-ring-label">{label}</span>
        {sub && <span className="sx-ring-sub">{sub}</span>}
      </div>
    </div>
  );
}

/**
 * One dimension, front and back.
 *
 * The bar is the figure and the delta is the direction. Momentum is the one
 * card that prints its signed change rather than its 0-100 value, because the
 * value is centred on 50 and "58" means nothing to a reader while "+4 points"
 * is the whole finding.
 */
function Card({ entry }: { entry: Dimension }) {
  const [open, setOpen] = useState(false);
  const momentum = entry.key === 'momentum';

  return (
    <div className={`sx-metric${entry.known ? '' : ' is-unknown'}`} data-key={entry.key}>
      <button
        type="button"
        className="sx-metric-face"
        aria-expanded={open}
        disabled={!entry.known}
        onClick={() => setOpen((was) => !was)}
      >
        <span className="sx-metric-label">{entry.label}</span>
        <strong className="sx-metric-value">
          {!entry.known || entry.value === null
            ? '-'
            : momentum
              ? `${(entry.delta ?? 0) > 0 ? '+' : ''}${entry.delta}`
              : entry.value}
          {momentum && entry.known && <i>pts</i>}
        </strong>

        {entry.known && entry.value !== null && (
          <span className="sx-metric-bar" aria-hidden="true">
            <span style={{ width: `${entry.value}%` }} />
          </span>
        )}

        {!momentum && entry.delta !== null && entry.delta !== 0 && (
          <span className={`sx-metric-delta ${entry.delta > 0 ? 'is-up' : 'is-down'}`}>
            {entry.delta > 0 ? '↑' : '↓'} {Math.abs(entry.delta)}
          </span>
        )}
        {!entry.known && <span className="sx-metric-none">no data yet</span>}
      </button>

      {open && (
        <div className="sx-metric-back">
          <p className="sx-metric-meaning">{entry.meaning}</p>
          <ul>
            {entry.evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Dimensions({ dimensions }: { dimensions: Dimension[] }) {
  return (
    <div className="sx-metrics">
      {dimensions.map((entry) => (
        <Card key={entry.key} entry={entry} />
      ))}
    </div>
  );
}
