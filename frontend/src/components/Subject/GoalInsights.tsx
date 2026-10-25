/**
 * "Toward your goal": the subject page's counted insights and next moves,
 * each said against the subject's main goal. The arithmetic is in
 * ./goalRead; this draws it, right under the goal band, so the first
 * thing after the goal is what bears on it.
 */
import { Link } from 'react-router-dom';
import type { GoalRead } from './goalRead';

const MARK = { good: '↑', bad: '!', flat: '→' } as const;
const WEIGHT = { now: 'Do first', next: 'Next', keep: 'Keep doing' } as const;

export function GoalInsights({ read, subject }: { read: GoalRead; subject: string }) {
  const { goal, insights, moves } = read;
  if (insights.length === 0 && moves.length === 0) return null;

  return (
    <section className="ax-panel sb-panel sgo-goal" aria-label="Toward your goal">
      <div className="ax-panel-head">
        <div className="ax-panel-title">
          <h2>{goal ? `Toward "${goal}"` : `Toward a goal for ${subject}`}</h2>
        </div>
      </div>
      <p className="ax-panel-note">
        {goal
          ? 'What your work in this subject says about your goal, and what to do about it. Counted from your tasks.'
          : 'No goal is set for this subject yet, so these read against the subject as a whole.'}
      </p>

      <div className="sgo-cols">
        {moves.length > 0 && (
          <div className="sgo-moves">
            <h3 className="sb-sub">What to do</h3>
            <ol className="sgo-move-list">
              {moves.map((move, at) => (
                <li key={move.id} className={`sgo-move is-${move.weight}`}>
                  <span className="sgo-move-num" aria-hidden="true">
                    {at + 1}
                  </span>
                  <div>
                    <span className="sgo-move-tag">{WEIGHT[move.weight]}</span>
                    <strong>{move.title}</strong>
                    <p>{move.why}</p>
                    {move.resource && (
                      <a className="sgo-move-res" href={move.resource.url} target="_blank" rel="noreferrer">
                        {move.resource.name} ↗
                      </a>
                    )}
                  </div>
                  {move.to && (
                    <Link to={move.to} className="sgo-move-go">
                      {move.link ?? 'Go'}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {insights.length > 0 && (
          <div className="sgo-insights">
            <h3 className="sb-sub">Insights</h3>
            <ul className="sgo-insight-list">
              {insights.map((item) => (
                <li key={item.id} className={`sgo-insight is-${item.tone}`}>
                  <span className="sgo-insight-mark" aria-hidden="true">
                    {MARK[item.tone]}
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <p className="sgo-insight-figure">{item.figure}</p>
                    <p className="sgo-insight-means">{item.means}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
