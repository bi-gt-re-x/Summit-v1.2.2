/**
 * Subject insights — the section that ends somewhere else in the app.
 *
 * Everything above it on the Insights tab ends in a statement. This ends in a
 * branch of a skill tree and a link into it, which is the whole difference
 * between analytics a reader agrees with and analytics that changes what they
 * open next:
 *
 *     Mathematics      91 performance · 4.1 difficulty · 84% consistency · ↑ 6
 *     "You are moving fastest in Algebra, while Geometry has stayed flat."
 *     Algebra        ████████░  91%
 *     Geometry       ███████░░  73%
 *     Recommended focus — Geometry is your largest gap → open it
 *
 * ## The four figures are the skill model, not a new one
 *
 * Performance, difficulty, consistency and the trend all come off a `SkillRow`,
 * which is the same thing the Subjects tab tables and the same computation the
 * Recommendations tab ranks by. See utils/subjectFocus for the branch reading,
 * which is the only part of this that is new arithmetic, and for why the gap is
 * the largest distance from full rather than the lowest bar.
 *
 * ## Why the bars are a list and not a chart
 *
 * A subject has two to five branches with work in them. A radar or a bar chart
 * over four values is a picture of four values, and the reader has to read the
 * axis to get the numbers back out — where a labelled bar with its percentage
 * beside it *is* the number. The panel that wants a chart is the one with
 * fifteen subjects on it, and that is the Subjects tab.
 *
 * ## The link is a door, not an instruction
 *
 * "Geometry is your largest gap" and a way to open it. Not "do Geometry next" —
 * that is the Recommendations tab, and this section keeps the same boundary
 * every other panel on this tab keeps.
 */
import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { Panel, PanelNote } from '@/components/Analytics/charts';
import type { BranchStanding, SubjectFocus } from '@/utils/subjectFocus';

/** Which tone a percentage gets. The same bands the Overview meters use. */
function toneFor(percent: number): string {
  if (percent >= 80) return 'green';
  if (percent >= 60) return 'blue';
  if (percent >= 40) return 'amber';
  return 'pink';
}

function Branch({ branch }: { branch: BranchStanding }) {
  return (
    <li className={`ax-branch ax-tone-${toneFor(branch.percent)}`}>
      <Link to={branch.href} className="ax-branch-name">
        {branch.name}
      </Link>
      <div
        className="ax-branch-track"
        role="meter"
        aria-valuenow={branch.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${branch.name} ${branch.percent}% of the branch`}
        style={{ '--ax-fill': `${Math.max(2, branch.percent)}%` } as CSSProperties}
      >
        <span className="ax-branch-fill" />
      </div>
      <span className="ax-branch-pct">{branch.percent}%</span>
    </li>
  );
}

/** One figure of the four, with its own scale spelled out. */
function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="ax-subject-figure">
      <dt>{label}</dt>
      <dd>
        {value}
        {note && <span className="ax-muted ax-small"> {note}</span>}
      </dd>
    </div>
  );
}

function SubjectBlock({ row }: { row: SubjectFocus }) {
  const trend =
    row.trend === null
      ? { mark: '→', word: 'too short to trend', tone: 'flat' }
      : row.trend > 4
        ? { mark: '↑', word: `${Math.round(row.trend)} points`, tone: 'up' }
        : row.trend < -4
          ? { mark: '↓', word: `${Math.abs(Math.round(row.trend))} points`, tone: 'down' }
          : { mark: '→', word: 'level', tone: 'flat' };

  return (
    <article className="ax-subject-block">
      <header className="ax-subject-head">
        <h4>{row.name}</h4>
        {row.treeTitle && <span className="ax-subject-tree">{row.treeTitle} tree</span>}
      </header>

      <dl className="ax-subject-figures">
        <Figure label="Performance" value={`${row.performance}`} note="of 100" />
        <Figure label="Difficulty" value={row.difficulty.toFixed(1)} note="of 5" />
        <Figure label="Consistency" value={`${row.consistency}%`} note="of weeks" />
        <Figure label="Trend" value={`${trend.mark} ${trend.word}`} />
      </dl>

      <p className="ax-subject-line">{row.sentence}</p>

      {row.branches.length > 0 && (
        <>
          <p className="ax-subject-sub">Skill tree impact</p>
          <ul className="ax-branches">
            {row.branches.map((branch) => (
              <Branch key={branch.node} branch={branch} />
            ))}
          </ul>
        </>
      )}

      {/* The one place this tab points at another page. It names the gap and
          opens the door; what to do about it is Recommendations. */}
      {row.gap && (
        <p className="ax-subject-focus">
          <span className="ax-subject-focus-label">Recommended focus</span>
          <span>
            {row.gap.name} is your largest gap here — {row.gap.percent}% of the branch, with{' '}
            {100 - row.gap.percent}% still to cover.
          </span>
          <Link to={row.gap.href} className="ax-link">
            Open the {row.gap.name} branch
          </Link>
        </p>
      )}
    </article>
  );
}

export interface SubjectInsightsProps {
  rows: SubjectFocus[];
}

export function SubjectInsights({ rows }: SubjectInsightsProps) {
  return (
    <Panel
      title="Subject insights"
      note={rows.length > 0 ? 'How each subject is going, and where the gap is' : undefined}
      className="ax-subjects"
      footer={
        <PanelNote label="Where these figures come from">
          <p>
            Performance, difficulty, consistency and the trend are the skill model's — the same
            numbers the Subjects tab tables, scored from the tasks you rated. A subject with no
            rated work is not scored at all rather than scored low.
          </p>
          <p>
            A branch is a node of the subject's skill tree that one of your subjects routes into,
            and its percentage is your own XP in that subject against what the node is worth,
            capped at 100.
          </p>
          <p>
            The recommended focus is the largest distance from full among branches you have
            actually started — not the lowest bar, which would send you to something you have
            barely begun.
          </p>
        </PanelNote>
      }
    >
      {rows.length === 0 ? (
        <p className="ax-empty">
          Rate a few finished tasks and this fills in. A subject is scored on how the work went, so
          an unrated record has nothing to read here.
        </p>
      ) : (
        <div className="ax-subject-stack">
          {rows.map((row) => (
            <SubjectBlock key={row.subject} row={row} />
          ))}
        </div>
      )}
    </Panel>
  );
}
