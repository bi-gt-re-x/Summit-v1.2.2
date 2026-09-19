/**
 * The Tasks card: three tabs over one list, split into its two halves.
 *
 * The tabs are a filter, not three lists — `bucketTasks` does the splitting and
 * this only chooses which bucket to draw. Inside a bucket the list keeps the
 * Todo / Calendar division the dashboard has always drawn, because those two
 * behave differently: a calendar task also occupies a block on the week grid.
 *
 * The list is capped. This account has 238 upcoming tasks, and a card that
 * renders all of them is a card nobody scrolls to the bottom of — so it shows
 * the first `VISIBLE` and says how many more there are, with "View all tasks"
 * going to the page whose job that is.
 */
import { Link } from 'react-router-dom';
import { TaskRow } from './TaskRow';
import { DayComplete } from '@/components/Tasks';
import { isCalendarTask } from './summary';
import { subjectOf } from '@/hooks/useSubjects';
import type { TaskBuckets } from './summary';
import type { Subject } from '@/services/subjects';
import type { Task } from '@/types';
import { Card } from '@/components/ui';

/**
 * How many rows a tab shows before it defers to the tasks page.
 *
 * Today keeps its short list — it is a plate, and a plate you cannot see the
 * end of is not a plate. The other two are histories rather than plates, so
 * they run to ten: the next ten things coming, and the last ten finished.
 */
const VISIBLE: Record<TaskTab, number> = { today: 6, upcoming: 10, completed: 10 };

export type TaskTab = 'today' | 'upcoming' | 'completed';

const TABS: Array<{ id: TaskTab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
];

export interface TaskPanelProps {
  buckets: TaskBuckets;
  tab: TaskTab;
  onTabChange: (tab: TaskTab) => void;
  busyId: string | null;
  /** The subject catalogue by id, so a row can draw what it is about. */
  subjects: Map<string, Subject>;
  onComplete: (task: Task) => void;
  onAdd: () => void;
  /** Whether the account rates its work, so whether the day button offers it. */
  canReview: boolean;
  /** Finish everything on the Today tab. `review` is the dialog's checkbox. */
  onCompleteDay: (review: boolean) => void;
  /** Mid-write: the day button says so and refuses a second press. */
  busy: boolean;
}

function Section({
  heading,
  items,
  done,
  busyId,
  subjects,
  onComplete,
  empty,
}: {
  heading: string;
  items: Task[];
  done: boolean;
  busyId: string | null;
  subjects: Map<string, Subject>;
  onComplete: (task: Task) => void;
  /** What to say when there is nothing. Omitted, the section draws nothing. */
  empty?: string;
}) {
  /* An empty bucket draws nothing at all — not a heading over the words
     "Nothing here yet", which is a label for an absence and takes up as much
     room as two real rows. The Today tab shows two of these side by side, so
     an account keeping only calendar tasks was reading a heading and an
     apology above every list it had.

     `empty` is the exception: the tab that has *no* rows anywhere still has to
     say so, and its caller passes it. Otherwise the whole panel would go
     blank with nothing to explain it. */
  if (items.length === 0) {
    return empty ? <p className="dash-task-empty">{empty}</p> : null;
  }

  return (
    <div className="dash-task-group">
      <h3 className="dash-task-head">{heading}</h3>
      <ul className="dash-task-list">
        {items.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            done={done}
            busy={busyId === task.id}
            subject={subjectOf(subjects, task.subject)}
            onComplete={onComplete}
          />
        ))}
      </ul>
    </div>
  );
}

export function TaskPanel({
  buckets,
  tab,
  onTabChange,
  busyId,
  subjects,
  onComplete,
  onAdd,
  canReview,
  onCompleteDay,
  busy,
}: TaskPanelProps) {
  // Upcoming is the calendar's list. Everything in it is scheduled onto a day
  // and drawn on the week grid, which is what makes "the next ten" a sentence
  // about something — an undated todo has no place in an ordering by when.
  const all = tab === 'upcoming' ? buckets.upcoming.filter(isCalendarTask) : buckets[tab];
  const shown = all.slice(0, VISIBLE[tab]);
  const hidden = all.length - shown.length;

  return (
    <Card className="dash-panel dash-tasks">
      <header className="dash-panel-head">
        <h2 className="dash-panel-title">Tasks</h2>

        <div className="dash-tabs" role="tablist" aria-label="Which tasks to show">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`dash-tab${tab === id ? ' is-active' : ''}`}
              onClick={() => onTabChange(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <button type="button" className="dash-add" onClick={onAdd}>
          + Add Task
        </button>
      </header>

      <div className="dash-task-scroll">
        {/* A tab with nothing in it anywhere says so once, here, rather than
            once per empty section — see the note on `Section`. */}
        {tab === 'completed' ? (
          <Section
            heading="Completed Tasks"
            items={shown}
            done
            busyId={busyId}
            subjects={subjects}
            onComplete={onComplete}
            empty="Nothing finished yet today."
          />
        ) : tab === 'upcoming' ? (
          /* One list, because the filter above already made it one kind. The
             Todo / Calendar split below is Today's, where both kinds land. */
          <Section
            heading="Calendar Tasks"
            items={shown}
            done={false}
            busyId={busyId}
            subjects={subjects}
            onComplete={onComplete}
            empty="Nothing scheduled ahead."
          />
        ) : shown.length === 0 ? (
          <p className="dash-task-empty">Nothing on today&rsquo;s plate.</p>
        ) : (
          <>
            <Section
              heading="Todo Tasks"
              items={shown.filter((task) => !isCalendarTask(task))}
              done={false}
              busyId={busyId}
              subjects={subjects}
              onComplete={onComplete}
            />
            <Section
              heading="Calendar Tasks"
              items={shown.filter(isCalendarTask)}
              done={false}
              busyId={busyId}
              subjects={subjects}
              onComplete={onComplete}
            />
          </>
        )}
      </div>

      {/* Today only: the other two tabs are histories rather than plates, and
          there is nothing to finish in a list of what is already done or of
          what is not due yet. `hidden` is the card's row cap rather than a
          filter, but it is the same disclosure — the button completes the
          whole tab, including the rows this card had no room for. */}
      {tab === 'today' && (
        <DayComplete
          tasks={all}
          hidden={hidden}
          busy={busy}
          canReview={canReview}
          onConfirm={onCompleteDay}
        />
      )}

      <Link className="dash-panel-link" to="/tasks">
        {hidden > 0 ? `View all tasks (${hidden} more)` : 'View all tasks'}
        <span aria-hidden="true"> →</span>
      </Link>
    </Card>
  );
}
