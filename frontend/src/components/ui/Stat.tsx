/**
 * One figure and what it is: "Completed · 4".
 *
 * A description-list pair, so a screen reader reads the label with its value.
 * Render several inside one `<dl className="ui-stats">` to lay them out in a
 * row; the grid lives in styles/ui.css.
 */
import type { ReactNode } from 'react';

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  /** A line under the figure — a unit, a comparison. */
  hint?: ReactNode;
  className?: string;
}

export function Stat({ label, value, hint, className }: StatProps) {
  return (
    <div className={className ? `ui-stat ${className}` : 'ui-stat'}>
      <dt className="ui-stat-label">{label}</dt>
      <dd className="ui-stat-value">{value}</dd>
      {hint != null && <dd className="ui-stat-hint">{hint}</dd>}
    </div>
  );
}
