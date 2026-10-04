/**
 * Subjects — where the work went, how good you are at it, and what is left.
 *
 * XP by subject, skill levels read from the problems marked on the skill
 * trees, and the tree behind each subject. One line above them says which of
 * the worked subjects have a goal on them, when the two lists differ.
 */
import { Link } from 'react-router-dom';
import { SkillLevelsPanel } from '../SkillLevels';
import { SubjectPanel } from '../Breakdown';
import { useSkillAttempts } from '@/hooks';
import { Panel } from '../charts';
import type { AnalyticsModel } from '../useAnalyticsModel';

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
  username = null,
}: { model: AnalyticsModel; username?: string | null }) {
  const { namedSubjects, breakdown, previousBySubject, detail } = model;
  /* The reader's marked skill-tree problems, for "Skills by level". */
  const practice = useSkillAttempts(username);

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
          <SubjectPanel rows={breakdown.rows} previous={previousBySubject} linked />
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

      {/* "What each subject opens" listed each subject's skill tree and its
          size. Each subject page says that in its Skill tree fold, and the
          panel above already points at the trees, so the subject names in the
          chart link to those pages instead. */}
    </>
  );
}
