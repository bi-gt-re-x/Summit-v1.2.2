/**
 * "What should I do next?" — the plan, and the time it has to fit in.
 *
 * The panel that opens the Recommendations tab, and the one thing on this page
 * that is about the next hour rather than the last two weeks. Everything else
 * here reports; this decides.
 *
 * ## The budget is the interface
 *
 * The row of minute buttons is not a filter. It is the question the panel is
 * answering — *given this much time, what do I do* — and changing it produces a
 * genuinely different plan rather than a longer or shorter version of the same
 * one. Fifteen minutes gets the overdue thing and nothing else; ninety gets the
 * overdue thing, the weak subject and a review block. That is the behaviour a
 * reader should be able to feel after two presses.
 *
 * The chosen budget is remembered for the session but not saved: how long you
 * have is a fact about this morning, not a preference.
 *
 * ## What each row shows, and in what order
 *
 * The action, the reason, and the minutes. The reason is not decoration — it is
 * what separates this from a to-do list, and it is always the reader's own
 * figures rather than an adjective. "Due today" and "you rate Geometry 2.4 out
 * of 5 against 3.6 elsewhere" are both reasons; "high priority" is not, because
 * the reader is the one who typed that.
 *
 * Rows that name a real task carry a link to it. Rows that name a subject do
 * not, because there is no page that means "practice this for half an hour" —
 * and a link that goes somewhere unrelated is worse than no link.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel, PanelNote } from './charts';
import {
  BUDGETS,
  bookSessions,
  clearLeftovers,
  type ActionKind,
  type NextAction,
  type Plan,
} from '@/services/next';
/* The same "1h 20m" the rest of the app prints. Insights carries a private
   copy of this called `hm`; this is the shared one. */
import { minutes as hm } from '@/utils/format';

/** The word beside each row, and the colour it carries. */
const KIND_LABEL: Record<ActionKind, string> = {
  deadline: 'Deadline',
  triage: 'Your list',
  misses: 'Missed',
  stuck: 'Fix',
  overdue: 'Overdue',
  due: 'Due today',
  goal: 'Goal',
  'weak-subject': 'Weakest',
  neglected: 'Dropped',
  review: 'Review',
  stale: 'Stale',
  momentum: 'On a run',
  streak: 'Streak',
  slipping: 'Slipping',
  'goal-quiet': 'Goal',
  xp: 'XP',
};

const KIND_TONE: Record<ActionKind, string> = {
  deadline: 'violet',
  triage: 'amber',
  misses: 'pink',
  stuck: 'blue',
  overdue: 'pink',
  due: 'amber',
  goal: 'violet',
  'weak-subject': 'blue',
  neglected: 'blue',
  review: 'green',
  stale: 'amber',
  /* The one row that is not about something being wrong, so it is the one
     row that does not wear a warning colour. */
  momentum: 'violet',
  streak: 'green',
  slipping: 'amber',
  'goal-quiet': 'violet',
  xp: 'blue',
};

/**
 * The one thing a row can do for you, when it can do something: put a dated
 * goal's sittings on the calendar, or clear a pile of leftover routines. Both
 * ask the server, which works the answer out again from the record, and the
 * plan is re-read afterwards so the row reflects what changed.
 */
function RowAction({ item, onDone }: { item: NextAction; onDone: () => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [note, setNote] = useState<string | null>(null);

  const book = item.kind === 'deadline' && item.book && item.goalId ? item.book : null;
  const clear = item.kind === 'triage' && item.clear?.length ? item.clear : null;
  if (!book && !clear) return null;

  const run = async () => {
    if (clear && !window.confirm(`Delete ${clear.length} leftover routines? This can't be undone.`)) return;
    setState('busy');
    setNote(null);
    const result = book ? await bookSessions(item.goalId as string) : await clearLeftovers(clear as string[]);
    if (!result.success) {
      setState('idle');
      setNote(result.message ?? "That didn't work. Try again.");
      return;
    }
    setState('done');
    if (book && 'booked' in result) {
      const count = result.booked.length;
      setNote(`Booked ${count} ${count === 1 ? 'session' : 'sessions'}. They're on your calendar.`);
    } else if ('cleared' in result) {
      setNote(`Cleared ${result.cleared.length}.`);
    }
    onDone();
  };

  return (
    <div className="ax-plan-act">
      {state !== 'done' && (
        <button type="button" className="ax-plan-act-btn" disabled={state === 'busy'} onClick={() => void run()}>
          {state === 'busy'
            ? 'Working…'
            : book
              ? `Book ${book.count === 1 ? 'it' : `these ${book.count}`}`
              : 'Clear them'}
        </button>
      )}
      {note && <span className="ax-plan-act-note">{note}</span>}
    </div>
  );
}

function ActionRow({ item, onDone }: { item: NextAction; onDone: () => void }) {
  return (
    <li className="ax-plan-row">
      <span className={`ax-plan-tag is-${KIND_TONE[item.kind]}`}>{KIND_LABEL[item.kind]}</span>
      <div className="ax-plan-body">
        <p className="ax-plan-title">
          {item.taskId ? (
            /* Straight to the list the task lives on. There is no per-task
               route, so this is as close as an honest link gets. */
            <Link to="/tasks" className="ax-plan-link">
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </p>
        <p className="ax-plan-why">{item.because}</p>
        <RowAction item={item} onDone={onDone} />
      </div>
      <span className="ax-plan-mins">{item.minutes}m</span>
    </li>
  );
}

export interface NextActionsProps {
  plan: Plan;
  onBudget: (minutes: number) => void;
  /**
   * The reader's typical sitting, in minutes, from their logged focus time.
   *
   * Context for the budget buttons above, which ask how long they have got and
   * offered no help answering it. Somebody who has sat for forty minutes at a
   * time all month is being asked to guess at a number this panel already
   * knows the usual value of. Optional: an account that logs no sessions has
   * nothing to say here, and a made-up default would be worse than silence.
   */
  typicalSession?: number | null;
  onRefresh: () => void;
}

export function NextActions({
  plan,
  onBudget,
  onRefresh,
  typicalSession,
}: NextActionsProps) {
  const { actions, more, spare, budget, planned } = plan;
  /* Under thirty seconds is not a sitting, it is a rounding artefact of a
     timer left running — so it is not offered as one. */
  const usual = typeof typicalSession === 'number' && typicalSession >= 1
    ? `you usually sit for ${hm(typicalSession)}`
    : null;

  return (
    <Panel
      title="What to do next"
      /* Just the arithmetic. It used to carry the whole provenance — "from
         your goals, your deadlines and the last two weeks of your own record"
         — which is a sentence the reader needs once, not on every visit above
         a plan they came here to read. It is in the footer note instead. */
      note={
        actions.length > 0
          ? [`${planned} of ${budget} minutes planned`, usual].filter(Boolean).join(' · ')
          : undefined
      }
      className="ax-plan"
      aside={
        <div className="ax-plan-budget" role="group" aria-label="Time available">
          {BUDGETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={`ax-plan-budget-btn${minutes === budget ? ' is-on' : ''}`}
              aria-pressed={minutes === budget}
              onClick={() => onBudget(minutes)}
            >
              {minutes}m
            </button>
          ))}
        </div>
      }
      footer={
        <PanelNote label="How this is chosen">
          <p className="ax-tips-head">First up</p>
          <ul className="ax-tips">
            <li><b>Beat the deadline:</b> Your next goal date gets the sessions it needs this week.</li>
            <li><b>Clear the pile:</b> Old routines you missed get one row, so you can clear them fast.</li>
            <li><b>Fix your misses:</b> Problems you got wrong lately come back first.</li>
            <li><b>Change your start:</b> If rough sessions keep going wrong the same way, you get a fix.</li>
          </ul>
          <p className="ax-tips-head">Then</p>
          <ul className="ax-tips">
            <li><b>Finish what's due:</b> Overdue tasks, then tasks due today.</li>
            <li><b>Catch up:</b> Goals falling behind and subjects you've let slide.</li>
            <li><b>Do or drop:</b> Old tasks with no due date.</li>
            <li><b>Keep it going:</b> Your streak, if nothing's done today.</li>
          </ul>
          <p className="ax-tips-head">Good to know</p>
          <ul className="ax-tips">
            <li><b>No repeats:</b> A subject you worked on today won't show up again.</li>
            <li><b>Real minutes:</b> Times come from how long your tasks usually take.</li>
            <li><b>Just start:</b> If a row needs more time than you have, it's last. Starting still counts.</li>
          </ul>
        </PanelNote>
      }
    >
      {actions.length === 0 ? (
        <p className="ax-empty">
          Nothing overdue, no goals behind and no weak subjects. You're all caught up.
        </p>
      ) : (
        <>
          <ul className="ax-plan-list">
            {actions.map((item) => (
              <ActionRow key={item.id} item={item} onDone={onRefresh} />
            ))}
          </ul>
          {/* One line under the rule rather than three stacked ones. The spare
              minutes are a fact about the plan and Re-read is what you do about
              it, so they belong on the same line at opposite ends — as a stack
              they read as one paragraph of small grey text with a link lost in
              the middle of it. */}
          <div className="ax-plan-foot">
            {/* Only when there is something left over. A plan that fills its
                budget has nothing to say here that the heading did not already
                say in the same two numbers. */}
            {/* Spare minutes now mean one thing only. Anything left over that
                is worth a row has already been trimmed into the plan by
                `buildPlan`, so a gap this size is the list running out rather
                than the packing giving up — the old "nothing shorter to add"
                branch could no longer be reached. */}
            {spare >= 10 ? (
              <p className="ax-plan-spare">{spare} min spare. Nothing else to add.</p>
            ) : (
              <span />
            )}
            <button type="button" className="ax-plan-refresh" onClick={onRefresh}>
              Re-read
            </button>
          </div>
          {more.length > 0 && (
            <details className="ax-plan-more">
              {/* What they actually need, not the budget they did not fit.
                  "5 more, too long for 45 minutes" was wrong twice over: the
                  budget is not what they were measured against — the minutes
                  left after the plan was packed are — and a reader with 45
                  minutes reads it as "none of this is ever worth doing today".
                  The shortest one's length is the number that answers the
                  question the fold is hiding. */}
              <summary>
                {more.length} more · the shortest needs{' '}
                {Math.min(...more.map((item) => item.minutes))} min
              </summary>
              <ul className="ax-plan-list">
                {more.map((item) => (
                  <ActionRow key={item.id} item={item} onDone={onRefresh} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Panel>
  );
}
