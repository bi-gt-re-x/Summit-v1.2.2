/**
 * Where your time should go, and what to leave alone.
 *
 * The plan underneath this is a list of things to do. This is the decision that list is
 * built around: which goal gets the time, why, what that costs, and the part most
 * productivity tools skip, which is what you should deliberately not work on. Knowing
 * your weakest subject isn't useful if it isn't what needs you this week.
 *
 * The server decides (backend/tracking/priority.py), so the dashboard's one line and this
 * tab can't disagree. There's no score on the page: the ranking weighs three rough things,
 * and a decimal would claim a precision it doesn't have. It shows the things themselves.
 */
import { Panel, PanelNote } from './charts';
import { Figures } from './Figures';
import { Link } from 'react-router-dom';
import type { PriorityDecision } from '@/services/next';

/** The most things named as "leave these alone" before the rest are folded away. */
const LEFT_SHOWN = 4;

function timeLeft(days: number | null): string {
  if (days === null) return 'No date';
  if (days === 0) return 'Today';
  return `${days.toLocaleString('en-US')} ${days === 1 ? 'day' : 'days'}`;
}

const STATE_WORD: Record<string, string> = {
  on_track: 'On track',
  behind: 'Behind',
  stalled: 'Stalled',
  done: 'All done',
  missing: 'Too new to tell',
  undated: 'No date',
};

export function PriorityPanel({ decision }: { decision: PriorityDecision }) {
  if (decision.mode === 'none') {
    return decision.note ? (
      <Panel title="Where your time should go" className="ax-pri">
        <p className="ax-pri-empty">{decision.note}</p>
        <Link className="ax-btn ax-pri-go" to="/goals">Add a goal</Link>
      </Panel>
    ) : null;
  }

  const shown = decision.not_now.slice(0, LEFT_SHOWN);
  const folded = decision.not_now.slice(LEFT_SHOWN);

  return (
    <Panel
      title="Where your time should go"
      className={`ax-pri is-${decision.mode}`}
      footer={
        <PanelNote label="How this is decided">
          <ul className="ax-tips">
            <li><b>Goals first:</b> Only goals with a number or checkpoints can lead. XP, streak, task and focus goals count activity, so they follow the work.</li>
            <li><b>Matters:</b> The priority you gave the goal.</li>
            <li><b>Time:</b> How close the date is and whether your pace gets you there. A goal well ahead of its pace can wait, however important it is.</li>
            <li><b>Return:</b> How much of the goal a session has really moved so far. With too few sessions, we say it's unknown.</li>
            <li><b>A close date wins:</b> Inside a week, a real date comes first. Inside two weeks, it does unless you're well ahead of it.</li>
            <li><b>No scraps:</b> A second goal only gets time if there's room for a real session.</li>
          </ul>
        </PanelNote>
      }
    >
      <p className="ax-pri-head">{decision.headline}</p>
      {decision.warning && <p className="ax-pri-warn">{decision.warning}</p>}

      <ul className="ax-pri-split">
        {decision.allocation.map((row) => (
          <li key={row.goal_id}>
            <span className="ax-pri-mins">{row.minutes}m</span>
            <span className="ax-pri-what">
              <b>{row.title}</b>
              {row.step && <small>Next step: {row.step}</small>}
              {row.best_use && <small>Best use of it: {row.best_use}</small>}
            </span>
          </li>
        ))}
      </ul>

      <dl className="ax-pri-answers">
        {decision.answers.map((row) => (
          <div key={row.key}>
            <dt>{row.question}</dt>
            <dd><Figures text={row.answer} /></dd>
          </div>
        ))}
      </dl>

      {decision.not_now.length > 0 && (
        <div className="ax-pri-leave">
          <h3>Leave these alone for now</h3>
          <ul>
            {shown.map((row) => (
              <li key={row.key}>
                <b>{row.title}</b>
                <span>{row.why}</span>
              </li>
            ))}
          </ul>
          {folded.length > 0 && (
            <details className="ax-pri-more">
              <summary>{folded.length} more you can leave</summary>
              <ul>
                {folded.map((row) => (
                  <li key={row.key}>
                    <b>{row.title}</b>
                    <span>{row.why}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {decision.goals.length > 1 && (
        <details className="ax-pri-more">
          <summary>How your goals ranked</summary>
          <div className="ax-pri-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Goal</th>
                  <th scope="col">Matters</th>
                  <th scope="col">Time left</th>
                  <th scope="col">Pace</th>
                  <th scope="col">A session moves it</th>
                </tr>
              </thead>
              <tbody>
                {decision.goals.map((row) => (
                  <tr key={row.goal_id} className={row.gets_time ? 'is-on' : undefined}>
                    <td>{row.title}</td>
                    <td>{row.matters}</td>
                    <td>{timeLeft(row.days_left)}</td>
                    <td>
                      {STATE_WORD[row.state] ?? row.state}
                      {row.needs !== null && row.pace !== null && (
                        <small> {row.pace} of {row.needs} a week</small>
                      )}
                    </td>
                    <td title={row.gain_evidence ?? undefined}>
                      {row.gain === null ? 'Unknown' : `About ${row.gain}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Panel>
  );
}
