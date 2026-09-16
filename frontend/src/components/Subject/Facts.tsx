/**
 * What this subject is, before anything has been worked out about it.
 *
 * ## The problem this fixes
 *
 * The subject page opened on a verdict — a ring, a grade and a sentence — and
 * every one of those needs ratings behind it. A reader who has filed six tasks
 * under Mathematics and rated none of them got a page whose first element said
 * "unrated", which is the page reporting on its own inputs rather than on
 * their work. Everything it could have said was true and countable, and it was
 * eight folds down.
 *
 * So this goes first and needs nothing: a count, hours, a completion rate, and
 * the shape of what has been taken on. All of it is description. None of it
 * waits for a trend, a rating or a second period.
 *
 * ## "What you have been taking on" is difficulty, and says so
 *
 * The obvious thing to put here is a topic split — Algebra 3, Geometry 2 — and
 * it cannot be done. **A task carries a subject and nothing finer.** There is
 * no topic column, no sub-skill column and no tag; the skill trees that do name
 * sub-skills are authored, and their states are illustrative rather than read
 * off anything. See the note at the top of ./state for the full list of what a
 * task actually holds.
 *
 * Reading those trees back as a breakdown would produce "your circle geometry
 * is 68%" from a hand-written hierarchy, which is the invented-figure problem
 * this product refuses everywhere else — and refuses most loudly two screens
 * down on this very page. So the breakdown is the finest grain the record
 * genuinely carries, and the heading names it as difficulty rather than
 * implying it is anything else.
 *
 * Priority when nothing is rated yet, difficulty once something is. Priority
 * is set when a task is written and is therefore the only composition that
 * exists on day one; difficulty is the more interesting of the two and takes
 * over as soon as it can.
 *
 * ## The third line: how it is changing
 *
 * "What have I done" and "what am I taking on" are both descriptions of a
 * heap. The question a reader actually returns with is whether the heap is
 * getting better, and the page answered that only in a badge inside the
 * standing card — one of four, unlabelled, and below a ring most accounts
 * cannot fill in.
 *
 * So the direction is said here in words, beside the counts it is drawn from.
 * It is the same `Momentum` the badge reads, with the same floor: four rated
 * tasks in each half, and a drift of at least three points before a direction
 * is claimed at all. Under that, the line is absent rather than "flat" —
 * "holding steady" over six tasks is a claim, not an absence of one.
 */
import { DIFFICULTY_WORDS } from '@/utils/ratings';
import type { Momentum } from './state';
import type { AnalyticsTask } from '@/services/analytics';

export interface Slice {
  label: string;
  count: number;
}

export interface SubjectFactsProps {
  /** Finished in the window. */
  finished: number;
  /** Everything filed here in the window, finished or not. */
  total: number;
  /** Logged against the finished tasks. */
  hours: number;
  /** What the rows are, in the heading's own words. */
  axis: string;
  rows: Slice[];
  /**
   * Which way execution is going, from ./state's `momentum`.
   *
   * Passed rather than computed: the standing card reads the same object for
   * its badge, and two components working it out separately is how the badge
   * and the sentence beside it come to disagree about a direction.
   */
  momentum: Momentum;
}

/** What the direction is called, and the shape of the claim behind it. */
const DIRECTION: Record<string, { word: string; note: string }> = {
  climbing: { word: 'Improving', note: 'executing better across this window than you were at the start of it' },
  slipping: { word: 'Slipping', note: 'executing less well across this window than you were at the start of it' },
  flat: { word: 'Holding', note: 'executing at much the same level across this window' },
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The composition, from whichever column can support one.
 *
 * Returns the axis alongside the rows so the caller cannot label a difficulty
 * split as a priority one — the two were a `string` and a `Slice[]` passed
 * separately for about ten minutes, which is exactly long enough to get them
 * out of step.
 */
export function compositionOf(tasks: AnalyticsTask[]): { axis: string; rows: Slice[] } {
  const rated = tasks.filter((task) => Number(task.difficulty) > 0);

  if (rated.length > 0) {
    const counts = new Map<number, number>();
    rated.forEach((task) => {
      const level = Number(task.difficulty);
      counts.set(level, (counts.get(level) ?? 0) + 1);
    });
    const rows = DIFFICULTY_WORDS.map((label, at) => ({
      label,
      count: counts.get(at + 1) ?? 0,
    })).filter((row) => row.count > 0);
    return { axis: 'By difficulty', rows };
  }

  /* Nothing rated. Priority is written down when the task is, so it is the one
     split that exists before anybody has answered a rating prompt. */
  const counts = new Map<string, number>();
  tasks.forEach((task) => {
    const level = String(task.priority ?? 'medium');
    counts.set(level, (counts.get(level) ?? 0) + 1);
  });
  const ORDER = ['high', 'medium', 'low'];
  const WORD: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };
  const rows = ORDER.map((key) => ({ label: WORD[key] ?? key, count: counts.get(key) ?? 0 })).filter(
    (row) => row.count > 0,
  );
  return { axis: 'By priority', rows };
}

export function SubjectFacts({
  finished,
  total,
  hours,
  axis,
  rows,
  momentum,
}: SubjectFactsProps) {
  /* Against everything filed here, not against the ones that went well. A rate
     that quietly drops what you missed is not a completion rate — the same
     rule the Overview tab's early stage states about its own. */
  const completion = total > 0 ? Math.round((finished / total) * 100) : null;
  const most = rows.reduce((top, row) => Math.max(top, row.count), 0);

  const digest = [
    plural(finished, 'task'),
    hours > 0 ? `${hours.toFixed(1)}h` : null,
    completion === null ? null : `${completion}% completed`,
  ].filter((part): part is string => part !== null);

  return (
    <section className="sx-facts">
      <p className="sx-facts-digest">
        {digest.map((part, at) => (
          <span key={part}>
            {at > 0 && (
              <i className="sx-facts-sep" aria-hidden="true">
                ·
              </i>
            )}
            {part}
          </span>
        ))}
      </p>

      {/* Absent rather than hedged when the floor is not met. See the header. */}
      {momentum.known && DIRECTION[momentum.direction] && (
        <p className="sx-facts-trend" data-way={momentum.direction}>
          <span className="sx-facts-way">{DIRECTION[momentum.direction]!.word}</span>
          <span className="sx-facts-note">
            {momentum.change !== null && momentum.direction !== 'flat' && (
              <strong>
                {momentum.change > 0 ? '+' : ''}
                {momentum.change} points&nbsp;&mdash;{' '}
              </strong>
            )}
            {DIRECTION[momentum.direction]!.note}
          </span>
        </p>
      )}

      {rows.length > 0 && (
        <div className="sx-facts-split">
          <p className="sx-facts-head">
            What you have been taking on <em>{axis}</em>
          </p>
          <ul>
            {rows.map((row) => (
              <li key={row.label}>
                <span className="sx-facts-name">{row.label}</span>
                <span className="sx-facts-bar" aria-hidden="true">
                  <i style={{ width: `${most > 0 ? Math.round((row.count / most) * 100) : 0}%` }} />
                </span>
                <span className="sx-facts-count">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
