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
import { placeCaret, pressAt, textOf, typeInto, type BlockField } from '@/test/blockFields';

let latest: Block[] = [];

function Host({ start }: { start: Block[] }) {
  const [blocks, setBlocks] = useState(start);
  latest = blocks;
  return <BlockEditor blocks={blocks} onChange={setBlocks} label="Page" />;
}

const page = (...blocks: Array<Partial<Block> & { text: string }>) =>
  render(<Host start={blocks.map((one, at) => ({ id: `b${at}`, type: 'text', ...one }))} />);

const fields = () => within(screen.getByRole('group', { name: 'Page' })).getAllByRole('textbox') as BlockField[];
const kinds = () => latest.map((one) => one.type);
const texts = () => latest.map((one) => one.text);

const type = typeInto;
const press = pressAt;

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
    expect(fields().map(textOf)).toEqual(['Details', 'after']);
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

describe('bold and italic', () => {
  it('bolds the selection with ⌘B, and takes it off again', () => {
    page({ text: 'hello world' });
    placeCaret(fields()[0]!, 0, 5);
    fireEvent.keyDown(fields()[0]!, { key: 'b', metaKey: true });
    expect(texts()).toEqual(['**hello** world']);
    expect(fields()[0]!.querySelector('strong')).toHaveTextContent('hello');

    placeCaret(fields()[0]!, 0, 5);
    fireEvent.keyDown(fields()[0]!, { key: 'b', ctrlKey: true });
    expect(texts()).toEqual(['hello world']);
  });

  it('italicises with ⌘I', () => {
    page({ text: 'an aside' });
    placeCaret(fields()[0]!, 3, 8);
    fireEvent.keyDown(fields()[0]!, { key: 'i', metaKey: true });
    expect(texts()).toEqual(['an *aside*']);
    expect(fields()[0]!.querySelector('em')).toHaveTextContent('aside');
  });

  it('formats "**word**" and "*word*" as they are typed', () => {
    page({ text: '' });
    type(fields()[0]!, 'say **hi**');
    expect(texts()).toEqual(['say **hi**']);
    expect(textOf(fields()[0]!)).toBe('say hi');
    // A field's whole text is set at once here, so the italic is typed on its own.
    type(fields()[0]!, 'an *aside*');
    expect(texts()).toEqual(['an *aside*']);
  });

  it('keeps a lone star as a star', () => {
    page({ text: '' });
    type(fields()[0]!, '5 * 3');
    expect(texts()).toEqual(['5 \\* 3']);
    expect(textOf(fields()[0]!)).toBe('5 * 3');
  });

  it('keeps the marks on each side when a block is split, and when two are joined', () => {
    page({ text: '**bold** plain' });
    press(fields()[0]!, 'Enter', 2);
    expect(texts()).toEqual(['**bo**', '**ld** plain']);
    press(fields()[1]!, 'Backspace', 0);
    expect(texts()).toEqual(['**bold** plain']);
  });

  it('shows the bar over a selection, and its buttons apply the marks', () => {
    page({ text: 'hello world' });
    placeCaret(fields()[0]!, 6, 11);
    fireEvent(document, new Event('selectionchange'));
    const bar = screen.getByRole('toolbar', { name: 'Text style' });
    expect(within(bar).getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(within(bar).getByRole('button', { name: 'Italic' }));
    expect(texts()).toEqual(['hello *world*']);
  });

  it('drops formatting when a block becomes code, and keeps stars literal coming back', () => {
    page({ text: '**x** *y*' });
    fireEvent.click(screen.getAllByRole('button', { name: /Drag to move/ })[0]!);
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Code/ }));
    expect(texts()).toEqual(['x y']);
    typeInto(fields()[0]!, '**a**');
    fireEvent.click(screen.getAllByRole('button', { name: /Drag to move/ })[0]!);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Text' }));
    expect(textOf(fields()[0]!)).toBe('**a**');
  });

  it('pastes plain text, and several lines as several blocks', () => {
    page({ text: 'ab' });
    const paste = (text: string) =>
      fireEvent.paste(fields()[0]!, { clipboardData: { getData: () => text } });
    placeCaret(fields()[0]!, 1);
    paste('X');
    expect(texts()).toEqual(['aXb']);
    placeCaret(fields()[0]!, 1);
    paste('one\n- two\nthree');
    expect(texts()).toEqual(['aone', 'two', 'threeXb']);
    expect(kinds()).toEqual(['text', 'bullet', 'text']);
  });
});
