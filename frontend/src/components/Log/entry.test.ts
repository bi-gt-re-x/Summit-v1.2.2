/**
 * The Log page's helpers: the preview a list row shows, search and order,
 * what deleting an entry takes with it, and the copy kept on this device.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Entry, Insight } from '@/services/log';
import { clearDraft, findEntries, onlyFrom, plainText, readDraft, writeDraft } from './entry';

const entry = (id: string, title: string, body: string, created_at: string): Entry => ({
  id, title, body, created_at, updated_at: created_at, learn_state: 'done',
});

describe('plainText', () => {
  it('drops the Markdown and keeps the words', () => {
    expect(plainText('## Plan\n\n- **Finish** the [set](/tasks?task=1)\n- [Bach]{red} ![x](https://a.b/c.png)'))
      .toBe('Plan Finish the set Bach');
  });

  it('keeps an escaped character as itself', () => {
    expect(plainText('2 \\* 3')).toBe('2 * 3');
  });
});

describe('findEntries', () => {
  const rows = [
    entry('1', 'Violin practice', 'Bow control', '2026-10-10T09:00:00'),
    entry('2', 'Big goals', 'AIME 4 by 9th grade', '2026-10-05T09:00:00'),
    entry('3', 'A good day', 'Finished **homework**', '2026-10-16T09:00:00'),
  ];

  it('lists newest first, or oldest first', () => {
    expect(findEntries(rows, '', 'newest').map((row) => row.id)).toEqual(['3', '1', '2']);
    expect(findEntries(rows, '', 'oldest').map((row) => row.id)).toEqual(['2', '1', '3']);
  });

  it('searches titles and text, every word', () => {
    expect(findEntries(rows, 'aime', 'newest').map((row) => row.id)).toEqual(['2']);
    expect(findEntries(rows, 'finished homework', 'newest').map((row) => row.id)).toEqual(['3']);
    expect(findEntries(rows, 'violin aime', 'newest')).toEqual([]);
  });
});

describe('onlyFrom', () => {
  const insight = (id: string, sources: string[]): Insight => ({
    id, kind: 'goal', topic: 'goals', text: id, status: 'active', sources,
    created_at: '', updated_at: '',
  });

  it('counts what came from this entry alone', () => {
    const rows = [insight('a', ['e1']), insight('b', ['e1', 'e2']), insight('c', ['e2'])];
    expect(onlyFrom(rows, 'e1').map((row) => row.id)).toEqual(['a']);
  });
});

describe('the draft on this device', () => {
  afterEach(() => clearDraft('myles'));

  it('is kept per account and can be cleared', () => {
    writeDraft('myles', { id: 'e1', title: 'T', body: 'B', at: 5 });
    expect(readDraft('myles')).toEqual({ id: 'e1', title: 'T', body: 'B', mood: null, energy: null, at: 5 });
    expect(readDraft('someone-else')).toBeNull();
    clearDraft('myles');
    expect(readDraft('myles')).toBeNull();
  });

  it('keeps the check-in, and drops one out of range', () => {
    writeDraft('myles', { title: '', body: '', mood: 4, energy: 9, at: 1 });
    expect(readDraft('myles')).toMatchObject({ mood: 4, energy: null });
  });

  it('ignores something that is not a draft', () => {
    localStorage.setItem('summit:log-draft:myles', '{"nope":1}');
    expect(readDraft('myles')).toBeNull();
  });
});
