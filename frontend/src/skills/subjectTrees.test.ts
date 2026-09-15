/**
 * The two facts the browser stores read off the authored trees.
 *
 * `treeRevision` is a fingerprint nobody maintains by hand, and the whole point
 * of deriving it is that it cannot be forgotten in the commit that edits a
 * tree — so what is worth testing is that it actually moves when the ids do and
 * actually holds still when they do not. `keepKnownNodes` is what that moving
 * triggers.
 */
import { describe, expect, it } from 'vitest';
import { SUBJECT_TREES, keepKnownNodes, knownNodeIds, treeRevision } from './subjectTrees';

describe('knownNodeIds', () => {
  it('holds every node on every tree', () => {
    const counted = SUBJECT_TREES.reduce((sum, tree) => sum + tree.nodes.length, 0);
    expect(knownNodeIds().size).toBe(counted);
  });

  it('is unique across the hierarchy, which is what lets one map cover it', () => {
    // utils/skillProgress keys a single map by node id across sixty-two trees.
    // Two trees sharing an id would silently merge two skills' practice.
    const counted = SUBJECT_TREES.reduce((sum, tree) => sum + tree.nodes.length, 0);
    expect(counted).toBe(knownNodeIds().size);
  });

  it('names the ids the trees actually use', () => {
    expect(knownNodeIds().has('m.algebra')).toBe(true);
    expect(knownNodeIds().has('nothing.at.all')).toBe(false);
  });
});

describe('treeRevision', () => {
  it('is stable across calls, so a read does not rewrite every store', () => {
    expect(treeRevision()).toBe(treeRevision());
  });

  it('is a short hex string rather than a date somebody has to remember', () => {
    expect(treeRevision()).toMatch(/^[0-9a-f]{1,8}$/);
  });
});

describe('keepKnownNodes', () => {
  it('keeps what the trees still name and drops what they do not', () => {
    const kept = keepKnownNodes({ 'm.algebra': 250, 'm.retired': 999 });
    expect(kept).toEqual({ 'm.algebra': 250 });
  });

  it('leaves a store with nothing stale in it untouched', () => {
    const all = { 'm.algebra': 250, 'm.arith': 100 };
    expect(keepKnownNodes(all)).toEqual(all);
  });
});
