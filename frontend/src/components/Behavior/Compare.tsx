/**
 * Two groups side by side as bars: before the fix and since, evening and earlier. The
 * figures come out as data (the bar's length and "3/8"), not as a sentence.
 */
import type { CompareChart } from '@/services/behavior';

export function Compare({ chart, label }: { chart: CompareChart; label: string }) {
  return (
    <div className="bh-compare" role="img" aria-label={`${label}: ${chart.rows.map((row) => `${row.label} ${row.value}${chart.unit}`).join(', ')}`}>
      {chart.rows.map((row) => (
        <div className="bh-compare-row" key={row.label}>
          <span className="bh-compare-label">{row.label}</span>
          <span className="bh-compare-track" aria-hidden="true">
            <span className="bh-compare-bar" style={{ width: `${Math.max(2, Math.min(100, (row.value / chart.max) * 100))}%` }} />
          </span>
          <span className="bh-compare-figure">{row.value}{chart.unit} <small>{row.text}</small></span>
        </div>
      ))}
    </div>
  );
}

/** Before the fix against since, as a chart. */
export function beforeAfter(before: { hits: number; of: number; percent: number },
  during: { hits: number; of: number; percent: number }, started: string): CompareChart {
  return {
    type: 'compare', max: 100, unit: '%', rows: [
      { label: 'Before the fix', value: before.percent, text: `${before.hits}/${before.of}` },
      { label: `Since ${started}`, value: during.percent, text: `${during.hits}/${during.of}` },
    ],
  };
}
