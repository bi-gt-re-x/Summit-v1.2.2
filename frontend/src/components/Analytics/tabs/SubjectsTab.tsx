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
import { treeStanding } from '@/skills/standing';
import { OTHER_KEY } from '@/utils/subjectXp';
import { LimiterLine } from '../Limiter';
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
  const { all, goalLimits, namedSubjects, tasks, breakdown, skills, nameOf } = model;

  /**
   * The limiters whose subject is one this window actually shows.
   *
   * The tab's own rule, applied to a second kind of row: a sentence about a
   * subject earns its place here only when the subject is on the page under
   * it. A limiter on Chemistry, on a window where no chemistry was worked, is
   * a finding about somewhere else — true, and belonging on the tab that is
   * about goals rather than on the one that is about subjects.
   *
   * Which is also the whole of what "only where the subject has a goal" means
   * in practice: `goalLimits` exists at all only for subjects some live goal's
   * work is filed under, so the filter below is the second half of that test
   * rather than a separate one.
   */
  const shown = useMemo(() => {
    const worked = new Set((breakdown?.rows ?? []).map((row) => row.key));
    return goalLimits.filter((row) => worked.has(row.subjectId));
  }, [breakdown?.rows, goalLimits]);

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

  /**
   * How far into each lattice this account's own work has got.
   *
   * The list below says what each subject *opens* — the size of the tree and
   * how many of its nodes the reader has marked practised. That is the
   * curriculum's figure and a hand-kept one; neither is a reading of the
   * record. This is the reading of the record: XP filed under the subjects
   * that route to a tree, against what the tree is worth. See skills/standing,
   * which explains why the nodes' own `percent` is not what is shown.
   *
   * Trees are grouped, so the five languages are one lattice rather than five
   * subjects — which is the whole difference between this panel and the
   * subject breakdown above it.
   *
   * Counted over **every** finished task rather than over `breakdown`, which is
   * the window the page is scoped to. Everything else on this tab is a
   * statement about the window, and this one is not, on purpose: a lattice is a
   * curriculum rather than a month, and "23% of Web Development" measured over
   * the last thirty days is not a fact about the reader's standing in it. The
   * server counts the Mastery badges the same way, over the same lifetime, and
   * a panel that quietly disagreed with the badge beside it would be worse than
   * no panel.
   */
  const standing = useMemo(
    () => {
      const xp = new Map<string, number>();
      for (const task of tasks) {
        const key = task.subject ?? '';
        if (task.status !== 'done' || !key || key === OTHER_KEY) continue;
        xp.set(key, (xp.get(key) ?? 0) + (Number(task.xp_value) || 0));
      }
      return treeStanding([...xp].map(([key, total]) => ({ key, xp: total })));
    },
    [tasks],
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
            <Link to="/analytics/goals" className="ax-link">
              See what is missing
            </Link>
          </p>
        </section>
      )}

      {/* Under the line about how many subjects have a goal, and answering the
          question it raises. That line says how many were aimed at; these say,
          for the ones that were, what the aiming is running into. Lines rather
          than cards for the reason the line above is a line: this tab is about
          mastery, and the goal reading is context on it. */}
      {shown.length > 0 && (
        <section className="ax-section">
          {shown.map((row) => (
            <LimiterLine key={row.goalId} row={row} />
          ))}
        </section>
      )}

      <div className="ax-section gr-scope">
        <SkillsChapter all={all} tasks={tasks} subjects={subjects} />
      </div>

      {/* How far in the work has got. The panel below says what there is to
          learn in each subject; this says how much of it this account's own
          record covers, which is the one skill-tree figure on the page that is
          about the reader rather than about the curriculum. */}
      {standing.length > 0 && (
        <section className="ax-section ax-panel">
          <div className="ax-panel-head">
            <div className="ax-panel-title">
              <h2>How far into each tree</h2>
            </div>
          </div>
          <p className="ax-panel-note">
            Your all-time XP in each skill tree, out of the tree's total. Related subjects share one
            tree (for example, all languages count toward Foreign Languages).
          </p>
          <ul className="ax-treedepth">
            {standing.map((tree) => (
              <li key={tree.id}>
                {/* Titled as well as printed: "Algorithms & Data Structures"
                    does not fit the column at any width worth giving it. */}
                <span className="ax-treedepth-name" title={tree.title}>{tree.title}</span>
                <span className="ax-treedepth-bar">
                  <span style={{ width: `${tree.percent}%` }} />
                </span>
                <span className="ax-treedepth-pct">{tree.percent}%</span>
                <span className="ax-treedepth-xp">
                  {tree.xp.toLocaleString()} / {tree.worth.toLocaleString()} XP
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
