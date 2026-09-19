/**
 * Summit's read on one goal: what is in the way, and what to do this week.
 *
 * ## What is a model's job here and what is not
 *
 * Everything else in the drawer is arithmetic over the account's own tasks —
 * the rate, the bottleneck, the health signals, what each checkpoint is
 * holding. That stays arithmetic, and this panel does not recompute any of
 * it. What arithmetic cannot do is the part that needs to know what the goal
 * *is*: "it needs 1.6 points a week and is getting 1.2" is true and useless to
 * somebody who does not know what a point on the AMC 8 is made of, and
 * turning it into "a mixed counting set at difficulty 4 to 5" requires knowing
 * the field. There is no table in this app that knows.
 *
 * That is the same argument backend/tracking/goal_plan.py already makes, and
 * this is that endpoint — the figures the page drew are sent up, the model is
 * told to use those and produce no others, and it writes the route over them.
 * Nothing is stored: it costs a call and is asked for by hand.
 *
 * ## The evidence gate, which is most of the design
 *
 * A read over two finished tasks is a model being asked to find a pattern in
 * noise, and it will find one, because that is what it does. The reader cannot
 * tell that answer apart from one drawn from forty tasks — both arrive as
 * confident prose — so the panel refuses rather than degrading, and says how
 * much more it needs.
 *
 * `EVIDENCE` is deliberately a count of *finished, linked* work rather than of
 * days or of tasks in the subject. It is the same evidence `goalHealth` reads
 * recency and consistency from, and the thing the whole page means by "work
 * toward this goal": an account can be busy every day and have done nothing
 * about the goal it is worried about.
 *
 * ## What the reader is shown about the answer
 *
 * The read sits above the app's own figures rather than replacing them, and
 * the panel says which is which. A model's paragraph and a counted percentage
 * look identical on a screen, and the entire value of these pages is that
 * their readers can tell the difference.
 */
import { useState } from 'react';
import { analytics as analyticsService } from '@/services';
import { fmtGoalNumber, formatGoalDate, goalNumbers } from './numbers';
import { goalHealth, goalPace, healthFactors } from '@/utils/goalHealth';
import type { GoalPlan } from '@/services/analytics';
import type { Goal, Task } from '@/types';
import { countsToward } from '@/utils/goalLinks';

/** Finished, linked tasks before a read is worth asking for. */
export const EVIDENCE = 4;

/** Every task that is work toward this goal, by either route. */
function linkedTo(goal: Goal, tasks: Task[]): Task[] {
  const stones = new Set((goal.milestones ?? []).map((stone) => stone.id));
  return tasks.filter(
    (task) => countsToward(task, goal.id) || (task.milestone_id && stones.has(task.milestone_id)),
  );
}

export interface GoalReadProps {
  goal: Goal;
  tasks: Task[];
  /** Turns a subject id into its name, for the brief the model is given. */
  nameOf: (id: string) => string;
}

export function GoalRead({ goal, tasks, nameOf }: GoalReadProps) {
  const [plan, setPlan] = useState<GoalPlan | null>(null);
  const [thinking, setThinking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const done = linkedTo(goal, tasks).filter((task) => task.status === 'done');
  const short = Math.max(0, EVIDENCE - done.length);

  const ask = async () => {
    setThinking(true);
    setFailed(null);
    const numbers = goalNumbers(goal);
    const pace = goalPace(goal);
    const health = goalHealth(goal, tasks);

    try {
      /* Every figure here is one the drawer already drew. Sending them rather
         than letting the server recompute is what keeps the read quoting the
         same numbers the reader is looking at — the argument in
         services/analytics's own note on `GoalPlanFindings`. */
      const result = await analyticsService.writeGoalPlan({
        goal: goal.title,
        subject: String(goal.subject_ids ?? '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
          .map(nameOf)
          .join(', '),
        why: goal.why || goal.description || '',
        standing: `${Math.round(numbers.progress)}% — ${fmtGoalNumber(numbers.current, numbers)} of ${fmtGoalNumber(numbers.target, numbers)}`,
        deadline: goal.deadline ? formatGoalDate(String(goal.deadline)) : '',
        days_left: health.signals.daysLeft,
        need_weekly: pace.need === null ? '' : `${Math.round(pace.need * 7 * 10) / 10} a week`,
        have_weekly: pace.have === null ? '' : `${Math.round(pace.have * 7 * 10) / 10} a week`,
        expected: health.signals.expected === null ? null : Math.round(health.signals.expected * 100),
        stages: (goal.milestones ?? []).map(
          (stone) => `${stone.title}${stone.status === 'done' ? ' (reached)' : ''}`,
        ),
        /* The diagnosis the page already made, as the sentences it wrote. The
           model is being asked to route around these, not to rediscover them —
           and a read that contradicted the health panel two sections up would
           be the drawer arguing with itself. */
        levers: healthFactors(health)
          .filter((one) => !one.good)
          .map((one) => one.note),
        finished: done.length,
      });

      if (!result.success) {
        setFailed(result.message || 'That did not work.');
        return;
      }
      setPlan(result.plan);
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : 'That did not work.');
    } finally {
      setThinking(false);
    }
  };

  return (
    <section className="gx-panel gx-read">
      <header className="gx-panel-head">
        <h3>Summit&rsquo;s read</h3>
        {plan && <span className="gx-read-mark">Written by a model</span>}
      </header>

      {/* Not enough behind it. Said as a count of what would unlock it rather
          than as a disabled button with no explanation — "four more" is a
          thing somebody can go and do. */}
      {short > 0 ? (
        <p className="gx-read-gate">
          <strong>Not enough evidence yet.</strong> Finish and link{' '}
          {short === 1 ? 'one more task' : `${short} more tasks`} to this goal and Summit can
          read the pattern in them. Right now there {done.length === 1 ? 'is' : 'are'}{' '}
          {done.length} — too few to tell a pattern from a coincidence.
        </p>
      ) : !plan ? (
        <>
          <p className="gx-read-lead">
            {done.length} finished tasks are linked to this goal. A read costs one model
            call and stores nothing.
          </p>
          <button
            type="button"
            className="gx-btn is-primary"
            disabled={thinking}
            onClick={() => void ask()}
          >
            {thinking ? 'Reading…' : 'Read this goal'}
          </button>
        </>
      ) : (
        <>
          <p className="gx-read-say">{plan.route}</p>

          {plan.week.length > 0 && (
            <div className="gx-read-block">
              <h4>Do this week</h4>
              <ul className="gx-read-week">
                {plan.week.map((one, at) => (
                  <li key={at}>{one}</li>
                ))}
              </ul>
            </div>
          )}

          {plan.phases.length > 0 && (
            <div className="gx-read-block">
              <h4>The route from here</h4>
              <ol className="gx-read-phases">
                {plan.phases.map((phase, at) => (
                  <li key={at}>
                    <span className="gx-read-phase-head">
                      <strong>{phase.title}</strong>
                      <em>{phase.weeks}w</em>
                    </span>
                    <span className="gx-quiet">{phase.outcome}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* The line between what was counted and what was written. Both
              arrive as confident prose and the reader has to be able to tell
              them apart. */}
          <p className="gx-quiet gx-caveat">
            Written by a model over the figures on this page. The numbers above it are
            counted from your own tasks; this paragraph is a reading of them, and the
            weeks it suggests are a recommendation.
          </p>
        </>
      )}

      {failed && <p className="gx-read-failed">{failed}</p>}
    </section>
  );
}
