/**
 * The rules of a page of blocks — components/Spaces/blocks.
 */
import { describe, expect, it } from 'vitest';
import {
  fromBody,
  hiddenIds,
  matchKinds,
  moveDown,
  moveTo,
  moveUp,
  normalise,
  numberOf,
  remove,
  retype,
  shortcut,
  duplicate,
  wordCount,
  type Block,
} from './blocks';

const b = (id: string, type: Block['type'] = 'text', indent = 0, extra: Partial<Block> = {}): Block => ({
  id,
  type,
  text: id,
  ...(indent ? { indent } : {}),
  ...extra,
});
const ids = (blocks: Block[]) => blocks.map((one) => `${one.id}${one.indent ? `:${one.indent}` : ''}`);

describe('typing shortcuts', () => {
  it.each([
    ['# Title', 'h1', 'Title'],
    ['## Part', 'h2', 'Part'],
    ['### Bit', 'h3', 'Bit'],
    ['- item', 'bullet', 'item'],
    ['* item', 'bullet', 'item'],
    ['1. first', 'numbered', 'first'],
    ['[] buy milk', 'todo', 'buy milk'],
    ['> more', 'toggle', 'more'],
    ['" said', 'quote', 'said'],
    ['---', 'divider', ''],
    ['```', 'code', ''],
  ])('%j makes a %s', (typed, type, text) => {
    expect(shortcut(typed)).toMatchObject({ type, text });
  });

  it('ticks a to-do typed as [x]', () => {
    expect(shortcut('[x] done')).toMatchObject({ type: 'todo', extra: { checked: true } });
  });

  it('leaves ordinary writing alone', () => {
    expect(shortcut('#hashtag')).toBeNull();
    expect(shortcut('-5 degrees')).toBeNull();
    expect(shortcut('hello')).toBeNull();
  });
});

describe('the slash menu', () => {
  it('offers every kind before anything is typed, with one entry per chart and per shape', () => {
    const all = matchKinds('');
    expect(all.filter((kind) => kind.type !== 'chart' && kind.type !== 'shape')).toHaveLength(13);
    expect(all.filter((kind) => kind.type === 'chart').map((kind) => kind.chart)).toEqual(['bar', 'line', 'area', 'pie', 'donut']);
    expect(all.filter((kind) => kind.type === 'shape').map((kind) => kind.shape)).toEqual([
      'rectangle', 'rounded', 'circle', 'triangle', 'diamond', 'star', 'hexagon', 'arrow',
    ]);
  });

  it('finds a sticky note and a shape by name', () => {
    expect(matchKinds('sticky').map((kind) => kind.type)).toEqual(['sticky']);
    expect(matchKinds('star').map((kind) => kind.shape)).toEqual(['star']);
  });

  it('puts a name that starts with what was typed first', () => {
    expect(matchKinds('line').map((kind) => kind.label)).toEqual(['Line chart', 'Divider']);
  });

  it('finds a chart by its kind', () => {
    expect(matchKinds('pie').map((kind) => kind.chart)).toEqual(['pie']);
    expect(matchKinds('chart')).toHaveLength(5);
  });

  it('filters by name and by the words people type', () => {
    expect(matchKinds('head').map((kind) => kind.type)).toEqual(['h1', 'h2', 'h3']);
    expect(matchKinds('todo').map((kind) => kind.type)).toEqual(['todo']);
    expect(matchKinds('hr').map((kind) => kind.type)).toEqual(['divider']);
    expect(matchKinds('zzz')).toEqual([]);
  });
});

describe('a page written as plain text', () => {
  it('becomes one block a line, with the kinds its marks say', () => {
    const blocks = fromBody('# Plan\n- [ ] read\n  - [x] skim\n1. one\n> quoted\n▸ more\n---\nplain');
    expect(blocks.map((one) => [one.type, one.text, one.indent ?? 0, Boolean(one.checked)])).toEqual([
      ['h1', 'Plan', 0, false],
      ['todo', 'read', 0, false],
      ['todo', 'skim', 1, true],
      ['numbered', 'one', 0, false],
      ['quote', 'quoted', 0, false],
      ['toggle', 'more', 0, false],
      ['divider', '', 0, false],
      ['text', 'plain', 0, false],
    ]);
  });

  it('keeps a fenced block of code as one block', () => {
    const blocks = fromBody('before\n```\nx = 1\n\ny = 2\n```\nafter');
    expect(blocks.map((one) => [one.type, one.text])).toEqual([
      ['text', 'before'],
      ['code', 'x = 1\n\ny = 2'],
      ['text', 'after'],
    ]);
  });

  it('is one empty block when there is nothing', () => {
    expect(fromBody('')).toEqual([expect.objectContaining({ type: 'text', text: '' })]);
  });
});

describe('a page as stored', () => {
  it('is made safe to edit', () => {
    const doc = normalise({
      icon: '🎯',
      cover: 'neon',
      blocks: [
        { id: 'a', type: 'marquee' as Block['type'], text: 'x' },
        { id: 'a', type: 'todo', text: 'y', indent: 9, checked: true },
      ],
    });
    expect(doc.icon).toBe('🎯');
    expect(doc.cover).toBe('');
    expect(doc.blocks[0]).toMatchObject({ id: 'a', type: 'text' });
    expect(doc.blocks[1]!.id).not.toBe('a');
    expect(doc.blocks[1]).toMatchObject({ type: 'todo', indent: 4, checked: true });
  });

  it('reads the plain text when there are no blocks yet', () => {
    expect(normalise(undefined, '- a').blocks[0]).toMatchObject({ type: 'bullet', text: 'a' });
  });

  it('always has a block to type in', () => {
    expect(normalise({ icon: '', cover: '', blocks: [] }).blocks).toHaveLength(1);
  });
});

describe('reading the list', () => {
  it('hides what sits under a shut toggle, and only that', () => {
    const blocks = [b('t', 'toggle', 0, { collapsed: true }), b('in', 'text', 1), b('deeper', 'text', 2), b('out')];
    expect([...hiddenIds(blocks)]).toEqual(['in', 'deeper']);
    expect(hiddenIds([b('t', 'toggle'), b('in', 'text', 1)]).size).toBe(0);
  });

  it('numbers a list by level, starting again after a break', () => {
    const blocks = [b('1', 'numbered'), b('2', 'numbered'), b('2a', 'numbered', 1), b('3', 'numbered'), b('p'), b('1again', 'numbered')];
    const numbers = blocks.flatMap((one, at) => (one.type === 'numbered' ? [numberOf(blocks, at)] : []));
    expect(numbers).toEqual([1, 2, 1, 3, 1]);
  });

  it('counts words', () => {
    expect(wordCount([b('two words', 'text'), { id: 'x', type: 'text', text: '  three  more words ' }])).toBe(5);
  });
});

describe('changing the list', () => {
  const page = () => [b('a'), b('b'), b('b1', 'text', 1), b('c')];

  it('moves a block with what is under it, taking the indent where it lands', () => {
    expect(ids(moveTo(page(), 'b', 'c', 'after'))).toEqual(['a', 'c', 'b', 'b1:1']);
    expect(ids(moveTo(page(), 'c', 'b1', 'before'))).toEqual(['a', 'b', 'c:1', 'b1:1']);
  });

  it('lands after a block\'s children when dropped after it', () => {
    expect(ids(moveTo(page(), 'a', 'b', 'after'))).toEqual(['b', 'b1:1', 'a', 'c']);
  });

  it('refuses to drop a block into itself', () => {
    const blocks = page();
    expect(moveTo(blocks, 'b', 'b1', 'after')).toBe(blocks);
    expect(moveTo(blocks, 'b', 'b', 'before')).toBe(blocks);
  });

  it('moves one place up and down', () => {
    expect(ids(moveUp(page(), 'c'))).toEqual(['a', 'b', 'c:1', 'b1:1']);
    expect(ids(moveDown(page(), 'a'))).toEqual(['b', 'b1:1', 'a', 'c']);
    expect(ids(moveUp(page(), 'a'))).toEqual(['a', 'b', 'b1:1', 'c']);
  });

  it('duplicates a block with what is under it', () => {
    const made = duplicate(page(), 'b');
    expect(made.blocks.map((one) => one.text)).toEqual(['a', 'b', 'b1', 'b', 'b1', 'c']);
    expect(made.copy).toBe(made.blocks[3]!.id);
  });

  it('removes a toggle with what is inside it, and anything else alone', () => {
    const toggled = [b('t', 'toggle'), b('in', 'text', 1), b('out')];
    expect(ids(remove(toggled, 't'))).toEqual(['out']);
    expect(ids(remove(page(), 'b'))).toEqual(['a', 'b1:1', 'c']);
    expect(remove([b('only')], 'only')).toEqual([expect.objectContaining({ type: 'text', text: '' })]);
  });

  it('drops what only the old kind meant when a block changes kind', () => {
    expect(retype(b('x', 'todo', 2, { checked: true }), 'h1')).toEqual({ id: 'x', type: 'h1', text: 'x', indent: 2 });
    expect(retype(b('x'), 'divider').text).toBe('');
  });
});
