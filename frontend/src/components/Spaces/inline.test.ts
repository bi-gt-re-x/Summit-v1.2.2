/**
 * Bold and italic as inline Markdown — components/Spaces/inline.
 */
import { describe, expect, it } from 'vitest';
import {
  autoFormat,
  escapeInline,
  hasMark,
  joinInline,
  parseInline,
  plainOf,
  serialize,
  setMark,
  sliceInline,
  spliceInline,
  toHtml,
} from './inline';

describe('reading Markdown', () => {
  it('reads bold, italic and both', () => {
    expect(parseInline('a **b** *c* ***d***')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', italic: true },
      { text: ' ' },
      { text: 'd', bold: true, italic: true },
    ]);
  });

  it('keeps a star with no partner as a star', () => {
    expect(plainOf('5 * 3')).toBe('5 * 3');
    expect(parseInline('5 * 3')).toEqual([{ text: '5 * 3' }]);
    expect(plainOf('**half')).toBe('**half');
  });

  it('reads escaped stars and backslashes literally', () => {
    expect(parseInline('\\*not italic\\* and \\\\')).toEqual([{ text: '*not italic* and \\' }]);
  });
});

describe('writing Markdown', () => {
  it('round-trips every pair of neighbouring marks', () => {
    const kinds = [{}, { bold: true }, { italic: true }, { bold: true, italic: true }];
    for (const a of kinds) {
      for (const b of kinds) {
        const runs = [{ text: 'a', ...a }, { text: 'b', ...b }, { text: 'c', ...a }];
        const md = serialize(runs);
        expect(parseInline(md)).toEqual(parseInline(serialize(parseInline(md))));
        expect(plainOf(md)).toBe('abc');
        expect(parseInline(md).map((run) => [Boolean(run.bold), Boolean(run.italic)]))
          .toEqual(parseInline(serialize(runs)).map((run) => [Boolean(run.bold), Boolean(run.italic)]));
      }
    }
    // Read back exactly as written, mark for mark.
    const mixed = [{ text: 'x', bold: true, italic: true }, { text: 'y', italic: true }, { text: 'z', bold: true }];
    expect(parseInline(serialize(mixed))).toEqual(mixed);
  });

  it('escapes what would otherwise be read as a mark', () => {
    expect(serialize([{ text: 'a*b' }])).toBe('a\\*b');
    expect(plainOf(escapeInline('**x**'))).toBe('**x**');
  });

  it('merges neighbours with the same marks', () => {
    expect(serialize([{ text: 'a', bold: true }, { text: 'b', bold: true }])).toBe('**ab**');
  });
});

describe('editing by visible offset', () => {
  const md = 'one **two** three';

  it('slices', () => {
    expect(sliceInline(md, 0, 6)).toBe('one **tw**');
    expect(sliceInline(md, 6)).toBe('**o** three');
  });

  it('splices plain text in', () => {
    expect(spliceInline(md, 4, 6, 'X')).toBe('one X**o** three');
    expect(spliceInline(md, 4, 7, 'X')).toBe('one X three');
    expect(spliceInline(md, 0, 0, '*')).toBe('\\*one **two** three');
  });

  it('joins two blocks into one string', () => {
    expect(joinInline('**a**', '**b** c')).toBe('**ab** c');
  });

  it('turns a mark on and off, and says whether a stretch has it', () => {
    const bolded = setMark('hello world', 0, 5, 'bold', true);
    expect(bolded).toBe('**hello** world');
    expect(hasMark(bolded, 0, 5, 'bold')).toBe(true);
    expect(hasMark(bolded, 0, 7, 'bold')).toBe(false);
    expect(hasMark(bolded, 2, 2, 'bold')).toBe(false);
    expect(setMark(bolded, 1, 3, 'bold', false)).toBe('**h**el**lo** world');
    const both = setMark(bolded, 0, 11, 'italic', true);
    expect(both).toBe('***hello** world*');
    expect(parseInline(both)).toEqual([{ text: 'hello', bold: true, italic: true }, { text: ' world', italic: true }]);
  });
});

describe('typed Markdown', () => {
  it('bolds "**word**" as the last star goes in', () => {
    const typed = escapeInline('say **hi**');
    expect(autoFormat(typed, 10)).toEqual({ text: 'say **hi**', caret: 6, mark: 'bold' });
  });

  it('italicises "*word*"', () => {
    expect(autoFormat(escapeInline('an *aside*'), 10)).toEqual({ text: 'an *aside*', caret: 8, mark: 'italic' });
  });

  it('leaves stars that do not close a word', () => {
    expect(autoFormat(escapeInline('a * b *'), 7)).toBeNull();
    expect(autoFormat(escapeInline('**a*'), 4)).toBeNull();
    expect(autoFormat(escapeInline('5 * 3'), 5)).toBeNull();
  });
});

describe('as HTML', () => {
  it('draws marks as strong and em, escaped', () => {
    expect(toHtml('a **<b>** ***c***')).toBe('a <strong>&lt;b&gt;</strong> <strong><em>c</em></strong>');
  });

  it('adds a break after a last empty line so it shows', () => {
    expect(toHtml('line\n')).toBe('line\n<br>');
  });
});
