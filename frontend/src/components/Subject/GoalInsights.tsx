/**
 * What the work here says about the goal, worst news first.
 *
 * Each reading is a headline that interprets, the figures behind it, then what they
 * suggest and what to try. They're worked out and hedged on the server
 * (backend/tracking/subject_read.py), so the page draws only what cleared the evidence
 * table, and says nothing about what didn't.
 */
import { useState } from 'react';
import { Figures } from '@/components/Analytics/Figures';
import { Suggestion } from '@/components/Analytics/Suggestion';
import type { SubjectInsight } from '@/services/subjectGoal';

const MARK = { good: '↑', bad: '!', flat: '→' } as const;
/** How many show before "Show more". */
const OPEN = 4;

export function GoalInsights({ insights, goal, subject }: { insights: SubjectInsight[]; goal: string; subject: string }) {
  const [all, setAll] = useState(false);
  if (insights.length === 0) return null;
  const shown = all ? insights : insights.slice(0, OPEN);

  return (
    <section className="ax-panel sb-panel sgo-reads" aria-label="What the work says">
      <div className="ax-panel-head">
        <div className="ax-panel-title">
          <h2>{goal ? `What your work says about ${goal}` : `What your ${subject} work says`}</h2>
        </div>
      </div>
      <ul className="sgo-insight-list">
        {shown.map((item) => (
          <li key={item.id} className={`sgo-insight is-${item.tone}`}>
            <span className="sgo-insight-mark" aria-hidden="true">
              {MARK[item.tone]}
            </span>
            <div>
              <strong className="sgo-insight-title">{item.title}</strong>
              <p className="sgo-insight-figure">
                <Figures text={item.figures} every />
              </p>
              <Suggestion text={item.suggests} />
              {(item.evidence || item.resource) && (
                <p className="sgo-insight-foot">
                  {item.evidence && <span className="sgo-insight-sure">How sure: {item.evidence.toLowerCase()}</span>}
                  {item.resource && (
                    <a className="sgo-insight-res" href={item.resource.url} target="_blank" rel="noreferrer">
                      {item.resource.name} ↗
                    </a>
                  )}
                </p>
              )}
            </div>
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
