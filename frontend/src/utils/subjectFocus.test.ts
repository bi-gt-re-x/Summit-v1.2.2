/**
 * Subject insights — the branch reading and the gap.
 *
 * The four headline figures are `SkillRow` fields copied across and are pinned
 * in skillScore.test; what is only true here is the branch arithmetic, the
 * sentence it assembles, and which branch gets recommended. The last of those is
 * the one worth being careful about: it is the only place on the Insights tab
 * that points a reader somewhere, and pointing them at a branch they have barely
 * opened is how the section would stop being believed.
 *
 * The routing table is real — `algebra` and `geometry` both route to nodes on
 * the mathematics tree — so these tests use those ids and the tree's own XP
 * worths rather than a fixture tree.
 */
import { describe, expect, it } from 'vitest';
import { branchesOf, subjectFocus } from './subjectFocus';
import type { SkillRow } from './skillScore';
import type { SubjectXpRow } from './subjectXp';

const nameOf = (id: string) => id;

/** m.algebra is worth 2000 XP, m.geometry 1800 — see skills/trees/mathematics. */
const ALGEBRA = 2000;
const GEOMETRY = 1800;

function skill(over: Partial<SkillRow> = {}): SkillRow {
  return {
    subject: 'mathematics',
    score: 91,
    raw: 91,
    band: 'Strong' as SkillRow['band'],
    parts: { accuracy: 90, difficulty: 80, consistency: 84, recent: 88, execution: 86, retention: 70 },
    confidence: 0.8,
    finished: 60,
    rated: 40,
    avgExecution: 4.3,
    avgDifficulty: 4.08,
    hardAccuracy: 78,
    daysSince: 1,
    activeWeeks: 21,
    weeks: 25,
    trend: 6,
    ...over,
  };
}

const row = (key: string, xp: number): SubjectXpRow => ({ key, label: key, xp, count: 10 });

describe('branches', () => {
  it('reads each branch as the account XP against what the node is worth', () => {
    const branches = branchesOf(
      'mathematics',
      new Map([
        ['algebra', ALGEBRA * 0.91],
        ['geometry', GEOMETRY * 0.73],
      ]),
      new Map(),
      nameOf,
    );
    expect(branches.map((branch) => [branch.name, branch.percent])).toEqual([
      ['Algebra', 91],
      ['Geometry', 73],
    ]);
  });

  it('caps a branch that has been worked past what the tree covers', () => {
    const branches = branchesOf('mathematics', new Map([['algebra', ALGEBRA * 4]]), new Map(), nameOf);
    expect(branches[0]?.percent).toBe(100);
  });

  it('leaves out branches with no work in them rather than drawing zeros', () => {
    const branches = branchesOf('mathematics', new Map([['algebra', 100]]), new Map(), nameOf);
    expect(branches).toHaveLength(1);
  });

  it('links each branch into the tree at its own node', () => {
    const branches = branchesOf('mathematics', new Map([['geometry', 900]]), new Map(), nameOf);
    expect(branches[0]?.href).toBe('/skill-trees?subject=geometry&node=m.geometry');
  });

  it('carries the change against the previous window', () => {
    const branches = branchesOf(
      'mathematics',
      new Map([['algebra', 200]]),
      new Map([['algebra', 100]]),
      nameOf,
    );
    expect(branches[0]?.change).toBe(100);
  });
});

describe('the recommended focus', () => {
  const focusOf = (xp: Array<[string, number]>) =>
    subjectFocus({
      skills: [skill()],
      rows: xp.map(([key, value]) => row(key, value)),
      previous: new Map(),
      nameOf,
    })[0];

  it('names the largest gap among branches actually started', () => {
    const found = focusOf([
      ['algebra', ALGEBRA * 0.91],
      ['geometry', GEOMETRY * 0.6],
    ]);
    expect(found?.gap?.name).toBe('Geometry');
  });

  it('skips a branch barely begun in favour of one being worked', () => {
    /* Number theory at 3% is the lowest bar and the wrong recommendation: it is
       a branch the reader has not started, not a gap in something they are
       doing. Geometry at 60% is the answer. */
    const found = focusOf([
      ['algebra', ALGEBRA * 0.95],
      ['geometry', GEOMETRY * 0.6],
      ['number-theory', 30],
    ]);
    expect(found?.gap?.name).toBe('Geometry');
  });

  it('recommends nothing when every started branch is nearly covered', () => {
    const found = focusOf([
      ['algebra', ALGEBRA * 0.95],
      ['geometry', GEOMETRY * 0.92],
    ]);
    expect(found?.gap).toBeNull();
  });
});

describe('the sentence', () => {
  it('names the fastest branch and the flat one', () => {
    const found = subjectFocus({
      skills: [skill()],
      rows: [row('algebra', 1000), row('geometry', 1000)],
      previous: new Map([
        ['algebra', 500],
        ['geometry', 1000],
      ]),
      nameOf,
    })[0];
    expect(found?.sentence).toContain('fastest in Algebra');
    expect(found?.sentence).toContain('Geometry');
    expect(found?.sentence).toContain('stayed flat');
  });

  it('falls back to the furthest along when nothing is moving', () => {
    const found = subjectFocus({
      skills: [skill()],
      rows: [row('algebra', ALGEBRA * 0.9)],
      previous: new Map(),
      nameOf,
    })[0];
    expect(found?.sentence).toContain('Algebra is the furthest along at 90%');
  });

  it('falls back to the subject trend where there are no branches', () => {
    const found = subjectFocus({
      skills: [skill({ subject: 'mathematics', trend: -12 })],
      rows: [],
      previous: new Map(),
      nameOf,
    })[0];
    expect(found?.sentence).toContain('down 12 points');
  });
});

describe('the figures', () => {
  it('copies the skill model rather than recomputing it', () => {
    const found = subjectFocus({
      skills: [skill()],
      rows: [],
      previous: new Map(),
      nameOf,
    })[0];
    expect(found?.performance).toBe(91);
    expect(found?.difficulty).toBe(4.1);
    // 21 of 25 weeks worked.
    expect(found?.consistency).toBe(84);
    expect(found?.trend).toBe(6);
    expect(found?.treeTitle).toBe('Mathematics');
  });

  it('describes a subject with no lattice behind it, without branches', () => {
    const found = subjectFocus({
      skills: [skill({ subject: 'something-invented' })],
      rows: [],
      previous: new Map(),
      nameOf,
    })[0];
    expect(found?.branches).toEqual([]);
    expect(found?.gap).toBeNull();
    expect(found?.performance).toBe(91);
  });
});
