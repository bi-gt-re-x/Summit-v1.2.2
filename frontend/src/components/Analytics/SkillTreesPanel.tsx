/**
 * "Your skill trees": every tree you've practiced lately, and what to do next
 * in each, on the Recommendations tab.
 *
 * The plan above carries the strongest of these as one row. This is the rest,
 * one line a tree, read from your answers (backend/tracking/skill_plan.py).
 * Each opens the skill on its tree, where the full plan and a Book button
 * are (components/SkillTree/TreePlan).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from './charts';
import { skillTrees, type SuggestionKind, type TreeSummary } from '@/services/skillPlan';

const KIND_LABEL: Record<SuggestionKind, string> = {
  review: 'Redo',
  'step-back': 'Step back',
  'ease-off': 'Ease off',
  harder: 'Move up',
  continue: 'Keep going',
  ready: 'Ready',
  start: 'Start',
  cold: 'Warm up',
};

const KIND_TONE: Record<SuggestionKind, string> = {
  review: 'pink',
  'step-back': 'amber',
  'ease-off': 'amber',
  harder: 'green',
  continue: 'violet',
  ready: 'green',
  start: 'violet',
  cold: 'blue',
};

/** "Step back to X" reads as "Algebra: step back to X", the way the plan says it. */
function lowerFirst(text: string): string {
  return text ? text[0]!.toLowerCase() + text.slice(1) : text;
}

function facts(tree: TreeSummary): string {
  return [
    `${tree.practiced} of ${tree.skills} skills practiced`,
    tree.got > 0 ? `${tree.got} solid` : null,
    tree.due > 0 ? `${tree.due} to redo` : null,
    tree.idle === 0 ? 'practiced today' : tree.idle === 1 ? 'practiced yesterday' : `practiced ${tree.idle} days ago`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function SkillTreesPanel() {
  const [trees, setTrees] = useState<TreeSummary[] | null>(null);

  useEffect(() => {
    let live = true;
    void skillTrees().then((result) => {
      if (live) setTrees(result.success ? result.trees : []);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!trees || trees.length === 0) return null;

  return (
    <section className="ax-section">
      <Panel title="Your skill trees" note="From your answers in the last 60 days" className="ax-plan">
        <ul className="ax-plan-list">
          {trees.map((tree) => {
            const top = tree.top;
            const to = top?.node_id ? `/skill-trees?node=${encodeURIComponent(top.node_id)}` : '/skill-trees';
            return (
              <li key={tree.tree} className="ax-plan-row">
                <span className={`ax-plan-tag is-${top ? KIND_TONE[top.kind] : 'blue'}`}>
                  {top ? KIND_LABEL[top.kind] : 'Practice'}
                </span>
                <div className="ax-plan-body">
                  <p className="ax-plan-title">
                    {tree.title}: {top ? lowerFirst(top.title) : 'keep practicing'}
                  </p>
                  {top && <p className="ax-plan-why">{top.because}</p>}
                  <p className="ax-plan-why">{facts(tree)}</p>
                  <div className="ax-plan-act">
                    <Link to={to} className="ax-plan-act-btn">
                      Open the tree
                    </Link>
                  </div>
                </div>
                <span className="ax-plan-mins">{top ? `${top.minutes}m` : ''}</span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </section>
  );
}
