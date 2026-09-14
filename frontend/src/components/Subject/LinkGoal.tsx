/**
 * What this subject is aimed at, and how to change it.
 *
 * ## The dead end this removes
 *
 * The page's first question is "what is this subject for", and until this
 * existed the honest answer on most subjects was "nobody has said" — drawn as
 * a heading and then left there. Everything below it degraded accordingly: the
 * evidence cards fell back to rules because there was no goal to weigh them
 * against, the recommendations ranked by whichever measure was lowest, and the
 * argument the whole page is built on ran without its premise.
 *
 * The fix is not another wizard. Goals already exist, made on the goals page,
 * and the only thing missing was a way to say *this subject belongs to that
 * one* from here. That is a single field — `subject_ids` on the goal, a
 * comma-separated list — and this is the control that writes it, in both
 * directions.
 *
 * It sits directly under the band rather than six folds down, because the
 * sentence it answers is up there.
 *
 * ## Why two
 *
 * A subject aimed at nothing has no argument. A subject aimed at five has five
 * and leads with whichever the sort happened to put first, which is worse than
 * none: the page would be confidently answering a question nobody asked. Two
 * covers the real case — a near-term target and a longer one — and is few
 * enough that the page can still name what it is chasing in one line.
 *
 * `MAX_GOALS` is that cap. It is enforced here rather than in the model:
 * `goalsFor` in ./model counts what is linked, and a goal linked by some other
 * route should still be counted rather than silently dropped.
 *
 * ## The list is shut, and every row says what it is already about
 *
 * An account with a dozen goals opening this page would meet a dozen rows it
 * has to read past. So the picker is a disclosure, and each row carries the
 * subjects that goal already names — or `Other`, when it names none. That is
 * the difference between picking a goal and guessing at one: "Reach AIME ·
 * Mathematics" is a goal you can tell at a glance is the wrong one to hang
 * Computer Science off.
 *
 * Counters are not on the list. "Earn 250,000 XP" is fed by every task on the
 * account, so aiming a subject at one says nothing about the subject — see
 * `measureOf` in components/Goals/numbers for the split.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';

/** How many goals one subject may be aimed at. See the note above. */
export const MAX_GOALS = 2;

export interface Linkable {
  id: string;
  title: string;
  /** Subject names already on the goal. Empty draws as "Other". */
  subjects: string[];
}

export function LinkGoal({
  linked,
  options,
  busy,
  error,
  onLink,
  onUnlink,
}: {
  /** The goals that already name this subject. */
  linked: Array<{ id: string; title: string }>;
  /** The account's other outcome goals, newest first. */
  options: Linkable[];
  /** The id being written, while one is. */
  busy: string;
  error: string;
  onLink: (goalId: string) => void;
  onUnlink: (goalId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const room = linked.length < MAX_GOALS;

  /* Nothing aimed at and nothing to aim at. The block still draws, because
     "you have no outcome goals" is the answer to the band's question and a
     missing section is not. */
  if (linked.length === 0 && options.length === 0) {
    return (
      <section className="sb-link" aria-label="Aim this subject at a goal">
        <div className="sb-link-say">
          <strong>Aim this subject at a goal</strong>
          <p>You have no outcome goals yet. Counters do not count — they are fed by
            every task on the account.</p>
        </div>
        <Link className="ax-link" to="/goals">Make one on the goals page →</Link>
      </section>
    );
  }

  return (
    <section className="sb-link" aria-label="Aim this subject at a goal">
      <div className="sb-link-say">
        <strong>
          {linked.length === 0
            ? 'Aim this subject at a goal'
            : `Aimed at ${linked.length} of ${MAX_GOALS} goals`}
        </strong>
        <p>
          {linked.length === 0
            ? 'Pick one you already have. The page reads your record against it.'
            : room
              ? 'You can add one more.'
              : 'Remove one to swap it.'}
        </p>
      </div>

      {linked.length > 0 && (
        <ul className="sb-link-on">
          {linked.map((goal) => (
            <li key={goal.id}>
              <span>{goal.title}</span>
              <button
                type="button"
                className="sb-link-drop"
                disabled={busy !== ''}
                onClick={() => onUnlink(goal.id)}
              >
                {busy === goal.id ? 'Removing…' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {room && options.length > 0 && (
        <>
          <button
            type="button"
            className={`sb-link-toggle${open ? ' is-open' : ''}`}
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
          >
            <span>{linked.length === 0 ? 'Choose a goal' : 'Add another'}</span>
            <em>{options.length}</em>
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <path d="M2 4.5 L6 8.5 L10 4.5" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* `inert` while shut, for the reason components/Subject/Fold gives:
              the collapse hides it from the eye and from nothing else. */}
          <div className="sb-link-body" inert={!open}>
            <div>
              <ul className="sb-link-list">
                {options.map((goal) => (
                  <li key={goal.id}>
                    <span className="sb-link-name">{goal.title}</span>
                    <span className="sb-link-subject">
                      {goal.subjects.length > 0 ? goal.subjects.join(' · ') : 'Other'}
                    </span>
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
            </div>
          </div>
        </>
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
