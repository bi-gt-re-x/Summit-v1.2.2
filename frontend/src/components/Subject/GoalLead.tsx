/**
 * What this subject is for, first on the page.
 *
 * The reading comes from backend/tracking/subject_read.py: which goal the work here
 * feeds, whether the plan puts that goal first, and what that means for the time
 * spent here. Under it, the goal itself, the other goals this work moves, and any
 * goal filed here whose work is somewhere else.
 */
import { Link } from 'react-router-dom';
import { Figures } from '@/components/Analytics/Figures';
import { Suggestion } from '@/components/Analytics/Suggestion';
import type { GoalPace, SubjectGoalRead, SubjectGoalRow, SubjectStance } from '@/services/subjectGoal';

const PACE: Record<GoalPace, { word: string; tone: 'good' | 'bad' | 'flat' }> = {
  on_track: { word: 'On track', tone: 'good' },
  behind: { word: 'Behind', tone: 'bad' },
  stalled: { word: 'Stalled', tone: 'bad' },
  missing: { word: 'No pace yet', tone: 'flat' },
  undated: { word: 'No date', tone: 'flat' },
  done: { word: 'Reached', tone: 'good' },
};

/** The plan's call on the goal, in a word or two. */
const CALL: Record<SubjectStance, string> = {
  first: "Your plan's top goal",
  also: 'Moves with your top goal',
  second: 'Next in your plan',
  waits: 'Waiting in your plan',
  none: '',
};

function daysLeft(row: SubjectGoalRow): string {
  if (row.days_left === null) return '';
  return `${row.days_left.toLocaleString('en-US')} ${row.days_left === 1 ? 'day' : 'days'} left`;
}

/** "136 of its 176 tasks are here", agreeing with the count. */
function workHere(here: number, total: number): string {
  return `${here.toLocaleString('en-US')} of its ${total.toLocaleString('en-US')} tasks ${here === 1 ? 'is' : 'are'} here`;
}

function FileButton({ goalId, busy, onFile }: { goalId: string; busy: string; onFile: (goalId: string) => void }) {
  return (
    <button type="button" className="sgo-file-btn" disabled={busy !== ''} onClick={() => onFile(goalId)}>
      {busy === goalId ? 'Filing…' : 'File it here'}
    </button>
  );
}

export function GoalLead({
  read,
  subject,
  busy,
  error,
  onFile,
  onMove,
}: {
  read: SubjectGoalRead;
  subject: string;
  /** The id being written, while one is. */
  busy: string;
  error: string;
  onFile: (goalId: string) => void;
  onMove: (goalId: string, home: string) => void;
}) {
  const { card, goals, misfiled, lead, stance } = read;
  const main = goals.find((row) => row.goal_id === lead) ?? null;
  const others = goals.filter((row) => row.goal_id !== lead);

  return (
    <section className={`ax-panel sb-panel sgo-lead is-${card.tone}`} aria-label="What this subject is for">
      <h2 className="sgo-lead-title">{card.title}</h2>
      <p className="sgo-lead-figures">
        <Figures text={card.figures} every />
      </p>
      <Suggestion text={card.suggests} />

      {main && (
        <div className="sgo-goal-main">
          <div className="sgo-goal-head">
            <span className="sgo-goal-kicker">{CALL[stance]}</span>
            <Link className="sgo-goal-name" to="/goals">
              {main.title}
            </Link>
            <span className={`sgo-pace is-${PACE[main.state].tone}`}>{PACE[main.state].word}</span>
          </div>
          {main.percent !== null && (
            <span
              className="sgo-goal-bar"
              role="img"
              aria-label={`${main.percent}% done`}
            >
              <span style={{ width: `${Math.max(0, Math.min(100, main.percent))}%` }} />
            </span>
          )}
          <p className="sgo-goal-meta">
            {main.percent !== null && <>{main.percent}% done</>}
            {main.percent !== null && main.days_left !== null && ' · '}
            {daysLeft(main)}
            {main.next && (
              <>
                {' · '}Next: <b>{main.next}</b>
              </>
            )}
          </p>
          {!main.filed && main.work_total > 0 && (
            <p className="sgo-file">
              {workHere(main.work_here, main.work_total)}, but it isn't filed under {subject}.
              <FileButton goalId={main.goal_id} busy={busy} onFile={onFile} />
            </p>
          )}
        </div>
      )}

      {others.length > 0 && (
        <ul className="sgo-goal-others" aria-label="Other goals this work feeds">
          {others.map((row) => (
            <li key={row.goal_id}>
              <div className="sgo-goal-head">
                <Link className="sgo-goal-name" to="/goals">
                  {row.title}
                </Link>
                <span className={`sgo-pace is-${PACE[row.state].tone}`}>{PACE[row.state].word}</span>
                {!row.filed && row.work_total > 0 && <FileButton goalId={row.goal_id} busy={busy} onFile={onFile} />}
              </div>
              {row.note && <p className="sgo-goal-note">{row.note}</p>}
            </li>
          ))}
        </ul>
      )}

      {misfiled.length > 0 && (
        <ul className="sgo-misfiled" aria-label="Goals filed here with their work elsewhere">
          {misfiled.map((row) => (
            <li key={row.goal_id}>
              <p>
                <b>{row.title}</b> is filed under {subject}, but {workHere(row.work_here, row.work_total)}
                {row.home_name ? `. Most are in ${row.home_name}.` : '.'}
              </p>
              {row.home && (
                <button
                  type="button"
                  className="sgo-file-btn"
                  disabled={busy !== ''}
                  onClick={() => onMove(row.goal_id, row.home ?? '')}
                >
                  {busy === row.goal_id ? 'Moving…' : `Move to ${row.home_name}`}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="sb-link-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
