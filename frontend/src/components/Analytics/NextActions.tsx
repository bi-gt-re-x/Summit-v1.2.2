/**
 * "What should I do next?" — the plan, and the time it has to fit in.
 *
 * The panel that opens the Recommendations tab, and the one thing on this page
 * that is about the next hour rather than the last fortnight. Everything else
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
 * not, because there is no page that means "practise this for half an hour" —
 * and a link that goes somewhere unrelated is worse than no link.
 */
import { Link } from 'react-router-dom';
import { Panel, PanelNote } from './charts';
import { BUDGETS, type ActionKind, type NextAction, type Plan } from '@/utils/nextActions';
/* The same "1h 20m" the rest of the app prints. Insights carries a private
   copy of this called `hm`; this is the shared one. */
import { minutes as hm } from '@/utils/format';

/** The word beside each row, and the colour it carries. */
const KIND_LABEL: Record<ActionKind, string> = {
  overdue: 'Overdue',
  due: 'Due today',
  goal: 'Goal',
  'weak-subject': 'Weakest',
  neglected: 'Dropped',
  review: 'Review',
  stale: 'Stale',
  streak: 'Streak',
};

const KIND_TONE: Record<ActionKind, string> = {
  overdue: 'pink',
  due: 'amber',
  goal: 'violet',
  'weak-subject': 'blue',
  neglected: 'blue',
  review: 'green',
  stale: 'amber',
  streak: 'green',
};

function ActionRow({ item }: { item: NextAction }) {
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
      </div>
      <span className="ax-plan-mins">{item.minutes}m</span>
    </li>
  );
}

export interface NextActionsProps {
  plan: Plan;
  onBudget: (minutes: number) => void;
  /** Days until this week's advice is replaced. */
  weekLeft: number;
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
  weekLeft,
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
         your goals, your deadlines and the last fortnight of your own record"
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
          <p>
            In order: overdue tasks, tasks due today, the goal furthest behind, your lowest-rated
            subject, low-rated tasks you haven't revisited, a subject you've stopped, old undated
            tasks, and your streak if nothing is done today.
          </p>
          <p>
            The streak comes last on purpose, so the real work comes first.
          </p>
          <p>
            Minutes are based on how long your finished tasks usually take. The list updates when
            you finish something and resets weekly: {weekLeft}{' '}
            {weekLeft === 1 ? 'day' : 'days'} until the next one.
          </p>
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
              <ActionRow key={item.id} item={item} />
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
            {spare >= 10 ? (
              <p className="ax-plan-spare">
                {spare} min spare —{' '}
                {more.length > 0 ? 'nothing shorter to add' : 'nothing else worth suggesting'}
              </p>
            ) : (
              <span />
            )}
            <button type="button" className="ax-plan-refresh" onClick={onRefresh}>
              Re-read
            </button>
          </div>
          {more.length > 0 && (
            <details className="ax-plan-more">
              <summary>
                {more.length} more, too long for {budget} minutes
              </summary>
              <ul className="ax-plan-list">
                {more.map((item) => (
                  <ActionRow key={item.id} item={item} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Panel>
  );
}
