/**
 * Skills by level — the Growth tab, one step of a skill tree at a time.
 *
 * The panel above this one reads the subject score, which is the finest grain
 * a task records: Mathematics, not Factoring. This one reads the problems the
 * reader marked right or wrong on the skill tree (utils/skillLevel), which are
 * filed under a step — so it can say what the subject panel cannot:
 *
 *     Factor Simple Quadratics          Level 2 → Level 4
 *     68% → 91% accuracy · Easy → Hard problems · 14 problems this period
 *
 * That line is the point of the panel. "You studied 4.2 hours" is a fact about
 * a diary; this is a fact about what the reader can now do, and every figure
 * in it is counted from answers they gave.
 *
 * ## Where the rows come from
 *
 * The Growth tab fetches them once and hands them in, because the subject
 * cards above read the same list for their skill-tree tile. Two panels each
 * asking would be the same request twice on every visit.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { UseSkillAttempts } from '@/hooks';
import { SUBJECT_TREES } from '@/skills/subjectTrees';
import { loadSteps, type Programmes } from '@/services/skillSteps';
import {
  LEVEL_NAME,
  MAX_LEVEL,
  TIER_NAME,
  NOTHING,
  sinceText,
  type SkillLevel,
} from '@/utils/skillLevel';

/** Where a step started the period and where it stands, and how much was done.
    Over the whole record the start is nothing answered at all. */
interface LevelChange {
  then: SkillLevel;
  now: SkillLevel;
  inPeriod: number;
}

/** Node id → its name and the tree it is drawn on, built once. */
let nodeIndex: Map<string, { name: string; tree: string }> | null = null;
function nodeInfo(id: string) {
  if (!nodeIndex) {
    nodeIndex = new Map();
    for (const tree of SUBJECT_TREES) {
      for (const node of tree.nodes) {
        if (!nodeIndex.has(node.id)) nodeIndex.set(node.id, { name: node.name, tree: tree.title });
      }
    }
  }
  return nodeIndex.get(id) ?? { name: id, tree: '' };
}

interface Row {
  key: string;
  nodeId: string;
  ordinal: number;
  title: string;
  where: string;
  change: LevelChange;
}

export interface SkillLevelsPanelProps {
  /** The reader's marked problems and the levels read from them on the
      server — fetched once by the tab and shared. */
  practice: Pick<UseSkillAttempts, 'attempts' | 'levels' | 'loading' | 'error'>;
  /** The period in words, for sentences. Always the whole record. */
  periodText: string;
  /** How many rows before "Show all". */
  limit?: number;
}

export function SkillLevelsPanel({ practice, periodText, limit = 6 }: SkillLevelsPanelProps) {
  const { attempts, levels, loading, error } = practice;
  const [titles, setTitles] = useState<Programmes>({});
  const [all, setAll] = useState(false);

  /* Step titles come from the written programmes — the same rows the skill
     tree draws — rather than being copied onto each attempt, so a step renamed
     by a regeneration is renamed here too. */
  const nodeIds = useMemo(
    () => [
      ...new Set(
        Object.keys(levels)
          .filter((key) => !key.endsWith('#0'))
          .map((key) => key.slice(0, key.lastIndexOf('#'))),
      ),
    ],
    [levels],
  );
  useEffect(() => {
    if (!nodeIds.length) return;
    let live = true;
    loadSteps(nodeIds).then((found) => live && setTitles(found));
    return () => {
      live = false;
    };
  }, [nodeIds]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const [key, read] of Object.entries(levels)) {
      const cut = key.lastIndexOf('#');
      const first = { node_id: key.slice(0, cut), ordinal: Number(key.slice(cut + 1)) };
      const change: LevelChange = { then: NOTHING, now: read.now, inPeriod: read.attempted };
      if (change.inPeriod === 0) continue;
      const info = nodeInfo(first.node_id);
      const steps = titles[first.node_id];
      const step = steps?.find((one) => one.ordinal === first.ordinal);
      out.push({
        key,
        nodeId: first.node_id,
        ordinal: first.ordinal,
        title: first.ordinal === 0 ? info.name : step?.title ?? `${info.name}, step ${first.ordinal}`,
        where:
          first.ordinal === 0
            ? `${info.tree ? `${info.tree} · ` : ''}the skill as a whole`
            : `${info.name}${steps ? ` · step ${first.ordinal} of ${steps.length}` : ''}`,
        change,
      });
    }
    /* Furthest climbed first, because that is the sentence the panel exists to
       print; then by how much was done, so a skill worked hard on and held
       steady still ranks above one touched once. */
    return out.sort((a, b) => {
      const climb = (b.change.now.level - b.change.then.level) - (a.change.now.level - a.change.then.level);
      if (climb !== 0) return climb;
      return b.change.inPeriod - a.change.inPeriod;
    });
  }, [levels, titles]);

  if (loading) return <p className="ax-empty">Reading your marked problems…</p>;
  if (error && !attempts.length) return <p className="ax-empty">{error}</p>;

  if (!rows.length) {
    return (
      <div className="ax-lv-empty">
        <p>
          No skill-tree problems marked in {periodText}. Levels here come from
          problems you mark right or wrong — not from time spent.
        </p>
        <p>
          Open a skill in the <Link to="/skill-trees">Skill Tree</Link>, pick a step, try its
          problems, and press <b>Got it</b> or <b>Missed it</b> after each answer. Work done
          elsewhere can be logged there too.
        </p>
      </div>
    );
  }

  const climbed = rows.filter((row) => row.change.now.level > row.change.then.level).length;
  const shown = all ? rows : rows.slice(0, limit);

  return (
    <>
      <p className="sg-lead">
        <strong>{rows.length}</strong> {rows.length === 1 ? 'skill' : 'skills'} practised in{' '}
        {periodText}
        {climbed > 0 ? (
          <>
            , and <strong>{climbed}</strong> moved up a level.
          </>
        ) : (
          <>, none moved up a level yet.</>
        )}
      </p>

      <ul className="ax-lv-rows">
        {shown.map((row) => (
          <SkillRow key={row.key} row={row} />
        ))}
      </ul>

      {rows.length > limit && (
        <button type="button" className="ax-lv-more" onClick={() => setAll((was) => !was)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}

      <p className="ax-panel-note ax-panel-note-foot">
        Level 1 is started; 2, 3 and 4 mean Easy, Medium and Hard problems right at least 70%
        of the time over five or more; 5 is Hard problems right 85% of the time over ten or
        more, on two different days. Accuracy is over your last 20 problems.
      </p>
    </>
  );
}

function SkillRow({ row }: { row: Row }) {
  const { then, now, inPeriod } = row.change;
  const moved = now.level - then.level;

  return (
    <li className={`ax-lv-row${moved > 0 ? ' is-up' : moved < 0 ? ' is-down' : ''}`}>
      <div className="ax-lv-row-head">
        <div>
          <p className="ax-lv-title">{row.title}</p>
          <p className="ax-lv-where">{row.where}</p>
        </div>
        <p className="ax-lv-levels" aria-label={`Level ${then.level} to level ${now.level} of ${MAX_LEVEL}`}>
          {moved !== 0 && (
            <>
              <span className="ax-lv-then">Level {then.level}</span>
              <span className="ax-lv-arrow" aria-hidden="true">→</span>
            </>
          )}
          <span className="ax-lv-now">Level {now.level}</span>
          <span className="ax-lv-of">/ {MAX_LEVEL}</span>
        </p>
      </div>

      <p className="ax-lv-band">
        {moved > 0
          ? `${LEVEL_NAME[then.level]} → ${LEVEL_NAME[now.level]}`
          : moved < 0
            ? `Slipped from ${LEVEL_NAME[then.level]} to ${LEVEL_NAME[now.level]}`
            : `Held at ${LEVEL_NAME[now.level]}`}
      </p>

      <dl className="ax-lv-facts">
        <div>
          <dt>Accuracy</dt>
          <dd>
            {then.accuracy !== null && then.accuracy !== now.accuracy ? `${then.accuracy}% → ` : ''}
            {now.accuracy === null ? '—' : `${now.accuracy}%`}
            <small>last 20 problems</small>
          </dd>
        </div>
        <div>
          <dt>Hardest solved</dt>
          <dd>
            {then.hardest && then.hardest !== now.hardest ? `${TIER_NAME[then.hardest]} → ` : ''}
            {now.hardest ? TIER_NAME[now.hardest] : 'none right yet'}
          </dd>
        </div>
        <div>
          <dt>Mastery</dt>
          <dd>
            {then.mastery !== now.mastery ? `${then.mastery}% → ` : ''}
            {now.mastery}%
          </dd>
        </div>
        <div>
          <dt>This period</dt>
          <dd>
            {inPeriod} {inPeriod === 1 ? 'problem' : 'problems'}
            <small>last practised {sinceText(now.lastAt)}</small>
          </dd>
        </div>
      </dl>
    </li>
  );
}
