/**
 * "Will you make it?" — each dated goal, at the pace you're going.
 *
 * The one card on this page that looks ahead. For every active goal with a
 * date, the server (backend/tracking/forecast.py) works out what's left, how
 * many sessions a week went into it lately, and so when it'd finish. Then it
 * says why (backend/tracking/goal_why.py): the main cause, and what's behind
 * it from the task names, the next step, any slump, when the work gets done and
 * how it's going. This only draws that. When there's too little to go on it
 * says what's missing instead.
 *
 * A goal that's short this week gets one button, which books the missing
 * sessions through the same booking as the plan's deadline row. The server
 * works the count out again, so a stale page can't over-book.
 */
import { useCallback, useEffect, useState } from 'react';
import { Panel, PanelNote } from './charts';
import { bookForecast, goalForecast, type ForecastState, type GoalForecast as Forecast } from '@/services/forecast';

/** How many goals show before the rest fold away. */
const SHOWN = 3;
/** The strongest reasons under each goal. The server sends up to five. */
const POINTS_SHOWN = 2;
const TROUBLE_FIRST: Record<ForecastState, number> = {
  stalled: 0,
  behind: 1,
  on_track: 2,
  missing: 3,
  done: 4,
};

const STATE_LABEL: Record<ForecastState, string> = {
  on_track: 'On track',
  behind: 'Behind',
  stalled: 'Stalled',
  done: 'Done',
  missing: 'Need data',
};

const STATE_TONE: Record<ForecastState, string> = {
  on_track: 'green',
  behind: 'amber',
  stalled: 'pink',
  done: 'green',
  missing: 'blue',
};

function BookButton({ row, onDone }: { row: Forecast; onDone: () => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    setState('busy');
    setNote(null);
    const result = await bookForecast(row.goal_id);
    if (!result.success) {
      setState('idle');
      setNote(result.message ?? "That didn't work. Try again.");
      return;
    }
    const count = result.booked.length;
    setState('done');
    setNote(`Booked ${count} ${count === 1 ? 'session' : 'sessions'}. They're on your calendar.`);
    onDone();
  };

  return (
    <div className="ax-plan-act">
      {state !== 'done' && (
        <button type="button" className="ax-plan-act-btn" disabled={state === 'busy'} onClick={() => void run()}>
          {state === 'busy'
            ? 'Booking…'
            : `Book ${row.to_book} ${row.to_book === 1 ? 'session' : 'sessions'} this week`}
        </button>
      )}
      {note && <span className="ax-plan-act-note">{note}</span>}
    </div>
  );
}

const DUE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function dueLabel(iso: string) {
  const day = new Date(`${iso}T12:00:00`);
  return Number.isNaN(day.getTime()) ? '' : `Due ${DUE.format(day)}`;
}

function ForecastRow({ row, onBooked }: { row: Forecast; onBooked: () => void }) {
  const booked =
    row.to_book === 0 && row.booked_this_week > 0 && (row.state === 'behind' || row.state === 'stalled')
      ? `${row.booked_this_week} booked this week.`
      : null;
  return (
    <li className="ax-plan-row">
      <span className={`ax-plan-tag is-${STATE_TONE[row.state]}`}>{STATE_LABEL[row.state]}</span>
      <div className="ax-plan-body">
        <p className="ax-plan-title">{row.title}</p>
        <p className="ax-plan-why ax-goal-lead">{row.why.lead}</p>
        {row.why.points.length > 0 && (
          <ul className="ax-tips ax-goal-points">
            {row.why.points.slice(0, POINTS_SHOWN).map((point) => (
              <li key={point.label}>
                <b>{point.label}:</b> {point.text}
              </li>
            ))}
          </ul>
        )}
        {booked && <p className="ax-plan-why">{booked}</p>}
        {row.to_book > 0 && <BookButton row={row} onDone={onBooked} />}
      </div>
      <span className="ax-plan-mins">
        <span>{row.days_left === 0 ? 'Today' : `${row.days_left} ${row.days_left === 1 ? 'day' : 'days'}`}</span>
        <small className="ax-goal-due">{dueLabel(row.deadline)}</small>
      </span>
    </li>
  );
}

/**
 * `reload` is the page's refresh nudge: when the plan below books sessions for
 * a goal, this reads the forecast again so the two don't disagree.
 */
export function GoalForecast({ onBooked, reload = 0 }: { onBooked?: () => void; reload?: number }) {
  const [rows, setRows] = useState<Forecast[] | null>(null);

  const load = useCallback(async () => {
    const result = await goalForecast();
    setRows(result.success ? result.goals : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load, reload]);

  /* Nothing until it's read, and nothing for an account with no dated goals.
     An empty card above the plan would just push the plan down. */
  if (!rows || rows.length === 0) return null;

  const booked = () => {
    void load();
    onBooked?.();
  };
  /* The goals in trouble first, then by date, which is how the server sends them. */
  const ranked = [...rows].sort((a, b) => TROUBLE_FIRST[a.state] - TROUBLE_FIRST[b.state]);
  const shown = ranked.slice(0, SHOWN);
  const more = ranked.slice(SHOWN);

  return (
    <section className="ax-section">
      <Panel
        title="Will you make it?"
        className="ax-plan"
        footer={
          <PanelNote label="How this works">
            <ul className="ax-tips">
              <li>
                <b>What's left:</b> Steps not done yet, or the gap to your number.
              </li>
              <li>
                <b>Your pace:</b> Finished tasks a week on this goal over the last 4 weeks. A task counts if it's linked or its name says so. Until there are 4 of those, the whole subject counts.
              </li>
              <li>
                <b>Your finish:</b> The sessions a step has taken you so far, times the steps left, at your pace.
              </li>
              <li>
                <b>The why:</b> Task names, your next step, any slump, when you do the work and how it's going.
              </li>
              <li>
                <b>No guessing:</b> With under 2 weeks of sessions, or nothing to go on, we say what's missing.
              </li>
            </ul>
          </PanelNote>
        }
      >
        <ul className="ax-plan-list">
          {shown.map((row) => (
            <ForecastRow key={row.goal_id} row={row} onBooked={booked} />
          ))}
        </ul>
        {more.length > 0 && (
          <details className="ax-plan-more">
            <summary>
              {more.length} more {more.length === 1 ? 'goal' : 'goals'}
            </summary>
            <ul className="ax-plan-list">
              {more.map((row) => (
                <ForecastRow key={row.goal_id} row={row} onBooked={booked} />
              ))}
            </ul>
          </details>
        )}
      </Panel>
    </section>
  );
}
