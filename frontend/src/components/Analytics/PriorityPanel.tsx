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
 *
 * Three ideas are kept apart at the top, because mixing them is how a plan asks for too
 * much: ambition (what matters most to you, the 1-10 on the goal), right now (what today
 * needs, which a close date or an audition can decide), and capacity (how much fits today,
 * from your usual day and your calendar, backend/tracking/capacity.py).
 */
import { Panel, PanelNote } from './charts';
import { Figures } from './Figures';
import { Link } from 'react-router-dom';
import type { BehaviorReminder, Capacity, PriorityDecision } from '@/services/next';

/** The most things named as "leave these alone" before the rest are folded away. */
const LEFT_SHOWN = 4;

function timeLeft(days: number | null): string {
  if (days === null) return 'No date';
  if (days === 0) return 'Today';
  return `${days.toLocaleString('en-US')} ${days === 1 ? 'day' : 'days'}`;
}

/** "1h 40m", "45m". */
function clock(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole}m`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function when(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** Ambition, right now, capacity: three questions with three different answers. */
function ThreeAnswers({ decision }: { decision: PriorityDecision }) {
  const ambition = decision.ambition_top;
  const lead = decision.lead;
  const focus = decision.focus;
  const capacity = decision.capacity;
  if (!ambition && !focus) return null;
  const nearest = focus ? decision.goals.find((row) => row.goal_id === focus.goal_id)?.commitment : null;
  return (
    <div className="ax-pri-three">
      {ambition && (
        <div className="ax-pri-three-card">
          <span className="ax-pri-three-q">Ambition</span>
          <b>{ambition.title}</b>
          <small>
            Matters most to you ({ambition.priority} of 10).
            {lead || (focus && focus.goal_id !== ambition.goal_id)
              ? ambition.gets_time ? ' Not first today, but it still gets time.' : ` Back to it ${decision.until ?? 'soon'}.`
              : ' And it comes first today too.'}
          </small>
        </div>
      )}
      <div className="ax-pri-three-card">
        <span className="ax-pri-three-q">Right now</span>
        <b>{lead ? lead.title : focus?.title}</b>
        <small>
          {lead
            ? `${lead.kind === 'task' ? 'Due' : 'On your calendar'} ${when(lead.days_left)}, so it comes first.`
            : nearest
              ? `${nearest.title} is ${when(nearest.days_left)}.`
              : focus && focus.days_left !== null
                ? `${timeLeft(focus.days_left)} left.`
                : 'Nothing is pressing, so it goes by what matters most.'}
        </small>
      </div>
      {capacity && <CapacityCard capacity={capacity} />}
    </div>
  );
}

function CapacityCard({ capacity }: { capacity: Capacity }) {
  const room = Math.max(capacity.left, 0);
  const asked = capacity.booked;
  const scale = Math.max(room, asked, 1);
  return (
    <div className={`ax-pri-three-card${capacity.over ? ' is-over' : ''}`}>
      <span className="ax-pri-three-q">Capacity today</span>
      <b>{room ? `About ${clock(room)}` : capacity.usual !== null ? "You've done your usual" : 'Little time left'}</b>
      <small>
        {capacity.usual !== null
          ? `You usually do ${clock(capacity.usual)} on ${capacity.usual_label}.`
          : 'Too little timed work to know your usual day.'}
        {capacity.busy > 0 ? ` ${clock(capacity.busy)} of today is on your calendar.` : ''}
      </small>
      {asked > 0 && (
        <div className="ax-pri-fit" role="img"
          aria-label={`Work due today: ${clock(asked)}. What fits: ${clock(room)}.`}>
          <span className="ax-pri-fit-room" style={{ width: `${(room / scale) * 100}%` }} />
          <span className={`ax-pri-fit-asked${capacity.over ? ' is-over' : ''}`} style={{ width: `${(asked / scale) * 100}%` }} />
        </div>
      )}
      {asked > 0 && (
        <small className="ax-pri-fit-words">
          Due today: {clock(asked)}{capacity.over ? `, ${clock(capacity.over)} more than fits` : ', and it fits'}.
        </small>
      )}
    </div>
  );
}

const STATE_WORD: Record<string, string> = {
  on_track: 'On track',
  behind: 'Behind',
  stalled: 'Stalled',
  done: 'All done',
  missing: 'Too new to tell',
  undated: 'No date',
};

export function PriorityPanel({ decision, reminders = [] }: {
  decision: PriorityDecision;
  /** Fixes from the Behavior page to have in mind before today's sessions. */
  reminders?: BehaviorReminder[];
}) {
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
            <li><b>Ambition:</b> How much the goal matters to you overall, the 1 to 10 you gave it. It doesn&apos;t change day to day.</li>
            <li><b>Right now:</b> How close the date is and whether your pace gets you there. A goal well ahead of its pace can wait, however important it is.</li>
            <li><b>Commitments:</b> An audition or an exam on your calendar, or a project due soon. One that&apos;s about a goal counts as that goal&apos;s date. One that isn&apos;t takes the first block of today when it&apos;s 3 days away or less.</li>
            <li><b>Capacity:</b> What fits today is what you usually get done on this weekday, capped by the free time your calendar leaves. Pick a length above to plan for something else.</li>
            <li><b>Return:</b> How much of the goal a session has really moved so far. With too few sessions, we say it's unknown.</li>
            <li><b>A close date wins:</b> Inside a week, a real date comes first. Inside two weeks, it does unless you're well ahead of it.</li>
            <li><b>No scraps:</b> A second goal only gets time if there's room for a real session.</li>
          </ul>
        </PanelNote>
      }
    >
      <p className="ax-pri-head">{decision.headline}</p>
      {decision.warning && <p className="ax-pri-warn">{decision.warning}</p>}

      <ThreeAnswers decision={decision} />

      {decision.capacity && decision.capacity.move.length > 0 && (
        <div className="ax-pri-move">
          <b>Too much is due today.</b>
          <span>
            Move {decision.capacity.move.map((row) => `"${row.title}"`).join(' and ')} to another day. No goal getting
            today&apos;s time needs {decision.capacity.move.length === 1 ? 'it' : 'them'}.
          </span>
        </div>
      )}

      {reminders.length > 0 && (
        <div className="ax-pri-remind">
          <b>Before you start</b>
          <ul>
            {reminders.map((row) => (
              <li key={row.behavior_id}>
                Do &ldquo;{row.fix}&rdquo; on {row.tasks.map((title) => `"${title}"`).join(', ')}
                {row.more ? ` and ${row.more} more` : ''}. It&apos;s your fix for &ldquo;{row.title}&rdquo;.
              </li>
            ))}
          </ul>
          <Link to="/behavior">Your patterns</Link>
        </div>
      )}

      <ul className="ax-pri-split">
        {decision.allocation.map((row) => (
          <li key={row.goal_id} className={row.kind === 'commitment' ? 'is-commitment' : undefined}>
            <span className="ax-pri-mins">{row.minutes}m</span>
            <span className="ax-pri-what">
              <b>{row.kind === 'commitment' && row.commitment?.kind === 'event' ? `Get ready: ${row.title}` : row.title}</b>
              {row.kind === 'commitment' && row.commitment && (
                <small>{row.commitment.kind === 'task' ? 'Due' : 'On your calendar'} {when(row.commitment.days_left)}. No goal covers it.</small>
              )}
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
                  <th scope="col">Ambition</th>
                  <th scope="col">Right now</th>
                  <th scope="col">Time left</th>
                  <th scope="col">Pace</th>
                  <th scope="col">A session moves it</th>
                </tr>
              </thead>
              <tbody>
                {decision.goals.map((row) => (
                  <tr key={row.goal_id} className={row.gets_time ? 'is-on' : undefined}>
                    <td>{row.title}</td>
                    <td>{row.ambition_label ?? row.matters}{row.ambition !== undefined && <small> {row.ambition} of 10</small>}</td>
                    <td>
                      {row.now ?? (row.gets_time ? 'Today' : '')}
                      {row.commitment
                        ? <small> {row.commitment.title} {when(row.commitment.days_left)}</small>
                        : row.now_why && row.now !== 'Today' && <small> {row.now_why}</small>}
                    </td>
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
