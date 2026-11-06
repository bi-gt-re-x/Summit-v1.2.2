/**
 * What stands out in the work on the goal, as cards: a tag, a short title, a small
 * chart and one thing to try. Worst first. Worked out and gated on the evidence table
 * on the server (backend/tracking/subject_read.py); how sure each is shows as a chip.
 */
import { useState } from 'react';
import type { InsightChart, SubjectInsight } from '@/services/subjectGoal';

/** How many show before "Show more". */
const OPEN = 4;

/** The evidence table's labels, short enough for a chip. The full one is the tooltip. */
function sure(label: string): string {
  if (/prelim/i.test(label)) return 'Early sign';
  if (/emerg/i.test(label)) return 'Emerging';
  if (/reliable/i.test(label)) return 'Likely';
  return label;
}

function Chart({ chart, tone }: { chart: InsightChart; tone: string }) {
  if (chart.type === 'part') {
    const share = chart.whole > 0 ? chart.part / chart.whole : 0;
    const dots = chart.whole <= 24;
    return (
      <div className="sgo-part" role="img" aria-label={`${chart.part} of ${chart.whole} ${chart.label}`}>
        <p className="sgo-part-num">
          <b>{chart.part}</b> of {chart.whole} <span>{chart.label}</span>
        </p>
        {dots ? (
          <span className="sgo-dots">
            {Array.from({ length: chart.whole }, (_, at) => (
              <i key={at} className={at < chart.part ? `is-on is-${tone}` : undefined} />
            ))}
          </span>
        ) : (
          <span className="sgo-bar">
            <span className={`is-${tone}`} style={{ width: `${share * 100}%` }} />
          </span>
        )}
      </div>
    );
  }
  const low = Math.min(...chart.rows.map((row) => row.value));
  return (
    <div className="sgo-compare" role="img" aria-label={chart.rows.map((row) => `${row.label} ${row.value}`).join(', ')}>
      {chart.rows.map((row) => (
        <div key={row.label} className="sgo-compare-row">
          <span className="sgo-compare-label">{row.label}</span>
          <span className="sgo-bar">
            <span
              className={row.value === low && chart.rows.length > 1 ? `is-${tone}` : 'is-base'}
              style={{ width: `${(row.value / (chart.max || 1)) * 100}%` }}
            />
          </span>
          <b>{row.value}</b>
        </div>
      ))}
    </div>
  );
}

export function GoalInsights({ insights, goal, subject }: { insights: SubjectInsight[]; goal: string; subject: string }) {
  const [all, setAll] = useState(false);
  if (insights.length === 0) return null;
  const shown = all ? insights : insights.slice(0, OPEN);

  return (
    <section className="ax-panel sb-panel sgo-reads" aria-label="What the work says">
      <div className="ax-panel-head">
        <div className="ax-panel-title">
          <h2>What stands out</h2>
        </div>
      </div>
      <p className="ax-panel-note">{goal ? `In your work on ${goal}.` : `In your ${subject} work.`}</p>
      <ul className="sgo-cards">
        {shown.map((item) => (
          <li key={item.id} className={`sgo-card is-${item.tone}`}>
            <div className="sgo-card-head">
              <span className="sgo-tag">{item.tag}</span>
              {item.evidence && (
                <span className="sgo-sure" title={`How sure: ${item.evidence.toLowerCase()}`}>
                  {sure(item.evidence)}
                </span>
              )}
            </div>
            <strong className="sgo-card-title">{item.title}</strong>
            <Chart chart={item.chart} tone={item.tone} />
            <p className="sgo-tip">
              <span aria-hidden="true">→</span> {item.tip}
              {item.resource && (
                <>
                  {' '}
                  <a href={item.resource.url} target="_blank" rel="noreferrer">
                    {item.resource.name} ↗
                  </a>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
      {insights.length > OPEN && (
        <button type="button" className="stl-more" onClick={() => setAll((open) => !open)}>
          {all ? 'Show fewer' : `Show ${insights.length - OPEN} more`}
        </button>
      )}
    </section>
  );
}
