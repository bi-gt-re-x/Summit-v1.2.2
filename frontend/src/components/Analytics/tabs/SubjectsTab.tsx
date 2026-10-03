/**
 * Subjects — mastery, and which of it anybody decided to aim at.
 *
 * The growth page's Skills chapter, which arrived whole and kept its own layout
 * inside `.gr-scope`. The line above it is this tab's only addition: which
 * subjects are being worked is the chapter's job, and which have a goal on them
 * is one sentence of context that earns its place only when the two lists
 * differ.
 */
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { SkillsChapter } from '@/components/Growth';
import { latticeFor } from '@/components/Subject/lattice';
import { loadProgress } from '@/utils/skillProgress';
import { OTHER_KEY } from '@/utils/subjectXp';
import { SkillScorePanel } from '../SkillView';
import { PanelGroup } from '../charts';
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
  const { all, namedSubjects, tasks, breakdown, skills, nameOf } = model;

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
      {/* The two chapters that arrived whole. Each was a tab of the growth
          page and neither had a counterpart here — mastery and achievement
          are questions the five original tabs never asked. They keep their own
          layout inside `.gr-scope`; see the stylesheet note at the top. */}
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

      <div className="ax-section gr-scope">
        <SkillsChapter all={all} tasks={tasks} subjects={subjects} />
      </div>

      {/* What each of them opens. The chapter above says how much work went
          where; this says what there is to learn in each, and gives the reader
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

      {/* Last on the tab, and shut.

          It was first and open, which was the wrong call twice over. The
          chapters above are what this tab has always been — where the work
          went and what each subject opens — and a reader arriving at Subjects
          is looking for those. The scored list is the deepest thing here and
          the one that rewards being sought out: eight subjects at six parts
          each is fifty-four rows of chart, which at the top of a tab is a wall
          before the tab has said anything.

          Shut rather than merely last, for the same reason. The group states
          what is inside it in its own heading, so a reader who wants the
          arithmetic opens it, and one who wants the chapters above scrolls
          past two lines instead of past a wall. */}
      {skills.length > 0 && (
        <section className="ax-section">
          <PanelGroup
            title="Skill Level"
            note="Every subject scored from your own ratings, with the working behind each."
          >
            <SkillScorePanel rows={skills} nameOf={nameOf} />
          </PanelGroup>
        </section>
      )}
    </>
  );
}
