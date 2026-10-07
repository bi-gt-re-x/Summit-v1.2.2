/**
 * The block editor's keys and menus — components/Spaces/BlockEditor.
 *
 * Driven through a tiny host that holds the blocks, the way the space page
 * does, so every edit is read back off the screen.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { BlockEditor } from './BlockEditor';
import type { Block } from './blocks';

let latest: Block[] = [];

function Host({ start }: { start: Block[] }) {
  const [blocks, setBlocks] = useState(start);
  latest = blocks;
  return <BlockEditor blocks={blocks} onChange={setBlocks} label="Page" />;
}

const page = (...blocks: Array<Partial<Block> & { text: string }>) =>
  render(<Host start={blocks.map((one, at) => ({ id: `b${at}`, type: 'text', ...one }))} />);

const fields = () => within(screen.getByRole('group', { name: 'Page' })).getAllByRole('textbox') as HTMLTextAreaElement[];
const kinds = () => latest.map((one) => one.type);
const texts = () => latest.map((one) => one.text);

/** Type into a field as if the caret were at the end of `value`. */
const type = (field: HTMLTextAreaElement, value: string, caret = value.length) =>
  fireEvent.change(field, { target: { value, selectionStart: caret, selectionEnd: caret } });

/** Press a key with the caret at `at`. */
function press(field: HTMLTextAreaElement, key: string, at: number, extra: Record<string, boolean> = {}) {
  field.setSelectionRange(at, at);
  fireEvent.keyDown(field, { key, ...extra });
}

describe('typing', () => {
  it('turns Markdown marks at the start of a block into that kind', () => {
    page({ text: '' });
    type(fields()[0]!, '# ');
    expect(kinds()).toEqual(['h1']);
    expect(texts()).toEqual(['']);
  });

  it('makes a divider of three dashes and carries on below it', () => {
    page({ text: '' });
    type(fields()[0]!, '---');
    expect(kinds()).toEqual(['divider', 'text']);
    expect(screen.getByRole('separator', { name: 'Divider' })).toBeInTheDocument();
  });

  it('opens the slash menu, filters it, and turns the block into the pick', () => {
    page({ text: '' });
    type(fields()[0]!, '/');
    expect(screen.getByRole('listbox', { name: 'Block kinds' })).toBeInTheDocument();
    type(fields()[0]!, '/todo');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    press(fields()[0]!, 'Enter', 5);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(kinds()).toEqual(['todo']);
    expect(texts()).toEqual(['']);
  });

  it('puts a slash pick below a block that already has words', () => {
    page({ text: 'Intro' });
    type(fields()[0]!, 'Intro ');
    type(fields()[0]!, 'Intro /');
    fireEvent.click(screen.getByRole('option', { name: /Heading 2/ }));
    expect(kinds()).toEqual(['text', 'h2']);
    expect(texts()).toEqual(['Intro ', '']);
  });

  it('shuts the slash menu on Escape and leaves the slash', () => {
    page({ text: '' });
    type(fields()[0]!, '/');
    press(fields()[0]!, 'Escape', 1);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(texts()).toEqual(['/']);
  });
});

describe('Enter and Backspace', () => {
  it('splits a block at the caret', () => {
    page({ text: 'helloworld' });
    press(fields()[0]!, 'Enter', 5);
    expect(texts()).toEqual(['hello', 'world']);
  });

  it('carries a list on, and ends it on an empty item', () => {
    page({ type: 'bullet', text: 'one' });
    press(fields()[0]!, 'Enter', 3);
    expect(kinds()).toEqual(['bullet', 'bullet']);
    press(fields()[1]!, 'Enter', 0);
    expect(kinds()).toEqual(['bullet', 'text']);
  });

  it('starts an unticked to-do after a ticked one', () => {
    page({ type: 'todo', text: 'done', checked: true });
    press(fields()[0]!, 'Enter', 4);
    expect(latest[1]).toMatchObject({ type: 'todo', text: '' });
    expect(latest[1]!.checked).toBeUndefined();
  });

  it('puts the next block inside an open toggle', () => {
    page({ type: 'toggle', text: 'More' });
    press(fields()[0]!, 'Enter', 4);
    expect(latest[1]).toMatchObject({ type: 'text', indent: 1 });
  });

  it('keeps new lines inside a code block', () => {
    page({ type: 'code', text: 'x' });
    press(fields()[0]!, 'Enter', 1);
    expect(latest).toHaveLength(1);
  });

  it('turns a block back into text, then joins it to the one above', () => {
    page({ text: 'ab' }, { type: 'h2', text: 'cd' });
    press(fields()[1]!, 'Backspace', 0);
    expect(kinds()).toEqual(['text', 'text']);
    press(fields()[1]!, 'Backspace', 0);
    expect(texts()).toEqual(['abcd']);
  });
});

describe('indent and toggles', () => {
  it('indents with Tab no deeper than one under the block above, and back with Shift+Tab', () => {
    page({ text: 'a' }, { text: 'b' });
    press(fields()[0]!, 'Tab', 0);
    expect(latest[0]!.indent).toBeUndefined();
    press(fields()[1]!, 'Tab', 0);
    press(fields()[1]!, 'Tab', 0);
    expect(latest[1]!.indent).toBe(1);
    press(fields()[1]!, 'Tab', 0, { shiftKey: true });
    expect(latest[1]!.indent).toBe(0);
  });

  it('hides what is inside a toggle when it is shut', () => {
    page({ type: 'toggle', text: 'Details' }, { text: 'inside', indent: 1 }, { text: 'after' });
    expect(fields()).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Close Details' }));
    expect(fields().map((field) => field.value)).toEqual(['Details', 'after']);
    fireEvent.click(screen.getByRole('button', { name: 'Open Details' }));
    expect(fields()).toHaveLength(3);
  });

  it('offers to fill an empty toggle', () => {
    page({ type: 'toggle', text: 'Empty' });
    fireEvent.click(screen.getByRole('button', { name: /Empty toggle/ }));
    expect(latest[1]).toMatchObject({ type: 'text', indent: 1 });
  });
});

describe('a block\'s handle', () => {
  it('ticks a to-do', () => {
    page({ type: 'todo', text: 'Buy milk' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Buy milk' }));
    expect(latest[0]!.checked).toBe(true);
  });

  it('turns a block into another kind, duplicates, moves and deletes it', () => {
    page({ text: 'a' }, { text: 'b' });
    const grip = () => screen.getAllByRole('button', { name: /Drag to move/ });

    fireEvent.click(grip()[0]!);
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: /Quote/ }));
    expect(kinds()).toEqual(['quote', 'text']);

    fireEvent.click(grip()[0]!);
    fireEvent.click(screen.getByRole('menuitem', { name: /Duplicate/ }));
    expect(texts()).toEqual(['a', 'a', 'b']);

    fireEvent.click(grip()[2]!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move up' }));
    expect(texts()).toEqual(['a', 'b', 'a']);

    fireEvent.click(grip()[0]!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(texts()).toEqual(['b', 'a']);
  });

  it('adds a block below with the slash menu open', () => {
    page({ text: 'a' });
    fireEvent.click(screen.getByRole('button', { name: 'Add a block below' }));
    expect(texts()).toEqual(['a', '/']);
    expect(screen.getByRole('listbox', { name: 'Block kinds' })).toBeInTheDocument();
  });

  it('writes at the end when the space under the last block is clicked', () => {
    page({ text: 'a' });
    fireEvent.click(screen.getByRole('button', { name: 'Write at the end of the page' }));
    expect(texts()).toEqual(['a', '']);
  });
});
