/**
 * Render, serialise, render again — and the two HTMLs have to match.
 *
 * The notes editor holds the HTML `render` produced and writes the note back
 * out with `toMarkdown` on every keystroke, so the pair is not two utilities
 * that happen to be related: it is one loop that runs thousands of times per
 * note. Anything it loses, it loses permanently and silently, on a page whose
 * whole promise is that what you wrote is what is stored.
 *
 * So the assertion is on the second *render* rather than on the Markdown. The
 * source is allowed to come back spelled differently — `1.` where somebody
 * typed `1)` — and is not allowed to come back meaning anything else.
 */
import { describe, expect, it } from 'vitest';
import { render } from './markdown';
import { harden, toMarkdown } from './htmlToMarkdown';

/** The loop the editor runs: HTML in, Markdown out, HTML again. */
function trip(source: string): { once: string; twice: string; middle: string } {
  const host = document.createElement('div');
  host.innerHTML = render(source);
  const middle = toMarkdown(host);
  const after = document.createElement('div');
  after.innerHTML = render(middle);
  return { once: host.innerHTML, twice: after.innerHTML, middle };
}

const NOTES: Array<[string, string]> = [
  ['a paragraph', 'Just some words.'],
  ['headings', '# One\n\n## Two\n\n### Three\n\n#### Four'],
  ['bold and italic', '**bold** and *italic* and both **together *here***'],
  ['underline and strike', '__under__ and ~~through~~'],
  ['highlight', 'some ==marked== words'],
  ['code', 'call `render(source)` first'],
  ['a fenced block', '```\nconst x = 1;\nif (x) go();\n```'],
  ['a quote', '> Discipline is a bridge.'],
  ['a rule', 'above\n\n---\n\nbelow'],
  ['a bulleted list', '- one\n- two\n- three'],
  ['a numbered list', '1. one\n2. two'],
  ['a lettered list', 'a. one\nb. two'],
  ['a roman list', 'i. one\nii. two'],
  ['a nested list', '- one\n  - under\n  - also\n- two'],
  ['a checklist', '- [ ] not yet\n- [x] done'],
  ['a colour', '[urgent]{red}'],
  ['a highlighter', '[careful]{bg-blue}'],
  ['a face and a size', '[Revise integrals]{serif s24}'],
  ['several tokens', '[all of it]{red serif s30}'],
  ['centring', 'A title {center}'],
  ['alignment on a heading', '## A title {right}'],
  ['an external link', 'see [the docs](https://example.com/x)'],
  ['a task link', 'see [Revise integrals](/tasks?task=a1b2)'],
  ['a goal link', 'see [Finish Calculus](/goals?goal=g9)'],
  ['a page link', 'see [Growth](/analytics/growth)'],
  ['a mail link', 'write to [us](mailto:hi@example.com)'],
  ['everything at once',
    '# Plan {center}\n\n**Today** I will finish [integrals]{red s20}.\n\n' +
    '- [ ] read [the task](/tasks?task=z1)\n- [x] ==revise== the notes\n\n> then rest'],
];

describe('the editor round trip', () => {
  for (const [name, source] of NOTES) {
    it(`keeps ${name}`, () => {
      const { once, twice } = trip(source);
      expect(twice).toBe(once);
    });
  }
});

describe('text that looks like syntax', () => {
  const LITERAL = [
    'two * three * four',
    'a **literal** pair',
    'snake_case stays',
    'a __doubled__ pair',
    'maths: 3 == 3',
    'braces {like this}',
    'a [bracket] alone',
    'a backslash \\ on its own',
    '- not a bullet, typed as prose',
    '# not a heading',
    '1. not a list',
  ];

  for (const text of LITERAL) {
    it(`survives ${JSON.stringify(text)}`, () => {
      // What the editor holds when somebody types that text and nothing else:
      // one paragraph, one text node, no marks.
      const host = document.createElement('div');
      const p = document.createElement('p');
      p.textContent = text;
      host.append(p);

      const source = toMarkdown(host);
      const back = document.createElement('div');
      back.innerHTML = render(source);
      expect(back.textContent).toBe(text);
    });
  }
});

describe('harden', () => {
  it('leaves ordinary prose alone', () => {
    expect(harden('Nothing to do here.')).toBe('Nothing to do here.');
  });

  it('leaves a single underscore, and takes a doubled one', () => {
    expect(harden('snake_case')).toBe('snake_case');
    expect(harden('__bold__')).toBe('\\__bold\\__');
  });
});

describe('what a browser leaves in a contenteditable', () => {
  const host = () => document.createElement('div');

  it('reads a <div> as a paragraph', () => {
    const root = host();
    root.innerHTML = '<div>first</div><div>second</div>';
    expect(toMarkdown(root)).toBe('first\nsecond');
  });

  it('reads <b> and <i> as the marks they stand for', () => {
    const root = host();
    root.innerHTML = '<p><b>bold</b> and <i>italic</i></p>';
    expect(toMarkdown(root)).toBe('**bold** and *italic*');
  });

  it('reads the CSS a paste writes instead of a tag', () => {
    const root = host();
    root.innerHTML = '<p><span style="font-weight: 700">bold</span></p>';
    expect(toMarkdown(root)).toBe('**bold**');
  });

  it('unwraps an element a note cannot say', () => {
    const root = host();
    root.innerHTML = '<p>keep <video>the words</video></p>';
    expect(toMarkdown(root)).toBe('keep the words');
  });

  it('drops a class it does not know rather than inventing a token', () => {
    const root = host();
    root.innerHTML = '<p><span class="from-some-website">words</span></p>';
    expect(toMarkdown(root)).toBe('words');
  });

  it('collapses a held-down Return to one blank line', () => {
    const root = host();
    root.innerHTML = '<p>one</p><div><br></div><div><br></div><div><br></div><p>two</p>';
    expect(toMarkdown(root)).toBe('one\n\ntwo');
  });

  it('does not grow a trailing blank every time it is opened', () => {
    const root = host();
    root.innerHTML = '<p>one</p><div><br></div>';
    expect(toMarkdown(root)).toBe('one');
  });
});
