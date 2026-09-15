/**
 * The envelope, and the two ways a stored document goes stale.
 *
 * Everything worth pinning here is a failure nobody would report, because it
 * looks like nothing rather than like a bug: practice that vanishes when a
 * shape changes, practice that lands on the wrong node when an id is reused,
 * and a store that opens a *second* reader's document because the key was not
 * scoped. Each of those is one case below.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { skillStore } from './skillStore';

type Counts = Record<string, number>;

function numbers(raw: unknown): Counts {
  if (!raw || typeof raw !== 'object') return {};
  const clean: Counts = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) clean[id] = value;
  }
  return clean;
}

/** The revision the store under test sees, so a test can move the trees. */
let rev = 'one';

const store = () =>
  skillStore<Counts>({
    key: 'testStore',
    version: 2,
    empty: {},
    revision: () => rev,
    migrate: (from, raw) => {
      // v0 is the bare pre-envelope document; v1 held its counts under `xp`.
      if (from === 0) return raw;
      if (from === 1) return (raw as { xp?: unknown } | null)?.xp;
      return undefined;
    },
    validate: numbers,
    onRevision: (value) => {
      const kept: Counts = {};
      for (const [id, n] of Object.entries(value)) if (id !== 'gone') kept[id] = n;
      return kept;
    },
  });

const rawAt = (username: string) => localStorage.getItem(`testStore:${username}`);

beforeEach(() => {
  rev = 'one';
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('round trip', () => {
  it('reads back what it wrote', () => {
    const s = store();
    s.save('ada', { 'm.algebra': 250 });
    expect(s.load('ada')).toEqual({ 'm.algebra': 250 });
  });

  it('keeps two accounts on one machine apart', () => {
    // The scoping is what stopped everybody sharing one calendar; the same key
    // shape is what these stores hang off. See userScopedKey in calendarStore.
    const s = store();
    s.save('ada', { 'm.algebra': 250 });
    s.save('grace', { 'c.vars': 50 });

    expect(s.load('ada')).toEqual({ 'm.algebra': 250 });
    expect(s.load('grace')).toEqual({ 'c.vars': 50 });
  });

  it('opens empty rather than throwing on a document that is not ours', () => {
    localStorage.setItem('testStore:ada', 'not json at all');
    expect(store().load('ada')).toEqual({});
  });

  it('stamps what it wrote, so a later version can tell what it is looking at', () => {
    const s = store();
    s.save('ada', {});
    expect(s.stampOf('ada')).toEqual({ version: 2, revision: 'one' });
    expect(s.stampOf('nobody')).toBeNull();
  });
});

describe('the shape moving', () => {
  it('adopts a document written before the envelope existed', () => {
    // This is what every browser holding practice is carrying today. Losing it
    // would be losing somebody's practice to a refactor.
    localStorage.setItem('testStore:ada', JSON.stringify({ 'm.algebra': 250 }));
    expect(store().load('ada')).toEqual({ 'm.algebra': 250 });
  });

  it('rewrites it once, so the migration is not run on every read', () => {
    localStorage.setItem('testStore:ada', JSON.stringify({ 'm.algebra': 250 }));
    const s = store();
    s.load('ada');
    expect(s.stampOf('ada')).toEqual({ version: 2, revision: 'one' });
  });

  it('brings an older envelope forward through its own arm', () => {
    localStorage.setItem(
      'testStore:ada',
      JSON.stringify({ v: 1, rev: 'one', data: { xp: { 'm.algebra': 250 } } }),
    );
    expect(store().load('ada')).toEqual({ 'm.algebra': 250 });
  });

  it('opens empty and clears when a document cannot be carried forward', () => {
    // A version from the future, or one whose arm was deliberately not written.
    // Leaving it on disk would make every later read the same failure.
    localStorage.setItem('testStore:ada', JSON.stringify({ v: 9, rev: 'one', data: { a: 1 } }));
    const s = store();

    expect(s.load('ada')).toEqual({});
    expect(rawAt('ada')).toBeNull();
  });
});

describe('the trees moving', () => {
  it('drops what the trees no longer name, and re-stamps', () => {
    const s = store();
    s.save('ada', { 'm.algebra': 250, gone: 999 });

    rev = 'two';
    expect(s.load('ada')).toEqual({ 'm.algebra': 250 });
    expect(s.stampOf('ada')).toEqual({ version: 2, revision: 'two' });
  });

  it('leaves an up-to-date store alone rather than rewriting it on every read', () => {
    const s = store();
    s.save('ada', { 'm.algebra': 250, gone: 999 });

    const before = rawAt('ada');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    // Same revision: `gone` is still a node, so nothing is pruned and nothing
    // is written.
    expect(s.load('ada')).toEqual({ 'm.algebra': 250, gone: 999 });
    expect(write).not.toHaveBeenCalled();
    expect(rawAt('ada')).toBe(before);
  });

  it('does not prune a store that did not ask to be pruned', () => {
    // The focus topics hold subject ids, not node ids, and the trees moving
    // says nothing about them. See utils/focusTopics.
    const plain = skillStore<Counts>({
      key: 'plainStore', version: 1, empty: {}, revision: () => rev, validate: numbers,
    });
    plain.save('ada', { gone: 999 });
    rev = 'two';
    expect(plain.load('ada')).toEqual({ gone: 999 });
  });
});

describe('when storage will not have it', () => {
  it('does not throw out of a read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    expect(() => store().load('ada')).not.toThrow();
    expect(store().load('ada')).toEqual({});
  });

  it('does not throw out of a write, because the click already worked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => store().save('ada', { 'm.algebra': 250 })).not.toThrow();
  });
});
