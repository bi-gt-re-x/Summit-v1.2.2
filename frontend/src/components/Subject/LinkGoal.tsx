/**
 * Point this subject at a goal you already have.
 *
 * ## The dead end this removes
 *
 * The page's first question is "what is this subject for", and until now the
 * honest answer on most subjects was "nobody has said" — drawn as a heading
 * and then left there. Everything below it degraded accordingly: the evidence
 * cards fell back to rules because there was no goal to weigh them against,
 * the recommendations ranked by whichever measure was lowest, and the whole
 * argument the page is built on ran without its premise.
 *
 * The fix is not another wizard. Goals already exist, made on the goals page,
 * and the only thing missing was a way to say *this subject belongs to that
 * one* from here. That is a single field — `subject_ids` on the goal, a
 * comma-separated list — and this is the control that writes it.
 *
 * ## Why two
 *
 * A subject aimed at nothing has no argument. A subject aimed at five has five
 * arguments and leads with whichever the sort happened to put first, which is
 * worse than none: the page would be confidently answering a question the
 * reader never asked. Two is enough for the real case — a subject serving a
 * near-term target and a longer one — and few enough that the page can still
 * name what it is chasing in one line.
 *
 * `MAX_GOALS` is that cap, and it is enforced here rather than in the model:
 * `goalsFor` in ./model counts what is linked, and a goal linked elsewhere by
 * some other route should still be counted rather than silently dropped.
 */
import { Link } from 'react-router-dom';

/** How many goals one subject may be aimed at. See the note above. */
export const MAX_GOALS = 2;

export interface Linkable {
  id: string;
  title: string;
}

export function LinkGoal({
  linked,
  options,
  busy,
  error,
  onLink,
}: {
  /** How many goals already name this subject. */
  linked: number;
  /** The account's other active goals, newest first. */
  options: Linkable[];
  /** The id being written, while one is. */
  busy: string;
  error: string;
  onLink: (goalId: string) => void;
}) {
  if (linked >= MAX_GOALS) return null;

  const first = linked === 0;

  return (
    <section className="sb-link" aria-label="Aim this subject at a goal">
      <div className="sb-link-say">
        <strong>{first ? 'Aim this subject at a goal' : 'Add a second goal'}</strong>
        <p>
          {options.length > 0
            ? 'Pick one you already have, and this page reads your record against it.'
            : 'No other active goals to pick from yet.'}
        </p>
      </div>

      {options.length > 0 && (
        <ul className="sb-link-list">
          {options.map((goal) => (
            <li key={goal.id}>
              <span>{goal.title}</span>
              <button
                type="button"
                className="ax-btn"
                disabled={busy !== ''}
                onClick={() => onLink(goal.id)}
              >
                {busy === goal.id ? 'Linking…' : 'Use this'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="sb-link-error" role="alert">
          {error}
        </p>
      )}

      <Link className="ax-link" to="/goals">
        {options.length > 0 ? 'Or make a new one' : 'Make one on the goals page'} →
      </Link>
    </section>
  );
}
