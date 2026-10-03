/**
 * Subjects — where the work went, how good you are at it, and what is left.
 *
 * XP by subject, skill levels read from the problems marked on the skill
 * trees, and the tree behind each subject. One line above them says which of
 * the worked subjects have a goal on them, when the two lists differ.
 */
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { latticeFor } from '@/components/Subject/lattice';
import { loadProgress } from '@/utils/skillProgress';
import { OTHER_KEY } from '@/utils/subjectXp';
import { SkillLevelsPanel } from '../SkillLevels';
import { SubjectPanel } from '../Breakdown';
import { useSkillAttempts } from '@/hooks';
import { Panel } from '../charts';
import type { AnalyticsModel } from '../useAnalyticsModel';
import type { SubjectIndex } from '@/hooks/useSubjects';

/**
 * @param username Whose practice store to read, for the lattice list below.
 *
 * A prop rather than `useAuth`, because a tab on this page fetches nothing and
 * reads no context — the page owns the data and hands it down. It was context
 * for one commit, and the cost showed up immediately: every test that renders
 * this tab on its own started throwing out of a provider it has no reason to
 * need.
 */
export function SubjectsTab({
  model,
  subjects,
  username = null,
}: { model: AnalyticsModel; subjects: SubjectIndex; username?: string | null }) {
  const { namedSubjects, breakdown, previousBySubject, detail } = model;
  /* The reader's marked skill-tree problems, for "Skills by level". */
  const practice = useSkillAttempts(username);

  /**
   * What there is to learn in each subject that got worked.
   *
   * This tab said which subjects are being worked and how much; it never said
   * what any of them *is*. Every subject opens a lattice — that is what the
   * skill tree page is for — and the two pages had no connection between them,
   * so a reader looking at "Mathematics, 1,610 XP" had no route from there to
   * the thing that says what mathematics contains.
   *
   * `latticeFor` keeps the curriculum's size and the reader's own practice
   * apart, and this list prints them as two figures rather than as a
   * percentage: the seed's node states are authored and say nothing about this
   * account. See components/Subject/lattice.
   */
  const lattices = useMemo(
    () => {
      const progress = loadProgress(username);
      return (breakdown?.rows ?? [])
        // "Other" is a bucket, not a subject, and has no lattice to open.
        .filter((row) => row.key !== OTHER_KEY && row.xp > 0)
        .map((row) => ({
          row,
          lattice: latticeFor(row.key, subjects.get(row.key)?.group, undefined, progress),
        }))
        .filter((entry): entry is typeof entry & { lattice: NonNullable<typeof entry.lattice> } =>
          entry.lattice !== null);
    },
    [breakdown?.rows, subjects, username],
  );

  return (
    <>
      {/* One line above the chapter. Which subjects are being worked is
          this tab's whole job; which of them anybody decided to aim at is
          one sentence of context on top of that, and it earns its place
          only when the two lists differ. */}
      {namedSubjects.total > 0 && (
        <section className="ax-section">
          <p className="ax-goal-line">
            {namedSubjects.named === 0 ? (
              <>
                None of the <strong>{namedSubjects.total}</strong> subjects you worked in
                this window has a goal aimed at it.
              </>
            ) : (
              <>
                <strong>{namedSubjects.named}</strong> of the {namedSubjects.total} subjects
                you worked in this window {namedSubjects.named === 1 ? 'has' : 'have'} a goal
                aimed at {namedSubjects.named === 1 ? 'it' : 'them'}.
              </>
            )}{' '}
            <Link to="/goals" className="ax-link">
              See what is missing
            </Link>
          </p>
        </section>
      )}

      {/* Where the work went: XP by subject, against the window before. It was
          on the Overview as well, which is the second place a reader would
          have met it. */}
      {breakdown && breakdown.rows.length > 0 && (
        <section className="ax-section">
          <SubjectPanel rows={breakdown.rows} previous={previousBySubject} />
        </section>
      )}

      {/* How good the reader is at each step, from problems they marked right
          or wrong on the skill trees. The one skill measure the app keeps:
          the subject score and the hundred-level mastery ladder were readings
          of XP and ratings dressed as ability, and this is read from answers. */}
      <section className="ax-section">
        <Panel
          title="Skills by level"
          note="Each step of your skill trees, measured from problems you marked right or wrong"
        >
          <SkillLevelsPanel
            practice={practice}
            periodText="your whole record"
            limit={detail.rows}
          />
        </Panel>
      </section>

      {/* What each of them opens: what there is to learn in each subject, and
          a way into it. */}
      {lattices.length > 0 && (
        <section className="ax-section ax-panel">
          <div className="ax-panel-head">
            <div className="ax-panel-title">
              <h2>What each subject opens</h2>
            </div>
          </div>
          <p className="ax-panel-note">
            Every subject has a skill tree behind it. The skill count is the tree's — somebody
            wrote it — and the practised count is yours.
          </p>
          <ul className="ax-lattices">
            {lattices.map(({ row, lattice }) => (
              <li key={row.key}>
                <Link className="ax-lattice" to={`/analytics/subject/${encodeURIComponent(row.key)}`}>
                  <span className="ax-lattice-subject">{row.name ?? row.label}</span>
                  <span className="ax-lattice-tree">{lattice.title}</span>
                  <span className="ax-lattice-facts">
                    {lattice.nodes} skills
                    {lattice.branches.length > 0 && <> · {lattice.branches.length} branches</>}
                    {lattice.practised > 0 && (
                      <b> · {lattice.practised} practised</b>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="ax-panel-note ax-panel-note-foot">
            <Link to="/skill-trees" className="ax-link">
              Open the skill trees
            </Link>
          </p>
        </section>
      )}
    </>
  );
}
