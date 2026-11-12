/**
 * The TeX splitter every problem goes through. A slip here turns a statement
 * into a wall of dollar signs, or worse, unescaped HTML.
 */
import { describe, expect, it } from 'vitest';
import { renderMath, splitMath } from './MathText';

describe('splitMath', () => {
  it('separates text, inline and display math', () => {
    expect(splitMath('Let $x$ be $$x^2$$ ok')).toEqual([
      { kind: 'text', value: 'Let ' },
      { kind: 'inline', value: 'x' },
      { kind: 'text', value: ' be ' },
      { kind: 'display', value: 'x^2' },
      { kind: 'text', value: ' ok' },
    ]);
  });

  it('reads \\$ as a literal dollar', () => {
    expect(splitMath('costs \\$4')).toEqual([{ kind: 'text', value: 'costs $4' }]);
    expect(splitMath('$\\$4$')).toEqual([{ kind: 'inline', value: '\\$4' }]);
  });

  it('shows an unclosed $ as written', () => {
    expect(splitMath('a $b')).toEqual([{ kind: 'text', value: 'a ' }, { kind: 'text', value: '$b' }]);
  });
});

describe('renderMath', () => {
  it('escapes the text between the math', () => {
    const html = renderMath('<img src=x onerror=alert(1)> and $1+1$');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('katex');
  });
});
