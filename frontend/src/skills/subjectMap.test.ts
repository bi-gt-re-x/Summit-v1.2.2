/**
 * The two halves of the routing contract, which pull in opposite directions.
 *
 * `treeForSubject` must never fail — a catalogue row this map has not caught up
 * with still has to land somewhere near its group. `latticeSubjects` exists
 * because that same forgiveness is wrong for a subject the account invented:
 * there is no tree behind it, so the fallback opens somebody else's lattice
 * under the wrong title.
 *
 * Both behaviours are deliberate and each looks like a bug from the other's
 * side, which is exactly why they are pinned together here.
 */
import { describe, expect, it } from 'vitest';
import { TREE_IDS, latticeSubjects, subjectsForTree, treeForSubject } from './subjectMap';

const catalogue = { id: 'mathematics', custom: false };
const invented = { id: 'fantasy-football', custom: true };

describe('latticeSubjects', () => {
  it('drops the subjects an account made for itself', () => {
    expect(latticeSubjects([catalogue, invented])).toEqual([catalogue]);
  });

  it('keeps every catalog subject, including ones the map has not named', () => {
    const unnamed = { id: 'not-in-the-map-yet', custom: false };
    expect(latticeSubjects([catalogue, unnamed])).toHaveLength(2);
  });

  it('preserves order, because the catalog order is this account usage', () => {
    const rows = [catalogue, invented, { id: 'physics', custom: false }];
    expect(latticeSubjects(rows).map((row) => row.id)).toEqual(['mathematics', 'physics']);
  });
});

describe('treeForSubject still forgives everything', () => {
  it('routes a known subject to its own tree', () => {
    expect(treeForSubject('mathematics').tree).toBe('mathematics');
  });

  it('falls back to the group root for a catalog row it has not been told about', () => {
    // The behaviour latticeSubjects exists alongside rather than replaces.
    expect(TREE_IDS).toContain(treeForSubject('brand-new-subject', 'Computing').tree);
  });

  it('falls back to a real tree even with no group at all', () => {
    expect(TREE_IDS).toContain(treeForSubject('brand-new-subject').tree);
  });
});

describe('the new competitive lattices are reachable', () => {
  it('routes Robotics at its own tree rather than at systems', () => {
    expect(treeForSubject('robotics').tree).toBe('robotics');
    expect(subjectsForTree('robotics')).toContain('robotics');
  });

  it('registers every competitive tree', () => {
    for (const id of ['competition-math', 'competitive-programming', 'olympiad-science',
                      'robotics', 'performance', 'debate']) {
      expect(TREE_IDS).toContain(id);
    }
  });
});
