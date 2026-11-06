/**
 * What this subject is for, first on the page, drawn rather than written.
 *
 * The reading is backend/tracking/subject_read.py: which goal the work here feeds,
 * where the plan puts it, a short title and one thing to try. The numbers under the
 * title are drawn: what the goal needs a week against what it gets, days left, how
 * far along it is, and how much of the recent work was on it.
 */
import { Link } from 'react-router-dom';
import type { GoalPace, SubjectGoalRead, SubjectGoalRow, SubjectStance } from '@/services/subjectGoal';

const PACE: Record<GoalPace, { word: string; tone: 'good' | 'bad' | 'flat' }> = {
  on_track: { word: 'On track', tone: 'good' },
  behind: { word: 'Behind', tone: 'bad' },
  stalled: { word: 'Stalled', tone: 'bad' },
  missing: { word: 'No pace yet', tone: 'flat' },
  undated: { word: 'No date', tone: 'flat' },
  done: { word: 'Reached', tone: 'good' },
};

const CALL: Record<SubjectStance, string> = {
  first: 'Top goal',
  also: 'Moves with your top goal',
  second: 'Next in your plan',
  waits: 'Can wait',
  none: 'No goal here',
};

const week = (value: number) => `${value % 1 === 0 ? value : value.toFixed(1)}/wk`;

/** A small ring for a share, with the number in the middle. */
function Ring({ percent, tone }: { percent: number; tone: string }) {
  const r = 22;
  const around = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, percent)) / 100) * around;
  return (
    <svg className={`sgo-ring is-${tone}`} viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
      <circle cx="28" cy="28" r={r} className="sgo-ring-track" />
      <circle cx="28" cy="28" r={r} className="sgo-ring-fill" strokeDasharray={`${filled} ${around}`} transform="rotate(-90 28 28)" />
      <text x="28" y="32" textAnchor="middle">{Math.round(percent)}%</text>
    </svg>
  );
}

function FileButton({ goalId, busy, onFile }: { goalId: string; busy: string; onFile: (goalId: string) => void }) {
  return (
    <button type="button" className="sgo-file-btn" disabled={busy !== ''} onClick={() => onFile(goalId)}>
      {busy === goalId ? 'Filing…' : 'File it here'}
    </button>
  );
}

function Pace({ row }: { row: SubjectGoalRow }) {
  return <span className={`sgo-pace is-${PACE[row.state].tone}`}>{PACE[row.state].word}</span>;
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
  const meter = card.meter;
  const scale = meter ? Math.max(meter.needs, meter.does, 0.1) : 1;
  const short = meter ? meter.does < meter.needs : false;

  return (
    <section className={`ax-panel sb-panel sgo-lead is-${card.tone}`} aria-label="What this subject is for">
      <div className="sgo-lead-top">
        <span className={`sgo-call is-${stance}`}>{CALL[stance]}</span>
        {main && (
          <>
            <Link className="sgo-goal-name" to="/goals">
              {main.title}
            </Link>
            <Pace row={main} />
          </>
        )}
      </div>

      <h2 className="sgo-lead-title">{card.title}</h2>

      <div className="sgo-lead-grid">
        {meter && (
          <div className="sgo-meter" role="img" aria-label={`Needs ${week(meter.needs)}, you do ${week(meter.does)}`}>
            <p className="sgo-label">Sessions a week</p>
            <div className="sgo-meter-row">
              <span>Needs</span>
              <span className="sgo-bar"><span className="is-need" style={{ width: `${(meter.needs / scale) * 100}%` }} /></span>
              <b>{week(meter.needs)}</b>
            </div>
            <div className="sgo-meter-row">
              <span>You do</span>
              <span className="sgo-bar">
                <span className={short ? 'is-short' : 'is-enough'} style={{ width: `${(meter.does / scale) * 100}%` }} />
              </span>
              <b>{week(meter.does)}</b>
            </div>
          </div>
        )}

        <div className="sgo-tiles">
          {card.days_left !== undefined && card.days_left !== null && (
            <div className="sgo-tile">
              <b>{card.days_left.toLocaleString('en-US')}</b>
              <span>days left</span>
            </div>
          )}
          {main && main.percent !== null && (
            <div className="sgo-tile is-ring" aria-label={`${main.percent}% done`}>
              <Ring percent={main.percent} tone={PACE[main.state].tone} />
              <span>done</span>
            </div>
          )}
          {card.on_goal && (
            <div className="sgo-tile">
              <b>
                {card.on_goal.on}
                <small>/{card.on_goal.of}</small>
              </b>
              <span>tasks on it, {card.on_goal.days}d</span>
            </div>
          )}
          {card.spare !== undefined && (
            <div className="sgo-tile is-spare">
              <b>+{card.spare}</b>
              <span>spare a week</span>
            </div>
          )}
          {card.recent !== undefined && (
            <div className="sgo-tile">
              <b>{card.recent}</b>
              <span>tasks in 30d</span>
            </div>
          )}
        </div>
      </div>

      <p className="sgo-tip">
        <span aria-hidden="true">→</span> {card.tip}
      </p>

      {main && !main.filed && main.work_total > 0 && (
        <p className="sgo-file">
          Not filed under {subject} yet. <FileButton goalId={main.goal_id} busy={busy} onFile={onFile} />
        </p>
      )}

      {others.length > 0 && (
        <ul className="sgo-chips" aria-label="Other goals this work feeds">
          {others.map((row) => (
            <li key={row.goal_id} className="sgo-chip" title={row.note || undefined}>
              <Link className="sgo-goal-name" to="/goals">
                {row.title}
              </Link>
              <Pace row={row} />
              {row.note && <span className="sgo-chip-note">{row.note}</span>}
              {!row.filed && row.work_total > 0 && <FileButton goalId={row.goal_id} busy={busy} onFile={onFile} />}
            </li>
          ))}
        </ul>
      )}

      {misfiled.length > 0 && (
        <ul className="sgo-misfiled" aria-label="Goals filed here with their work elsewhere">
          {misfiled.map((row) => (
            <li key={row.goal_id}>
              <span>
                <b>{row.title}</b> is filed here, but{' '}
                {row.work_here === 0 ? 'none' : `${row.work_here} of ${row.work_total}`} of its tasks are.
              </span>
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
